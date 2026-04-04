/**
 * ui_state.js: runtime state container and workspace helpers.
 */

const DEFAULT_WORKSPACE_NAME = "工作区 1";

export function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export function deepClone(value) {
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(value);
        } catch (_) { }
    }
    return JSON.parse(JSON.stringify(value));
}

export function createEmptyWorkspace(name = DEFAULT_WORKSPACE_NAME, seed = {}) {
    return {
        id: seed.id || makeId("workspace"),
        name: seed.name || name,
        cards: Array.isArray(seed.cards) ? seed.cards : [],
        activeCardId: seed.activeCardId || null,
        selectedCardIds: Array.isArray(seed.selectedCardIds) ? seed.selectedCardIds : [],
        selectedAreaIds: Array.isArray(seed.selectedAreaIds) ? seed.selectedAreaIds : [],
        painterMode: !!seed.painterMode,
        painterSource: seed.painterSource || null,
        scrollLeft: Number.isFinite(seed.scrollLeft) ? seed.scrollLeft : 0,
    };
}

export function normalizeWorkspace(workspace, index = 0) {
    const normalized = createEmptyWorkspace(workspace?.name || `${DEFAULT_WORKSPACE_NAME} ${index + 1}`, workspace);
    normalized.cards = Array.isArray(workspace?.cards) ? workspace.cards : [];
    normalized.activeCardId = workspace?.activeCardId || null;
    normalized.selectedCardIds = Array.isArray(workspace?.selectedCardIds) ? workspace.selectedCardIds : [];
    normalized.selectedAreaIds = Array.isArray(workspace?.selectedAreaIds) ? workspace.selectedAreaIds : [];
    normalized.painterMode = !!workspace?.painterMode;
    normalized.painterSource = workspace?.painterSource || null;
    normalized.scrollLeft = Number.isFinite(workspace?.scrollLeft) ? workspace.scrollLeft : 0;
    return normalized;
}

const initialWorkspace = createEmptyWorkspace(DEFAULT_WORKSPACE_NAME);

// Runtime mirror: legacy code still reads/writes state.cards and friends.
export const state = {
    schemaVersion: 2,
    activeWorkspaceId: initialWorkspace.id,
    workspaces: [initialWorkspace],

    // active workspace mirror
    cards: initialWorkspace.cards,
    activeCardId: initialWorkspace.activeCardId,
    selectedCardIds: initialWorkspace.selectedCardIds,
    selectedAreaIds: initialWorkspace.selectedAreaIds,
    painterMode: initialWorkspace.painterMode,
    painterSource: initialWorkspace.painterSource,
};

export const dragState = {
    type: null,
    cardId: null,
    areaId: null,
    cardIds: null,
    areaIds: null,
    anchorAreaId: null,
    sourceInfo: null,
    isClone: false,
};

export const appState = {
    isBindingMode: false,
    lastClickedCardId: null,
    lastClickedAreaId: null,
    selectedWorkspaceIds: [],
    lastClickedWorkspaceId: null,
};

export function getWorkspaceIndexById(workspaceId = state.activeWorkspaceId) {
    return state.workspaces.findIndex((workspace) => workspace.id === workspaceId);
}

export function getActiveWorkspace() {
    const idx = getWorkspaceIndexById();
    if (idx === -1) return null;
    return state.workspaces[idx];
}

export function getActiveWorkspaceIndex() {
    return getWorkspaceIndexById();
}

export function syncStateToActiveWorkspace() {
    const workspace = getActiveWorkspace();
    if (!workspace) return null;

    workspace.cards = Array.isArray(state.cards) ? state.cards : [];
    workspace.activeCardId = state.activeCardId || null;
    workspace.selectedCardIds = [];
    workspace.selectedAreaIds = [];
    workspace.painterMode = false;
    workspace.painterSource = null;
    return workspace;
}

export function applyWorkspaceToState(workspace) {
    const normalized = normalizeWorkspace(workspace);
    state.activeWorkspaceId = normalized.id;
    state.cards = normalized.cards;
    state.activeCardId = normalized.activeCardId;
    state.selectedCardIds = [];
    state.selectedAreaIds = [];
    state.painterMode = false;
    state.painterSource = null;
    appState.lastClickedCardId = null;
    appState.lastClickedAreaId = null;
    return normalized;
}

export function createWorkspaceFromCurrent(name) {
    syncStateToActiveWorkspace();
    const current = deepClone(getActiveWorkspace() || initialWorkspace);
    const workspace = normalizeWorkspace({
        ...current,
        id: makeId("workspace"),
        name: name || `${DEFAULT_WORKSPACE_NAME} ${state.workspaces.length + 1}`,
    });
    workspace.cards = deepClone(current.cards || []);
    return workspace;
}

export function resetTransientState() {
    state.activeCardId = null;
    state.selectedCardIds = [];
    state.selectedAreaIds = [];
    state.painterMode = false;
    state.painterSource = null;
    appState.lastClickedCardId = null;
    appState.lastClickedAreaId = null;
}

export function ensureWorkspaceRuntime() {
    if (!Array.isArray(state.workspaces) || state.workspaces.length === 0) {
        const workspace = createEmptyWorkspace(DEFAULT_WORKSPACE_NAME);
        state.workspaces = [workspace];
        state.activeWorkspaceId = workspace.id;
        applyWorkspaceToState(workspace);
        return;
    }

    let active = getActiveWorkspace();
    if (!active) {
        state.activeWorkspaceId = state.workspaces[0].id;
        active = state.workspaces[0];
    }
    applyWorkspaceToState(active);
}

export function buildPersistedState() {
    syncStateToActiveWorkspace();
    return {
        schemaVersion: state.schemaVersion || 2,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: state.workspaces.map((workspace, index) => normalizeWorkspace(workspace, index)),
    };
}

export function hydrateStateFromPersisted(persisted = {}) {
    const workspaces = Array.isArray(persisted.workspaces) && persisted.workspaces.length > 0
        ? persisted.workspaces.map((workspace, index) => normalizeWorkspace(workspace, index))
        : [normalizeWorkspace(persisted, 0)];

    state.schemaVersion = persisted.schemaVersion || 2;
    state.workspaces = workspaces;
    state.activeWorkspaceId = persisted.activeWorkspaceId && workspaces.some((workspace) => workspace.id === persisted.activeWorkspaceId)
        ? persisted.activeWorkspaceId
        : workspaces[0].id;

    ensureWorkspaceRuntime();
    return state;
}

export function saveAndRender() {
    if (window.CLab) window.CLab.saveState(state);
    document.dispatchEvent(new CustomEvent("clab_render_ui"));
}

// =========================================================================
// Global asset cleanup helper: remove URLs from all output areas.
// =========================================================================
export const removeUrlsGlobally = (urlsToRemove) => {
    if (!urlsToRemove || urlsToRemove.length === 0) return;

    const getPathAndQuery = (urlStr) => {
        if (!urlStr) return "";
        try {
            return new URL(urlStr, window.location.origin).pathname + new URL(urlStr, window.location.origin).search;
        } catch (e) {
            return urlStr;
        }
    };

    const pathsToRemove = urlsToRemove.map(getPathAndQuery);

    state.cards.forEach((card) => {
        card.areas?.forEach((area) => {
            if (area.type !== "preview") return;

            if (area.history && area.history.length > 0) {
                const activeUrl = area.resultUrl;
                const originalLength = area.history.length;
                area.history = area.history.filter((historyUrl) => !pathsToRemove.includes(getPathAndQuery(historyUrl)));

                if (area.history.length !== originalLength) {
                    if (area.history.length === 0) {
                        area.resultUrl = "";
                        area.historyIndex = 0;
                        area.selectedThumbIndices = [];
                    } else {
                        let newActiveIdx = area.history.indexOf(activeUrl);
                        if (newActiveIdx === -1) newActiveIdx = Math.max(0, area.history.length - 1);
                        area.historyIndex = newActiveIdx;
                        area.resultUrl = area.history[newActiveIdx];
                        if (area.selectedThumbIndices) {
                            area.selectedThumbIndices = area.selectedThumbIndices.filter((i) => i < area.history.length);
                        }
                    }
                }
            } else if (area.resultUrl && pathsToRemove.includes(getPathAndQuery(area.resultUrl))) {
                area.resultUrl = "";
            }
        });
    });

    saveAndRender();
};
