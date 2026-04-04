import io

with open("comp_workspace.js", 'r', encoding='utf-8') as f:
    text = f.read()

# Import update
text = text.replace(
"""import {
    state,
    syncStateToActiveWorkspace,""",
"""import {
    state,
    appState,
    deepClone,
    makeId,
    syncStateToActiveWorkspace,""")

# Render update
text = text.replace(
"""    const activeWorkspaceId = state.activeWorkspaceId;
    const tabsHtml = (state.workspaces || []).map((workspace, index) => {
        const isActive = workspace.id === activeWorkspaceId;
        const label = workspace.name || getWorkspaceLabel(index);
        return `
            <button class="clab-workspace-tab ${isActive ? "active" : ""}" data-workspace-id="${workspace.id}" title="${label}">
                <span class="clab-workspace-tab-name">${label}</span>
            </button>
        `;
    }).join("");""",
"""    const activeWorkspaceId = state.activeWorkspaceId;
    const selectedIds = appState.selectedWorkspaceIds || [];
    const tabsHtml = (state.workspaces || []).map((workspace, index) => {
        const isActive = workspace.id === activeWorkspaceId;
        const isSelected = selectedIds.includes(workspace.id);
        const classes = ["clab-workspace-tab"];
        if (isActive) classes.push("active");
        if (isSelected) classes.push("selected");
        const label = workspace.name || getWorkspaceLabel(index);
        return `
            <button class="${classes.join(' ')}" data-workspace-id="${workspace.id}" title="${label}" draggable="true">
                <span class="clab-workspace-tab-name">${label}</span>
            </button>
        `;
    }).join("");""")

with open("comp_workspace.js", 'w', encoding='utf-8') as f:
    f.write(text)
print("Phase 1 done")
