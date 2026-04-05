/**
 * 文件名: event_global.js
 * 职责: 处理全局级别的生命周期事件、快捷键、以及系统级点击防误触护盾
 */
import { state, appState, createEmptyWorkspace, applyWorkspaceToState, saveAndRender } from "../ui_state.js";
import { updateSelectionUI } from "../ui_selection.js";
import { enterBindingModeForSelected } from "../actions/action_binding.js";
import { loadSelectedTextContent, syncTextContentWithSelection } from "../modules/media_types/media_utils.js";

// 【核心新增】：快捷键解析引擎下沉至此，根据字符串动态计算修饰键和主键
function parseShortcut(shortcutStr) {
    if (!shortcutStr) return { key: 'c', ctrl: false, shift: false, alt: false, meta: false };
    const parts = shortcutStr.toLowerCase().split('+').map(s => s.trim());
    const parsed = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
    
    parts.forEach(part => {
        if (part === 'ctrl' || part === 'control') parsed.ctrl = true;
        else if (part === 'shift') parsed.shift = true;
        else if (part === 'alt' || part === 'option') parsed.alt = true;
        else if (part === 'meta' || part === 'cmd' || part === 'win' || part === 'windows') parsed.meta = true;
        else parsed.key = part; 
    });
    return parsed;
}

export function setupGlobalEvents(panelContainer, backdropContainer, togglePanelFunc, performRenderFunc) {
    
    if (!window._clabGlobalMediaErrorHijacked) {
        const clearFallback = (target) => {
            const parent = target.parentElement;
            if (parent) {
                const fb = parent.querySelector('.clab-media-dead-fallback');
                if (fb) fb.remove();
            }
        };

        window.addEventListener('error', (e) => {
            const target = e.target;
            if (target && ['IMG', 'VIDEO', 'AUDIO'].includes(target.tagName)) {
                const isPreview = target.classList && target.classList.contains('clab-preview-img');
                const isThumb = target.closest && target.closest('.clab-history-thumb');
                if (isPreview || isThumb) {
                    const src = target.getAttribute('src');
                    if (!src || !src.includes('filename=')) return;

                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.clab-media-dead-fallback')) {
                        parent.insertAdjacentHTML('beforeend', `
                            <div class="clab-media-dead-fallback" style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#1e1e1e; color:#ff5555; z-index:10; pointer-events:none;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                <span style="font-size:10px; margin-top:4px; color:#ccc;">媒体丢失</span>
                            </div>
                        `);
                    }
                }
            }
        }, true); 

        window.addEventListener('load', (e) => {
            if (e.target && ['IMG', 'VIDEO', 'AUDIO'].includes(e.target.tagName)) clearFallback(e.target);
        }, true);
        window.addEventListener('loadeddata', (e) => {
            if (e.target && ['IMG', 'VIDEO', 'AUDIO'].includes(e.target.tagName)) clearFallback(e.target);
        }, true);

        window._clabGlobalMediaErrorHijacked = true;
    }

    if (!window._clabGlobalSelectionShield) {
        let isDragging = false;
        window.addEventListener('dragstart', () => { isDragging = true; }, true);
        window.addEventListener('dragend', () => { setTimeout(() => { isDragging = false; }, 100); }, true);

        const shieldEvent = (e) => {
            if (e.button !== 0 && e.type !== 'contextmenu') return;

            const isInteractive = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName) ||
                                  e.target.closest('.clab-custom-select') || e.target.closest('.clab-history-thumb') ||
                                  e.target.closest('.clab-bool-label') || e.target.closest('.clab-upload-zone') ||
                                  e.target.closest('.clab-del-card-btn') || e.target.closest('.clab-del-area-btn') ||
                                  e.target.closest('.clab-video-controls-interactive');

            if (isInteractive) return;

            const areaEl = e.target.closest('.clab-area');
            const cardEl = e.target.closest('.clab-card:not(.clab-add-card-inline)');

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
                // 【终极修复核心】：拔除会导致菜单彻底消失的隐身符 (style.display = none)，只优雅地移除 .open 类
                document.querySelectorAll('.clab-custom-select.open, .clab-select.open').forEach(el => {
                    el.classList.remove('open');
                });

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
        window._clabGlobalSelectionShield = true;
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

        const tag = e.target.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
        
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

        if (e.key === 'Delete' && !isInput) {
            e.preventDefault();
            let changed = false;

            // Delete selected modules
            if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
                const idsToDelete = [...state.selectedAreaIds];
                state.cards.forEach(c => {
                    if (c.areas) {
                        const originalLen = c.areas.length;
                        c.areas = c.areas.filter(a => !idsToDelete.includes(a.id));
                        if (c.areas.length !== originalLen) changed = true;
                    }
                });
                idsToDelete.forEach(id => {
                    const el = document.querySelector(`.clab-area[data-area-id="${id}"]`);
                    if (el) el.remove();
                });
                state.selectedAreaIds = [];
            } 
            // Delete selected cards
            else if (state.selectedCardIds && state.selectedCardIds.length > 0) {
                const idsToDelete = [...state.selectedCardIds];
                state.cards = state.cards.filter(c => !idsToDelete.includes(c.id));
                idsToDelete.forEach(id => {
                    const el = document.querySelector(`.clab-card[data-card-id="${id}"]`);
                    if (el) el.remove();
                });
                state.selectedCardIds = [];
                state.activeCardId = (state.selectedCardIds && state.selectedCardIds.length > 0) ? state.selectedCardIds[state.selectedCardIds.length - 1] : null;
                changed = true;
                
                if (window._clabUpdateCardsLayout) window._clabUpdateCardsLayout();
            }

            if (changed) {
                if (window._clabJustSave) window._clabJustSave();
                if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
                updateSelectionUI();
            }
            return;
        }

        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.selectedAreaIds.length === 1) {
            if (isInput) return;
            
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
                    syncTextContentWithSelection(targetArea);

                    if (window._clabSurgicallyUpdateArea) {
                        window._clabSurgicallyUpdateArea(targetArea.id);
                        if (window._clabJustSave) window._clabJustSave();
                    } else {
                        saveAndRender();
                    }
                    void loadSelectedTextContent(targetArea, { refresh: true });
                }
                return;
            }
        }

        if (isInput) return;
        
        // 【核心修复】：动态解析快捷键配置，执行严格的修饰键全量比对
        const sc = parseShortcut(window._clabShortcutRaw || 'C');
        
        if (e.key.toLowerCase() === sc.key && 
            e.ctrlKey === sc.ctrl && 
            e.shiftKey === sc.shift && 
            e.altKey === sc.alt && 
            e.metaKey === sc.meta) {
            
            e.preventDefault();
            togglePanelFunc();
        }
    });

    document.addEventListener("clab_update_preview", (e) => {
        const { cardId, areaId, url } = e.detail;
        const areaEl = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
        if (areaEl) {
            const mediaEl = areaEl.querySelector('.clab-preview-img');
            if (!mediaEl) {
                document.dispatchEvent(new CustomEvent("clab_render_ui"));
                return;
            }
            const placeholder = areaEl.querySelector('.clab-preview-placeholder');
            const isVideo = url.toLowerCase().match(/\.(mp4|webm|mov|avi|mkv)$/);
            const isAudio = url.toLowerCase().match(/\.(mp3|wav|ogg|flac|aac|m4a)$/);
            
            const tagName = mediaEl.tagName.toLowerCase();
            const isImgTag = tagName === 'img';
            const isVidTag = tagName === 'video';
            const isAudTag = tagName === 'audio';
            
            if ((isVideo && !isVidTag) || (isAudio && !isAudTag) || (!isVideo && !isAudio && !isImgTag)) {
                document.dispatchEvent(new CustomEvent("clab_render_ui"));
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

    document.addEventListener("clab_state_loaded", (e) => {
        const loadedState = e.detail || { cards: [], activeCardId: null, selectedCardIds: [], selectedAreaIds: [] };
        Object.assign(state, loadedState);
        if (!Array.isArray(state.workspaces) || state.workspaces.length === 0) {
            const workspace = createEmptyWorkspace();
            state.workspaces = [workspace];
            state.activeWorkspaceId = workspace.id;
            applyWorkspaceToState(workspace);
        }

        state.selectedCardIds = [];
        state.selectedAreaIds = [];
        state.painterMode = false;
        state.painterSource = null;
        appState.lastClickedCardId = null;
        appState.lastClickedAreaId = null;
        
        state.cards.forEach(card => {
            if (!card.areas) {
                card.areas = [];
                if (card.previewAreas) { card.areas.push(...card.previewAreas.map(a => ({...a, type: 'preview', matchMedia: false, ratio: '16:9'}))); delete card.previewAreas; }
                if (card.editAreas) { card.areas.push(...card.editAreas.map(a => ({...a, type: 'edit', dataType: 'string', autoHeight: true}))); delete card.editAreas; }
            }
        });

        if (panelContainer && panelContainer.classList.contains('visible')) performRenderFunc();
    });

    document.addEventListener("clab_state_cleared", () => {
        const workspace = createEmptyWorkspace();
        state.workspaces = [workspace];
        state.activeWorkspaceId = workspace.id;
        applyWorkspaceToState(workspace);
        state.selectedCardIds = [];
        state.selectedAreaIds = [];
        state.painterMode = false;
        state.painterSource = null;
        appState.lastClickedCardId = null;
        appState.lastClickedAreaId = null;
        if (panelContainer && panelContainer.classList.contains('visible')) performRenderFunc();
    });

    document.addEventListener('clab_enter_binding_mode', (e) => {
        enterBindingModeForSelected(e.detail, panelContainer, backdropContainer);
    });
}
