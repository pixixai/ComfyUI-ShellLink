/**
 * 文件: comp_modulearea.js
 * 职责: 负责输入/输出区域渲染、拖拽排序与局部刷新。
 */
import { state, dragState, saveAndRender } from "./ui_state.js";
import { injectDnDCSS, bindComboSelectEvents } from "./ui_utils.js";
import { generateInputHTML, attachInputEvents, refreshInputAreaInPlace } from "./modules/module_input.js";
import { generateOutputHTML, attachOutputEvents } from "./modules/module_output.js";
import { updateSelectionUI } from "./ui_selection.js"; // [新增] 引入更新选中状态的 UI 方法
import { app } from "../../../scripts/app.js";

// 核心解耦：仅保存状态到后端节点，不触发整页刷新
export function justSave() {
    // Prefer extension save bridge so latest in-memory state is always persisted.
    if (window.CLab && typeof window.CLab.saveState === "function") {
        window.CLab.saveState(state);
        return;
    }
    if (window.StateManager && window.StateManager.syncToNode) {
        const graph = app?.graph || window.app?.graph;
        if (graph) window.StateManager.syncToNode(graph);
    }
}

function isVideoAutoplayEnabled() {
    if (typeof window._clabIsVideoAutoplayEnabled === "function") {
        return window._clabIsVideoAutoplayEnabled();
    }
    return window._clabVideoAutoplay !== false;
}

// 微创更新单个区域：只替换目标 DOM，尽量保留媒体播放状态，避免控件错位。
export function surgicallyUpdateArea(areaId) {
    const areaEl = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
    if (!areaEl) return;
    let targetCard = null;
    let targetArea = null;
    state.cards.forEach(c => {
        const a = c.areas?.find(x => x.id === areaId);
        if (a) { targetCard = c; targetArea = a; }
    });
    if (targetCard && targetArea) {
        const mediaEl = areaEl.querySelector('.clab-media-target');
        let stashedMedia = null, stashedSrc = null, stashedTime = 0, stashedPaused = true;

        if (mediaEl && (mediaEl.tagName === 'VIDEO' || mediaEl.tagName === 'AUDIO')) {
            stashedMedia = mediaEl;
            stashedSrc = mediaEl.getAttribute('src') || '';
            stashedTime = mediaEl.currentTime;
            stashedPaused = mediaEl.paused;
            
            if (!window._clabMiniVault) {
                window._clabMiniVault = document.createElement('div');
                window._clabMiniVault.id = 'clab-mini-vault';
                window._clabMiniVault.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0.01; pointer-events: none; z-index: -9999; overflow: hidden;';
                document.body.appendChild(window._clabMiniVault);
            }
            window._clabMiniVault.appendChild(mediaEl);
        }

        const temp = document.createElement('div');
        temp.innerHTML = generateAreaHTML(targetArea, targetCard);
        const newAreaEl = temp.firstElementChild;
        areaEl.replaceWith(newAreaEl);

        if (stashedMedia) {
            const newMediaEl = newAreaEl.querySelector('.clab-media-target');
            if (newMediaEl) {
                const newSrc = newMediaEl.getAttribute('src') || '';
                
                // 通过标准化 URL 比较路径与 filename，忽略临时时间戳等缓存参数，
                // 若判定为同一资源则复用旧媒体元素，避免播放状态在局部刷新时丢失。
                let isSame = false;
                try {
                    const oU = new URL(stashedSrc, window.location.origin);
                    const nU = new URL(newSrc, window.location.origin);
                    isSame = (oU.pathname === nU.pathname && 
                              oU.searchParams.get('filename') === nU.searchParams.get('filename') && 
                              oU.searchParams.get('t') === nU.searchParams.get('t'));
                } catch(e) {
                    isSame = (stashedSrc === newSrc);
                }
                
                if (isSame && stashedSrc !== '') {
                    newMediaEl.replaceWith(stashedMedia);
                    if (Math.abs(stashedMedia.currentTime - stashedTime) > 0.1) {
                        stashedMedia.currentTime = stashedTime;
                    }
                    if (stashedMedia instanceof HTMLVideoElement) {
                        const autoplayEnabled = isVideoAutoplayEnabled();
                        stashedMedia.autoplay = autoplayEnabled;
                        if (autoplayEnabled) stashedMedia.setAttribute("autoplay", "");
                        else stashedMedia.removeAttribute("autoplay");
                        if (autoplayEnabled && !stashedPaused) stashedMedia.play().catch(()=>{});
                        else stashedMedia.pause();
                    } else if (!stashedPaused) {
                        stashedMedia.play().catch(()=>{});
                    }
                } else {
                    stashedMedia.remove();
                }
            } else {
                stashedMedia.remove();
            }
        }
        
        attachAreaEvents(newAreaEl.parentElement); 
    }
}

export function refreshAreaForContext(areaId) {
    const areaEl = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
    if (!areaEl) return false;

    let targetCard = null;
    let targetArea = null;
    state.cards.forEach((card) => {
        const area = card.areas?.find((item) => item.id === areaId);
        if (area) {
            targetCard = card;
            targetArea = area;
        }
    });
    if (!targetCard || !targetArea) return false;

    if (targetArea.type === "edit" && refreshInputAreaInPlace(areaEl, targetArea, targetCard)) {
        return true;
    }

    if (targetArea.type === "preview") {
        const temp = document.createElement("div");
        temp.innerHTML = generateAreaHTML(targetArea, targetCard);
        const nextAreaEl = temp.firstElementChild;
        const hasCurrentMedia = !!areaEl.querySelector(".clab-media-target");
        const hasNextMedia = !!nextAreaEl?.querySelector(".clab-media-target");

        if (nextAreaEl && !hasCurrentMedia && !hasNextMedia) {
            areaEl.className = nextAreaEl.className;
            areaEl.dataset.cardId = targetCard.id;
            areaEl.dataset.areaId = targetArea.id;
            areaEl.style.cssText = nextAreaEl.style.cssText;
            areaEl.innerHTML = nextAreaEl.innerHTML;
            attachAreaEvents(areaEl);
            return true;
        }
    }

    surgicallyUpdateArea(areaId);
    return true;
}

// 同步所有卡片/区域的默认标题（仅在标题未自定义时更新）。
export function updateAllDefaultTitles() {
    document.querySelectorAll('.clab-card:not(.clab-add-card-inline)').forEach((cardEl) => {
        const cardId = cardEl.dataset.cardId;
        const stateCardIdx = state.cards.findIndex(c => c.id === cardId);
        if (stateCardIdx === -1) return;

        const stateCard = state.cards[stateCardIdx];
        const defaultCardTitle = `#${stateCardIdx + 1}`;
        const cardTitleInput = cardEl.querySelector('.clab-card-title-input');
        
        if (cardTitleInput) {
            cardTitleInput.placeholder = defaultCardTitle;
            cardTitleInput.dataset.default = defaultCardTitle;
            if (!stateCard.title) {
                cardTitleInput.value = defaultCardTitle;
                cardTitleInput.size = Math.max(defaultCardTitle.length, 2);
            }
        }

        let editCount = 0;
        let previewCount = 0;

        const allAreas = cardEl.querySelectorAll('.clab-area');
        allAreas.forEach((areaEl) => {
            const areaId = areaEl.dataset.areaId;
            const stateArea = stateCard.areas?.find(a => a.id === areaId);
            if (!stateArea) return;

            let currentIdx = 0;
            if (stateArea.type === 'edit') {
                editCount++;
                currentIdx = editCount;
            } else if (stateArea.type === 'preview') {
                previewCount++;
                currentIdx = previewCount;
            }

            const defaultAreaTitle = `##${currentIdx}`;
            const areaTitleInput = areaEl.querySelector('.clab-area-title-input');
            
            if (areaTitleInput) {
                areaTitleInput.placeholder = defaultAreaTitle;
                if (!stateArea.title) {
                    areaTitleInput.value = defaultAreaTitle;
                    areaTitleInput.size = Math.max(defaultAreaTitle.length, 2);
                }
            }
        });
    });
}

// 当区域跨卡片移动后，修正该区域及其子元素上的 data-card / data-card-id。
export function updateAreaDOMIdentity(areaId, newCardId) {
    try {
        const el = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
        if (el) {
            el.dataset.cardId = newCardId;
            el.querySelectorAll('[data-card]').forEach(child => child.dataset.card = newCardId);
            el.querySelectorAll('[data-card-id]').forEach(child => child.dataset.cardId = newCardId);
        }
    } catch(e) { console.error("[CLab] DOM 身份更新失败:", e); }
}

window._clabSurgicallyUpdateArea = surgicallyUpdateArea;
window._clabJustSave = justSave;
window._clabUpdateAllDefaultTitles = updateAllDefaultTitles;
window._clabUpdateAreaDOMIdentity = updateAreaDOMIdentity;
window._clabGenerateAreaHTML = generateAreaHTML;
window._clabAttachAreaEvents = attachAreaEvents;
window._clabRefreshAreaForContext = refreshAreaForContext;

export function syncAreaDOMOrder(cardId, newAreasArray) {
    const list = document.querySelector(`.clab-card[data-card-id="${cardId}"] .clab-area-list`);
    if (!list) return;
    newAreasArray.forEach(a => {
        const el = document.querySelector(`.clab-area[data-area-id="${a.id}"]`);
        if (el) list.appendChild(el); 
    });
}

export function generateAreaHTML(area, card) {
    if (area.type === 'edit') return generateInputHTML(area, card);
    if (area.type === 'preview') return generateOutputHTML(area, card);
    return '';
}

export function attachAreaEvents(container) {
    injectDnDCSS();
    attachInputEvents(container);
    attachOutputEvents(container);
    
    bindComboSelectEvents(container, state, () => {
        if (window._clabSurgicallyUpdateArea && appState.lastClickedAreaId) {
            window._clabSurgicallyUpdateArea(appState.lastClickedAreaId);
            justSave();
        } else {
            saveAndRender();
        }
    });

    container.querySelectorAll('.clab-del-area-btn').forEach(btn => {
        if (btn.dataset.clabEventsBound) return;
        btn.dataset.clabEventsBound = "1";
        
        btn.onclick = (e) => {
            e.stopPropagation();
            const { card: cardId, area: areaId } = e.target.dataset;
            const isSelected = state.selectedAreaIds && state.selectedAreaIds.includes(areaId);

            if (isSelected && state.selectedAreaIds.length > 1) {
                state.cards.forEach(c => {
                    if (c.areas) {
                        c.areas = c.areas.filter(a => !state.selectedAreaIds.includes(a.id));
                    }
                });
                state.selectedAreaIds.forEach(id => {
                    const el = document.querySelector(`.clab-area[data-area-id="${id}"]`);
                    if (el) el.remove(); 
                });
                state.selectedAreaIds = [];
            } else {
                const card = state.cards.find(c => c.id === cardId);
                if(card) {
                    card.areas = card.areas.filter(a => a.id !== areaId);
                    if (state.selectedAreaIds) {
                        state.selectedAreaIds = state.selectedAreaIds.filter(id => id !== areaId);
                    }
                    const el = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
                    if (el) el.remove(); 
                }
            }
            justSave();
            updateAllDefaultTitles(); 
        };
    });

    container.querySelectorAll('.clab-area-title-input').forEach(input => {
        if (input.dataset.clabEventsBound) return;
        input.dataset.clabEventsBound = "1";
        
        input.addEventListener('input', function() {
            this.size = Math.max(this.value.length, 2); 
        });
        input.onchange = (e) => {
            const { card: cardId, area: areaId } = e.target.dataset;
            const card = state.cards.find(c => c.id === cardId);
            const area = card?.areas.find(a => a.id === areaId);
            if (area) {
                const currentVal = e.target.value.trim();
                const defaultTitle = e.target.placeholder;
                area.title = (currentVal === defaultTitle || currentVal === '') ? '' : currentVal;
                justSave();
            }
        };
    });

    container.querySelectorAll('.clab-area').forEach(areaEl => {
        if (areaEl.dataset.clabEventsBound) return;
        areaEl.dataset.clabEventsBound = "1";
        
        // 强制确保每个区域都可拖拽，防止局部重渲染后 draggable 丢失。
        areaEl.setAttribute('draggable', 'true');

        areaEl.addEventListener('contextmenu', (e) => {
            const areaId = areaEl.dataset.areaId;
            const cardId = areaEl.dataset.cardId;
            const card = state.cards.find(c => c.id === cardId);
            const area = card?.areas.find(a => a.id === areaId);

            if (area && area.type === 'preview' && area.resultUrl) {
                if (e.target.closest('.clab-preview-bg') || e.target.closest('.clab-history-thumb')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.CLab && window.CLab.showPreviewContextMenu) {
                        let targetUrl = area.resultUrl;
                        if (e.target.closest('.clab-history-thumb')) {
                            const thumbIdx = parseInt(e.target.closest('.clab-history-thumb').dataset.index, 10);
                            targetUrl = area.history[thumbIdx];
                        }
                        window.CLab.showPreviewContextMenu(e.clientX, e.clientY, cardId, areaId, targetUrl);
                    }
                }
            }
        });

        areaEl.addEventListener('dragstart', (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName) || e.target.closest('.clab-custom-select') || e.target.closest('.clab-bool-label') || e.target.closest('.clab-upload-zone') || e.target.closest('.clab-history-thumb') || e.target.closest('.clab-text-preview-shell') || e.target.closest('.clab-text-body-scroll') || e.target.closest('.clab-text-body-content')) {
                e.preventDefault();
                return;
            }
            
            e.stopPropagation(); 
            const currentAreaId = areaEl.dataset.areaId;

            let draggedIds = [currentAreaId];
            if (state.selectedAreaIds && state.selectedAreaIds.includes(currentAreaId)) {
                draggedIds = [...state.selectedAreaIds];
            }

            dragState.type = 'area';
            dragState.cardId = areaEl.dataset.cardId;   
            dragState.anchorAreaId = currentAreaId;     
            dragState.areaIds = draggedIds; 

            dragState.sourceInfo = {};
            state.cards.forEach(c => {
                if (c.areas) {
                    c.areas.forEach((a, idx) => {
                        if (draggedIds.includes(a.id)) {
                            dragState.sourceInfo[a.id] = { cardId: c.id, index: idx };
                        }
                    });
                }
            });
            
            // 兜底：如果当前区域未进入批量选中，补录其 sourceInfo，保证单个拖拽也可用。
            if (!dragState.sourceInfo[currentAreaId]) {
                state.cards.forEach(c => {
                    const idx = c.areas?.findIndex(a => a.id === currentAreaId);
                    if (idx !== -1 && idx !== undefined) {
                        dragState.sourceInfo[currentAreaId] = { cardId: c.id, index: idx };
                    }
                });
            }
            
            e.dataTransfer.effectAllowed = 'copyMove'; // 允许拖拽操作同时支持 copy 与 move
            e.dataTransfer.setData('text/plain', 'area');
            
            setTimeout(() => {
                draggedIds.forEach(id => {
                    const el = document.querySelector(`.clab-area[data-area-id="${id}"]`);
                    if (el) el.classList.add('clab-dragging');
                });
            }, 0);
        });

        areaEl.addEventListener('dragend', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.clab-dragging').forEach(el => el.classList.remove('clab-dragging'));
            document.querySelectorAll('.clab-drag-over-area-top, .clab-drag-over-area-bottom').forEach(el => {
                el.classList.remove('clab-drag-over-area-top', 'clab-drag-over-area-bottom');
            });
            document.querySelectorAll('.clab-drag-over-list').forEach(el => el.classList.remove('clab-drag-over-list'));
            dragState.type = null; dragState.cardId = null; dragState.anchorAreaId = null; dragState.areaIds = null; dragState.sourceInfo = null; dragState.isClone = false;
        });

        areaEl.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds) {
                const targetAreaId = areaEl.dataset.areaId;
                const isClone = e.altKey; // 按住 Alt 表示复制（克隆），否则为移动

                // 非克隆模式下，拖到已选中的自身区域时直接忽略，避免无效操作。
                if (dragState.areaIds.includes(targetAreaId) && !isClone) return;

                e.preventDefault(); e.stopPropagation();
                e.dataTransfer.dropEffect = isClone ? 'copy' : 'move'; // 实时反馈当前将执行复制还是移动

                const rect = areaEl.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    areaEl.classList.add('clab-drag-over-area-top');
                    areaEl.classList.remove('clab-drag-over-area-bottom');
                    areaEl.dataset.dropPosition = 'top';
                } else {
                    areaEl.classList.add('clab-drag-over-area-bottom');
                    areaEl.classList.remove('clab-drag-over-area-top');
                    areaEl.dataset.dropPosition = 'bottom';
                }
            }
        });

        areaEl.addEventListener('dragleave', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            e.stopPropagation();
            if (!areaEl.contains(e.relatedTarget)) {
                areaEl.classList.remove('clab-drag-over-area-top', 'clab-drag-over-area-bottom');
                delete areaEl.dataset.dropPosition;
            }
        });

        // 处理拖拽落点：统一执行跨卡片/同卡片的复制或移动逻辑。
        areaEl.addEventListener('drop', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault(); e.stopPropagation();
                const dropPos = areaEl.dataset.dropPosition;
                areaEl.classList.remove('clab-drag-over-area-top', 'clab-drag-over-area-bottom');
                delete areaEl.dataset.dropPosition;
                
                const targetCardId = areaEl.dataset.cardId;
                const targetAreaId = areaEl.dataset.areaId;
                const isClone = e.altKey; // drop 阶段再次读取 Alt，决定复制或移动
                
                if (dragState.areaIds.includes(targetAreaId) && !isClone) return;
                const isSameCard = (targetCardId === dragState.cardId);

                const movedAreasByCard = {};
                const allMovedAreas = []; 
                
                state.cards.forEach((c, cIdx) => {
                    movedAreasByCard[c.id] = [];
                    if (!c.areas) return;
                    const remainingAreas = [];
                    c.areas.forEach((a, aIdx) => {
                        if (dragState.areaIds.includes(a.id)) {
                            if (isClone) {
                                // 复制模式：深拷贝区域并分配新 id，避免与原区域冲突。
                                const cloned = JSON.parse(JSON.stringify(a));
                                cloned.id = 'area_clone_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '_' + cIdx + '_' + aIdx;
                                movedAreasByCard[c.id].push(cloned);
                                allMovedAreas.push(cloned);
                                remainingAreas.push(a); // 复制模式保留原区域不移除
                            } else {
                                movedAreasByCard[c.id].push(a);
                                allMovedAreas.push(a);
                            }
                        } else {
                            remainingAreas.push(a);
                        }
                    });
                    if (!isClone) c.areas = remainingAreas; // 移动模式才从原卡片移除被拖拽区域
                });

                const targetCard = state.cards.find(c => c.id === targetCardId);
                if (targetCard) {
                    if (!targetCard.areas) targetCard.areas = [];
                    let targetIdx = targetCard.areas.findIndex(a => a.id === targetAreaId);
                    
                    if (targetIdx !== -1) {
                        if (dropPos === 'bottom') targetIdx += 1;
                    } else {
                        targetIdx = targetCard.areas.length;
                    }

                    if (isSameCard) {
                        // 同卡片内拖拽时，需要按目标索引回插，保持顺序一致。
                        // 这里直接使用计算后的 targetIdx（已包含上下半区偏移）。
                        state.cards.forEach(c => {
                            const moved = movedAreasByCard[c.id];
                            if (moved && moved.length > 0) {
                                // 以目标索引为镜像位置插入，避免顺序错乱。
                                let absoluteMirrorIdx = Math.max(0, Math.min(targetIdx, c.areas.length));
                                c.areas.splice(absoluteMirrorIdx, 0, ...moved);
                                
                                // 复制模式需补建新增区域 DOM，并重新绑定事件。
                                if (isClone) {
                                    const listEl = document.querySelector(`.clab-card[data-card-id="${c.id}"] .clab-area-list`);
                                    if (listEl) {
                                        moved.forEach(a => {
                                            const temp = document.createElement('div');
                                            temp.innerHTML = generateAreaHTML(a, c);
                                            listEl.appendChild(temp.firstElementChild);
                                        });
                                        attachAreaEvents(listEl);
                                    }
                                }

                                syncAreaDOMOrder(c.id, c.areas);
                                if (window._clabUpdateAreaDOMIdentity) moved.forEach(a => window._clabUpdateAreaDOMIdentity(a.id, c.id));
                            }
                        });
                    } else {
                        targetCard.areas.splice(targetIdx, 0, ...allMovedAreas);
                        
                        state.cards.forEach(c => {
                            if (!isClone && movedAreasByCard[c.id] && movedAreasByCard[c.id].length > 0 && c.id !== targetCardId) {
                                syncAreaDOMOrder(c.id, c.areas);
                            }
                        });
                        
                        // 跨卡片复制时也要补建目标卡片中的新增 DOM。
                        if (isClone) {
                            const listEl = document.querySelector(`.clab-card[data-card-id="${targetCardId}"] .clab-area-list`);
                            if (listEl) {
                                allMovedAreas.forEach(a => {
                                    const temp = document.createElement('div');
                                    temp.innerHTML = generateAreaHTML(a, targetCard);
                                    listEl.appendChild(temp.firstElementChild);
                                });
                                attachAreaEvents(listEl);
                            }
                        }

                        syncAreaDOMOrder(targetCardId, targetCard.areas);
                        if (window._clabUpdateAreaDOMIdentity) allMovedAreas.forEach(a => window._clabUpdateAreaDOMIdentity(a.id, targetCardId));
                    }
                    
                    // 复制完成后，将新克隆出的区域设为当前选中，便于后续连续操作。
                    if (isClone && allMovedAreas.length > 0) {
                        state.selectedAreaIds = allMovedAreas.map(a => a.id);
                        updateSelectionUI();
                    }
                    
                    justSave();
                    updateAllDefaultTitles(); 
                }
            }
        });
    });
}
