/**
 * Workspace bar (Excel-like tabs).
 */
import {
    state,
    syncStateToActiveWorkspace,
    applyWorkspaceToState,
    createEmptyWorkspace,
    createWorkspaceFromCurrent,
    saveAndRender,
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

    const activeWorkspaceId = state.activeWorkspaceId;
    const tabsHtml = (state.workspaces || []).map((workspace, index) => {
        const isActive = workspace.id === activeWorkspaceId;
        const label = workspace.name || getWorkspaceLabel(index);
        return `
            <button class="clab-workspace-tab ${isActive ? "active" : ""}" data-workspace-id="${workspace.id}" title="${label}">
                <span class="clab-workspace-tab-name">${label}</span>
            </button>
        `;
    }).join("");

    container.innerHTML = `
        ${tabsHtml}
        <button class="clab-workspace-tab clab-workspace-add" id="clab-workspace-add" title="新建工作区">+</button>
    `;
}

function switchWorkspace(workspaceId) {
    const current = syncStateToActiveWorkspace();
    const target = (state.workspaces || []).find((workspace) => workspace.id === workspaceId);
    if (!target || target === current) return;

    applyWorkspaceToState(target);
    saveAndRender();
}

function addWorkspace() {
    syncStateToActiveWorkspace();
    const workspace = createEmptyWorkspace(getWorkspaceLabel((state.workspaces || []).length));
    state.workspaces = [...(state.workspaces || []), workspace];
    state.activeWorkspaceId = workspace.id;
    applyWorkspaceToState(workspace);
    saveAndRender();
}

function duplicateWorkspace() {
    syncStateToActiveWorkspace();
    const workspace = createWorkspaceFromCurrent(`${getActiveWorkspaceName()} 副本`);
    state.workspaces = [...(state.workspaces || []), workspace];
    state.activeWorkspaceId = workspace.id;
    applyWorkspaceToState(workspace);
    saveAndRender();
}

function startInlineRename(tabEl, workspaceId) {
    const workspace = (state.workspaces || []).find((item) => item.id === workspaceId);
    if (!workspace) return;
    
    const nameSpan = tabEl.querySelector(".clab-workspace-tab-name");
    if (!nameSpan) return;

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

function deleteWorkspace() {
    if (!state.workspaces || state.workspaces.length <= 1) {
        return;
    }

    const index = state.workspaces.findIndex((workspace) => workspace.id === state.activeWorkspaceId);
    if (index === -1) return;

    const nextWorkspaces = state.workspaces.filter((workspace) => workspace.id !== state.activeWorkspaceId);
    const nextActive = nextWorkspaces[Math.min(index, nextWorkspaces.length - 1)];
    state.workspaces = nextWorkspaces;
    state.activeWorkspaceId = nextActive.id;
    applyWorkspaceToState(nextActive);
    saveAndRender();
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
        
        switchWorkspace(tab.dataset.workspaceId);

        workspaceMenuEl.innerHTML = `
            <div class="clab-context-menu-title">工作区</div>
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

        workspaceMenuEl.querySelector("#clab-ctx-ws-duplicate").onclick = () => { workspaceMenuEl.style.display = "none"; duplicateWorkspace(); };
        workspaceMenuEl.querySelector("#clab-ctx-ws-rename").onclick = () => { 
            workspaceMenuEl.style.display = "none"; 
            startInlineRename(tab, tab.dataset.workspaceId); 
        };
        workspaceMenuEl.querySelector("#clab-ctx-ws-delete").onclick = () => { workspaceMenuEl.style.display = "none"; deleteWorkspace(); };
    });

    container.addEventListener("click", (event) => {
        const tab = event.target.closest(".clab-workspace-tab[data-workspace-id]");
        if (tab) {
            switchWorkspace(tab.dataset.workspaceId);
            return;
        }

        if (event.target.closest("#clab-workspace-add")) {
            addWorkspace();
            return;
        }
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
