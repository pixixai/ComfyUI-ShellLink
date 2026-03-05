/**
 * 文件名: event_global.js
 * 职责: 处理全局级别的生命周期事件、快捷键、以及系统级点击防误触护盾
 */
import { state, appState, saveAndRender } from "../ui_state.js";
import { updateSelectionUI } from "../ui_selection.js";
import { enterBindingModeForSelected } from "../actions/action_binding.js";

export function setupGlobalEvents(panelContainer, backdropContainer, togglePanelFunc, performRenderFunc) {
    
    // =========================================================================
    // 【系统级终极护盾】：Window级拦截器，彻底解决事件冒泡导致的多选失效！
    // 兼管“卡片”和“模块”的多选保护逻辑，放在这里符合 MVC 职责单一原则
    // =========================================================================
    if (!window._slGlobalSelectionShield) {
        let isDragging = false;
        
        window.addEventListener('dragstart', () => { isDragging = true; }, true);
        window.addEventListener('dragend', () => { 
            setTimeout(() => { isDragging = false; }, 100); 
        }, true);

        const shieldEvent = (e) => {
            // 放行所有交互型控件
            const isInteractive = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName) ||
                                  e.target.closest('.sl-custom-select') ||
                                  e.target.closest('.sl-history-thumb') ||
                                  e.target.closest('.sl-bool-label') ||
                                  e.target.closest('.sl-upload-zone') ||
                                  e.target.closest('.sl-del-card-btn') ||
                                  e.target.closest('.sl-del-area-btn') ||
                                  e.target.closest('.sl-video-controls-interactive');

            if (isInteractive) return;

            const areaEl = e.target.closest('.sl-area');
            const cardEl = e.target.closest('.sl-card:not(.sl-add-card-inline)');

            let isTargetSelected = false;
            let targetId = null;
            let targetType = null;

            if (areaEl) {
                targetId = areaEl.dataset.areaId;
                isTargetSelected = state.selectedAreaIds && state.selectedAreaIds.includes(targetId);
                targetType = 'area';
            } else if (cardEl) {
                targetId = cardEl.dataset.cardId;
                isTargetSelected = state.selectedCardIds && state.selectedCardIds.includes(targetId);
                targetType = 'card';
            }

            // 【核心防御】：如果点击的是“已选中”的元素，并且没有按 Ctrl/Shift，拦截一切向下的事件流！
            if (isTargetSelected && !e.ctrlKey && !e.shiftKey) {
                e.stopPropagation();

                if (e.type === 'mousedown' || e.type === 'pointerdown') {
                    isDragging = false; 
                }

                if (e.type === 'mouseup') {
                    // 如果鼠标抬起时发现并没有触发拖拽，说明用户就是想单选它
                    if (!isDragging) {
                        if (targetType === 'area') {
                            state.selectedAreaIds = [targetId];
                            state.selectedCardIds = [];
                        } else {
                            state.selectedCardIds = [targetId];
                            state.selectedAreaIds = [];
                            state.activeCardId = targetId;
                        }
                        saveAndRender();
                        updateSelectionUI();
                    }
                }
            }
        };

        // 以最高优先级挂载在 Window 对象上，阻断任何隐藏的全局选择监听器
        window.addEventListener('pointerdown', shieldEvent, true);
        window.addEventListener('mousedown', shieldEvent, true);
        window.addEventListener('mouseup', shieldEvent, true);
        window.addEventListener('click', shieldEvent, true);
        window._slGlobalSelectionShield = true;
    }

    // =========================================================================

    window.addEventListener('contextmenu', (e) => {
        if (appState.isBindingMode) {
            e.preventDefault(); 
            e.stopPropagation();
            return;
        }

        if (state.painterMode) {
            e.preventDefault(); e.stopPropagation();
            state.painterMode = false;
            state.painterSource = null;
            updateSelectionUI();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (appState.isBindingMode) return; 
        
        if (e.key === 'Escape') {
            if (state.painterMode) {
                state.painterMode = false;
                state.painterSource = null;
            }
            state.selectedCardIds = [];
            state.activeCardId = null;
            state.selectedAreaIds = [];
            updateSelectionUI();
            return;
        }

        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.selectedAreaIds.length === 1) {
            if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            
            const areaId = state.selectedAreaIds[0];
            let targetArea = null;
            for (const c of state.cards) {
                const a = c.areas?.find(x => x.id === areaId);
                if (a) { targetArea = a; break; }
            }
            
            if (targetArea && targetArea.type === 'preview' && targetArea.history && targetArea.history.length > 1) {
                e.preventDefault(); 
                let idx = targetArea.historyIndex !== undefined ? targetArea.historyIndex : targetArea.history.length - 1;
                
                if (e.key === 'ArrowLeft') {
                    idx = Math.max(0, idx - 1);
                } else {
                    idx = Math.min(targetArea.history.length - 1, idx + 1);
                }
                
                if (targetArea.historyIndex !== idx) {
                    targetArea.historyIndex = idx;
                    targetArea.resultUrl = targetArea.history[idx];
                    saveAndRender();
                }
                return;
            }
        }

        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
        
        if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            togglePanelFunc();
        }
    });

    document.addEventListener("shell_link_update_preview", (e) => {
        const { cardId, areaId, url } = e.detail;
        const areaEl = document.querySelector(`.sl-area[data-area-id="${areaId}"]`);
        if (areaEl) {
            const mediaEl = areaEl.querySelector('.sl-preview-img');
            if (!mediaEl) {
                document.dispatchEvent(new CustomEvent("sl_render_ui"));
                return;
            }
            const placeholder = areaEl.querySelector('.sl-preview-placeholder');
            const isVideo = url.toLowerCase().match(/\.(mp4|webm|mov|avi|mkv)$/);
            const isAudio = url.toLowerCase().match(/\.(mp3|wav|ogg|flac|aac|m4a)$/);
            
            const tagName = mediaEl.tagName.toLowerCase();
            const isImgTag = tagName === 'img';
            const isVidTag = tagName === 'video';
            const isAudTag = tagName === 'audio';
            
            if ((isVideo && !isVidTag) || (isAudio && !isAudTag) || (!isVideo && !isAudio && !isImgTag)) {
                document.dispatchEvent(new CustomEvent("sl_render_ui"));
                return;
            }

            mediaEl.src = url;
            mediaEl.style.display = "block";
            if (placeholder) placeholder.style.display = "none";
        }
    });

    document.addEventListener("shell_link_state_loaded", (e) => {
        const loadedState = e.detail || { cards: [], activeCardId: null, selectedCardIds: [], selectedAreaIds: [] };
        Object.assign(state, loadedState);
        if (!state.selectedCardIds) state.selectedCardIds = state.activeCardId ? [state.activeCardId] : [];
        if (!state.selectedAreaIds) state.selectedAreaIds = [];
        state.painterMode = false;
        state.painterSource = null;
        
        state.cards.forEach(card => {
            if (!card.areas) {
                card.areas = [];
                if (card.previewAreas) { card.areas.push(...card.previewAreas.map(a => ({...a, type: 'preview', matchMedia: false, ratio: '16:9'}))); delete card.previewAreas; }
                if (card.editAreas) { card.areas.push(...card.editAreas.map(a => ({...a, type: 'edit', dataType: 'string', autoHeight: true}))); delete card.editAreas; }
            }
        });

        if (panelContainer && panelContainer.classList.contains('visible')) performRenderFunc();
    });

    document.addEventListener("shell_link_state_cleared", () => {
        Object.assign(state, { cards: [], activeCardId: null, selectedCardIds: [], selectedAreaIds: [], painterMode: false, painterSource: null });
        if (panelContainer && panelContainer.classList.contains('visible')) performRenderFunc();
    });

    document.addEventListener('sl_enter_binding_mode', (e) => {
        enterBindingModeForSelected(e.detail, panelContainer, backdropContainer);
    });
}