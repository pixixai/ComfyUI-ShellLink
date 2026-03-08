/**
 * 文件名: event_global.js
 * 职责: 处理全局级别的生命周期事件、快捷键、以及系统级点击防误触护盾
 */
import { state, appState, saveAndRender } from "../ui_state.js";
import { updateSelectionUI } from "../ui_selection.js";
import { enterBindingModeForSelected } from "../actions/action_binding.js";

export function setupGlobalEvents(panelContainer, backdropContainer, togglePanelFunc, performRenderFunc) {
    
    // 【核心新增】：全局媒体加载与失效 (404) 拦截器！统一显示媒体丢失的 UI，且加载成功时自动清除
    if (!window._slGlobalMediaErrorHijacked) {
        const clearFallback = (target) => {
            const parent = target.parentElement;
            if (parent) {
                const fb = parent.querySelector('.sl-media-dead-fallback');
                if (fb) fb.remove();
            }
        };

        window.addEventListener('error', (e) => {
            const target = e.target;
            // 拦截所有图片、视频、音频的加载报错
            if (target && ['IMG', 'VIDEO', 'AUDIO'].includes(target.tagName)) {
                const isPreview = target.classList && target.classList.contains('sl-preview-img');
                const isThumb = target.closest && target.closest('.sl-history-thumb');
                // 仅针对我们面板内的媒体生效
                if (isPreview || isThumb) {
                    // 【修复 1】：防止空 src 触发误判。只有当 src 看起来像是一个真实的请求路径时才处理
                    const src = target.getAttribute('src');
                    if (!src || !src.includes('filename=')) return;

                    target.style.display = 'none';
                    const parent = target.parentElement;
                    // 在原地插入一个漂亮的统一丢失图标
                    // 【修复 2】：将 background 改为不透明的深灰色 #1e1e1e，确保覆盖背后的蓝紫色渐变
                    if (parent && !parent.querySelector('.sl-media-dead-fallback')) {
                        parent.insertAdjacentHTML('beforeend', `
                            <div class="sl-media-dead-fallback" style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#1e1e1e; color:#ff5555; z-index:10; pointer-events:none;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                <span style="font-size:10px; margin-top:4px; color:#ccc;">媒体丢失</span>
                            </div>
                        `);
                    }
                }
            }
        }, true); // 必须设置为 true 进行捕获，因为 error 事件不会冒泡

        // 如果用户执行了“同步”且文件回来了，自动清理这个报错 UI
        window.addEventListener('load', (e) => {
            if (e.target && ['IMG', 'VIDEO', 'AUDIO'].includes(e.target.tagName)) clearFallback(e.target);
        }, true);
        window.addEventListener('loadeddata', (e) => {
            if (e.target && ['IMG', 'VIDEO', 'AUDIO'].includes(e.target.tagName)) clearFallback(e.target);
        }, true);

        window._slGlobalMediaErrorHijacked = true;
    }

    if (!window._slGlobalSelectionShield) {
        let isDragging = false;
        window.addEventListener('dragstart', () => { isDragging = true; }, true);
        window.addEventListener('dragend', () => { setTimeout(() => { isDragging = false; }, 100); }, true);

        const shieldEvent = (e) => {
            if (e.button !== 0 && e.type !== 'contextmenu') return;

            const isInteractive = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName) ||
                                  e.target.closest('.sl-custom-select') || e.target.closest('.sl-history-thumb') ||
                                  e.target.closest('.sl-bool-label') || e.target.closest('.sl-upload-zone') ||
                                  e.target.closest('.sl-del-card-btn') || e.target.closest('.sl-del-area-btn') ||
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
                if (e.type === 'click' && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
                    // 放行
                } else {
                    e.stopPropagation();
                }

                if (e.type === 'mousedown' || e.type === 'pointerdown') {
                    isDragging = false; 
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

    window.addEventListener('contextmenu', (e) => {
        if (appState.isBindingMode) {
            e.preventDefault(); e.stopPropagation(); return;
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
                
                if (e.key === 'ArrowLeft') idx = Math.max(0, idx - 1);
                else idx = Math.min(targetArea.history.length - 1, idx + 1);
                
                if (targetArea.historyIndex !== idx) {
                    targetArea.historyIndex = idx;
                    targetArea.resultUrl = targetArea.history[idx];

                    // 【核心修复】：彻底接入局部更新引擎，键盘切换不再闪屏重绘！
                    if (window._slSurgicallyUpdateArea) {
                        window._slSurgicallyUpdateArea(targetArea.id);
                        if (window._slJustSave) window._slJustSave();
                    } else {
                        saveAndRender();
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