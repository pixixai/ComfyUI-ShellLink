/**
 * Workspace bar (Excel-like tabs).
 */
import {
    state,
    appState,
    syncStateToActiveWorkspace,
    applyWorkspaceToState,
    applyChannelToState,
    createEmptyWorkspace,
    createEmptyChannel,
    normalizeWorkspace,
    normalizeChannel,
    saveAndRender,
    makeId,
    deepClone,
} from "./ui_state.js";

function getWorkspaceLabel(index) {
    return `工作区 ${index + 1}`;
}

function getChannelLabel(index) {
    return `通道 ${index + 1}`;
}

export function renderChannelBar(container) {
    if (!container) return;

    const channels = state.channels || [];
    const activeChannelId = state.activeChannelId;
    const selectedIds = appState.selectedChannelIds || [];

    const tabsHtml = channels.map((channel, index) => {
        const isActive = channel.id === activeChannelId;
        const isSelected = selectedIds.includes(channel.id);
        const classes = ["clab-workspace-tab", "clab-channel-tab"];
        if (isActive) classes.push("active");
        if (isSelected) classes.push("selected");

        const label = channel.name || getChannelLabel(index);
        return `
            <button class="${classes.join(" ")}" data-channel-id="${channel.id}" title="${label}" style="height:22px; min-height:22px; padding:0 8px;">
                <span class="clab-workspace-tab-name">${label}</span>
            </button>
        `;
    }).join("");

    container.innerHTML = `
        ${tabsHtml}
        <button class="clab-workspace-tab clab-channel-tab clab-workspace-add" id="clab-channel-add" title="新建通道" style="height:22px; min-height:22px; padding:0 8px;">+</button>
    `;
}

export function renderWorkspaceBar(container) {
    if (!container) return;

    const workspaces = state.workspaces || [];
    const activeWorkspaceId = state.activeWorkspaceId;
    const selectedIds = appState.selectedWorkspaceIds || [];

    // --- Optimization: Stable DOM for double-click reliability ---
    const existingTabs = Array.from(container.querySelectorAll(".clab-workspace-tab[data-workspace-id]"));
    if (existingTabs.length === workspaces.length) {
        let isStructureSame = true;
        for (let i = 0; i < workspaces.length; i++) {
            if (existingTabs[i].dataset.workspaceId !== workspaces[i].id) {
                isStructureSame = false;
                break;
            }
        }

        if (isStructureSame) {
            workspaces.forEach((ws, i) => {
                const tabEl = existingTabs[i];
                const isActive = ws.id === activeWorkspaceId;
                const isSelected = selectedIds.includes(ws.id);

                tabEl.classList.toggle("active", isActive);
                tabEl.classList.toggle("selected", isSelected);

                const nameSpan = tabEl.querySelector(".clab-workspace-tab-name");
                if (nameSpan && nameSpan.contentEditable !== "true") {
                    const label = ws.name || getWorkspaceLabel(i);
                    if (nameSpan.textContent !== label) nameSpan.textContent = label;
                    tabEl.title = label;
                }
            });
            return;
        }
    }
    // -----------------------------------------------------------

    const tabsHtml = workspaces.map((workspace, index) => {
        const isActive = workspace.id === activeWorkspaceId;
        const isSelected = selectedIds.includes(workspace.id);
        const classes = ["clab-workspace-tab"];
        if (isActive) classes.push("active");
        if (isSelected) classes.push("selected");

        const label = workspace.name || getWorkspaceLabel(index);
        return `
            <button class="${classes.join(" ")}" data-workspace-id="${workspace.id}" title="${label}" draggable="true">
                <span class="clab-workspace-tab-name">${label}</span>
            </button>
        `;
    }).join("");

    container.innerHTML = `
        ${tabsHtml}
        <button class="clab-workspace-tab clab-workspace-add" id="clab-workspace-add" title="新建工作区">+</button>
    `;
}

function switchWorkspace(workspaceId, isMultiSelect = false) {
    if (!isMultiSelect) {
        appState.selectedWorkspaceIds = [workspaceId];
    }
    appState.lastClickedWorkspaceId = workspaceId;

    const current = syncStateToActiveWorkspace();
    const target = (state.workspaces || []).find((workspace) => workspace.id === workspaceId);
    if (!target || target === current) {
        saveAndRender(); // Re-render to show selection
        return;
    }

    applyWorkspaceToState(target);
    saveAndRender();
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
        channel.name = index === 0 ? name : `${name} (${index})`;
    });

    saveAndRender();
}

function addWorkspace(insertAfterId = null) {
    syncStateToActiveWorkspace();
    const workspace = createEmptyWorkspace(getWorkspaceLabel((state.workspaces || []).length));

    if (insertAfterId) {
        const index = state.workspaces.findIndex(w => w.id === insertAfterId);
        if (index !== -1) {
            state.workspaces.splice(index + 1, 0, workspace);
        } else {
            state.workspaces.push(workspace);
        }
    } else {
        state.workspaces = [...(state.workspaces || []), workspace];
    }

    state.activeWorkspaceId = workspace.id;
    appState.selectedWorkspaceIds = [workspace.id];
    appState.lastClickedWorkspaceId = workspace.id;

    applyWorkspaceToState(workspace);
    saveAndRender();
}

function duplicateSelectedWorkspaces() {
    syncStateToActiveWorkspace();
    const targetIds = (appState.selectedWorkspaceIds || []).length > 0
        ? appState.selectedWorkspaceIds
        : [state.activeWorkspaceId];

    // Sort selected indices to maintain relative order
    const sortedTargets = targetIds
        .map(id => state.workspaces.find(w => w.id === id))
        .filter(Boolean)
        .sort((a, b) => state.workspaces.indexOf(a) - state.workspaces.indexOf(b));

    // Iterate backwards to not mess up indices during splice
    sortedTargets.reverse();

    let lastCreatedId = null;
    for (const ws of sortedTargets) {
        const index = state.workspaces.indexOf(ws);
        const dup = normalizeWorkspace(deepClone(ws));
        dup.id = makeId("workspace");
        dup.name = `${ws.name || getWorkspaceLabel(index)} 副本`;

        state.workspaces.splice(index + 1, 0, dup);
        lastCreatedId = dup.id;
    }

    if (lastCreatedId) {
        state.activeWorkspaceId = lastCreatedId;
        appState.selectedWorkspaceIds = [lastCreatedId];
        appState.lastClickedWorkspaceId = lastCreatedId;
        applyWorkspaceToState(state.workspaces.find(w => w.id === lastCreatedId));
    }
    saveAndRender();
}

function deleteSelectedWorkspaces() {
    if (!state.workspaces || state.workspaces.length <= 1) return;

    const targetIds = (appState.selectedWorkspaceIds || []).length > 0
        ? appState.selectedWorkspaceIds
        : [state.activeWorkspaceId];

    if (targetIds.length >= state.workspaces.length) {
        alert("无法删除所有工作区，至少需要保留一个。");
        return;
    }

    if (targetIds.length > 1 && !confirm(`确认删除选中的 ${targetIds.length} 个工作区吗？`)) {
        return;
    }

    const activeIndex = state.workspaces.findIndex(w => w.id === state.activeWorkspaceId);
    let nextWorkspaces = state.workspaces.filter(w => !targetIds.includes(w.id));

    let newActiveId = state.activeWorkspaceId;
    if (targetIds.includes(state.activeWorkspaceId)) {
        // Find nearest workspace
        newActiveId = nextWorkspaces[Math.min(activeIndex, nextWorkspaces.length - 1)].id;
    }

    state.workspaces = nextWorkspaces;
    state.activeWorkspaceId = newActiveId;
    appState.selectedWorkspaceIds = [newActiveId];
    appState.lastClickedWorkspaceId = newActiveId;

    applyWorkspaceToState(state.workspaces.find(w => w.id === newActiveId));
    saveAndRender();
}

function bulkRenameWorkspaces() {
    const targetIds = (appState.selectedWorkspaceIds || []).length > 0
        ? appState.selectedWorkspaceIds
        : [state.activeWorkspaceId];

    if (targetIds.length === 0) return;

    if (targetIds.length === 1) {
        // Fallback to inline rename for single item if possible
        const tab = document.querySelector(`.clab-workspace-tab[data-workspace-id="${targetIds[0]}"]`);
        if (tab) startInlineRename(tab, targetIds[0]);
        return;
    }

    const baseName = prompt(`批量重命名 ${targetIds.length} 个工作区，请输入新的基础名称:`, "工作区");
    if (baseName === null) return;
    const name = baseName.trim() || "工作区";

    // Sort to rename in tab order
    const sortedTargets = targetIds
        .map(id => state.workspaces.find(w => w.id === id))
        .filter(Boolean)
        .sort((a, b) => state.workspaces.indexOf(a) - state.workspaces.indexOf(b));

    sortedTargets.forEach((ws, i) => {
        ws.name = i === 0 ? name : `${name} (${i})`;
    });

    saveAndRender();
}

function startInlineRename(tabEl, workspaceId) {
    const workspace = (state.workspaces || []).find((item) => item.id === workspaceId);
    if (!workspace) return;

    const nameSpan = tabEl.querySelector(".clab-workspace-tab-name");
    if (!nameSpan) return;

    // Selection might be cleared by switchWorkspace if double click timing is tight
    appState.selectedWorkspaceIds = [workspaceId];
    appState.lastClickedWorkspaceId = workspaceId;
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
        if (nextName && nextName !== workspace.name) {
            workspace.name = nextName;
            saveAndRender();
        } else {
            nameSpan.textContent = workspace.name || getWorkspaceLabel(state.workspaces.indexOf(workspace));
        }
    };

    nameSpan.onkeydown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            finishEdit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            nameSpan.textContent = workspace.name || getWorkspaceLabel(state.workspaces.indexOf(workspace));
            finishEdit();
        }
    };

    nameSpan.onblur = () => {
        finishEdit();
    };
}

function startInlineRenameChannel(tabEl, channelId) {
    const channel = (state.channels || []).find((item) => item.id === channelId);
    if (!channel) return;

    const nameSpan = tabEl.querySelector(".clab-workspace-tab-name");
    if (!nameSpan) return;

    appState.selectedChannelIds = [channelId];
    appState.lastClickedChannelId = channelId;
    saveAndRender();

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
        nameSpan.blur();
        const nextName = nameSpan.textContent.trim().replace(/[\r\n]+/g, "");
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
            nameSpan.textContent = channel.name || getChannelLabel((state.channels || []).indexOf(channel));
            finishEdit();
        }
    };

    nameSpan.onblur = () => {
        finishEdit();
    };
}



let workspaceMenuEl = null;
let channelMenuEl = null;

export function attachWorkspaceEvents(container) {
    if (!container || container.dataset.clabWorkspaceBound === "1") return;
    container.dataset.clabWorkspaceBound = "1";

    if (!workspaceMenuEl) {
        workspaceMenuEl = document.createElement("div");
        workspaceMenuEl.className = "clab-context-menu";
        document.body.appendChild(workspaceMenuEl);

        const closeMenu = (e) => {
            if (workspaceMenuEl.style.display === "block" && !workspaceMenuEl.contains(e.target)) {
                workspaceMenuEl.style.display = "none";
            }
        };
        window.addEventListener("mousedown", closeMenu, true);
        window.addEventListener("contextmenu", (e) => {
            if (workspaceMenuEl.style.display === "block" && !workspaceMenuEl.contains(e.target)) {
                workspaceMenuEl.style.display = "none";
            }
        }, true);
    }

    container.addEventListener("contextmenu", (event) => {
        const tab = event.target.closest(".clab-workspace-tab[data-workspace-id]");
        if (!tab) return;
        event.preventDefault();
        event.stopPropagation();

        const wsId = tab.dataset.workspaceId;
        // If right-clicked on an unselected tab, select it alone
        if (!appState.selectedWorkspaceIds.includes(wsId)) {
            switchWorkspace(wsId);
        }

        workspaceMenuEl.innerHTML = `
            <div class="clab-context-menu-title">工作区</div>
            <div class="clab-context-menu-item" id="clab-ctx-ws-add">新建工作区</div>
            <div class="clab-context-menu-item" id="clab-ctx-ws-duplicate">复制</div>
            <div class="clab-context-menu-item" id="clab-ctx-ws-rename">重命名</div>
            <div class="clab-context-menu-divider"></div>
            <div class="clab-context-menu-item clab-danger" id="clab-ctx-ws-delete">删除</div>
        `;

        workspaceMenuEl.style.display = "block";
        let left = event.clientX;
        let top = event.clientY;
        const rect = workspaceMenuEl.getBoundingClientRect();
        if (left + rect.width > window.innerWidth) left -= rect.width;
        if (top + rect.height > window.innerHeight) top -= rect.height;
        workspaceMenuEl.style.left = `${left}px`;
        workspaceMenuEl.style.top = `${top}px`;

        workspaceMenuEl.querySelector("#clab-ctx-ws-add").onclick = () => { workspaceMenuEl.style.display = "none"; addWorkspace(wsId); };
        workspaceMenuEl.querySelector("#clab-ctx-ws-duplicate").onclick = () => { workspaceMenuEl.style.display = "none"; duplicateSelectedWorkspaces(); };
        workspaceMenuEl.querySelector("#clab-ctx-ws-rename").onclick = () => { workspaceMenuEl.style.display = "none"; bulkRenameWorkspaces(); };
        workspaceMenuEl.querySelector("#clab-ctx-ws-delete").onclick = () => { workspaceMenuEl.style.display = "none"; deleteSelectedWorkspaces(); };
    });

    container.addEventListener("click", (event) => {
        const tab = event.target.closest(".clab-workspace-tab[data-workspace-id]");
        if (tab) {
            const wsId = tab.dataset.workspaceId;
            if (event.shiftKey && appState.lastClickedWorkspaceId) {
                // Range select
                const startIndex = state.workspaces.findIndex(w => w.id === appState.lastClickedWorkspaceId);
                const endIndex = state.workspaces.findIndex(w => w.id === wsId);
                if (startIndex !== -1 && endIndex !== -1) {
                    const sorted = [startIndex, endIndex].sort((a, b) => a - b);
                    const newRange = state.workspaces.slice(sorted[0], sorted[1] + 1).map(w => w.id);
                    // Additive selection per user request
                    const existing = appState.selectedWorkspaceIds || [];
                    appState.selectedWorkspaceIds = [...new Set([...existing, ...newRange])];
                    appState.lastClickedWorkspaceId = wsId; // Update anchor for next shift-click
                    saveAndRender();
                }
            } else if (event.ctrlKey || event.metaKey) {
                // Toggle select
                appState.selectedWorkspaceIds = appState.selectedWorkspaceIds || [];
                if (appState.selectedWorkspaceIds.includes(wsId)) {
                    appState.selectedWorkspaceIds = appState.selectedWorkspaceIds.filter(id => id !== wsId);
                } else {
                    appState.selectedWorkspaceIds.push(wsId);
                }
                appState.lastClickedWorkspaceId = wsId;
                saveAndRender();
            } else {
                // Normal click
                switchWorkspace(wsId);
            }
            return;
        }

        if (event.target.closest("#clab-workspace-add")) {
            addWorkspace();
            return;
        }
    });

    container.addEventListener("dragstart", (e) => {
        const tab = e.target.closest(".clab-workspace-tab[data-workspace-id]");
        if (!tab) return;

        const wsId = tab.dataset.workspaceId;
        const isSelected = (appState.selectedWorkspaceIds || []).includes(wsId);
        const sourceIds = isSelected ? [...appState.selectedWorkspaceIds] : [wsId];

        appState.dragState = { type: 'workspaceTab', sourceIds };

        // Highlight all tabs being dragged
        sourceIds.forEach(id => {
            const el = container.querySelector(`.clab-workspace-tab[data-workspace-id="${id}"]`);
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
        if (!appState.dragState || appState.dragState.type !== 'workspaceTab') return;
        e.preventDefault();
        const tab = e.target.closest(".clab-workspace-tab[data-workspace-id]");
        if (!tab) return;

        const targetId = tab.dataset.workspaceId;
        const sourceIds = appState.dragState.sourceIds || [];
        if (sourceIds.includes(targetId)) return;

        container.querySelectorAll(".clab-drag-over-tab-left, .clab-drag-over-tab-right").forEach(el => {
            el.classList.remove("clab-drag-over-tab-left", "clab-drag-over-tab-right");
        });

        const rect = tab.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
            tab.classList.add("clab-drag-over-tab-left");
        } else {
            tab.classList.add("clab-drag-over-tab-right");
        }
    });

    container.addEventListener("dragleave", (e) => {
        const tab = e.target.closest(".clab-workspace-tab[data-workspace-id]");
        if (tab) {
            tab.classList.remove("clab-drag-over-tab-left", "clab-drag-over-tab-right");
        }
    });

    container.addEventListener("drop", (e) => {
        if (!appState.dragState || appState.dragState.type !== 'workspaceTab') return;
        e.preventDefault();

        const tab = e.target.closest(".clab-workspace-tab[data-workspace-id]");
        if (!tab) return;

        tab.classList.remove("clab-drag-over-tab-left", "clab-drag-over-tab-right");
        const targetId = tab.dataset.workspaceId;
        const sourceIds = appState.dragState.sourceIds || [];
        if (sourceIds.includes(targetId)) return;

        // 1. Identify source tabs and their original order
        const sourceTabs = sourceIds
            .map(id => state.workspaces.find(w => w.id === id))
            .filter(Boolean)
            .sort((a, b) => state.workspaces.indexOf(a) - state.workspaces.indexOf(b));

        if (sourceTabs.length === 0) return;

        // 2. Remove all source tabs from state
        state.workspaces = state.workspaces.filter(w => !sourceIds.includes(w.id));

        // 3. Find the new index of the target tab in the shrunken list
        const targetIndex = state.workspaces.findIndex(w => w.id === targetId);
        if (targetIndex === -1) {
            // Target was somehow lost (unlikely), just append
            state.workspaces.push(...sourceTabs);
        } else {
            const rect = tab.getBoundingClientRect();
            const insertAtLeft = e.clientX < rect.left + rect.width / 2;
            const insertIndex = insertAtLeft ? targetIndex : targetIndex + 1;

            // 4. Splice the block of tabs back in
            state.workspaces.splice(insertIndex, 0, ...sourceTabs);
        }

        saveAndRender();
    });

    container.addEventListener("dblclick", (event) => {
        const tab = event.target.closest(".clab-workspace-tab[data-workspace-id]");
        if (!tab) return;
        startInlineRename(tab, tab.dataset.workspaceId);
    });

    container.addEventListener("wheel", (event) => {
        if (event.deltaY !== 0) {
            container.scrollLeft += event.deltaY * 0.6;
            event.preventDefault();
        }
    });
}

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

        channelMenuEl.innerHTML = `
            <div class="clab-context-menu-title">通道</div>
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
            if (event.ctrlKey || event.metaKey) {
                appState.selectedChannelIds = appState.selectedChannelIds || [];
                if (appState.selectedChannelIds.includes(channelId)) {
                    appState.selectedChannelIds = appState.selectedChannelIds.filter((id) => id !== channelId);
                } else {
                    appState.selectedChannelIds.push(channelId);
                }
                appState.lastClickedChannelId = channelId;
                saveAndRender();
            } else {
                switchChannel(channelId);
            }
            return;
        }

        if (event.target.closest("#clab-channel-add")) {
            addChannel();
        }
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
