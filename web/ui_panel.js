/**
 * ui_panel.js：【主入口】负责组装组件、挂载 DOM、处理核心的容器交互。
 */
import { app } from "../../scripts/app.js";
import { state, appState, saveAndRender } from "./components/ui_state.js";
import { injectCSS } from "./components/ui_utils.js";
import { setupStaticToolbarEvents, renderDynamicToolbar, attachDynamicToolbarEvents } from "./components/comp_toolbar.js";
import { renderCardsList, attachCardEvents } from "./components/comp_taskcard.js";
import { attachAreaEvents } from "./components/comp_modulearea.js";
import { updateSelectionUI } from "./components/ui_selection.js";

import { setupGlobalEvents } from "./components/events/event_global.js";
import { setupExecutionEvents } from "./components/events/event_execution.js";

console.log("[ShellLink] UI 拆分重构版本已被成功导入 (极速响应安全版)");

let panelContainer = null;
let backdropContainer = null;

// =========================================================================
// 【全局物理截胡引擎】：彻底解决原生 Video 在重绘时的闪烁断连问题
// =========================================================================
window.ShellLink = window.ShellLink || {};

window.ShellLink.stashMedia = () => {
    window._slGlobalVaultMap = new Map();
    if (!window._slMiniVault) {
        window._slMiniVault = document.createElement('div');
        window._slMiniVault.id = 'sl-mini-vault';
        window._slMiniVault.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0.01; pointer-events: none; z-index: -9999; overflow: hidden;';
        document.body.appendChild(window._slMiniVault);
    }
    // 提前拔出所有媒体节点
    document.querySelectorAll('.sl-video-player .sl-media-target, .sl-audio-player .sl-media-target').forEach(media => {
        const areaEl = media.closest('.sl-area');
        if (areaEl && areaEl.dataset.areaId) {
            const info = {
                el: media,
                src: media.getAttribute('src') || '',
                time: media.currentTime || 0,
                paused: media.paused
            };
            window._slGlobalVaultMap.set(areaEl.dataset.areaId, info);
            window._slMiniVault.appendChild(media);
        }
    });
};

window.ShellLink.restoreMedia = () => {
    if (!window._slGlobalVaultMap) return;
    document.querySelectorAll('.sl-area').forEach(areaEl => {
        const areaId = areaEl.dataset.areaId;
        if (window._slGlobalVaultMap.has(areaId)) {
            const info = window._slGlobalVaultMap.get(areaId);
            const newMedia = areaEl.querySelector('.sl-media-target');
            if (newMedia) {
                const newSrc = newMedia.getAttribute('src') || '';
                const oldBase = info.src.split('&t=')[0].split('?t=')[0];
                const newBase = newSrc.split('&t=')[0].split('?t=')[0];
                
                // 忽略时间戳差异，只要源文件一致，直接原装替换！
                if (oldBase === newBase && oldBase !== '') {
                    newMedia.replaceWith(info.el);
                    if (Math.abs(info.el.currentTime - info.time) > 0.1) {
                        info.el.currentTime = info.time;
                    }
                    if (!info.paused) info.el.play().catch(()=>{});
                } else {
                    info.el.remove();
                }
            } else {
                info.el.remove();
            }
            window._slGlobalVaultMap.delete(areaId);
        }
    });
    window._slGlobalVaultMap.forEach(info => info.el.remove());
    window._slGlobalVaultMap.clear();
};


export function setupUI() {
    injectCSS(); 
    
    const overrideStyle = document.createElement("style");
    overrideStyle.innerHTML = `
        .sl-custom-select-item:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
            color: #ffffff !important;
        }
        #shell-link-panel {
            --sl-card-width: 320px;
        }
        #shell-link-panel .sl-card {
            width: var(--sl-card-width) !important;
            min-width: var(--sl-card-width) !important;
            max-width: var(--sl-card-width) !important;
            transition: width 0.1s ease, min-width 0.1s ease, max-width 0.1s ease;
        }
        #sl-card-width-input::-webkit-outer-spin-button,
        #sl-card-width-input::-webkit-inner-spin-button,
        #sl-run-batch-count::-webkit-outer-spin-button,
        #sl-run-batch-count::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        #sl-card-width-input[type=number],
        #sl-run-batch-count[type=number] {
            -moz-appearance: textfield;
        }
        
        .sl-context-menu {
            background: #2a2a2a !important;
            border: 1px solid #555 !important;
            border-radius: 6px !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5) !important;
            padding: 4px 0 !important;
            font-family: sans-serif !important;
            backdrop-filter: none !important;
        }
        .sl-context-menu-title {
            padding: 6px 12px !important; 
            font-size: 12px !important;  
            color: #aaa !important;
            font-weight: bold !important;
            background: rgba(255,255,255,0.08) !important; 
            margin: 0 !important; 
            pointer-events: none !important;
            letter-spacing: normal !important;
        }
        .sl-context-menu-item {
            padding: 6px 12px !important;
            font-size: 12px !important;
            color: #eee !important;
            cursor: pointer !important;
            transition: background 0.1s !important;
            display: flex !important;
            align-items: center !important;
        }
        .sl-context-menu-item:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
            color: #ffffff !important;
        }
        .sl-context-menu-item.sl-danger {
            color: #ff4d4f !important;
        }
        .sl-context-menu-item.sl-danger:hover {
            background-color: #ff4d4f !important;
            color: #ffffff !important;
        }
        .sl-context-menu-divider {
            height: 1px !important;
            background: rgba(255, 255, 255, 0.1) !important;
            margin: 4px 12px !important; 
        }
    `;
    document.head.appendChild(overrideStyle);

    try {
        if (!panelContainer) {
            createPanelDOM();
            if (backdropContainer) document.body.appendChild(backdropContainer);
            document.body.appendChild(panelContainer);

            setupGlobalEvents(panelContainer, backdropContainer, togglePanel, performRender);
            setupExecutionEvents();

            import("./components/comp_contextmenu.js").then(module => {
                module.setupContextMenu(panelContainer);
            }).catch(err => {
                console.warn("[ShellLink] 提示：右键菜单模块未找到或内部存在错误，详情见下方报错：", err);
            });
        }

        if (app.extensionManager && app.extensionManager.registerSidebarTab) {
            app.extensionManager.registerSidebarTab({
                id: "shellLinkSidebar",
                icon: "pi pi-sliders-v shell-link-sidebar-icon", 
                title: "ShellLink 控制台",
                tooltip: "打开 ShellLink 主面板 (快捷键 S)",
                type: "custom",
                render: (el) => {}
            });
            
            const globalSidebarHijacker = (e) => {
                let isOurTab = false;
                const tabBtn = e.target.closest('.p-tabview-nav-link, [role="tab"], li');
                const isOurIcon = e.target.classList && e.target.classList.contains('shell-link-sidebar-icon');
                
                if (isOurIcon || (tabBtn && tabBtn.querySelector('.shell-link-sidebar-icon'))) {
                    isOurTab = true;
                }

                if (isOurTab) {
                    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                    if (e.type === 'click') togglePanel();
                }
            };

            window.addEventListener('pointerdown', globalSidebarHijacker, true);
            window.addEventListener('pointerup', globalSidebarHijacker, true);
            window.addEventListener('mousedown', globalSidebarHijacker, true);
            window.addEventListener('mouseup', globalSidebarHijacker, true);
            window.addEventListener('click', globalSidebarHijacker, true);
        }
    } catch (error) {
        console.error("[ShellLink] UI 面板初始化失败:", error);
    }
}

export function togglePanel() {
    if (!panelContainer) return;
    const isVisible = panelContainer.classList.contains('visible');
    if (isVisible) {
        panelContainer.classList.remove('visible');
        if (backdropContainer) backdropContainer.classList.remove('visible');
        state.painterMode = false;
        state.painterSource = null;
    } else {
        panelContainer.classList.add('visible');
        if (backdropContainer) backdropContainer.classList.add('visible');
        performRender(); 
    }
}

document.addEventListener("sl_render_ui", () => {
    performRender();
});

function performRender() {
    if (!panelContainer) return;

    const toolbarHandle = panelContainer.querySelector('#sl-toolbar-handle');
    const cardsContainer = panelContainer.querySelector('#sl-cards-container');

    let savedScrollLeft = 0;
    const savedCardScrolls = new Map();
    if (cardsContainer) {
        savedScrollLeft = cardsContainer.scrollLeft; 
        cardsContainer.querySelectorAll('.sl-card-body').forEach(body => {
            if (body.dataset.cardId) {
                savedCardScrolls.set(body.dataset.cardId, body.scrollTop); 
            }
        });
    }

    if (window.ShellLink && window.ShellLink.stashMedia) window.ShellLink.stashMedia();
    
    renderDynamicToolbar(toolbarHandle);
    renderCardsList(cardsContainer);
    
    if (cardsContainer) {
        cardsContainer.scrollLeft = savedScrollLeft;
        cardsContainer.querySelectorAll('.sl-card-body').forEach(body => {
            if (body.dataset.cardId && savedCardScrolls.has(body.dataset.cardId)) {
                body.scrollTop = savedCardScrolls.get(body.dataset.cardId);
            }
        });
    }

    if (window.ShellLink && window.ShellLink.restoreMedia) window.ShellLink.restoreMedia();

    attachDynamicToolbarEvents(toolbarHandle);
    attachCardEvents(cardsContainer);
    attachAreaEvents(cardsContainer);
    
    if (window._slUpdateAllDefaultTitles) window._slUpdateAllDefaultTitles();
}

function createPanelDOM() {
    backdropContainer = document.createElement("div");
    backdropContainer.id = "sl-backdrop";
    backdropContainer.onclick = () => {
        if (!appState.isBindingMode) togglePanel();
    };

    panelContainer = document.createElement("div");
    panelContainer.id = "shell-link-panel";
    
    panelContainer.innerHTML = `
        <div class="sl-toolbar" id="sl-toolbar-handle">
            <div style="display:flex; gap:10px; align-items:center;">
                <button class="sl-btn" id="sl-global-add-card" title="新建空白任务卡片">+ 新建任务</button>
                <button class="sl-btn" id="sl-global-add-module" title="在当前任务内添加新模块">+ 新建模块</button>
                <div id="sl-module-toolbar-separator" style="width:1px; height:20px; background:rgba(255,255,255,0.2); margin:0 5px; display:none;"></div>
                <div id="sl-module-toolbar" style="display:none; align-items:center; gap:12px;"></div>
            </div>

            <div style="display:flex; gap:10px; align-items:center; margin-left:auto;">
                
                <div style="display:inline-flex; align-items:stretch; height: 34px;">
                    <div id="sl-run-btn-wrapper" class="sl-run-wrapper" style="border-top-right-radius: 0; border-bottom-right-radius: 0; height: 100%;">
                        <button class="sl-btn run-btn-main" id="sl-btn-run" title="按规则运行选中任务 (局部)" style="height: 100%;">▶ 运行</button>
                        <div style="width:1px; height:16px; background:rgba(255,255,255,0.4); margin: 0 4px; align-self: center;"></div>
                        <button class="sl-btn run-btn-toggle" id="sl-run-dropdown-toggle" title="展开更多运行选项" style="height: 100%;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div id="sl-run-dropdown-menu" class="sl-custom-select-dropdown" style="display:none; top: calc(100% + 4px); right: 0; left: auto; min-width: 140px; z-index: 10002;">
                            <div class="sl-custom-select-item" id="sl-btn-run-all" style="display:flex; align-items:center; gap:8px;">
                                <svg width="15" height="15" viewBox="0 0 19.6 15.01" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19.26,6.77L11.55.23c-.63-.53-1.59-.09-1.59.74v13.07c0,.82.96,1.27,1.59.74l7.72-6.54c.46-.39.46-1.09,0-1.48Z"/>
                                    <path d="M9.31,6.77L1.59.23C.96-.3,0,.15,0,.97v13.07c0,.82.96,1.27,1.59.74l7.72-6.54c.46-.39.46-1.09,0-1.48Z"/>
                                </svg>
                                运行全部
                            </div>
                        </div>
                    </div>
                    
                    <div style="display:flex; align-items:center; background: rgba(0,0,0,0.5); border: 1px solid #555; border-left: none; border-top-right-radius: 6px; border-bottom-right-radius: 6px; padding-left: 6px; height: 100%; box-sizing: border-box;" title="循环运行次数 (排队执行)">
                        <input type="number" id="sl-run-batch-count" value="1" min="1" max="999" style="width: 24px; background: transparent; border: none; color: #eee; font-size: 14px; text-align: center; outline: none; font-family: sans-serif; -moz-appearance: textfield; padding: 0;">
                        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height: 100%; margin-left: 2px; gap: 2px;">
                            <div id="sl-run-count-up" style="cursor:pointer; display:flex; align-items:center; justify-content:center; padding: 2px 6px;" onmouseover="this.querySelector('svg').style.stroke='#fff'" onmouseout="this.querySelector('svg').style.stroke='#aaa'">
                                <svg width="14" height="8" viewBox="0 7 24 10" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; transition: stroke 0.2s;"><polyline points="18 15 12 9 6 15"></polyline></svg>
                            </div>
                            <div id="sl-run-count-down" style="cursor:pointer; display:flex; align-items:center; justify-content:center; padding: 2px 6px;" onmouseover="this.querySelector('svg').style.stroke='#fff'" onmouseout="this.querySelector('svg').style.stroke='#aaa'">
                                <svg width="14" height="8" viewBox="0 7 24 10" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; transition: stroke 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </div>
                        </div>
                    </div>
                </div>

                <button class="sl-btn" id="sl-btn-config" title="在画布创建配置节点">⚓ 创建配置锚点</button>
            </div>
        </div>
        <div class="sl-cards-container" id="sl-cards-container"></div>

        <div id="sl-card-width-ctrl" style="position: absolute; bottom: 16px; left: 16px; z-index: 1000; display: flex; align-items: center; gap: 8px; transition: opacity 0.2s;">
            <svg id="sl-card-width-reset" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="恢复默认宽度" style="cursor: pointer; transition: stroke 0.2s;" onmouseover="this.style.stroke='#fff'" onmouseout="this.style.stroke='#888'">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
            <input type="range" id="sl-card-width-slider" min="260" max="600" value="320" style="width: 80px; accent-color: #888; cursor: pointer; height: 4px; background: rgba(255,255,255,0.2); outline: none; border-radius: 2px; -webkit-appearance: none;">
            <input type="number" id="sl-card-width-input" title="手动输入宽度 (回车确认)" style="width: 36px; background: transparent; border: none; color: #888; font-size: 12px; outline: none; text-align: left; padding: 0; margin: 0; font-family: monospace; transition: color 0.2s;" onfocus="this.style.color='#fff'" onblur="this.style.color='#888'">
        </div>
    `;

    setupStaticToolbarEvents(panelContainer);
    
    const countInput = panelContainer.querySelector('#sl-run-batch-count');
    const upBtn = panelContainer.querySelector('#sl-run-count-up');
    const downBtn = panelContainer.querySelector('#sl-run-count-down');
    if (countInput && upBtn && downBtn) {
        upBtn.onclick = (e) => {
            e.stopPropagation();
            countInput.value = Math.min(999, parseInt(countInput.value || 1) + 1);
        };
        downBtn.onclick = (e) => {
            e.stopPropagation();
            countInput.value = Math.max(1, parseInt(countInput.value || 1) - 1);
        };
        countInput.onchange = () => {
            let v = parseInt(countInput.value);
            if (isNaN(v) || v < 1) v = 1;
            if (v > 999) v = 999;
            countInput.value = v;
        };
    }

    panelContainer.addEventListener("click", (e) => {
        if (!state.painterMode) return;
        if (e.target.closest('#tb-format-painter')) return;
        const isToolbar = e.target.closest('#sl-toolbar-handle');
        const isAddCardBtn = e.target.closest('.sl-add-card-inline');

        if (isToolbar || isAddCardBtn) {
            state.painterMode = false;
            state.painterSource = null;
            panelContainer.classList.remove('sl-painter-active');
            updateSelectionUI();
        }
    }, true);

    const cardsContainer = panelContainer.querySelector("#sl-cards-container");
    const toolbar = panelContainer.querySelector("#sl-toolbar-handle");
    
    cardsContainer.addEventListener("mousedown", (e) => {
        if (state.painterMode) return; 
        const cardEl = e.target.closest('.sl-card:not(.sl-add-card-inline)');
        if (cardEl && cardEl.dataset.cardId) {
            const targetId = cardEl.dataset.cardId;
            if (state.activeCardId !== targetId) state.activeCardId = targetId;
        }
    }, true); 

    const handleDeselectAll = (forceExitPainter = false) => {
        const openDropdowns = document.querySelectorAll('.sl-custom-select.open');
        if (openDropdowns.length > 0) {
            openDropdowns.forEach(el => el.classList.remove('open'));
            return; 
        }
        let changed = false;
        if (forceExitPainter && state.painterMode) {
            state.painterMode = false;
            state.painterSource = null;
            changed = true;
        }
        if (state.selectedCardIds && state.selectedCardIds.length > 0) {
            state.selectedCardIds = [];
            state.activeCardId = null;
            changed = true;
        }
        if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
            state.selectedAreaIds = [];
            state.activeCardId = null; 
            changed = true;
        }
        if(changed) updateSelectionUI(); 
    };

    cardsContainer.addEventListener("mousedown", (e) => {
        const isInteractive = e.target.closest('button, input, select, textarea, .sl-custom-select, .sl-edit-val-bool, .sl-del-area-btn, .sl-del-card-btn, .sl-history-thumb, .sl-upload-zone, .sl-video-controls-interactive');
        
        if (state.painterMode) {
            if (isInteractive && e.button === 0) {
                state.painterMode = false;
                state.painterSource = null;
                panelContainer.classList.remove('sl-painter-active');
                updateSelectionUI();
            }
            return; 
        }

        if (e.button !== 0) return; 

        const isMedia = e.target.closest('.sl-video-player, .sl-audio-player, .sl-preview-bg, video, audio');
        const areaEl = e.target.closest('.sl-area');
        const cardEl = e.target.closest('.sl-card:not(.sl-add-card-inline)');

        if (areaEl) {
            const areaId = areaEl.dataset.areaId;
            const targetCardId = cardEl ? cardEl.dataset.cardId : null;

            if (e.ctrlKey || e.metaKey) {
                if (isInteractive) {
                    if (!state.selectedAreaIds.includes(areaId)) state.selectedAreaIds.push(areaId);
                } else {
                    if (state.selectedAreaIds.includes(areaId)) state.selectedAreaIds = state.selectedAreaIds.filter(id => id !== areaId);
                    else state.selectedAreaIds.push(areaId);
                }
                appState.lastClickedAreaId = areaId; 
            } 
            else if (e.shiftKey && appState.lastClickedAreaId) {
                let startCardIdx = -1, endCardIdx = -1;
                let startAreaIdx = -1, endAreaIdx = -1;
                let anchorType = null;
                
                state.cards.forEach((c, cIdx) => {
                    if (c.id === targetCardId) {
                        endCardIdx = cIdx;
                        if (c.areas) endAreaIdx = c.areas.findIndex(a => a.id === areaId);
                    }
                    if (c.areas) {
                        const aIdx = c.areas.findIndex(a => a.id === appState.lastClickedAreaId);
                        if (aIdx !== -1) {
                            startCardIdx = cIdx;
                            startAreaIdx = aIdx;
                            anchorType = c.areas[aIdx].type; 
                        }
                    }
                });

                if (startCardIdx !== -1 && endCardIdx !== -1 && startAreaIdx !== -1 && endAreaIdx !== -1) {
                    const minC = Math.min(startCardIdx, endCardIdx);
                    const maxC = Math.max(startCardIdx, endCardIdx);
                    const minA = Math.min(startAreaIdx, endAreaIdx);
                    const maxA = Math.max(startAreaIdx, endAreaIdx);

                    const rangeIds = [];
                    for (let c = minC; c <= maxC; c++) {
                        const curCard = state.cards[c];
                        if (curCard && curCard.areas) {
                            for (let a = minA; a <= maxA; a++) {
                                const candidate = curCard.areas[a];
                                if (candidate && candidate.type === anchorType) {
                                    rangeIds.push(candidate.id);
                                }
                            }
                        }
                    }
                    state.selectedAreaIds = Array.from(new Set([...state.selectedAreaIds, ...rangeIds]));
                } else {
                    state.selectedAreaIds = [areaId];
                    appState.lastClickedAreaId = areaId; 
                }
            } 
            else {
                if (isInteractive && state.selectedAreaIds.includes(areaId) && state.selectedAreaIds.length > 1) {
                } else {
                    state.selectedAreaIds = [areaId];
                }
                appState.lastClickedAreaId = areaId; 
            }
            
            state.selectedCardIds = [];
            state.activeCardId = state.selectedAreaIds.length > 0 ? targetCardId : null;
            
            updateSelectionUI(); 
            
            if (!isInteractive && !isMedia) e.stopPropagation();
            
        } else if (cardEl) {
            const targetId = cardEl.dataset.cardId;
            if (e.ctrlKey || e.metaKey) {
                if (isInteractive) {
                    if (!state.selectedCardIds.includes(targetId)) state.selectedCardIds.push(targetId);
                } else {
                    if (state.selectedCardIds.includes(targetId)) state.selectedCardIds = state.selectedCardIds.filter(id => id !== targetId);
                    else state.selectedCardIds.push(targetId);
                }
                appState.lastClickedCardId = targetId; 
            } else if (e.shiftKey && appState.lastClickedCardId) {
                const currentIndex = state.cards.findIndex(c => c.id === targetId);
                const lastIndex = state.cards.findIndex(c => c.id === appState.lastClickedCardId);
                const minIdx = Math.min(currentIndex, lastIndex);
                const maxIdx = Math.max(currentIndex, lastIndex);
                const rangeIds = state.cards.slice(minIdx, maxIdx + 1).map(c => c.id);
                state.selectedCardIds = Array.from(new Set([...state.selectedCardIds, ...rangeIds]));
            } else {
                if (isInteractive && state.selectedCardIds.includes(targetId) && state.selectedCardIds.length > 1) {
                } else {
                    state.selectedCardIds = [targetId];
                }
                appState.lastClickedCardId = targetId; 
            }
            
            state.activeCardId = state.selectedCardIds.length > 0 ? state.selectedCardIds[state.selectedCardIds.length - 1] : null;
            state.selectedAreaIds = [];
            
            updateSelectionUI(); 
            
            if (!isInteractive && !isMedia) e.stopPropagation();
        }
    }, true); 


    cardsContainer.addEventListener("click", (e) => {
        const isInteractive = e.target.closest('button, input, select, textarea, .sl-custom-select, .sl-edit-val-bool, .sl-del-area-btn, .sl-del-card-btn, .sl-history-thumb, .sl-upload-zone, .sl-video-controls-interactive');
        const isMedia = e.target.closest('.sl-video-player, .sl-audio-player, .sl-preview-bg, video, audio');
        
        const areaEl = e.target.closest('.sl-area');
        const cardEl = e.target.closest('.sl-card:not(.sl-add-card-inline)');

        if (state.painterMode) {
            if (isInteractive) {
                state.painterMode = false;
                state.painterSource = null;
                panelContainer.classList.remove('sl-painter-active');
                updateSelectionUI();
                return;
            }

            if (state.painterSource?.type === 'card') {
                if (cardEl && !areaEl) {
                    const targetId = cardEl.dataset.cardId;
                    if (state.painterSource.data.id !== targetId) {
                        const targetCard = state.cards.find(c => c.id === targetId);
                        targetCard.areas = JSON.parse(JSON.stringify(state.painterSource.data.areas));
                        targetCard.areas.forEach(a => a.id = 'area_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
                        saveAndRender();
                    }
                } else if (!cardEl) {
                    let insertIndex = state.cards.length;
                    const cardEls = cardsContainer.querySelectorAll('.sl-card:not(.sl-add-card-inline)');
                    for (let i = 0; i < cardEls.length; i++) {
                        const rect = cardEls[i].getBoundingClientRect();
                        if (e.clientX < rect.left + rect.width / 2) { insertIndex = i; break; }
                    }
                    const newCard = JSON.parse(JSON.stringify(state.painterSource.data));
                    newCard.id = 'card_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                    if (newCard.areas) newCard.areas.forEach(a => a.id = 'area_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
                    state.cards.splice(insertIndex, 0, newCard);
                    saveAndRender();
                }
                e.stopPropagation(); return;
            }

            if (state.painterSource?.type === 'area') {
                if (areaEl) {
                    const targetAreaId = areaEl.dataset.areaId;
                    if (state.painterSource.data.id !== targetAreaId) {
                        const src = state.painterSource.data;
                        const card = state.cards.find(c => c.id === areaEl.dataset.cardId);
                        const area = card?.areas.find(a => a.id === targetAreaId);
                        if (area) {
                            area.type = src.type;
                            area.targetNodeId = src.targetNodeId;
                            area.targetWidget = src.targetWidget;
                            area.targetNodeIds = Array.isArray(src.targetNodeIds) ? [...src.targetNodeIds] : [];
                            area.targetWidgets = Array.isArray(src.targetWidgets) ? [...src.targetWidgets] : [];
                            area.dataType = src.dataType;
                            area.autoHeight = src.autoHeight;
                            area.ratio = src.ratio;
                            area.width = src.width;
                            area.height = src.height;
                            area.matchMedia = src.matchMedia;
                            area.fillMode = src.fillMode;
                            if (area.type !== src.type) area.value = ''; 
                            
                            // 格式刷覆盖时使用点穴级更新
                            if (window._slSurgicallyUpdateArea) {
                                window._slSurgicallyUpdateArea(targetAreaId);
                                if (window._slJustSave) window._slJustSave();
                            } else {
                                saveAndRender();
                            }
                        }
                    }
                } else if (cardEl && !areaEl) {
                    let insertIndex = 0;
                    const targetCard = state.cards.find(c => c.id === cardEl.dataset.cardId);
                    const areaEls = cardEl.querySelectorAll('.sl-area');
                    if (areaEls && areaEls.length > 0) {
                        insertIndex = targetCard.areas ? targetCard.areas.length : 0;
                        for (let i = 0; i < areaEls.length; i++) {
                            const rect = areaEls[i].getBoundingClientRect();
                            if (e.clientY < rect.top + rect.height / 2) { insertIndex = i; break; }
                        }
                    }
                    const newArea = JSON.parse(JSON.stringify(state.painterSource.data));
                    newArea.id = 'area_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                    if (!targetCard.areas) targetCard.areas = [];
                    targetCard.areas.splice(insertIndex, 0, newArea);
                    
                    // 格式刷空白插入时，使用原生 DOM 追加，绝不全局重绘
                    if (window._slGenerateAreaHTML && window._slAttachAreaEvents) {
                        const temp = document.createElement('div');
                        temp.innerHTML = window._slGenerateAreaHTML(newArea, targetCard);
                        const newEl = temp.firstElementChild;
                        const cardBody = cardEl.querySelector('.sl-area-list');
                        if (cardBody) {
                            if (insertIndex >= targetCard.areas.length - 1) cardBody.appendChild(newEl);
                            else {
                                const nextArea = targetCard.areas[insertIndex + 1];
                                const nextEl = cardBody.querySelector(`.sl-area[data-area-id="${nextArea.id}"]`);
                                cardBody.insertBefore(newEl, nextEl);
                            }
                            window._slAttachAreaEvents(cardBody);
                        }
                        if (window._slJustSave) window._slJustSave();
                        if (window._slUpdateAllDefaultTitles) window._slUpdateAllDefaultTitles();
                    } else {
                        saveAndRender();
                    }
                }
                e.stopPropagation(); return;
            }
            return;
        }

        if ((areaEl || cardEl) && !isInteractive && !isMedia) {
            e.stopPropagation();
            return;
        }

        if (!isInteractive && !isMedia && (e.target === cardsContainer || e.target.classList.contains('sl-cards-wrapper'))) {
            handleDeselectAll(false);
        }
    }, true);

    toolbar.addEventListener("click", (e) => {
        const isInteractive = ['BUTTON', 'INPUT', 'LABEL', 'SELECT'].includes(e.target.tagName) || 
                              e.target.closest('button, input, label, select, .sl-custom-select, .sl-type-btn');
        if (!isInteractive) handleDeselectAll(true);
    });

    cardsContainer.addEventListener("wheel", (e) => {
        if (e.deltaY === 0) return;
        let isInsideVerticalScrollable = false;
        let elem = e.target;
        while (elem && elem !== cardsContainer) {
            if (elem.scrollHeight > elem.clientHeight) {
                const style = window.getComputedStyle(elem);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    const isAtTop = elem.scrollTop === 0;
                    const isAtBottom = Math.abs(elem.scrollHeight - elem.scrollTop - elem.clientHeight) < 1;
                    if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
                        isInsideVerticalScrollable = true; break;
                    }
                }
            }
            elem = elem.parentNode;
        }
        if (!isInsideVerticalScrollable) {
            e.preventDefault(); 
            cardsContainer.scrollLeft += Math.sign(e.deltaY) * 360;
        }
    }, { passive: false });

    makePanelDraggable();

    const widthSlider = panelContainer.querySelector('#sl-card-width-slider');
    const widthInput = panelContainer.querySelector('#sl-card-width-input');
    const widthResetBtn = panelContainer.querySelector('#sl-card-width-reset');
    const widthCtrlNode = panelContainer.querySelector('#sl-card-width-ctrl');
    
    if (widthSlider && widthInput && widthResetBtn) {
        const savedWidth = localStorage.getItem('shelllink-card-width') || '320';
        widthSlider.value = savedWidth <= 600 ? savedWidth : 600; 
        widthInput.value = savedWidth;
        panelContainer.style.setProperty('--sl-card-width', `${savedWidth}px`);

        const updateWidth = (val) => {
            let numVal = parseInt(val, 10);
            if (isNaN(numVal)) numVal = 320;
            if (numVal < 260) numVal = 260; 
            if (numVal > 1200) numVal = 1200; 

            widthSlider.value = Math.min(numVal, 600); 
            widthInput.value = numVal;
            panelContainer.style.setProperty('--sl-card-width', `${numVal}px`);
            localStorage.setItem('shelllink-card-width', numVal);
        };

        widthSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = e.target.value;
            widthInput.value = val;
            panelContainer.style.setProperty('--sl-card-width', `${val}px`);
        });

        widthSlider.addEventListener('change', (e) => {
            updateWidth(e.target.value);
        });

        widthInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.target.blur(); 
            }
        });
        widthInput.addEventListener('blur', (e) => {
            updateWidth(e.target.value);
        });

        widthResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateWidth(320);
        });

        const stopProp = e => e.stopPropagation();
        widthSlider.addEventListener('mousedown', stopProp);
        widthInput.addEventListener('mousedown', stopProp);
        widthResetBtn.addEventListener('mousedown', stopProp);
        if (widthCtrlNode) {
            widthCtrlNode.addEventListener('mousedown', stopProp);
            widthCtrlNode.addEventListener('click', stopProp);
        }
    }

    window.ShellLink.handleMediaError = (cardId, areaId, failedUrl) => {
        const card = state.cards.find(c => c.id === cardId);
        const area = card?.areas.find(a => a.id === areaId);
        if (area && area.history && area.history.length > 0) {
            const failedPath = new URL(failedUrl, window.location.origin).pathname + new URL(failedUrl, window.location.origin).search;
            const idx = area.history.findIndex(hUrl => {
                const hPath = new URL(hUrl, window.location.origin).pathname + new URL(hUrl, window.location.origin).search;
                return hPath === failedPath;
            });
            
            if (idx !== -1) {
                area.history.splice(idx, 1);
                if (area.history.length === 0) {
                    area.resultUrl = '';
                    area.historyIndex = 0;
                } else {
                    area.historyIndex = Math.min(idx, area.history.length - 1);
                    area.resultUrl = area.history[area.historyIndex];
                }
                setTimeout(() => { if (window._slSurgicallyUpdateArea) window._slSurgicallyUpdateArea(areaId); }, 10);
            } else if (area.resultUrl === failedUrl) {
                area.resultUrl = '';
                setTimeout(() => { if (window._slSurgicallyUpdateArea) window._slSurgicallyUpdateArea(areaId); }, 10);
            }
        } else if (area && area.resultUrl === failedUrl) {
             area.resultUrl = '';
             setTimeout(() => { if (window._slSurgicallyUpdateArea) window._slSurgicallyUpdateArea(areaId); }, 10);
        }
    };
}

function makePanelDraggable() {
    const handle = panelContainer.querySelector('#sl-toolbar-handle');
    let isDragging = false, offsetX = 0, offsetY = 0;

    handle.addEventListener('mousedown', (e) => {
        if (['BUTTON', 'SELECT', 'INPUT', 'LABEL'].includes(e.target.tagName) || e.target.closest('button, select, input, label, .sl-custom-select')) return;
        isDragging = true;
        const rect = panelContainer.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panelContainer.style.left = (e.clientX - offsetX) + 'px';
        panelContainer.style.top = (e.clientY - offsetY) + 'px';
        panelContainer.style.right = 'auto'; 
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = '';
        }
    });
}