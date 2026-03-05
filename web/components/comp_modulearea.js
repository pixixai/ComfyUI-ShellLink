/**
 * comp_modulearea.js：【路由器与外壳】负责分发 Input/Output 渲染，管理外壳拖拽。
 */
import { state, dragState, saveAndRender } from "./ui_state.js";
import { injectDnDCSS, bindComboSelectEvents } from "./ui_utils.js";
import { generateInputHTML, attachInputEvents } from "./modules/module_input.js";
import { generateOutputHTML, attachOutputEvents } from "./modules/module_output.js";

export function generateAreaHTML(area, card) {
    if (area.type === 'edit') return generateInputHTML(area, card);
    if (area.type === 'preview') return generateOutputHTML(area, card);
    return '';
}

export function attachAreaEvents(container) {
    injectDnDCSS();
    attachInputEvents(container);
    attachOutputEvents(container);
    bindComboSelectEvents(container, state, saveAndRender);

    // =========================================================================
    // 【核心升级】：支持模块多选后的批量删除
    // =========================================================================
    container.querySelectorAll('.sl-del-area-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const { card: cardId, area: areaId } = e.target.dataset;
            const isSelected = state.selectedAreaIds.includes(areaId);

            if (isSelected && state.selectedAreaIds.length > 1) {
                // 批量删除所有选中的模块
                state.cards.forEach(c => {
                    if (c.areas) {
                        c.areas = c.areas.filter(a => !state.selectedAreaIds.includes(a.id));
                    }
                });
                state.selectedAreaIds = [];
            } else {
                // 单独删除这一个模块
                const card = state.cards.find(c => c.id === cardId);
                if(card) {
                    card.areas = card.areas.filter(a => a.id !== areaId);
                    state.selectedAreaIds = state.selectedAreaIds.filter(id => id !== areaId);
                }
            }
            saveAndRender();
        };
    });

    container.querySelectorAll('.sl-area-title-input').forEach(input => {
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
                saveAndRender();
            }
        };
    });

    // 🚨 所有的 click/mousedown 全盘铲除，彻绝冲突
    container.querySelectorAll('.sl-area').forEach(areaEl => {
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

        // =========================================================================
        // 【核心升级】：拖拽起飞阶段，识别多选阵列
        // =========================================================================
        areaEl.addEventListener('dragstart', (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || e.target.closest('.sl-custom-select') || e.target.closest('.sl-bool-label') || e.target.closest('.sl-upload-zone') || e.target.closest('.sl-history-thumb')) return;
            
            e.stopPropagation(); 
            const currentAreaId = areaEl.dataset.areaId;

            // 判断拖拽的是否在多选数组内，如果是，则拉起整个多选阵列；否则只拉起自己
            let draggedIds = [currentAreaId];
            if (state.selectedAreaIds.includes(currentAreaId)) {
                draggedIds = [...state.selectedAreaIds];
            }

            dragState.type = 'area';
            dragState.cardId = areaEl.dataset.cardId;
            dragState.areaIds = draggedIds; // 核心：使用数组存储被拖拽的所有模块 ID
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'area');
            
            setTimeout(() => {
                // 让所有被拖拽的模块都进入半透明拖拽状态
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
            dragState.type = null; dragState.cardId = null; dragState.areaIds = null;
        });

        areaEl.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            // 判断如果拖拽的是模块，并且目标模块不在拖拽阵列中，则允许放置
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

        // =========================================================================
        // 【核心升级】：降落阶段，批量提取并重组排序
        // =========================================================================
        areaEl.addEventListener('drop', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault(); e.stopPropagation();
                const dropPos = areaEl.dataset.dropPosition;
                areaEl.classList.remove('sl-drag-over-area-top', 'sl-drag-over-area-bottom');
                delete areaEl.dataset.dropPosition;
                
                const targetCardId = areaEl.dataset.cardId;
                const targetAreaId = areaEl.dataset.areaId;
                
                // 禁止放置在被拖拽阵列自身上
                if (dragState.areaIds.includes(targetAreaId)) return;

                // 1. 从整个面板的所有卡片中，将这批模块按原顺序剥离出来
                const movedAreas = [];
                state.cards.forEach(c => {
                    if (!c.areas) return;
                    const remainingAreas = [];
                    c.areas.forEach(a => {
                        if (dragState.areaIds.includes(a.id)) {
                            movedAreas.push(a);
                        } else {
                            remainingAreas.push(a);
                        }
                    });
                    c.areas = remainingAreas;
                });

                // 2. 找到目标卡片及插入锚点
                const targetCard = state.cards.find(c => c.id === targetCardId);
                if (!targetCard.areas) targetCard.areas = [];
                
                let targetIdx = targetCard.areas.findIndex(a => a.id === targetAreaId);
                
                if (targetIdx !== -1) {
                    if (dropPos === 'bottom') targetIdx += 1;
                    // 使用 spread 语法将整个阵列一次性插入
                    targetCard.areas.splice(targetIdx, 0, ...movedAreas);
                    saveAndRender();
                } else {
                    targetCard.areas.push(...movedAreas);
                    saveAndRender();
                }
            }
        });
    });
}