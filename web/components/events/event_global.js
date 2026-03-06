/**
 * 文件名: event_global.js
 * 职责: 处理全局级别的生命周期事件、快捷键、以及系统级点击防误触护盾
 */
import { state, appState, saveAndRender } from "../ui_state.js";
import { updateSelectionUI } from "../ui_selection.js";
import { enterBindingModeForSelected } from "../actions/action_binding.js";

export function setupGlobalEvents(panelContainer, backdropContainer, togglePanelFunc, performRenderFunc) {
    
    // =========================================================================
    // 【系统级终极护盾】：Window级拦截器，保护多选失效问题
    // =========================================================================
    if (!window._slGlobalSelectionShield) {
        let isDragging = false;
        
        window.addEventListener('dragstart', () => { isDragging = true; }, true);
        window.addEventListener('dragend', () => { 
            setTimeout(() => { isDragging = false; }, 100); 
        }, true);

        const shieldEvent = (e) => {
            // 绝对放行右键！让右键事件能干干净净地落到底层的视频控件里
            if (e.button !== 0 && e.type !== 'contextmenu') return;

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

            if (isTargetSelected && !e.ctrlKey && !e.shiftKey) {
                // 如果是点击事件，且点在了视频区域上，放行冒泡！
                if (e.type === 'click' && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
                    // 放行
                } else {
                    e.stopPropagation();
                }

                if (e.type === 'mousedown' || e.type === 'pointerdown') {
                    isDragging = false; 
                    
                    // 【核心修复 A】：锚点挽救！即使被护盾拦截了事件，也要在底层静默更新锚点。
                    // 这样当你点击一个已选中的模块后，再按 Shift 连选，系统就知道该从哪里开始了！
                    if (targetType === 'area') appState.lastClickedAreaId = targetId;
                    if (targetType === 'card') appState.lastClickedCardId = targetId;
                }

                if (e.type === 'mouseup') {
                    if (!isDragging) {
                        if (targetType === 'area') {
                            state.selectedAreaIds = [targetId];
                            state.selectedCardIds = [];
                        } else {
                            state.selectedCardIds = [targetId];
                            state.selectedAreaIds = [];
                            state.activeCardId = targetId;
                        }
                        updateSelectionUI();
                    }
                }
            }
        };

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
            let targetCardId = null;
            for (const c of state.cards) {
                const a = c.areas?.find(x => x.id === areaId);
                if (a) { targetArea = a; targetCardId = c.id; break; }
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
                    
                    document.dispatchEvent(new CustomEvent("shell_link_update_preview", {
                        detail: { cardId: targetCardId, areaId: targetArea.id, url: targetArea.resultUrl }
                    }));

                    const areaEl = document.querySelector(`.sl-area[data-area-id="${areaId}"]`);
                    if (areaEl) {
                        const badges = areaEl.querySelectorAll('div');
                        badges.forEach(div => {
                            if (div.style.position === 'absolute' && div.style.top === '8px') {
                                div.textContent = `${idx + 1} / ${targetArea.history.length}`;
                            }
                        });
                        
                        const grid = areaEl.querySelector('.sl-history-grid');
                        if (grid) {
                            grid.querySelectorAll('.sl-history-thumb').forEach((thumb, tIdx) => {
                                if (tIdx === idx) thumb.style.borderColor = '#4CAF50';
                                else if (targetArea.selectedThumbIndices?.includes(tIdx)) thumb.style.borderColor = '#2196F3';
                                else thumb.style.borderColor = 'rgba(255,255,255,0.1)';
                            });
                        }
                    }

                    if (window.StateManager && window.StateManager.syncToNode) {
                        window.StateManager.syncToNode(window.app.graph);
                    }
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

            let finalUrl = url;
            try {
                const u = new URL(url, window.location.origin);
                if (u.pathname === '/view') {
                    u.searchParams.set('t', Date.now());
                    finalUrl = u.pathname + u.search + u.hash;
                }
            } catch(err){}

            mediaEl.src = finalUrl;
            mediaEl.style.display = "block";
            
            if (isVideo) mediaEl.play().catch(()=>{});

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