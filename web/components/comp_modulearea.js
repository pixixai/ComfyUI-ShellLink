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
    // 支持模块多选后的批量删除
    // =========================================================================
    container.querySelectorAll('.sl-del-area-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const { card: cardId, area: areaId } = e.target.dataset;
            const isSelected = state.selectedAreaIds && state.selectedAreaIds.includes(areaId);

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
                    if (state.selectedAreaIds) {
                        state.selectedAreaIds = state.selectedAreaIds.filter(id => id !== areaId);
                    }
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
        // 【高级升级】：起飞阶段 - 记录锚点身份与各模块的原始坐标
        // =========================================================================
        areaEl.addEventListener('dragstart', (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName) || e.target.closest('.sl-custom-select') || e.target.closest('.sl-bool-label') || e.target.closest('.sl-upload-zone') || e.target.closest('.sl-history-thumb')) return;
            
            e.stopPropagation(); 
            const currentAreaId = areaEl.dataset.areaId;

            let draggedIds = [currentAreaId];
            if (state.selectedAreaIds && state.selectedAreaIds.includes(currentAreaId)) {
                draggedIds = [...state.selectedAreaIds];
            }

            dragState.type = 'area';
            dragState.cardId = areaEl.dataset.cardId;   // 拖拽的主力(锚点)所在的卡片
            dragState.anchorAreaId = currentAreaId;     // 记录是哪个模块被抓起
            dragState.areaIds = draggedIds; 

            // 引擎预热：扫描全场，记录所有被选中模块的初始卡片归属和坐标
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

        // =========================================================================
        // 【高级升级】：降落阶段 - 智能双模引擎 (平行同步位移 vs 跨卡片汇聚)
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

                // 核心判断：鼠标松开的目标卡片，是不是锚点原本的家？
                const isSameCard = (targetCardId === dragState.cardId);

                // 1. 从各路卡片中将这批模块剥离出来，按卡片归属分好组
                const movedAreasByCard = {};
                const allMovedAreas = []; // 备用：供情况2跨卡片大一统时使用
                
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

                // 2. 找到鼠标实际所在的锚点并计算索引
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
                        // 【情况 1：本卡片内拖动 -> 平行空间同步位移引擎】
                        const anchorOrigIdx = dragState.sourceInfo[dragState.anchorAreaId].index;
                        const delta = targetIdx - anchorOrigIdx; // 计算出位移差

                        state.cards.forEach(c => {
                            const moved = movedAreasByCard[c.id];
                            if (moved && moved.length > 0) {
                                if (c.id === targetCardId) {
                                    // 鼠标所在的源卡片，精准插入指定位置
                                    c.areas.splice(targetIdx, 0, ...moved);
                                } else {
                                    // 平行空间的其它卡片，应用 Delta 位移
                                    const firstOrigIdx = dragState.sourceInfo[moved[0].id].index;
                                    let newIdx = firstOrigIdx + delta;
                                    // 绝对防越界系统：顶破天算0，坠到底算数组长度
                                    newIdx = Math.max(0, Math.min(newIdx, c.areas.length));
                                    c.areas.splice(newIdx, 0, ...moved);
                                }
                            }
                        });
                    } else {
                        // 【情况 2：跨界拖动 -> 万物归一汇聚引擎】
                        // 将全宇宙被选中的模块，全部插入到新卡片的指定缝隙中
                        targetCard.areas.splice(targetIdx, 0, ...allMovedAreas);
                    }
                    
                    saveAndRender();
                }
            }
        });
    });
}