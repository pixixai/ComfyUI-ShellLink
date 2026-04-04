/**
 * event_panel.js: panel-local event wiring (selection, painter, wheel, drag, width).
 */
import { state, saveAndRender } from "../ui_state.js";
import { attachCardEvents, generateSingleCardHTML } from "../comp_taskcard.js";
import { attachAreaEvents } from "../comp_modulearea.js";
import {
    updateSelectionUI,
    handleSelectionMouseDown,
    handleDeselectAll,
    isInteractiveTarget,
    isMediaTarget,
} from "../ui_selection.js";

function isToolbarInteractiveTarget(target) {
    const tagName = target?.tagName;
    const hasClosest = target && typeof target.closest === "function";
    return ["BUTTON", "INPUT", "LABEL", "SELECT"].includes(tagName) ||
        !!(hasClosest && target.closest("button, input, label, select, .clab-custom-select, .clab-type-btn"));
}

function setupBatchCountControl(panelContainer) {
    const countInput = panelContainer.querySelector("#clab-run-batch-count");
    const upBtn = panelContainer.querySelector("#clab-run-count-up");
    const downBtn = panelContainer.querySelector("#clab-run-count-down");
    if (!countInput || !upBtn || !downBtn) return;

    upBtn.onclick = (event) => {
        event.stopPropagation();
        countInput.value = Math.min(999, parseInt(countInput.value || 1, 10) + 1);
    };
    downBtn.onclick = (event) => {
        event.stopPropagation();
        countInput.value = Math.max(1, parseInt(countInput.value || 1, 10) - 1);
    };
    countInput.onchange = () => {
        let value = parseInt(countInput.value, 10);
        if (Number.isNaN(value) || value < 1) value = 1;
        if (value > 999) value = 999;
        countInput.value = value;
    };
}

function setupPanelDrag(panelContainer) {
    const handle = panelContainer.querySelector("#clab-toolbar-handle");
    if (!handle) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", (event) => {
        const blocked = ["BUTTON", "SELECT", "INPUT", "LABEL"].includes(event.target.tagName) ||
            event.target.closest("button, select, input, label, .clab-custom-select");
        if (blocked) return;

        isDragging = true;
        const rect = panelContainer.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;
        panelContainer.style.left = `${event.clientX - offsetX}px`;
        panelContainer.style.top = `${event.clientY - offsetY}px`;
        panelContainer.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = "";
    });
}

function setupCardWidthControl(panelContainer) {
    const widthSlider = panelContainer.querySelector("#clab-card-width-slider");
    const widthInput = panelContainer.querySelector("#clab-card-width-input");
    const widthResetBtn = panelContainer.querySelector("#clab-card-width-reset");
    const widthCtrlNode = panelContainer.querySelector("#clab-card-width-ctrl");
    if (!widthSlider || !widthInput || !widthResetBtn) return;

    const savedWidth = localStorage.getItem("clab-card-width-v1") || "320";
    widthSlider.value = savedWidth <= 600 ? savedWidth : 600;
    widthInput.value = savedWidth;
    panelContainer.style.setProperty("--clab-card-width", `${savedWidth}px`);

    const updateWidth = (value) => {
        let numericValue = parseInt(value, 10);
        if (Number.isNaN(numericValue)) numericValue = 320;
        if (numericValue < 260) numericValue = 260;
        if (numericValue > 1200) numericValue = 1200;

        const cardsContainer = panelContainer.querySelector("#clab-cards-container");
        let ratio = 0.5;
        if (cardsContainer && cardsContainer.scrollWidth > 0) {
            ratio = (cardsContainer.scrollLeft + cardsContainer.clientWidth / 2) / cardsContainer.scrollWidth;
        }

        widthSlider.value = Math.min(numericValue, 600);
        widthInput.value = numericValue;
        panelContainer.style.setProperty("--clab-card-width", `${numericValue}px`);
        localStorage.setItem("clab-card-width-v1", numericValue);

        // Sync layout immediately to update scrollWidth
        if (window._clabUpdateCardsLayout) {
            window._clabUpdateCardsLayout();
        }

        if (cardsContainer && cardsContainer.scrollWidth > 0) {
            const newScrollLeft = (ratio * cardsContainer.scrollWidth) - (cardsContainer.clientWidth / 2);
            cardsContainer.scrollLeft = newScrollLeft;
        }
    };

    widthSlider.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        panelContainer.classList.add("clab-zooming");
    });

    const stopZooming = () => {
        panelContainer.classList.remove("clab-zooming");
    };

    window.addEventListener("mouseup", stopZooming);
    widthSlider.addEventListener("change", (event) => {
        stopZooming();
        updateWidth(event.target.value);
    });

    widthSlider.addEventListener("input", (event) => {
        event.stopPropagation();
        const value = event.target.value;
        widthInput.value = value;
        
        const cardsContainer = panelContainer.querySelector("#clab-cards-container");
        let ratio = 0.5;
        if (cardsContainer && cardsContainer.scrollWidth > 0) {
            ratio = (cardsContainer.scrollLeft + cardsContainer.clientWidth / 2) / cardsContainer.scrollWidth;
        }

        panelContainer.style.setProperty("--clab-card-width", `${value}px`);

        if (window._clabUpdateCardsLayout) {
            window._clabUpdateCardsLayout();
        }

        if (cardsContainer && cardsContainer.scrollWidth > 0) {
            cardsContainer.scrollLeft = (ratio * cardsContainer.scrollWidth) - (cardsContainer.clientWidth / 2);
        }
    });
    widthSlider.addEventListener("change", (event) => updateWidth(event.target.value));

    widthInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.target.blur();
    });
    widthInput.addEventListener("blur", (event) => updateWidth(event.target.value));

    widthResetBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        updateWidth(320);
    });

    const stopPropagation = (event) => event.stopPropagation();
    widthSlider.addEventListener("mousedown", stopPropagation);
    widthInput.addEventListener("mousedown", stopPropagation);
    widthResetBtn.addEventListener("mousedown", stopPropagation);
    if (widthCtrlNode) {
        widthCtrlNode.addEventListener("mousedown", stopPropagation);
        widthCtrlNode.addEventListener("click", stopPropagation);
    }
}

function setupMediaErrorHandler() {
    window.CLab = window.CLab || {};

    window.CLab.handleMediaError = (cardId, areaId, failedUrl) => {
        const card = state.cards.find((item) => item.id === cardId);
        const area = card?.areas.find((item) => item.id === areaId);

        if (area && area.history && area.history.length > 0) {
            const failedPath = new URL(failedUrl, window.location.origin).pathname + new URL(failedUrl, window.location.origin).search;
            const idx = area.history.findIndex((historyUrl) => {
                const path = new URL(historyUrl, window.location.origin).pathname + new URL(historyUrl, window.location.origin).search;
                return path === failedPath;
            });

            if (idx !== -1) {
                area.history.splice(idx, 1);
                if (area.history.length === 0) {
                    area.resultUrl = "";
                    area.historyIndex = 0;
                } else {
                    area.historyIndex = Math.min(idx, area.history.length - 1);
                    area.resultUrl = area.history[area.historyIndex];
                }
                setTimeout(() => {
                    if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(areaId);
                }, 10);
            } else if (area.resultUrl === failedUrl) {
                area.resultUrl = "";
                setTimeout(() => {
                    if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(areaId);
                }, 10);
            }
            return;
        }

        if (area && area.resultUrl === failedUrl) {
            area.resultUrl = "";
            setTimeout(() => {
                if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(areaId);
            }, 10);
        }
    };
}

function handlePainterModeClick(event, panelContainer, cardsContainer) {
    const isInteractive = isInteractiveTarget(event.target);
    const areaEl = event.target.closest(".clab-area");
    const cardEl = event.target.closest(".clab-card:not(.clab-add-card-inline)");

    if (isInteractive) {
        state.painterMode = false;
        state.painterSource = null;
        panelContainer.classList.remove("clab-painter-active");
        updateSelectionUI();
        return true;
    }

    if (state.painterSource?.type === "card") {
        if (cardEl && !areaEl) {
            const targetId = cardEl.dataset.cardId;
            if (state.painterSource.data.id !== targetId) {
                const targetCard = state.cards.find((card) => card.id === targetId);
                targetCard.areas = JSON.parse(JSON.stringify(state.painterSource.data.areas));
                targetCard.areas.forEach((area) => {
                    area.id = `area_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                });

                const newHtml = generateSingleCardHTML(targetCard, state.cards.indexOf(targetCard));
                const temp = document.createElement("div");
                temp.innerHTML = newHtml;
                const newEl = temp.firstElementChild;

                cardEl.replaceWith(newEl);
                attachCardEvents(newEl.parentElement);
                attachAreaEvents(newEl);

                if (window._clabJustSave) window._clabJustSave();
                if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
            }
        } else if (!cardEl) {
            let insertIndex = state.cards.length;
            const cardEls = cardsContainer.querySelectorAll(".clab-card:not(.clab-add-card-inline)");
            for (let i = 0; i < cardEls.length; i += 1) {
                const rect = cardEls[i].getBoundingClientRect();
                if (event.clientX < rect.left + rect.width / 2) {
                    insertIndex = i;
                    break;
                }
            }

            const newCard = JSON.parse(JSON.stringify(state.painterSource.data));
            newCard.id = `card_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            if (newCard.areas) {
                newCard.areas.forEach((area) => {
                    area.id = `area_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                });
            }
            state.cards.splice(insertIndex, 0, newCard);

            const wrapper = document.querySelector(".clab-cards-wrapper");
            if (wrapper) {
                const newHtml = generateSingleCardHTML(newCard, insertIndex);
                const temp = document.createElement("div");
                temp.innerHTML = newHtml;
                const newEl = temp.firstElementChild;

                const nextCard = state.cards[insertIndex + 1];
                let referenceNode = nextCard ? wrapper.querySelector(`.clab-card[data-card-id="${nextCard.id}"]`) : null;
                if (!referenceNode) referenceNode = wrapper.querySelector(".clab-add-card-inline");

                if (referenceNode) wrapper.insertBefore(newEl, referenceNode);
                else wrapper.appendChild(newEl);

                attachCardEvents(wrapper);
                attachAreaEvents(newEl);

                if (window._clabJustSave) window._clabJustSave();
                if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
                if (window._clabUpdateCardsLayout) window._clabUpdateCardsLayout();

                setTimeout(() => {
                    newEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                }, 50);
            } else {
                saveAndRender();
            }
        }

        event.stopPropagation();
        return true;
    }

    if (state.painterSource?.type === "area") {
        if (areaEl) {
            const targetAreaId = areaEl.dataset.areaId;
            if (state.painterSource.data.id !== targetAreaId) {
                const src = state.painterSource.data;
                const card = state.cards.find((item) => item.id === areaEl.dataset.cardId);
                const area = card?.areas.find((item) => item.id === targetAreaId);
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
                    if (area.type !== src.type) area.value = "";

                    if (window._clabSurgicallyUpdateArea) {
                        window._clabSurgicallyUpdateArea(targetAreaId);
                        if (window._clabJustSave) window._clabJustSave();
                    } else {
                        saveAndRender();
                    }
                }
            }
        } else if (cardEl && !areaEl) {
            let insertIndex = 0;
            const targetCard = state.cards.find((card) => card.id === cardEl.dataset.cardId);
            const areaEls = cardEl.querySelectorAll(".clab-area");
            if (areaEls && areaEls.length > 0) {
                insertIndex = targetCard.areas ? targetCard.areas.length : 0;
                for (let i = 0; i < areaEls.length; i += 1) {
                    const rect = areaEls[i].getBoundingClientRect();
                    if (event.clientY < rect.top + rect.height / 2) {
                        insertIndex = i;
                        break;
                    }
                }
            }

            const newArea = JSON.parse(JSON.stringify(state.painterSource.data));
            newArea.id = `area_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            if (!targetCard.areas) targetCard.areas = [];
            targetCard.areas.splice(insertIndex, 0, newArea);

            if (window._clabGenerateAreaHTML && window._clabAttachAreaEvents) {
                const temp = document.createElement("div");
                temp.innerHTML = window._clabGenerateAreaHTML(newArea, targetCard);
                const newEl = temp.firstElementChild;
                const cardBody = cardEl.querySelector(".clab-area-list");
                if (cardBody) {
                    if (insertIndex >= targetCard.areas.length - 1) {
                        cardBody.appendChild(newEl);
                    } else {
                        const nextArea = targetCard.areas[insertIndex + 1];
                        const nextEl = cardBody.querySelector(`.clab-area[data-area-id="${nextArea.id}"]`);
                        cardBody.insertBefore(newEl, nextEl);
                    }
                    window._clabAttachAreaEvents(cardBody);
                }
                if (window._clabJustSave) window._clabJustSave();
                if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
            } else {
                saveAndRender();
            }
        }

        event.stopPropagation();
        return true;
    }

    return true;
}

export function setupPanelEvents(panelContainer) {
    const cardsContainer = panelContainer.querySelector("#clab-cards-container");
    const toolbar = panelContainer.querySelector("#clab-toolbar-handle");
    if (!cardsContainer || !toolbar) return;

    setupBatchCountControl(panelContainer);

    panelContainer.addEventListener("click", (event) => {
        if (!state.painterMode) return;
        if (event.target.closest("#tb-format-painter")) return;

        const isToolbar = event.target.closest("#clab-toolbar-handle");
        const isAddCardBtn = event.target.closest(".clab-add-card-inline");
        if (!isToolbar && !isAddCardBtn) return;

        state.painterMode = false;
        state.painterSource = null;
        panelContainer.classList.remove("clab-painter-active");
        updateSelectionUI();
    }, true);

    cardsContainer.addEventListener("mousedown", (event) => {
        if (state.painterMode) return;
        const cardEl = event.target.closest(".clab-card:not(.clab-add-card-inline)");
        if (!cardEl || !cardEl.dataset.cardId) return;

        const targetId = cardEl.dataset.cardId;
        if (state.activeCardId !== targetId) state.activeCardId = targetId;
    }, true);

    cardsContainer.addEventListener("mousedown", (event) => {
        handleSelectionMouseDown(event, panelContainer);
    }, true);

    cardsContainer.addEventListener("click", (event) => {
        const isInteractive = isInteractiveTarget(event.target);
        const isMedia = isMediaTarget(event.target);
        const areaEl = event.target.closest(".clab-area");
        const cardEl = event.target.closest(".clab-card:not(.clab-add-card-inline)");

        if (state.painterMode) {
            const handled = handlePainterModeClick(event, panelContainer, cardsContainer);
            if (handled) return;
        }

        if ((areaEl || cardEl) && !isInteractive && !isMedia) {
            event.stopPropagation();
            return;
        }

        const isBackground = event.target === cardsContainer || !!event.target.classList?.contains("clab-cards-wrapper");
        if (!isInteractive && !isMedia && isBackground) {
            handleDeselectAll(false);
        }
    }, true);

    toolbar.addEventListener("click", (event) => {
        if (!isToolbarInteractiveTarget(event.target)) handleDeselectAll(true);
    });

    cardsContainer.addEventListener("wheel", (event) => {
        if (event.deltaY === 0) return;

        let insideVerticalScrollable = false;
        let elem = event.target;
        while (elem && elem !== cardsContainer) {
            if (elem.scrollHeight > elem.clientHeight) {
                const style = window.getComputedStyle(elem);
                if (style.overflowY === "auto" || style.overflowY === "scroll") {
                    const atTop = elem.scrollTop === 0;
                    const atBottom = Math.abs(elem.scrollHeight - elem.scrollTop - elem.clientHeight) < 1;
                    if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) {
                        insideVerticalScrollable = true;
                        break;
                    }
                }
            }
            elem = elem.parentNode;
        }

        if (insideVerticalScrollable) return;

        event.preventDefault();
        const cardEl = cardsContainer.querySelector(".clab-card:not(.clab-add-card-inline)");
        const panelWidth = parseInt(getComputedStyle(panelContainer).getPropertyValue("--clab-card-width"), 10) || 320;
        const cardWidth = cardEl ? cardEl.offsetWidth : panelWidth;
        const scrollDistance = cardWidth + 20;
        cardsContainer.scrollBy({ left: Math.sign(event.deltaY) * scrollDistance, behavior: "smooth" });
    }, { passive: false });

    setupPanelDrag(panelContainer);
    setupCardWidthControl(panelContainer);
    setupMediaErrorHandler();
}
