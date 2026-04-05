/**
 * ui_panel.js: panel composition entry.
 */
import { state, appState } from "./components/ui_state.js";
import { injectCSS } from "./components/ui_utils.js";
import { setupStaticToolbarEvents } from "./components/comp_toolbar.js";
import { renderDynamicToolbar, attachDynamicToolbarEvents } from "./components/comp_toolbar.js";
import { renderCardsList, attachCardEvents } from "./components/comp_taskcard.js";
import { attachAreaEvents } from "./components/comp_modulearea.js";
import { renderWorkspaceBar, attachWorkspaceEvents } from "./components/comp_workspace.js";
import { renderChannelBar, attachChannelEvents } from "./components/comp_channel.js";

import { setupGlobalEvents } from "./components/events/event_global.js";
import { setupExecutionEvents } from "./components/events/event_execution.js";
import { setupPanelEvents } from "./components/events/event_panel.js";

console.log("[CLab] UI split version loaded (entry/composition mode)");

let panelContainer = null;
let backdropContainer = null;

function ensureMiniVault() {
    if (window._clabMiniVault) return window._clabMiniVault;
    const vault = document.createElement("div");
    vault.id = "clab-mini-vault";
    vault.style.cssText = "position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0.01; pointer-events: none; z-index: -9999; overflow: hidden;";
    document.body.appendChild(vault);
    window._clabMiniVault = vault;
    return vault;
}

function setupPanelMediaVault() {
    window.CLab = window.CLab || {};

    window.CLab.stashMedia = () => {
        window._clabGlobalVaultMap = new Map();
        const miniVault = ensureMiniVault();

        document.querySelectorAll(".clab-video-player .clab-media-target, .clab-audio-player .clab-media-target").forEach((media) => {
            const areaEl = media.closest(".clab-area");
            if (!areaEl || !areaEl.dataset.areaId) return;

            const info = {
                el: media,
                src: media.getAttribute("src") || "",
                time: media.currentTime || 0,
                paused: media.paused,
            };
            window._clabGlobalVaultMap.set(areaEl.dataset.areaId, info);
            miniVault.appendChild(media);
        });
    };

    window.CLab.restoreMedia = () => {
        if (!window._clabGlobalVaultMap) return;

        document.querySelectorAll(".clab-area").forEach((areaEl) => {
            const areaId = areaEl.dataset.areaId;
            if (!window._clabGlobalVaultMap.has(areaId)) return;

            const info = window._clabGlobalVaultMap.get(areaId);
            const newMedia = areaEl.querySelector(".clab-media-target");
            if (newMedia) {
                const newSrc = newMedia.getAttribute("src") || "";
                const shouldRestoreStashed = (() => {
                    if (!info.src || !newSrc) return false;
                    try {
                        const oldUrl = new URL(info.src, window.location.origin);
                        const newUrl = new URL(newSrc, window.location.origin);

                        const oldIsView = oldUrl.pathname === "/view" && !!oldUrl.searchParams.get("filename");
                        const newIsView = newUrl.pathname === "/view" && !!newUrl.searchParams.get("filename");

                        if (oldIsView && newIsView) {
                            const oldFilename = oldUrl.searchParams.get("filename");
                            const newFilename = newUrl.searchParams.get("filename");
                            const oldT = oldUrl.searchParams.get("t") || "";
                            const newT = newUrl.searchParams.get("t") || "";
                            return oldFilename === newFilename && oldT === newT;
                        }
                    } catch (_) {}

                    const oldBase = info.src.split("&t=")[0].split("?t=")[0];
                    const newBase = newSrc.split("&t=")[0].split("?t=")[0];
                    return oldBase === newBase && oldBase !== "";
                })();

                if (shouldRestoreStashed) {
                    newMedia.replaceWith(info.el);
                    if (Math.abs(info.el.currentTime - info.time) > 0.1) {
                        info.el.currentTime = info.time;
                    }
                    if (!info.paused) info.el.play().catch(() => {});
                } else {
                    info.el.remove();
                }
            } else {
                info.el.remove();
            }

            window._clabGlobalVaultMap.delete(areaId);
        });

        window._clabGlobalVaultMap.forEach((info) => info.el.remove());
        window._clabGlobalVaultMap.clear();
    };
}

function getRenderedCardsState(cardsContainer) {
    const wrapper = cardsContainer?.querySelector(".clab-cards-wrapper");
    if (!wrapper) return { wrapper: null, cardEls: [] };
    const cardEls = Array.from(wrapper.querySelectorAll(":scope > .clab-card[data-card-id]"));
    return { wrapper, cardEls };
}

function syncCardShellInPlace(cardEl, card, index) {
    if (!cardEl || !card) return;

    const isSelected = !!state.selectedCardIds?.includes(card.id);
    const defaultTitle = `#${index + 1}`;
    const displayTitle = card.title || defaultTitle;

    cardEl.dataset.cardId = card.id;
    cardEl.classList.toggle("active", isSelected);
    cardEl.classList.toggle("selected", isSelected);
    cardEl.style.borderColor = isSelected ? "var(--clab-theme-card, #4CAF50)" : "";

    const titleInput = cardEl.querySelector(".clab-card-title-input");
    if (titleInput) {
        titleInput.dataset.id = card.id;
        titleInput.dataset.default = defaultTitle;
        titleInput.placeholder = defaultTitle;
        if (document.activeElement !== titleInput) {
            titleInput.value = displayTitle;
            titleInput.size = Math.max(displayTitle.length, 2);
        }
    }

    const deleteBtn = cardEl.querySelector(".clab-del-card-btn");
    if (deleteBtn) deleteBtn.dataset.id = card.id;

    const progressEl = cardEl.querySelector(".clab-card-progress-container");
    if (progressEl) progressEl.dataset.cardProgId = card.id;

    const bodyEl = cardEl.querySelector(".clab-card-body");
    if (bodyEl) bodyEl.dataset.cardId = card.id;

    const areaListEl = cardEl.querySelector(".clab-area-list");
    if (areaListEl) areaListEl.dataset.cardId = card.id;
}

function canRefreshCardsInPlace(cardsContainer) {
    if (!cardsContainer || !window._clabSurgicallyUpdateArea) return false;

    const { cardEls } = getRenderedCardsState(cardsContainer);
    if (cardEls.length !== state.cards.length) return false;

    return state.cards.every((card, index) => {
        const cardEl = cardEls[index];
        if (!cardEl) return false;

        const areaEls = Array.from(cardEl.querySelectorAll(".clab-area-list > .clab-area[data-area-id]"));
        const stateAreas = Array.isArray(card.areas) ? card.areas : [];
        return areaEls.length === stateAreas.length;
    });
}

function refreshCardsInPlace(cardsContainer, areaIds = null) {
    if (!canRefreshCardsInPlace(cardsContainer)) return false;

    const panel = cardsContainer.closest("#clab-panel");
    if (panel) {
        panel.classList.toggle("clab-painter-active", !!state.painterMode);
    }

    const { cardEls } = getRenderedCardsState(cardsContainer);

    state.cards.forEach((card, cardIndex) => {
        const cardEl = cardEls[cardIndex];
        syncCardShellInPlace(cardEl, card, cardIndex);

        const areaEls = Array.from(cardEl.querySelectorAll(".clab-area-list > .clab-area[data-area-id]"));
        areaEls.forEach((areaEl, areaIndex) => {
            const area = card.areas?.[areaIndex];
            if (!area) return;
            areaEl.dataset.cardId = card.id;
            areaEl.dataset.areaId = area.id;
        });
    });

    const targetAreaIds = Array.isArray(areaIds) ? new Set(areaIds) : null;
    if (!targetAreaIds || targetAreaIds.size > 0) {
        state.cards.forEach((card) => {
            (card.areas || []).forEach((area) => {
                if (targetAreaIds && !targetAreaIds.has(area.id)) return;
                if (window._clabRefreshAreaForContext) window._clabRefreshAreaForContext(area.id);
                else window._clabSurgicallyUpdateArea(area.id);
            });
        });
    }

    if (window._clabUpdateCardsLayout) window._clabUpdateCardsLayout();
    if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
    return true;
}

function performPanelRender() {
    if (!panelContainer) return;

    const toolbarHandle = panelContainer.querySelector("#clab-toolbar-handle");
    const channelBar = panelContainer.querySelector("#clab-channel-bar");
    const cardsContainer = panelContainer.querySelector("#clab-cards-container");
    const workspaceBar = panelContainer.querySelector("#clab-workspace-bar");

    let savedScrollLeft = 0;
    const savedCardScrolls = new Map();
    if (cardsContainer) {
        savedScrollLeft = cardsContainer.scrollLeft;
        cardsContainer.querySelectorAll(".clab-card-body").forEach((body) => {
            if (!body.dataset.cardId) return;
            savedCardScrolls.set(body.dataset.cardId, body.scrollTop);
        });
    }

    if (window.CLab && window.CLab.stashMedia) window.CLab.stashMedia();

    renderDynamicToolbar(toolbarHandle);
    renderChannelBar(channelBar);
    renderCardsList(cardsContainer);
    renderWorkspaceBar(workspaceBar);

    if (cardsContainer) {
        cardsContainer.scrollLeft = savedScrollLeft;
        cardsContainer.querySelectorAll(".clab-card-body").forEach((body) => {
            if (!body.dataset.cardId || !savedCardScrolls.has(body.dataset.cardId)) return;
            body.scrollTop = savedCardScrolls.get(body.dataset.cardId);
        });
    }

    if (window.CLab && window.CLab.restoreMedia) window.CLab.restoreMedia();

    attachDynamicToolbarEvents(toolbarHandle);
    attachChannelEvents(channelBar);
    attachCardEvents(cardsContainer);
    attachAreaEvents(cardsContainer);
    attachWorkspaceEvents(workspaceBar);

    if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
}

function refreshContextView(options = {}) {
    if (!panelContainer) return;

    if (window.CLab && typeof window.CLab.saveState === "function") {
        window.CLab.saveState(state);
    } else if (window.StateManager && typeof window.StateManager.syncToNode === "function" && window.app?.graph) {
        window.StateManager.syncToNode(window.app.graph);
    }

    const toolbarHandle = panelContainer.querySelector("#clab-toolbar-handle");
    const channelBar = panelContainer.querySelector("#clab-channel-bar");
    const cardsContainer = panelContainer.querySelector("#clab-cards-container");
    const workspaceBar = panelContainer.querySelector("#clab-workspace-bar");

    if (toolbarHandle) {
        renderDynamicToolbar(toolbarHandle);
        attachDynamicToolbarEvents(toolbarHandle);
    }
    if (channelBar) {
        renderChannelBar(channelBar);
        attachChannelEvents(channelBar);
    }
    if (workspaceBar) {
        renderWorkspaceBar(workspaceBar);
        attachWorkspaceEvents(workspaceBar);
    }

    if (refreshCardsInPlace(cardsContainer, options.areaIds)) return;

    performPanelRender();
}

export function setupUI() {
    injectCSS();
    setupPanelMediaVault();

    const overrideStyle = document.createElement("style");
    overrideStyle.innerHTML = `
        .clab-custom-select-item:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
            color: #ffffff !important;
        }
        #clab-panel {
            --clab-card-width: 320px;
        }
        #clab-panel .clab-card {
            width: var(--clab-card-width) !important;
            min-width: var(--clab-card-width) !important;
            max-width: var(--clab-card-width) !important;
            transition: width 0.1s ease, min-width 0.1s ease, max-width 0.1s ease;
        }
        #clab-panel.clab-zooming .clab-card {
            transition: none !important;
        }
        #clab-card-width-input::-webkit-outer-spin-button,
        #clab-card-width-input::-webkit-inner-spin-button,
        #clab-run-batch-count::-webkit-outer-spin-button,
        #clab-run-batch-count::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        #clab-card-width-input[type=number],
        #clab-run-batch-count[type=number] {
            -moz-appearance: textfield;
        }

        .clab-context-menu {
            background: #2a2a2a !important;
            border: 1px solid #555 !important;
            border-radius: 6px !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5) !important;
            padding: 4px 0 !important;
            font-family: sans-serif !important;
            backdrop-filter: none !important;
        }
        .clab-context-menu-title {
            padding: 6px 12px !important;
            font-size: 12px !important;
            color: #aaa !important;
            font-weight: bold !important;
            background: rgba(255,255,255,0.08) !important;
            margin: 0 !important;
            pointer-events: none !important;
            letter-spacing: normal !important;
        }
        .clab-context-menu-item {
            padding: 6px 12px !important;
            font-size: 12px !important;
            color: #eee !important;
            cursor: pointer !important;
            transition: background 0.1s !important;
            display: flex !important;
            align-items: center !important;
        }
        .clab-context-menu-item:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
            color: #ffffff !important;
        }
        .clab-context-menu-item.clab-danger {
            color: #ff4d4f !important;
        }
        .clab-context-menu-item.clab-danger:hover {
            background-color: #ff4d4f !important;
            color: #ffffff !important;
        }
        .clab-context-menu-divider {
            height: 1px !important;
            background: rgba(255, 255, 255, 0.1) !important;
            margin: 4px 12px !important;
        }
        #clab-channel-strip {
            height: 28px;
            min-height: 28px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding: 0;
            display: flex;
            align-items: stretch;
            background: rgba(0, 0, 0, 0.25);
        }
        #clab-channel-bar {
            width: 100%;
            display: flex;
            align-items: stretch;
            gap: 0;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
        }
        #clab-channel-bar::-webkit-scrollbar {
            display: none;
        }
        .clab-channel-tab {
            font-size: 11px !important;
            opacity: 0.8;
            height: 100%;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 16px !important;
            background: transparent !important;
            color: rgb(100, 100, 100) !important;
            display: flex;
            align-items: center;
            cursor: pointer;
            transition: all 0.2s;
            border-right: 1px solid rgba(255,255,255,0.05) !important;
            white-space: nowrap;
        }
        .clab-channel-tab:hover {
            background: rgba(255, 255, 255, 0.05) !important;
            opacity: 1;
            color: #fff !important;
        }
        .clab-channel-tab.active {
            background: rgb(24, 24, 24) !important;
            opacity: 1;
            color: #fff !important;
            font-weight: normal;
            box-shadow: inset 0 -2px 0 var(--clab-theme-card, #4CAF50);
        }
        .clab-channel-tab.selected {
            background: rgb(24, 24, 24) !important;
            opacity: 1 !important;
        }
        .clab-channel-tab.clab-dragging {
            opacity: 0.4 !important;
            background: rgba(255, 255, 255, 0.05) !important;
            border: 1px dashed rgba(255, 255, 255, 0.3) !important;
        }
        .clab-channel-tab.clab-drag-over-tab-left {
            border-left: 2px solid var(--clab-theme-card, #4CAF50) !important;
            background: rgba(255, 255, 255, 0.08) !important;
        }
        .clab-channel-tab.clab-drag-over-tab-right {
            border-right: 2px solid var(--clab-theme-card, #4CAF50) !important;
            background: rgba(255, 255, 255, 0.08) !important;
        }
        #clab-channel-add {
            font-size: 14px !important;
            padding: 0 10px !important;
            position: sticky !important;
            right: 0 !important;
            background: rgb(24, 24, 24) !important; /* Fully opaque background */
            opacity: 1 !important;
            z-index: 15 !important;
            border-left: 1px solid rgba(255, 255, 255, 0.15) !important;
        }
    `;
    document.head.appendChild(overrideStyle);

    try {
        if (!panelContainer) {
            createPanelDOM();
            if (backdropContainer) document.body.appendChild(backdropContainer);
            document.body.appendChild(panelContainer);
            if (window._clabApplyPanelLayout) window._clabApplyPanelLayout();

            setupGlobalEvents(panelContainer, backdropContainer, togglePanel, performRender);
            setupExecutionEvents();

            import("./components/comp_contextmenu.js").then((module) => {
                module.setupContextMenu(panelContainer);
            }).catch((err) => {
                console.warn("[CLab] context menu module failed to load:", err);
            });
        }
    } catch (error) {
        console.error("[CLab] UI panel init failed:", error);
    }
}

export function togglePanel() {
    if (!panelContainer) return;

    const isVisible = panelContainer.classList.contains("visible");
    if (isVisible) {
        panelContainer.classList.remove("visible");
        if (backdropContainer) backdropContainer.classList.remove("visible");
        state.painterMode = false;
        state.painterSource = null;
        return;
    }

    panelContainer.classList.add("visible");
    if (backdropContainer) backdropContainer.classList.add("visible");
    performRender();
}

document.addEventListener("clab_render_ui", () => {
    performRender();
});

window._clabRefreshContextView = refreshContextView;

function performRender() {
    performPanelRender();
}

function createPanelDOM() {
    backdropContainer = document.createElement("div");
    backdropContainer.id = "clab-backdrop";
    backdropContainer.onclick = () => {
        if (!appState.isBindingMode) togglePanel();
    };

    panelContainer = document.createElement("div");
    panelContainer.id = "clab-panel";

    panelContainer.innerHTML = `
        <div class="clab-toolbar" id="clab-toolbar-handle">
            <div class="clab-toolbar-left">
                <button class="clab-btn" id="clab-global-add-card" title="新建空白任务卡片">+ 新建任务</button>
                <button class="clab-btn" id="clab-global-add-module" title="在当前任务内添加新模块">+ 新建模块</button>
                <div id="clab-module-toolbar-separator" style="width:1px; height:20px; background:rgba(255,255,255,0.2); margin:0 5px; display:none;"></div>
                <div id="clab-module-toolbar" class="clab-module-toolbar" style="display:none;"></div>
            </div>

            <div class="clab-toolbar-right">
                <div style="display:inline-flex; align-items:stretch; height: 34px;">
                    <div id="clab-run-btn-wrapper" class="clab-run-wrapper" style="border-top-right-radius: 0; border-bottom-right-radius: 0; height: 100%;">
                        <button class="clab-btn run-btn-main" id="clab-btn-run" title="按规则运行选中任务（局部）" style="height: 100%;">运行</button>
                        <div style="width:1px; height:16px; background:rgba(255,255,255,0.4); margin: 0 4px; align-self: center;"></div>
                        <button class="clab-btn run-btn-toggle" id="clab-run-dropdown-toggle" title="展开更多运行选项" style="height: 100%;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div id="clab-run-dropdown-menu" class="clab-custom-select-dropdown" style="display:none; top: calc(100% + 4px); right: 0; left: auto; min-width: 140px; z-index: 10002;">
                            <div class="clab-custom-select-item" id="clab-btn-run-all" style="display:flex; align-items:center; gap:8px;">
                                <svg width="15" height="15" viewBox="0 0 19.6 15.01" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19.26,6.77L11.55.23c-.63-.53-1.59-.09-1.59.74v13.07c0,.82.96,1.27,1.59.74l7.72-6.54c.46-.39.46-1.09,0-1.48Z"/>
                                    <path d="M9.31,6.77L1.59.23C.96-.3,0,.15,0,.97v13.07c0,.82.96,1.27,1.59.74l7.72-6.54c.46-.39.46-1.09,0-1.48Z"/>
                                </svg>
                                运行全部
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; background: rgba(0,0,0,0.5); border: 1px solid #555; border-left: none; border-top-right-radius: 6px; border-bottom-right-radius: 6px; padding-left: 6px; height: 100%; box-sizing: border-box;" title="循环运行次数（排队执行）">
                        <input type="number" id="clab-run-batch-count" value="1" min="1" max="999" style="width: 24px; background: transparent; border: none; color: #eee; font-size: 14px; text-align: center; outline: none; font-family: sans-serif; -moz-appearance: textfield; padding: 0;">
                        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height: 100%; margin-left: 2px; gap: 2px;">
                            <div id="clab-run-count-up" style="cursor:pointer; display:flex; align-items:center; justify-content:center; padding: 2px 6px;" onmouseover="this.querySelector('svg').style.stroke='#fff'" onmouseout="this.querySelector('svg').style.stroke='#aaa'">
                                <svg width="14" height="8" viewBox="0 7 24 10" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; transition: stroke 0.2s;"><polyline points="18 15 12 9 6 15"></polyline></svg>
                            </div>
                            <div id="clab-run-count-down" style="cursor:pointer; display:flex; align-items:center; justify-content:center; padding: 2px 6px;" onmouseover="this.querySelector('svg').style.stroke='#fff'" onmouseout="this.querySelector('svg').style.stroke='#aaa'">
                                <svg width="14" height="8" viewBox="0 7 24 10" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; transition: stroke 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </div>
                        </div>
                    </div>
                </div>

                <button class="clab-btn" id="clab-btn-config" title="在画布创建配置锚点">创建配置锚点</button>
            </div>
        </div>
        <div id="clab-channel-strip">
            <div id="clab-channel-bar"></div>
        </div>
        <div class="clab-cards-container" id="clab-cards-container"></div>
        <div id="clab-card-width-ctrl" class="clab-card-width-ctrl">
            <svg id="clab-card-width-reset" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="恢复默认宽度" style="cursor: pointer; transition: stroke 0.2s;" onmouseover="this.style.stroke='#fff'" onmouseout="this.style.stroke='#888'">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
            <input type="range" id="clab-card-width-slider" min="260" max="600" value="320" style="width: 80px; accent-color: #888; cursor: pointer; height: 4px; background: rgba(255,255,255,0.2); outline: none; border-radius: 2px; -webkit-appearance: none;">
            <input type="number" id="clab-card-width-input" title="手动输入宽度（回车确认）" style="width: 36px; background: transparent; border: none; color: #888; font-size: 12px; outline: none; text-align: left; padding: 0; margin: 0; font-family: monospace; transition: color 0.2s;" onfocus="this.style.color='#fff'" onblur="this.style.color='#888'">
        </div>

        <div class="clab-panel-footer">
            <div class="clab-workspace-shell">
                <div class="clab-workspace-tabs" id="clab-workspace-bar"></div>
            </div>
        </div>
    `;

    setupStaticToolbarEvents(panelContainer);
    setupPanelEvents(panelContainer);
}
