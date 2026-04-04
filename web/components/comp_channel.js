/**
 * Channel bar component.
 */
import {
    state,
    appState,
    syncStateToActiveWorkspace,
    applyChannelToState,
    createEmptyChannel,
    normalizeChannel,
    saveAndRender,
    makeId,
    deepClone,
} from "./ui_state.js";

function getChannelLabel(index) {
    return `通道 ${index + 1}`;
}

export function renderChannelBar(container) {
    if (!container) return;

    const channels = state.channels || [];
    const activeChannelId = state.activeChannelId;
    const selectedIds = appState.selectedChannelIds || [];

    // --- Optimization: Stable DOM for double-click reliability ---
    const existingTabs = Array.from(container.querySelectorAll(".clab-channel-tab[data-channel-id]"));
    if (existingTabs.length === channels.length) {
        let isStructureSame = true;
        for (let i = 0; i < channels.length; i++) {
            if (existingTabs[i].dataset.channelId !== channels[i].id) {
                isStructureSame = false;
                break;
            }
        }

        if (isStructureSame) {
            channels.forEach((channel, i) => {
                const tabEl = existingTabs[i];
                const isActive = channel.id === activeChannelId;
                const isSelected = selectedIds.includes(channel.id);

                tabEl.classList.toggle("active", isActive);
                tabEl.classList.toggle("selected", isSelected);

                const nameSpan = tabEl.querySelector(".clab-workspace-tab-name");
                if (nameSpan && nameSpan.contentEditable !== "true") {
                    const label = channel.name || getChannelLabel(i);
                    if (nameSpan.textContent !== label) nameSpan.textContent = label;
                }
            });
            return;
        }
    }
    // -----------------------------------------------------------

    const tabsHtml = channels.map((channel, index) => {
        const isActive = channel.id === activeChannelId;
        const isSelected = selectedIds.includes(channel.id);
        const classes = ["clab-workspace-tab", "clab-channel-tab"];
        if (isActive) classes.push("active");
        if (isSelected) classes.push("selected");

        const label = channel.name || getChannelLabel(index);
        return `
            <button class="${classes.join(" ")}" data-channel-id="${channel.id}" title="${label}" draggable="true">
                <span class="clab-workspace-tab-name">${label}</span>
            </button>
        `;
    }).join("");

    container.innerHTML = `
        ${tabsHtml}
        <button class="clab-workspace-tab clab-channel-tab clab-workspace-add" id="clab-channel-add" title="新建通道">+</button>
    `;
}

function switchChannel(channelId) {
    appState.selectedChannelIds = [channelId];
    appState.lastClickedChannelId = channelId;

    const workspace = syncStateToActiveWorkspace();
    if (!workspace) return;

    const target = (workspace.channels || []).find((channel) => channel.id === channelId);
    if (!target) {
        saveAndRender();
        return;
    }

    applyChannelToState(channelId);
    saveAndRender();
}

function addChannel(insertAfterId = null) {
    const workspace = syncStateToActiveWorkspace();
    if (!workspace) return;

    const channel = createEmptyChannel(getChannelLabel((workspace.channels || []).length));
    const channels = Array.isArray(workspace.channels) ? workspace.channels : [];

    if (insertAfterId) {
        const index = channels.findIndex((item) => item.id === insertAfterId);
        if (index !== -1) {
            channels.splice(index + 1, 0, channel);
        } else {
            channels.push(channel);
        }
    } else {
        channels.push(channel);
    }

    workspace.channels = channels;
    workspace.activeChannelId = channel.id;
    state.channels = channels;
    state.activeChannelId = channel.id;

    appState.selectedChannelIds = [channel.id];
    appState.lastClickedChannelId = channel.id;

    applyChannelToState(channel.id);
    saveAndRender();
}

function duplicateSelectedChannels() {
    const workspace = syncStateToActiveWorkspace();
    if (!workspace) return;

    const targetIds = (appState.selectedChannelIds || []).length > 0
        ? appState.selectedChannelIds
        : [state.activeChannelId];
    const channels = Array.isArray(workspace.channels) ? workspace.channels : [];

    const sortedTargets = targetIds
        .map((id) => channels.find((channel) => channel.id === id))
        .filter(Boolean)
        .sort((a, b) => channels.indexOf(a) - channels.indexOf(b))
        .reverse();

    let lastCreatedId = null;
    sortedTargets.forEach((channel) => {
        const index = channels.indexOf(channel);
        const duplicate = normalizeChannel(deepClone(channel));
        duplicate.id = makeId("channel");
        duplicate.name = `${channel.name || getChannelLabel(index)} 副本`;
        channels.splice(index + 1, 0, duplicate);
        lastCreatedId = duplicate.id;
    });

    if (lastCreatedId) {
        workspace.channels = channels;
        workspace.activeChannelId = lastCreatedId;
        state.channels = channels;
        state.activeChannelId = lastCreatedId;
        appState.selectedChannelIds = [lastCreatedId];
        appState.lastClickedChannelId = lastCreatedId;
        applyChannelToState(lastCreatedId);
    }

    saveAndRender();
}

function deleteSelectedChannels() {
    const workspace = syncStateToActiveWorkspace();
    if (!workspace) return;

    const channels = Array.isArray(workspace.channels) ? workspace.channels : [];
    if (channels.length <= 1) return;

    const targetIds = (appState.selectedChannelIds || []).length > 0
        ? appState.selectedChannelIds
        : [state.activeChannelId];

    if (targetIds.length >= channels.length) {
        alert("无法删除所有通道，至少需要保留一个。");
        return;
    }

    if (targetIds.length > 1 && !confirm(`确认删除选中的 ${targetIds.length} 个通道吗？`)) {
        return;
    }

    const activeIndex = channels.findIndex((channel) => channel.id === state.activeChannelId);
    const nextChannels = channels.filter((channel) => !targetIds.includes(channel.id));

    let nextActiveId = state.activeChannelId;
    if (targetIds.includes(state.activeChannelId)) {
        nextActiveId = nextChannels[Math.min(activeIndex, nextChannels.length - 1)].id;
    }

    workspace.channels = nextChannels;
    workspace.activeChannelId = nextActiveId;
    state.channels = nextChannels;
    state.activeChannelId = nextActiveId;
    appState.selectedChannelIds = [nextActiveId];
    appState.lastClickedChannelId = nextActiveId;

    applyChannelToState(nextActiveId);
    saveAndRender();
}

function bulkRenameChannels() {
    const targetIds = (appState.selectedChannelIds || []).length > 0
        ? appState.selectedChannelIds
        : [state.activeChannelId];

    if (targetIds.length === 0) return;

    if (targetIds.length === 1) {
        const tab = document.querySelector(`.clab-channel-tab[data-channel-id="${targetIds[0]}"]`);
        if (tab) startInlineRenameChannel(tab, targetIds[0]);
        return;
    }

    const baseName = prompt(`批量重命名 ${targetIds.length} 个通道，请输入新的基础名称:`, "通道");
    if (baseName === null) return;
    const name = baseName.trim() || "通道";

    const channels = state.channels || [];
    const sortedTargets = targetIds
        .map((id) => channels.find((channel) => channel.id === id))
        .filter(Boolean)
        .sort((a, b) => channels.indexOf(a) - channels.indexOf(b));

    sortedTargets.forEach((channel, index) => {
        // Windows style renaming: first is name, then name (1), name (2)...
        channel.name = index === 0 ? name : `${name} (${index})`;
    });

    saveAndRender();
}

function startInlineRenameChannel(tabEl, channelId) {
    const getTargetChannel = () => (state.channels || []).find((item) => item.id === channelId);
    let channel = getTargetChannel();
    if (!channel) return;

    const nameSpan = tabEl.querySelector(".clab-workspace-tab-name");
    if (!nameSpan) return;

    appState.selectedChannelIds = [channelId];
    appState.lastClickedChannelId = channelId;
    saveAndRender();

    const originalDraggable = tabEl.getAttribute("draggable");
    tabEl.setAttribute("draggable", "false");

    nameSpan.contentEditable = "true";
    nameSpan.focus();

    const range = document.createRange();
    range.selectNodeContents(nameSpan);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finishEdit = () => {
        if (nameSpan.contentEditable !== "true") return;
        nameSpan.contentEditable = "false";
        tabEl.setAttribute("draggable", originalDraggable);
        nameSpan.blur();
        const nextName = nameSpan.textContent.trim().replace(/[\r\n]+/g, "");

        channel = getTargetChannel();
        if (!channel) return;

        if (nextName && nextName !== channel.name) {
            channel.name = nextName;
            saveAndRender();
        } else {
            nameSpan.textContent = channel.name || getChannelLabel((state.channels || []).indexOf(channel));
        }
    };

    nameSpan.onkeydown = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finishEdit();
        } else if (event.key === "Escape") {
            event.preventDefault();
            channel = getTargetChannel();
            nameSpan.textContent = channel ? (channel.name || getChannelLabel((state.channels || []).indexOf(channel))) : "";
            finishEdit();
        }
    };

    nameSpan.onblur = () => {
        finishEdit();
    };
}

let channelMenuEl = null;

export function attachChannelEvents(container) {
    if (!container || container.dataset.clabChannelBound === "1") return;
    container.dataset.clabChannelBound = "1";

    if (!channelMenuEl) {
        channelMenuEl = document.createElement("div");
        channelMenuEl.className = "clab-context-menu";
        document.body.appendChild(channelMenuEl);

        const closeMenu = (event) => {
            if (channelMenuEl.style.display === "block" && !channelMenuEl.contains(event.target)) {
                channelMenuEl.style.display = "none";
            }
        };
        window.addEventListener("mousedown", closeMenu, true);
        window.addEventListener("contextmenu", closeMenu, true);
    }

    container.addEventListener("contextmenu", (event) => {
        const tab = event.target.closest(".clab-channel-tab[data-channel-id]");
        if (!tab) return;
        event.preventDefault();
        event.stopPropagation();

        const channelId = tab.dataset.channelId;
        if (!channelId) return;

        if (!(appState.selectedChannelIds || []).includes(channelId)) {
            switchChannel(channelId);
        }

        const count = (appState.selectedChannelIds || []).length;
        const countText = count > 1 ? ` (${count})` : "";

        channelMenuEl.innerHTML = `
            <div class="clab-context-menu-title">通道${countText}</div>
            <div class="clab-context-menu-item" id="clab-ctx-channel-add">新建通道</div>
            <div class="clab-context-menu-item" id="clab-ctx-channel-duplicate">复制</div>
            <div class="clab-context-menu-item" id="clab-ctx-channel-rename">重命名</div>
            <div class="clab-context-menu-divider"></div>
            <div class="clab-context-menu-item clab-danger" id="clab-ctx-channel-delete">删除</div>
        `;

        channelMenuEl.style.display = "block";
        let left = event.clientX;
        let top = event.clientY;
        const rect = channelMenuEl.getBoundingClientRect();
        if (left + rect.width > window.innerWidth) left -= rect.width;
        if (top + rect.height > window.innerHeight) top -= rect.height;
        channelMenuEl.style.left = `${left}px`;
        channelMenuEl.style.top = `${top}px`;

        channelMenuEl.querySelector("#clab-ctx-channel-add").onclick = () => { channelMenuEl.style.display = "none"; addChannel(channelId); };
        channelMenuEl.querySelector("#clab-ctx-channel-duplicate").onclick = () => { channelMenuEl.style.display = "none"; duplicateSelectedChannels(); };
        channelMenuEl.querySelector("#clab-ctx-channel-rename").onclick = () => { channelMenuEl.style.display = "none"; bulkRenameChannels(); };
        channelMenuEl.querySelector("#clab-ctx-channel-delete").onclick = () => { channelMenuEl.style.display = "none"; deleteSelectedChannels(); };
    });

    container.addEventListener("click", (event) => {
        const tab = event.target.closest(".clab-channel-tab[data-channel-id]");
        if (tab) {
            const channelId = tab.dataset.channelId;
            const channels = state.channels || [];

            if (event.shiftKey && appState.lastClickedChannelId) {
                // Range selection
                const startIndex = channels.findIndex(c => c.id === appState.lastClickedChannelId);
                const endIndex = channels.findIndex(c => c.id === channelId);
                if (startIndex !== -1 && endIndex !== -1) {
                    const sorted = [startIndex, endIndex].sort((a, b) => a - b);
                    const newRange = channels.slice(sorted[0], sorted[1] + 1).map(c => c.id);
                    const existing = appState.selectedChannelIds || [];
                    appState.selectedChannelIds = [...new Set([...existing, ...newRange])];
                    appState.lastClickedChannelId = channelId;
                    saveAndRender();
                }
            } else if (event.ctrlKey || event.metaKey) {
                // Multi selection toggle
                appState.selectedChannelIds = appState.selectedChannelIds || [];
                if (appState.selectedChannelIds.includes(channelId)) {
                    appState.selectedChannelIds = appState.selectedChannelIds.filter((id) => id !== channelId);
                } else {
                    appState.selectedChannelIds.push(channelId);
                }
                appState.lastClickedChannelId = channelId;
                saveAndRender();
            } else {
                // Normal Switch
                switchChannel(channelId);
            }
            return;
        }

        if (event.target.closest("#clab-channel-add")) {
            addChannel();
        }
    });

    // --- Drag and Drop logic ---
    container.addEventListener("dragstart", (e) => {
        const tab = e.target.closest(".clab-channel-tab[data-channel-id]");
        if (!tab) return;

        const channelId = tab.dataset.channelId;
        const isSelected = (appState.selectedChannelIds || []).includes(channelId);
        const sourceIds = isSelected ? [...appState.selectedChannelIds] : [channelId];

        appState.dragState = { type: 'channelTab', sourceIds };
        
        // Ensure move effect
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', channelId); // Required for some browsers
        }

        // Highlight dragging tabs
        sourceIds.forEach(id => {
            const el = container.querySelector(`.clab-channel-tab[data-channel-id="${id}"]`);
            if (el) el.classList.add("clab-dragging");
        });
    });

    container.addEventListener("dragend", (e) => {
        container.querySelectorAll(".clab-dragging").forEach(el => {
            el.classList.remove("clab-dragging");
        });
        container.querySelectorAll(".clab-drag-over-tab-left, .clab-drag-over-tab-right").forEach(el => {
            el.classList.remove("clab-drag-over-tab-left", "clab-drag-over-tab-right");
        });
        appState.dragState = null;
    });

    container.addEventListener("dragover", (e) => {
        if (!appState.dragState || appState.dragState.type !== 'channelTab') return;
        e.preventDefault(); // Required to allow drop
        
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }

        const tab = e.target.closest(".clab-channel-tab[data-channel-id]");
        if (!tab) return;

        const targetId = tab.dataset.channelId;
        const sourceIds = appState.dragState.sourceIds || [];
        if (sourceIds.includes(targetId)) return;

        // Visual feedback
        const rect = tab.getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;

        if (isLeft) {
            if (!tab.classList.contains("clab-drag-over-tab-left")) {
                container.querySelectorAll(".clab-drag-over-tab-left, .clab-drag-over-tab-right").forEach(el => {
                    el.classList.remove("clab-drag-over-tab-left", "clab-drag-over-tab-right");
                });
                tab.classList.add("clab-drag-over-tab-left");
            }
        } else {
            if (!tab.classList.contains("clab-drag-over-tab-right")) {
                container.querySelectorAll(".clab-drag-over-tab-left, .clab-drag-over-tab-right").forEach(el => {
                    el.classList.remove("clab-drag-over-tab-left", "clab-drag-over-tab-right");
                });
                tab.classList.add("clab-drag-over-tab-right");
            }
        }
    });

    container.addEventListener("dragleave", (e) => {
        const tab = e.target.closest(".clab-channel-tab[data-channel-id]");
        if (tab) {
            // Only remove if we're actually leaving the tab's bounds
            const rect = tab.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                tab.classList.remove("clab-drag-over-tab-left", "clab-drag-over-tab-right");
            }
        }
    });

    container.addEventListener("drop", (e) => {
        if (!appState.dragState || appState.dragState.type !== 'channelTab') return;
        e.preventDefault();

        const tab = e.target.closest(".clab-channel-tab[data-channel-id]");
        if (!tab) return;

        const targetId = tab.dataset.channelId;
        const sourceIds = appState.dragState.sourceIds || [];
        if (sourceIds.includes(targetId)) return;

        const channels = state.channels || [];
        const sourceTabs = sourceIds
            .map(id => channels.find(c => c.id === id))
            .filter(Boolean)
            .sort((a, b) => channels.indexOf(a) - channels.indexOf(b));

        if (sourceTabs.length === 0) return;

        // Clear visual state
        container.querySelectorAll(".clab-drag-over-tab-left, .clab-drag-over-tab-right").forEach(el => {
            el.classList.remove("clab-drag-over-tab-left", "clab-drag-over-tab-right");
        });

        // Remove source nodes from current list
        state.channels = channels.filter(c => !sourceIds.includes(c.id));

        // Find new insertion point
        const targetIndex = state.channels.findIndex(c => c.id === targetId);
        if (targetIndex === -1) {
            state.channels.push(...sourceTabs);
        } else {
            const rect = tab.getBoundingClientRect();
            const insertAtLeft = e.clientX < rect.left + rect.width / 2;
            const insertIndex = insertAtLeft ? targetIndex : targetIndex + 1;
            state.channels.splice(insertIndex, 0, ...sourceTabs);
        }

        saveAndRender();
    });

    container.addEventListener("dblclick", (event) => {
        const tab = event.target.closest(".clab-channel-tab[data-channel-id]");
        if (!tab) return;
        startInlineRenameChannel(tab, tab.dataset.channelId);
    });

    container.addEventListener("wheel", (event) => {
        if (event.deltaY !== 0) {
            container.scrollLeft += event.deltaY * 0.6;
            event.preventDefault();
        }
    });
}
