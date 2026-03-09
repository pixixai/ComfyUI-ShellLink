/**
 * 文件名: comp_modulearea.js
 * 职责: 【路由器与外壳】负责分发 Input/Output 渲染，管理外壳拖拽。
 */
import { state, dragState, saveAndRender } from "./ui_state.js";
import { injectDnDCSS, bindComboSelectEvents } from "./ui_utils.js";
import { generateInputHTML, attachInputEvents } from "./modules/module_input.js";
import { generateOutputHTML, attachOutputEvents } from "./modules/module_output.js";

// 【核心解耦】：仅保存状态到后台节点，拒绝触发全局刷新
export function justSave() {
    if (window.StateManager && window.StateManager.syncToNode) {
        window.StateManager.syncToNode(window.app.graph);
    }
}

// 【终极定点爆破】：自带 Mini-Stash（微型物理金库），局部替换 DOM 时完美保护视频状态！
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
                
                // 【核心修复】：精确比对时间戳 t。如果用户点击了“重新同步”，t 参数会改变，
                // 此时金库必须放弃拦截，让视频真正地重新加载渲染，实现真正的强制刷新！
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
                    if (!stashedPaused) stashedMedia.play().catch(()=>{});
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

// 【魔法纠偏】：静默扫描全场，给所有的卡片和模块理顺排队序号
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

// 【全新洗牌引擎】：当模块发生物理位移时，重写 DOM 上所有残留的卡片 ID 烙印
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
        
        // 【防御补丁】：强行确保所有模块节点都具备原生物理拖拽能力
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
            if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName) || e.target.closest('.clab-custom-select') || e.target.closest('.clab-bool-label') || e.target.closest('.clab-upload-zone') || e.target.closest('.clab-history-thumb')) return;
            
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
            
            // 【核心修复】：为新生儿（新建工作流中刚添加的模块）提供户口本补录保险
            if (!dragState.sourceInfo[currentAreaId]) {
                state.cards.forEach(c => {
                    const idx = c.areas?.findIndex(a => a.id === currentAreaId);
                    if (idx !== -1 && idx !== undefined) {
                        dragState.sourceInfo[currentAreaId] = { cardId: c.id, index: idx };
                    }
                });
            }
            
            e.dataTransfer.effectAllowed = 'move';
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
            dragState.type = null; dragState.cardId = null; dragState.anchorAreaId = null; dragState.areaIds = null; dragState.sourceInfo = null;
        });

        areaEl.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds && !dragState.areaIds.includes(areaEl.dataset.areaId)) {
                e.preventDefault(); e.stopPropagation();
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

        // 降落阶段 - 【全新绝对镜像平行拖拽引擎】
        areaEl.addEventListener('drop', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault(); e.stopPropagation();
                const dropPos = areaEl.dataset.dropPosition;
                areaEl.classList.remove('clab-drag-over-area-top', 'clab-drag-over-area-bottom');
                delete areaEl.dataset.dropPosition;
                
                const targetCardId = areaEl.dataset.cardId;
                const targetAreaId = areaEl.dataset.areaId;
                
                if (dragState.areaIds.includes(targetAreaId)) return;
                const isSameCard = (targetCardId === dragState.cardId);

                const movedAreasByCard = {};
                const allMovedAreas = []; 
                
                state.cards.forEach(c => {
                    movedAreasByCard[c.id] = [];
                    if (!c.areas) return;
                    const remainingAreas = [];
                    c.areas.forEach(a => {
                        if (dragState.areaIds.includes(a.id)) {
                            movedAreasByCard[c.id].push(a);
                            allMovedAreas.push(a);
                        } else {
                            remainingAreas.push(a);
                        }
                    });
                    c.areas = remainingAreas;
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
                        // 【核心修复】：放弃容易造成歧义的相对 delta 运算！
                        // 直接使用主目标卡片的绝对插入位置 (targetIdx) 作为全宇宙的降落坐标！
                        state.cards.forEach(c => {
                            const moved = movedAreasByCard[c.id];
                            if (moved && moved.length > 0) {
                                // 强制在同一绝对索引处执行插入，达成完美的平行镜像同步！
                                let absoluteMirrorIdx = Math.max(0, Math.min(targetIdx, c.areas.length));
                                c.areas.splice(absoluteMirrorIdx, 0, ...moved);
                                
                                syncAreaDOMOrder(c.id, c.areas);
                                if (window._clabUpdateAreaDOMIdentity) moved.forEach(a => window._clabUpdateAreaDOMIdentity(a.id, c.id));
                            }
                        });
                    } else {
                        targetCard.areas.splice(targetIdx, 0, ...allMovedAreas);
                        
                        state.cards.forEach(c => {
                            if (movedAreasByCard[c.id] && movedAreasByCard[c.id].length > 0 && c.id !== targetCardId) {
                                syncAreaDOMOrder(c.id, c.areas);
                            }
                        });
                        
                        syncAreaDOMOrder(targetCardId, targetCard.areas);
                        if (window._clabUpdateAreaDOMIdentity) allMovedAreas.forEach(a => window._clabUpdateAreaDOMIdentity(a.id, targetCardId));
                    }
                    
                    justSave();
                    updateAllDefaultTitles(); 
                }
            }
        });
    });
}