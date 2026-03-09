/**
 * 文件名: comp_taskcard.js
 * 职责: 【组件】负责“任务卡片”列表的 HTML 生成、局部物理拖拽与单点重绘
 */
import { state, dragState, appState } from "./ui_state.js";
import { generateAreaHTML, syncAreaDOMOrder, justSave } from "./comp_modulearea.js";
import { updateSelectionUI } from "./ui_selection.js";

// 【全新动态布局引擎】：同步精确计算纯卡片宽度，控制自适应居中与左对齐
export function updateCardsLayout() {
    const container = document.querySelector('#clab-cards-container');
    const wrapper = document.querySelector('.clab-cards-wrapper');
    if (!container || !wrapper) return;

    const cardEls = wrapper.querySelectorAll('.clab-card');
    const count = cardEls.length;
    
    // 【核心修复 1】：彻底抛弃 20ms 的 setTimeout 异步等待！
    // 刚插入的卡片就算没被浏览器绘制出 offsetWidth 也没关系，
    // 我们直接抓取面板配置的 CSS 绝对宽度，做到“未卜先知”的 0 延迟同步排版！
    let cardWidth = 340; 
    const panel = document.getElementById('clab-panel');
    if (panel) {
        const cssVal = parseInt(getComputedStyle(panel).getPropertyValue('--clab-card-width'));
        if (!isNaN(cssVal) && cssVal > 0) {
            cardWidth = cssVal;
        } else if (cardEls.length > 0 && cardEls[0].offsetWidth > 0) {
            cardWidth = cardEls[0].offsetWidth;
        }
    }

    const gap = 20;
    const totalWidth = count > 0 ? (count * cardWidth + (count - 1) * gap) : 0;

    // 核心排版：如果连卡片都没有，直接占满；如果有，严丝合缝地包裹
    if (totalWidth === 0) {
        wrapper.style.width = '100%';
        wrapper.style.flex = '1';
        wrapper.style.margin = '0';
        return;
    }

    wrapper.style.width = `${totalWidth}px`;
    wrapper.style.flex = 'none';

    const containerWidth = container.clientWidth > 0 ? container.clientWidth : window.innerWidth * 0.8;
    
    // 判断溢出时减去 40px 的安全内边距
    if (totalWidth >= containerWidth - 40) {
        wrapper.style.margin = '0'; // 溢出时靠左，允许滚动
    } else {
        wrapper.style.margin = '0 auto'; // 未溢出时完美纯净居中
    }
}
window._clabUpdateCardsLayout = updateCardsLayout;

export function generateSingleCardHTML(card, index) {
    const isCardSelected = state.selectedCardIds && state.selectedCardIds.includes(card.id);
    const borderStyle = isCardSelected ? 'border-color: #4CAF50;' : '';
    const activeClass = isCardSelected ? 'active selected' : '';
    let areasHtml = (card.areas || []).map(area => generateAreaHTML(area, card)).join('');
    const defaultTitle = `#${index + 1}`;
    const displayTitle = card.title ? card.title : defaultTitle;

    return `
        <div class="clab-card ${activeClass}" style="${borderStyle}" data-card-id="${card.id}" draggable="true">
            <div class="clab-card-title-bar" style="cursor: grab; position: relative;">
                <input class="clab-card-title-input" type="text" data-id="${card.id}" data-default="${defaultTitle}" value="${displayTitle}" placeholder="${defaultTitle}" size="${Math.max(displayTitle.length, 2)}" style="width: unset; max-width: 240px; min-width: 30px;" />
                
                <div class="clab-card-progress-container" data-card-prog-id="${card.id}" style="position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; opacity: 0; transition: opacity 0.3s ease; z-index: 5;">
                    <div class="clab-card-progress-bar" style="height: 100%; width: 0%; background: #4CAF50; transition: width 0.1s ease-out, background-color 0.2s; box-shadow: 0 0 5px rgba(76,175,80,0.5);"></div>
                </div>
            </div>
            <button class="clab-del-card-btn" data-id="${card.id}" title="删除此任务(若多选则批量删除)">✖</button>
            <div class="clab-card-body" data-card-id="${card.id}">
                <div class="clab-area-list" data-card-id="${card.id}">${areasHtml}</div>
            </div>
        </div>
    `;
}

export function renderCardsList(container) {
    if (!document.getElementById('clab-card-dnd-styles')) {
        const style = document.createElement('style');
        style.id = 'clab-card-dnd-styles';
        style.innerHTML = `
            .clab-drag-over-card-left { border-left: 3px solid #4CAF50 !important; }
            .clab-drag-over-card-right { border-right: 3px solid #4CAF50 !important; }
        `;
        document.head.appendChild(style);
    }

    container.innerHTML = "";
    
    const panelContainer = container.closest('#clab-panel');
    if (panelContainer) {
        if (state.painterMode) panelContainer.classList.add('clab-painter-active');
        else panelContainer.classList.remove('clab-painter-active');
    }

    const wrapper = document.createElement("div");
    wrapper.className = "clab-cards-wrapper";
    
    // 【核心修复 2】：彻底剔除 transition: margin 0.3s ease;
    // 这样在创建新卡片需要居中对齐时，不会再产生任何拖泥带水的“平移滑动动画”，瞬间清爽对齐！
    wrapper.style.cssText = `
        display: flex; gap: 20px; position: relative;
        height: 100%; align-items: stretch;
    `;

    if (state.cards.length > 0) {
        state.cards.forEach((card, index) => {
            const temp = document.createElement('div');
            temp.innerHTML = generateSingleCardHTML(card, index);
            wrapper.appendChild(temp.firstElementChild);
        });
    }

    container.appendChild(wrapper);
    
    // 界面初次打开时，同步执行一次对齐排版
    if (window._clabUpdateCardsLayout) window._clabUpdateCardsLayout();
}

export function attachCardEvents(container) {
    container.querySelectorAll('.clab-card-title-input').forEach(input => {
        if (input.dataset.clabEventsBound) return;
        input.dataset.clabEventsBound = "1";

        input.addEventListener('input', function() {
            this.size = Math.max(this.value.length, 2); 
        });

        input.onchange = (e) => {
            const card = state.cards.find(c => c.id === e.target.dataset.id);
            if(card) { 
                const defaultTitle = e.target.dataset.default;
                const currentVal = e.target.value.trim();
                if (currentVal === defaultTitle || currentVal === '') card.title = '';
                else card.title = currentVal; 
                justSave(); 
            }
        };
    });

    container.querySelectorAll('.clab-del-card-btn').forEach(btn => {
        if (btn.dataset.clabEventsBound) return;
        btn.dataset.clabEventsBound = "1";

        btn.onclick = (e) => {
            const id = e.target.dataset.id;
            let idsToDelete = [id];
            if (state.selectedCardIds && state.selectedCardIds.includes(id) && state.selectedCardIds.length > 1) {
                idsToDelete = [...state.selectedCardIds];
            }
            state.cards = state.cards.filter(c => !idsToDelete.includes(c.id));
            if (state.selectedCardIds) state.selectedCardIds = state.selectedCardIds.filter(selId => !idsToDelete.includes(selId));
            state.activeCardId = (state.selectedCardIds && state.selectedCardIds.length > 0) ? state.selectedCardIds[state.selectedCardIds.length - 1] : null;
            
            idsToDelete.forEach(delId => {
                const el = document.querySelector(`.clab-card[data-card-id="${delId}"]`);
                if (el) el.remove();
            });
            justSave();
            updateSelectionUI();
            if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles(); 
            
            if (window._clabUpdateCardsLayout) window._clabUpdateCardsLayout();
        };
    });

    container.querySelectorAll('.clab-card').forEach(cardEl => {
        if (cardEl.dataset.clabEventsBound) return;
        cardEl.dataset.clabEventsBound = "1";

        cardEl.addEventListener('dragstart', (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || e.target.closest('.clab-custom-select') || e.target.closest('.clab-edit-val-bool')) {
                e.preventDefault(); return;
            }
            if (e.target.closest('.clab-area')) return; 

            const currentCardId = cardEl.dataset.cardId;

            let draggedIds = [currentCardId];
            if (state.selectedCardIds && state.selectedCardIds.includes(currentCardId)) {
                draggedIds = [...state.selectedCardIds];
            }

            dragState.type = 'card';
            dragState.cardIds = draggedIds; 
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'card');
            
            setTimeout(() => {
                draggedIds.forEach(id => {
                    const el = document.querySelector(`.clab-card[data-card-id="${id}"]`);
                    if (el) el.classList.add('clab-dragging');
                });
            }, 0);
        });

        cardEl.addEventListener('dragend', () => {
            document.querySelectorAll('.clab-dragging').forEach(el => el.classList.remove('clab-dragging'));
            document.querySelectorAll('.clab-drag-over-card-left, .clab-drag-over-card-right').forEach(el => {
                el.classList.remove('clab-drag-over-card-left', 'clab-drag-over-card-right');
            });
            dragState.type = null; dragState.cardIds = null; dragState.areaIds = null;
        });

        cardEl.addEventListener('dragover', (e) => {
            if (dragState.type === 'card' && dragState.cardIds && !dragState.cardIds.includes(cardEl.dataset.cardId)) {
                e.preventDefault();
                const rect = cardEl.getBoundingClientRect();
                const midX = rect.left + rect.width / 2; 
                
                if (e.clientX < midX) {
                    cardEl.classList.add('clab-drag-over-card-left');
                    cardEl.classList.remove('clab-drag-over-card-right');
                    cardEl.dataset.dropPosition = 'left';
                } else {
                    cardEl.classList.add('clab-drag-over-card-right');
                    cardEl.classList.remove('clab-drag-over-card-left');
                    cardEl.dataset.dropPosition = 'right';
                }
            }
        });

        cardEl.addEventListener('dragleave', (e) => {
            if (!cardEl.contains(e.relatedTarget)) {
                cardEl.classList.remove('clab-drag-over-card-left', 'clab-drag-over-card-right');
                delete cardEl.dataset.dropPosition;
            }
        });

        cardEl.addEventListener('drop', (e) => {
            if (dragState.type === 'card' && dragState.cardIds) {
                e.preventDefault(); e.stopPropagation();
                
                const dropPos = cardEl.dataset.dropPosition;
                cardEl.classList.remove('clab-drag-over-card-left', 'clab-drag-over-card-right');
                delete cardEl.dataset.dropPosition;
                
                const targetCardId = cardEl.dataset.cardId;
                if (targetCardId && !dragState.cardIds.includes(targetCardId)) {
                    
                    const movedCards = [];
                    const remainingCards = [];
                    state.cards.forEach(c => {
                        if (dragState.cardIds.includes(c.id)) movedCards.push(c);
                        else remainingCards.push(c);
                    });
                    state.cards = remainingCards;
                    
                    let targetIdx = state.cards.findIndex(c => c.id === targetCardId);
                    const wrapper = cardEl.parentElement;

                    if (targetIdx !== -1) {
                        if (dropPos === 'right') targetIdx += 1; 
                        state.cards.splice(targetIdx, 0, ...movedCards);
                    } else {
                        state.cards.push(...movedCards);
                    }

                    state.cards.forEach(c => {
                        const el = wrapper.querySelector(`.clab-card[data-card-id="${c.id}"]`);
                        if (el) wrapper.appendChild(el);
                    });
                    
                    justSave();
                    if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
                }
            }
        });
    });

    container.querySelectorAll('.clab-card-body').forEach(bodyEl => {
        if (bodyEl.dataset.clabEventsBound) return;
        bodyEl.dataset.clabEventsBound = "1";

        bodyEl.addEventListener('dragover', (e) => {
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault();
                if (!e.target.closest('.clab-area')) {
                    bodyEl.classList.add('clab-drag-over-list');
                } else {
                    bodyEl.classList.remove('clab-drag-over-list');
                }
            }
        });

        bodyEl.addEventListener('dragleave', (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
                bodyEl.classList.remove('clab-drag-over-list');
            }
        });

        bodyEl.addEventListener('drop', (e) => {
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault(); e.stopPropagation();
                bodyEl.classList.remove('clab-drag-over-list');
                
                if (!e.target.closest('.clab-area')) {
                    const targetCardId = bodyEl.dataset.cardId;
                    if (!targetCardId) return;
                    
                    const movedAreas = [];
                    state.cards.forEach(c => {
                        if (!c.areas) return;
                        const remaining = [];
                        c.areas.forEach(a => {
                            if (dragState.areaIds.includes(a.id)) movedAreas.push(a);
                            else remaining.push(a);
                        });
                        c.areas = remaining;
                        syncAreaDOMOrder(c.id, c.areas);
                    });
                    
                    const targetCard = state.cards.find(c => c.id === targetCardId);
                    if (!targetCard.areas) targetCard.areas = [];
                    targetCard.areas.push(...movedAreas); 
                    syncAreaDOMOrder(targetCardId, targetCard.areas);
                    
                    if (window._clabUpdateAreaDOMIdentity) movedAreas.forEach(a => window._clabUpdateAreaDOMIdentity(a.id, targetCardId));

                    justSave();
                    if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles(); 
                }
            }
        });
    });
}