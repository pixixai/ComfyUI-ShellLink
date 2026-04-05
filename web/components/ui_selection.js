/**
 * ui_selection.js: selection ui + Ctrl/Shift multi-select interaction logic.
 */
import { state, appState } from "./ui_state.js";
import { app } from "../../../scripts/app.js";
import { renderDynamicToolbar, attachDynamicToolbarEvents } from "./comp_toolbar.js";

const INTERACTIVE_SELECTOR = "button, input, select, textarea, .clab-custom-select, .clab-edit-val-bool, .clab-del-area-btn, .clab-del-card-btn, .clab-history-thumb, .clab-upload-zone, .clab-video-controls-interactive, .clab-text-preview-shell, .clab-text-body-scroll, .clab-text-body-content";
const MEDIA_SELECTOR = ".clab-video-player, .clab-audio-player, .clab-preview-bg, video, audio, .clab-text-preview-shell, .clab-text-body-scroll, .clab-text-body-content";

export function isInteractiveTarget(target) {
    return !!(target && typeof target.closest === "function" && target.closest(INTERACTIVE_SELECTOR));
}

export function isMediaTarget(target) {
    return !!(target && typeof target.closest === "function" && target.closest(MEDIA_SELECTOR));
}

export function handleDeselectAll(forceExitPainter = false) {
    const openDropdowns = document.querySelectorAll(".clab-custom-select.open");
    if (openDropdowns.length > 0) {
        openDropdowns.forEach((el) => el.classList.remove("open"));
        return false;
    }

    let changed = false;
    if (forceExitPainter && state.painterMode) {
        state.painterMode = false;
        state.painterSource = null;
        changed = true;
    }
    if (state.selectedCardIds?.length > 0) {
        state.selectedCardIds = [];
        state.activeCardId = null;
        changed = true;
    }
    if (state.selectedAreaIds?.length > 0) {
        state.selectedAreaIds = [];
        state.activeCardId = null;
        changed = true;
    }

    if (changed) updateSelectionUI();
    return changed;
}

export function handleSelectionMouseDown(event, panelContainer) {
    const isInteractive = isInteractiveTarget(event.target);

    if (state.painterMode) {
        if (isInteractive && event.button === 0) {
            state.painterMode = false;
            state.painterSource = null;
            if (panelContainer) panelContainer.classList.remove("clab-painter-active");
            updateSelectionUI();
            return true;
        }
        return true;
    }

    if (event.button !== 0) return false;

    const isMedia = isMediaTarget(event.target);
    const areaEl = event.target.closest(".clab-area");
    const cardEl = event.target.closest(".clab-card:not(.clab-add-card-inline)");

    if (areaEl) {
        const areaId = areaEl.dataset.areaId;
        const targetCardId = cardEl ? cardEl.dataset.cardId : null;

        if (event.ctrlKey || event.metaKey) {
            if (isInteractive) {
                if (!state.selectedAreaIds.includes(areaId)) state.selectedAreaIds.push(areaId);
            } else {
                if (state.selectedAreaIds.includes(areaId)) state.selectedAreaIds = state.selectedAreaIds.filter((id) => id !== areaId);
                else state.selectedAreaIds.push(areaId);
            }
            appState.lastClickedAreaId = areaId;
        } else if (event.shiftKey && appState.lastClickedAreaId) {
            let startCardIdx = -1;
            let endCardIdx = -1;
            let startAreaIdx = -1;
            let endAreaIdx = -1;
            let anchorType = null;

            state.cards.forEach((card, cardIdx) => {
                if (card.id === targetCardId) {
                    endCardIdx = cardIdx;
                    if (card.areas) endAreaIdx = card.areas.findIndex((area) => area.id === areaId);
                }
                if (!card.areas) return;
                const anchorIdx = card.areas.findIndex((area) => area.id === appState.lastClickedAreaId);
                if (anchorIdx === -1) return;

                startCardIdx = cardIdx;
                startAreaIdx = anchorIdx;
                anchorType = card.areas[anchorIdx].type;
            });

            if (startCardIdx !== -1 && endCardIdx !== -1 && startAreaIdx !== -1 && endAreaIdx !== -1) {
                const minCard = Math.min(startCardIdx, endCardIdx);
                const maxCard = Math.max(startCardIdx, endCardIdx);
                const minArea = Math.min(startAreaIdx, endAreaIdx);
                const maxArea = Math.max(startAreaIdx, endAreaIdx);

                const rangeIds = [];
                for (let c = minCard; c <= maxCard; c += 1) {
                    const currentCard = state.cards[c];
                    if (!currentCard?.areas) continue;
                    for (let a = minArea; a <= maxArea; a += 1) {
                        const candidate = currentCard.areas[a];
                        if (candidate && candidate.type === anchorType) rangeIds.push(candidate.id);
                    }
                }
                state.selectedAreaIds = Array.from(new Set([...state.selectedAreaIds, ...rangeIds]));
            } else {
                state.selectedAreaIds = [areaId];
                appState.lastClickedAreaId = areaId;
            }
        } else {
            if (!(isInteractive && state.selectedAreaIds.includes(areaId) && state.selectedAreaIds.length > 1)) {
                state.selectedAreaIds = [areaId];
            }
            appState.lastClickedAreaId = areaId;
        }

        state.selectedCardIds = [];
        state.activeCardId = state.selectedAreaIds.length > 0 ? targetCardId : null;
        updateSelectionUI();

        if (!isInteractive && !isMedia) event.stopPropagation();
        return true;
    }

    if (cardEl) {
        const targetId = cardEl.dataset.cardId;
        if (event.ctrlKey || event.metaKey) {
            if (isInteractive) {
                if (!state.selectedCardIds.includes(targetId)) state.selectedCardIds.push(targetId);
            } else {
                if (state.selectedCardIds.includes(targetId)) state.selectedCardIds = state.selectedCardIds.filter((id) => id !== targetId);
                else state.selectedCardIds.push(targetId);
            }
            appState.lastClickedCardId = targetId;
        } else if (event.shiftKey && appState.lastClickedCardId) {
            const currentIndex = state.cards.findIndex((card) => card.id === targetId);
            const lastIndex = state.cards.findIndex((card) => card.id === appState.lastClickedCardId);
            const minIdx = Math.min(currentIndex, lastIndex);
            const maxIdx = Math.max(currentIndex, lastIndex);
            const rangeIds = state.cards.slice(minIdx, maxIdx + 1).map((card) => card.id);
            state.selectedCardIds = Array.from(new Set([...state.selectedCardIds, ...rangeIds]));
        } else {
            if (!(isInteractive && state.selectedCardIds.includes(targetId) && state.selectedCardIds.length > 1)) {
                state.selectedCardIds = [targetId];
            }
            appState.lastClickedCardId = targetId;
        }

        state.activeCardId = state.selectedCardIds.length > 0 ? state.selectedCardIds[state.selectedCardIds.length - 1] : null;
        state.selectedAreaIds = [];
        updateSelectionUI();

        if (!isInteractive && !isMedia) event.stopPropagation();
        return true;
    }

    return false;
}

export function updateSelectionUI() {
    try {
        // 1. 遍历卡片 DOM，修改高亮
        document.querySelectorAll(".clab-card:not(.clab-add-card-inline)").forEach((card) => {
            const cardId = card.dataset.cardId;
            if (state.selectedCardIds && state.selectedCardIds.includes(cardId)) {
                card.classList.add("active", "selected");
                card.style.borderColor = "var(--clab-theme-card, #4CAF50)";
            } else {
                card.classList.remove("active", "selected");
                card.style.borderColor = "";
            }
        });

        // 2. 遍历模块 DOM，修改高亮
        document.querySelectorAll(".clab-area").forEach((area) => {
            const areaId = area.dataset.areaId;
            if (state.selectedAreaIds && state.selectedAreaIds.includes(areaId)) {
                area.classList.add("active");
                area.classList.add("selected");
                area.style.borderColor = "var(--clab-theme-module, #2196F3)";
            } else {
                area.classList.remove("active");
                area.classList.remove("selected");
                area.style.borderColor = "";
            }
        });

        // 3. 刷新动态工具栏
        const toolbarHandle = document.querySelector("#clab-toolbar-handle");
        if (toolbarHandle) {
            renderDynamicToolbar(toolbarHandle);
            attachDynamicToolbarEvents(toolbarHandle);
        }

        // 4. 静默保存状态到节点（不触发全量渲染）
        if (window.CLab && window.CLab.saveState) {
            window.CLab.saveState(state);
        } else if (window.StateManager && window.StateManager.syncToNode) {
            window.StateManager.syncToNode(app.graph);
        }
    } catch (err) {
        console.error("[CLab] Selection local refresh failed, falling back to full render:", err);
        if (window.CLab && window.CLab.saveState) window.CLab.saveState(state);
        document.dispatchEvent(new CustomEvent("clab_render_ui"));
    }
}

window.CLab = window.CLab || {};
window.CLab.updateSelectionUI = updateSelectionUI;
