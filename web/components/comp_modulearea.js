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
    const areaEl = document.querySelector(`.sl-area[data-area-id="${areaId}"]`);
    if (!areaEl) return;
    let targetCard = null;
    let targetArea = null;
    state.cards.forEach(c => {
        const a = c.areas?.find(x => x.id === areaId);
        if (a) { targetCard = c; targetArea = a; }
    });
    if (targetCard && targetArea) {
        // --- 1. Mini-Stash：把视频塞进口袋 ---
        const mediaEl = areaEl.querySelector('.sl-media-target');
        let stashedMedia = null, stashedSrc = null, stashedTime = 0, stashedPaused = true;

        if (mediaEl && (mediaEl.tagName === 'VIDEO' || mediaEl.tagName === 'AUDIO')) {
            stashedMedia = mediaEl;
            stashedSrc = mediaEl.getAttribute('src') || '';
            stashedTime = mediaEl.currentTime;
            stashedPaused = mediaEl.paused;
            
            if (!window._slMiniVault) {
                window._slMiniVault = document.createElement('div');
                window._slMiniVault.id = 'sl-mini-vault';
                window._slMiniVault.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0.01; pointer-events: none; z-index: -9999; overflow: hidden;';
                document.body.appendChild(window._slMiniVault);
            }
            window._slMiniVault.appendChild(mediaEl);
        }

        // --- 2. 暴力拔除并换上新 HTML ---
        const temp = document.createElement('div');
        temp.innerHTML = generateAreaHTML(targetArea, targetCard);
        const newAreaEl = temp.firstElementChild;
        areaEl.replaceWith(newAreaEl);
        attachAreaEvents(newAreaEl.parentElement); 

        // --- 3. 从口袋里掏出来完美装回 ---
        if (stashedMedia) {
            const newMediaEl = newAreaEl.querySelector('.sl-media-target');
            if (newMediaEl) {
                const newSrc = newMediaEl.getAttribute('src') || '';
                const oldBase = stashedSrc.split('&t=')[0].split('?t=')[0];
                const newBase = newSrc.split('&t=')[0].split('?t=')[0];
                
                if (oldBase === newBase && oldBase !== '') {
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
    }
}

// 【魔法纠偏】：静默扫描全场，给所有的卡片和模块理顺排队序号
export function updateAllDefaultTitles() {
    document.querySelectorAll('.sl-card:not(.sl-add-card-inline)').forEach((cardEl) => {
        const cardId = cardEl.dataset.cardId;
        const stateCardIdx = state.cards.findIndex(c => c.id === cardId);
        if (stateCardIdx === -1) return;

        // 1. 卡片序号
        const stateCard = state.cards[stateCardIdx];
        const defaultCardTitle = `#${stateCardIdx + 1}`;
        const cardTitleInput = cardEl.querySelector('.sl-card-title-input');
        
        if (cardTitleInput) {
            cardTitleInput.placeholder = defaultCardTitle;
            cardTitleInput.dataset.default = defaultCardTitle;
            if (!stateCard.title) {
                cardTitleInput.value = defaultCardTitle;
                cardTitleInput.size = Math.max(defaultCardTitle.length, 2);
            }
        }

        // 2. 模块序号 (统一给该卡片下的所有区域排号)
        const allAreas = cardEl.querySelectorAll('.sl-area');
        allAreas.forEach((areaEl, aIdx) => {
            const areaId = areaEl.dataset.areaId;
            const stateArea = stateCard.areas?.find(a => a.id === areaId);
            if (!stateArea) return;

            const defaultAreaTitle = `##${aIdx + 1}`;
            const areaTitleInput = areaEl.querySelector('.sl-area-title-input');
            // 输出模块没有标题输入框，所以只更新那些存在的输入框
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

window._slSurgicallyUpdateArea = surgicallyUpdateArea;
window._slJustSave = justSave;
window._slUpdateAllDefaultTitles = updateAllDefaultTitles;
window._slGenerateAreaHTML = generateAreaHTML;
window._slAttachAreaEvents = attachAreaEvents;

export function syncAreaDOMOrder(cardId, newAreasArray) {
    const list = document.querySelector(`.sl-card[data-card-id="${cardId}"] .sl-area-list`);
    if (!list) return;
    newAreasArray.forEach(a => {
        const el = list.querySelector(`.sl-area[data-area-id="${a.id}"]`);
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
    // 这里我们把输入模块下拉框的操作，也替换为不引发全局闪烁的微创更新
    bindComboSelectEvents(container, state, () => {
        if (window._slSurgicallyUpdateArea && appState.lastClickedAreaId) {
            window._slSurgicallyUpdateArea(appState.lastClickedAreaId);
            justSave();
        } else {
            saveAndRender();
        }
    });

    container.querySelectorAll('.sl-del-area-btn').forEach(btn => {
        if (btn.dataset.slEventsBound) return;
        btn.dataset.slEventsBound = "1";
        
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
                    const el = document.querySelector(`.sl-area[data-area-id="${id}"]`);
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
                    const el = document.querySelector(`.sl-area[data-area-id="${areaId}"]`);
                    if (el) el.remove(); 
                }
            }
            justSave();
            updateAllDefaultTitles(); // 删除后自动补齐序号
        };
    });

    container.querySelectorAll('.sl-area-title-input').forEach(input => {
        if (input.dataset.slEventsBound) return;
        input.dataset.slEventsBound = "1";
        
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

    container.querySelectorAll('.sl-area').forEach(areaEl => {
        if (areaEl.dataset.slEventsBound) return;
        areaEl.dataset.slEventsBound = "1";

        areaEl.addEventListener('contextmenu', (e) => {
            const areaId = areaEl.dataset.areaId;
            const cardId = areaEl.dataset.cardId;
            const card = state.cards.find(c => c.id === cardId);
            const area = card?.areas.find(a => a.id === areaId);
            
            if (area && area.type === 'preview' && area.resultUrl) {
                if (e.target.closest('.sl-preview-bg') || e.target.closest('.sl-history-thumb')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.ShellLink && window.ShellLink.showPreviewContextMenu) {
                        let targetUrl = area.resultUrl;
                        if (e.target.closest('.sl-history-thumb')) {
                            const thumbIdx = parseInt(e.target.closest('.sl-history-thumb').dataset.index, 10);
                            targetUrl = area.history[thumbIdx];
                        }
                        window.ShellLink.showPreviewContextMenu(e.clientX, e.clientY, cardId, areaId, targetUrl);
                    }
                }
            }
        });

        // 起飞阶段
        areaEl.addEventListener('dragstart', (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName) || e.target.closest('.sl-custom-select') || e.target.closest('.sl-bool-label') || e.target.closest('.sl-upload-zone') || e.target.closest('.sl-history-thumb')) return;
            
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
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'area');
            
            setTimeout(() => {
                draggedIds.forEach(id => {
                    const el = document.querySelector(`.sl-area[data-area-id="${id}"]`);
                    if (el) el.classList.add('sl-dragging');
                });
            }, 0);
        });

        areaEl.addEventListener('dragend', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.sl-dragging').forEach(el => el.classList.remove('sl-dragging'));
            document.querySelectorAll('.sl-drag-over-area-top, .sl-drag-over-area-bottom').forEach(el => {
                el.classList.remove('sl-drag-over-area-top', 'sl-drag-over-area-bottom');
            });
            document.querySelectorAll('.sl-drag-over-list').forEach(el => el.classList.remove('sl-drag-over-list'));
            dragState.type = null; dragState.cardId = null; dragState.anchorAreaId = null; dragState.areaIds = null; dragState.sourceInfo = null;
        });

        areaEl.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds && !dragState.areaIds.includes(areaEl.dataset.areaId)) {
                e.preventDefault(); e.stopPropagation();
                const rect = areaEl.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    areaEl.classList.add('sl-drag-over-area-top');
                    areaEl.classList.remove('sl-drag-over-area-bottom');
                    areaEl.dataset.dropPosition = 'top';
                } else {
                    areaEl.classList.add('sl-drag-over-area-bottom');
                    areaEl.classList.remove('sl-drag-over-area-top');
                    areaEl.dataset.dropPosition = 'bottom';
                }
            }
        });

        areaEl.addEventListener('dragleave', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            e.stopPropagation();
            if (!areaEl.contains(e.relatedTarget)) {
                areaEl.classList.remove('sl-drag-over-area-top', 'sl-drag-over-area-bottom');
                delete areaEl.dataset.dropPosition;
            }
        });

        // 降落阶段 - 物理级 DOM 重排！
        areaEl.addEventListener('drop', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault(); e.stopPropagation();
                const dropPos = areaEl.dataset.dropPosition;
                areaEl.classList.remove('sl-drag-over-area-top', 'sl-drag-over-area-bottom');
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
                        const anchorOrigIdx = dragState.sourceInfo[dragState.anchorAreaId].index;
                        const delta = targetIdx - anchorOrigIdx; 

                        state.cards.forEach(c => {
                            const moved = movedAreasByCard[c.id];
                            if (moved && moved.length > 0) {
                                if (c.id === targetCardId) {
                                    c.areas.splice(targetIdx, 0, ...moved);
                                } else {
                                    const firstOrigIdx = dragState.sourceInfo[moved[0].id].index;
                                    let newIdx = firstOrigIdx + delta;
                                    newIdx = Math.max(0, Math.min(newIdx, c.areas.length));
                                    c.areas.splice(newIdx, 0, ...moved);
                                }
                                syncAreaDOMOrder(c.id, c.areas);
                            }
                        });
                    } else {
                        targetCard.areas.splice(targetIdx, 0, ...allMovedAreas);
                        syncAreaDOMOrder(dragState.cardId, state.cards.find(c => c.id === dragState.cardId).areas);
                        syncAreaDOMOrder(targetCardId, targetCard.areas);
                    }
                    
                    justSave();
                    updateAllDefaultTitles(); // 拖拽结束后，静默纠正标题
                }
            }
        });
    });
}