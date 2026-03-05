/**
 * 文件名: comp_taskcard.js
 * 职责: 【组件】负责“任务卡片”列表的 HTML 生成、中线判定拖拽排序与事件交互
 */
import { state, dragState, appState, saveAndRender } from "./ui_state.js";
import { generateAreaHTML } from "./comp_modulearea.js";

// 底部兜底的全局添加任务
function addNewCard() {
    const newCard = { id: 'card_' + Date.now(), title: ``, areas: [] };
    state.cards.push(newCard);
    state.selectedCardIds = [newCard.id];
    state.activeCardId = newCard.id;
    state.selectedAreaIds = []; 
    appState.lastClickedCardId = newCard.id;
    saveAndRender();
    
    setTimeout(() => {
        const container = document.querySelector("#sl-cards-container");
        if (container) container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
    }, 50);
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
            const cardEl = document.createElement("div");
            const isCardSelected = state.selectedCardIds && state.selectedCardIds.includes(card.id);
            cardEl.className = `sl-card ${isCardSelected ? 'active selected' : ''}`;
            if (isCardSelected) cardEl.style.borderColor = '#4CAF50';
            cardEl.dataset.cardId = card.id;
            cardEl.setAttribute('draggable', 'true');
            
            let areasHtml = (card.areas || []).map(area => generateAreaHTML(area, card)).join('');
            const defaultTitle = `#${index + 1}`;
            const displayTitle = card.title ? card.title : defaultTitle;

            cardEl.innerHTML = `
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
            `;
            wrapper.appendChild(cardEl);
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
    inlineAddBtn.onclick = addNewCard;
    
    container.appendChild(wrapper);
}

export function attachCardEvents(container) {
    container.querySelectorAll('.sl-card-title-input').forEach(input => {
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
                saveAndRender(); 
            }
        };
    });

    // 批量删除逻辑完全保留
    container.querySelectorAll('.sl-del-card-btn').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.target.dataset.id;
            let idsToDelete = [id];
            if (state.selectedCardIds && state.selectedCardIds.includes(id) && state.selectedCardIds.length > 1) {
                idsToDelete = [...state.selectedCardIds];
            }
            state.cards = state.cards.filter(c => !idsToDelete.includes(c.id));
            if (state.selectedCardIds) state.selectedCardIds = state.selectedCardIds.filter(selId => !idsToDelete.includes(selId));
            state.activeCardId = (state.selectedCardIds && state.selectedCardIds.length > 0) ? state.selectedCardIds[state.selectedCardIds.length - 1] : null;
            saveAndRender();
        };
    });

    container.querySelectorAll('.sl-card').forEach(cardEl => {
        if (cardEl.classList.contains('sl-add-card-inline')) return;

        // =========================================================================
        // 卡片层级的批量拖拽与重组引擎 (利用全局护盾，无需拦截 click)
        // =========================================================================
        cardEl.addEventListener('dragstart', (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || e.target.closest('.sl-custom-select') || e.target.closest('.sl-edit-val-bool')) {
                e.preventDefault(); return;
            }
            if (e.target.closest('.sl-area')) return; 

            const currentCardId = cardEl.dataset.cardId;

            // 识别是否处于多选阵列中
            let draggedIds = [currentCardId];
            if (state.selectedCardIds && state.selectedCardIds.includes(currentCardId)) {
                draggedIds = [...state.selectedCardIds];
            }

            dragState.type = 'card';
            dragState.cardIds = draggedIds; // 核心：记录多选数组
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'card');
            
            setTimeout(() => {
                // 让被选中的所有卡片都变半透明进入拖拽状态
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
            // 禁止拖放到自己或自己多选的卡片上
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
                    
                    // 1. 将被拖拽的所有卡片从原位置剥离
                    const movedCards = [];
                    const remainingCards = [];
                    state.cards.forEach(c => {
                        if (dragState.cardIds.includes(c.id)) movedCards.push(c);
                        else remainingCards.push(c);
                    });
                    state.cards = remainingCards;
                    
                    // 2. 找到目标卡片并整体插入
                    let targetIdx = state.cards.findIndex(c => c.id === targetCardId);
                    if (targetIdx !== -1) {
                        if (dropPos === 'right') targetIdx += 1; 
                        state.cards.splice(targetIdx, 0, ...movedCards);
                        saveAndRender();
                    } else {
                        state.cards.push(...movedCards);
                        saveAndRender();
                    }
                }
            }
        });
    });

    // =========================================================================
    // 处理模块(Area) 被批量拖拽到卡片空白主体(Card Body) 内的跨界操作
    // =========================================================================
    container.querySelectorAll('.sl-card-body').forEach(bodyEl => {
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
                    
                    // 剥离所有拖动的模块
                    const movedAreas = [];
                    state.cards.forEach(c => {
                        if (!c.areas) return;
                        const remaining = [];
                        c.areas.forEach(a => {
                            if (dragState.areaIds.includes(a.id)) movedAreas.push(a);
                            else remaining.push(a);
                        });
                        c.areas = remaining;
                    });
                    
                    // 插入到目标卡片最末尾
                    const targetCard = state.cards.find(c => c.id === targetCardId);
                    if (!targetCard.areas) targetCard.areas = [];
                    targetCard.areas.push(...movedAreas); 
                    saveAndRender();
                }
            }
        });
    });
}