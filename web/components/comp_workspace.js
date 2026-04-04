/**
 * Workspace bar (Excel-like tabs).
 */
import {
    state,
    appState,
    syncStateToActiveWorkspace,
    applyWorkspaceToState,
    createEmptyWorkspace,
    normalizeWorkspace,
    createWorkspaceFromCurrent,
    saveAndRender,
    makeId,
    deepClone,
} from "./ui_state.js";

function getWorkspaceLabel(index) {
    return `工作区 ${index + 1}`;
}

function getActiveWorkspaceName() {
    const workspace = (state.workspaces || []).find((item) => item.id === state.activeWorkspaceId);
    return workspace?.name || "工作区";
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



let workspaceMenuEl = null;

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
