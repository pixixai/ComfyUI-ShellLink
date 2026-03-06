/**
 * 文件名: comp_taskcard.js
 * 职责: 【组件】负责“任务卡片”列表的 HTML 生成、局部物理拖拽与单点重绘
 */
import { state, dragState, appState } from "./ui_state.js";
import { generateAreaHTML, syncAreaDOMOrder, justSave } from "./comp_modulearea.js";
import { updateSelectionUI } from "./ui_selection.js";

// 【新核武器】：提供单个卡片实体的纯净渲染，拒绝波及池鱼
export function generateSingleCardHTML(card, index) {
    const isCardSelected = state.selectedCardIds && state.selectedCardIds.includes(card.id);
    const borderStyle = isCardSelected ? 'border-color: #4CAF50;' : '';
    const activeClass = isCardSelected ? 'active selected' : '';
    let areasHtml = (card.areas || []).map(area => generateAreaHTML(area, card)).join('');
    const defaultTitle = `#${index + 1}`;
    const displayTitle = card.title ? card.title : defaultTitle;

    return `
        <div class="sl-card ${activeClass}" style="${borderStyle}" data-card-id="${card.id}" draggable="true">
            <div class="sl-card-title-bar" style="cursor: grab; position: relative;">
                <input class="sl-card-title-input" type="text" data-id="${card.id}" data-default="${defaultTitle}" value="${displayTitle}" placeholder="${defaultTitle}" size="${Math.max(displayTitle.length, 2)}" style="width: unset; max-width: 240px; min-width: 30px;" />
                
                <div class="sl-card-progress-container" data-card-prog-id="${card.id}" style="position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; opacity: 0; transition: opacity 0.3s ease; z-index: 5;">
                    <div class="sl-card-progress-bar" style="height: 100%; width: 0%; background: #4CAF50; transition: width 0.1s ease-out, background-color 0.2s; box-shadow: 0 0 5px rgba(76,175,80,0.5);"></div>
                </div>
            </div>
            <button class="sl-del-card-btn" data-id="${card.id}" title="删除此任务(若多选则批量删除)">✖</button>
            <div class="sl-card-body" data-card-id="${card.id}">
                <div class="sl-area-list" data-card-id="${card.id}">${areasHtml}</div>
            </div>
        </div>
    `;
}

export function renderCardsList(container) {
    if (!document.getElementById('sl-card-dnd-styles')) {
        const style = document.createElement('style');
        style.id = 'sl-card-dnd-styles';
        style.innerHTML = `
            .sl-drag-over-card-left { border-left: 3px solid #4CAF50 !important; }
            .sl-drag-over-card-right { border-right: 3px solid #4CAF50 !important; }
        `;
        document.head.appendChild(style);
    }

    container.innerHTML = "";
    
    const panelContainer = container.closest('#shell-link-panel');
    if (panelContainer) {
        if (state.painterMode) panelContainer.classList.add('sl-painter-active');
        else panelContainer.classList.remove('sl-painter-active');
    }

    const wrapper = document.createElement("div");
    wrapper.className = "sl-cards-wrapper";
    
    const containerWidth = container.clientWidth > 0 ? container.clientWidth : window.innerWidth * 0.8;
    const innerWidth = containerWidth - 40; 
    const cardsWidth = state.cards.length * 360 - 20; 
    const isOverflowing = cardsWidth >= innerWidth;

    wrapper.style.cssText = `
        display: flex; gap: 20px; position: relative;
        margin-left: ${isOverflowing ? '0' : 'auto'};
        margin-right: ${isOverflowing ? '0' : 'auto'};
        height: 100%; align-items: stretch;
    `;

    if (state.cards.length > 0) {
        state.cards.forEach((card, index) => {
            const temp = document.createElement('div');
            temp.innerHTML = generateSingleCardHTML(card, index);
            wrapper.appendChild(temp.firstElementChild);
        });
    }

    const inlineAddBtn = document.createElement("div");
    inlineAddBtn.className = "sl-card sl-add-card-inline";
    inlineAddBtn.innerHTML = `<span style="font-size: 32px; color: #ccc; margin-bottom: 15px; font-weight: 300;">+</span><span style="font-size: 16px; color: #ccc;">新建任务</span>`;
    
    if (state.cards.length === 0) {
        inlineAddBtn.style.cssText = `
            display: flex; flex-direction: column; justify-content: center; align-items: center; 
            background: rgba(255,255,255,0.02); border: 2px dashed rgba(255,255,255,0.1); 
            cursor: pointer; flex: 0 0 340px; width: 340px; height: 100%; box-sizing: border-box; 
            opacity: 0.7; transition: all 0.2s; margin: auto;
        `;
        wrapper.appendChild(inlineAddBtn);
    } else {
        inlineAddBtn.style.cssText = `
            display: flex; flex-direction: column; justify-content: center; align-items: center; 
            background: rgba(255,255,255,0.02); border: 2px dashed rgba(255,255,255,0.1); 
            cursor: pointer; flex: 0 0 340px; width: 340px; box-sizing: border-box; 
            opacity: 0.7; transition: all 0.2s;
            position: absolute; left: 100%; top: 0; bottom: 0; margin-left: 20px;
            box-shadow: 20px 0 0 transparent;
        `;
        wrapper.appendChild(inlineAddBtn);
    }
    
    inlineAddBtn.onmouseover = () => {
        inlineAddBtn.style.opacity = '1';
        inlineAddBtn.style.background = 'rgba(255,255,255,0.06)';
        inlineAddBtn.style.borderColor = 'rgba(255,255,255,0.3)';
    };
    inlineAddBtn.onmouseout = () => {
        inlineAddBtn.style.opacity = '0.7';
        inlineAddBtn.style.background = 'rgba(255,255,255,0.02)';
        inlineAddBtn.style.borderColor = 'rgba(255,255,255,0.1)';
    };
    
    inlineAddBtn.onclick = () => {
        const newCard = { id: 'card_' + Date.now(), title: ``, areas: [] };
        state.cards.push(newCard);
        state.selectedCardIds = [newCard.id];
        state.activeCardId = newCard.id;
        state.selectedAreaIds = []; 
        appState.lastClickedCardId = newCard.id;
        
        const temp = document.createElement('div');
        temp.innerHTML = generateSingleCardHTML(newCard, state.cards.length - 1);
        wrapper.insertBefore(temp.firstElementChild, inlineAddBtn);
        
        attachCardEvents(wrapper);
        justSave();
        updateSelectionUI();
        
        if (window._slUpdateAllDefaultTitles) window._slUpdateAllDefaultTitles(); // 新建后纠正

        setTimeout(() => {
            const dContainer = document.querySelector("#sl-cards-container");
            if (dContainer) dContainer.scrollTo({ left: dContainer.scrollWidth, behavior: 'smooth' });
        }, 50);
    };
    
    container.appendChild(wrapper);
}

export function attachCardEvents(container) {
    container.querySelectorAll('.sl-card-title-input').forEach(input => {
        if (input.dataset.slEventsBound) return;
        input.dataset.slEventsBound = "1";

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

    container.querySelectorAll('.sl-del-card-btn').forEach(btn => {
        if (btn.dataset.slEventsBound) return;
        btn.dataset.slEventsBound = "1";

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
                const el = document.querySelector(`.sl-card[data-card-id="${delId}"]`);
                if (el) el.remove();
            });
            justSave();
            updateSelectionUI();
            if (window._slUpdateAllDefaultTitles) window._slUpdateAllDefaultTitles(); // 删除后纠正
        };
    });

    container.querySelectorAll('.sl-card:not(.sl-add-card-inline)').forEach(cardEl => {
        if (cardEl.dataset.slEventsBound) return;
        cardEl.dataset.slEventsBound = "1";

        cardEl.addEventListener('dragstart', (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || e.target.closest('.sl-custom-select') || e.target.closest('.sl-edit-val-bool')) {
                e.preventDefault(); return;
            }
            if (e.target.closest('.sl-area')) return; 

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
                    const el = document.querySelector(`.sl-card[data-card-id="${id}"]`);
                    if (el) el.classList.add('sl-dragging');
                });
            }, 0);
        });

        cardEl.addEventListener('dragend', () => {
            document.querySelectorAll('.sl-dragging').forEach(el => el.classList.remove('sl-dragging'));
            document.querySelectorAll('.sl-drag-over-card-left, .sl-drag-over-card-right').forEach(el => {
                el.classList.remove('sl-drag-over-card-left', 'sl-drag-over-card-right');
            });
            dragState.type = null; dragState.cardIds = null; dragState.areaIds = null;
        });

        cardEl.addEventListener('dragover', (e) => {
            if (dragState.type === 'card' && dragState.cardIds && !dragState.cardIds.includes(cardEl.dataset.cardId)) {
                e.preventDefault();
                const rect = cardEl.getBoundingClientRect();
                const midX = rect.left + rect.width / 2; 
                
                if (e.clientX < midX) {
                    cardEl.classList.add('sl-drag-over-card-left');
                    cardEl.classList.remove('sl-drag-over-card-right');
                    cardEl.dataset.dropPosition = 'left';
                } else {
                    cardEl.classList.add('sl-drag-over-card-right');
                    cardEl.classList.remove('sl-drag-over-card-left');
                    cardEl.dataset.dropPosition = 'right';
                }
            }
        });

        cardEl.addEventListener('dragleave', (e) => {
            if (!cardEl.contains(e.relatedTarget)) {
                cardEl.classList.remove('sl-drag-over-card-left', 'sl-drag-over-card-right');
                delete cardEl.dataset.dropPosition;
            }
        });

        cardEl.addEventListener('drop', (e) => {
            if (dragState.type === 'card' && dragState.cardIds) {
                e.preventDefault(); e.stopPropagation();
                
                const dropPos = cardEl.dataset.dropPosition;
                cardEl.classList.remove('sl-drag-over-card-left', 'sl-drag-over-card-right');
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

                    const inlineBtn = wrapper.querySelector('.sl-add-card-inline');
                    state.cards.forEach(c => {
                        const el = wrapper.querySelector(`.sl-card[data-card-id="${c.id}"]`);
                        if (el) wrapper.insertBefore(el, inlineBtn);
                    });
                    
                    justSave();
                    if (window._slUpdateAllDefaultTitles) window._slUpdateAllDefaultTitles(); // 拖拽后纠正
                }
            }
        });
    });

    container.querySelectorAll('.sl-card-body').forEach(bodyEl => {
        if (bodyEl.dataset.slEventsBound) return;
        bodyEl.dataset.slEventsBound = "1";

        bodyEl.addEventListener('dragover', (e) => {
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault();
                if (!e.target.closest('.sl-area')) {
                    bodyEl.classList.add('sl-drag-over-list');
                } else {
                    bodyEl.classList.remove('sl-drag-over-list');
                }
            }
        });

        bodyEl.addEventListener('dragleave', (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
                bodyEl.classList.remove('sl-drag-over-list');
            }
        });

        bodyEl.addEventListener('drop', (e) => {
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault(); e.stopPropagation();
                bodyEl.classList.remove('sl-drag-over-list');
                
                if (!e.target.closest('.sl-area')) {
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

                    justSave();
                    if (window._slUpdateAllDefaultTitles) window._slUpdateAllDefaultTitles(); // 拖入空卡片后纠正
                }
            }
        });
    });
}