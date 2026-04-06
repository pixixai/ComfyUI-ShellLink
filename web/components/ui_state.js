/**
 * ui_state.js: runtime state container and workspace helpers.
 */
import { syncTextContentWithSelection } from "./modules/media_types/media_utils.js";

const DEFAULT_WORKSPACE_NAME = "工作区 1";
const DEFAULT_CHANNEL_NAME = "通道 1";
const DEFAULT_PREVIEW_FILL_MODE = "显示全部";
const CHANNEL_BINDING_KEYS = [
    "targetNodeId",
    "targetWidget",
    "targetNodeIds",
    "targetWidgets",
    "runtimeNodeBypassed",
    "runtimeNodeDisabled",
    "dataType",
    "autoHeight",
    "ratio",
    "width",
    "height",
    "matchMedia",
    "fillMode",
];

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

function normalizeBindingMap(bindings) {
    if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return {};
    return deepClone(bindings);
}

function extractAreaBinding(area) {
    const binding = {};
    if (!area || typeof area !== "object") return binding;

    CHANNEL_BINDING_KEYS.forEach((key) => {
        if (area[key] === undefined) return;
        if (Array.isArray(area[key])) {
            binding[key] = [...area[key]];
            return;
        }
        if (area[key] && typeof area[key] === "object") {
            binding[key] = deepClone(area[key]);
            return;
        }
        binding[key] = area[key];
    });

    return binding;
}

function buildBindingsFromCards(cards) {
    const bindings = {};
    if (!Array.isArray(cards)) return bindings;

    cards.forEach((card) => {
        card?.areas?.forEach((area) => {
            if (!area?.id) return;
            bindings[area.id] = extractAreaBinding(area);
        });
    });

    return bindings;
}

function resetAreaBindingFields(area) {
    if (!area || typeof area !== "object") return;

    area.targetNodeId = null;
    area.targetWidget = null;
    area.targetNodeIds = [];
    area.targetWidgets = [];
    area.runtimeNodeBypassed = false;
    area.runtimeNodeDisabled = false;

    if (area.type === "edit") {
        area.dataType = "string";
        area.autoHeight = true;
    } else if (area.type === "preview") {
        area.ratio = "16:9";
        area.width = null;
        area.height = null;
        area.matchMedia = true;
        area.fillMode = DEFAULT_PREVIEW_FILL_MODE;
    }
}

function applyAreaBinding(area, binding) {
    if (!area || !binding || typeof binding !== "object") return;

    CHANNEL_BINDING_KEYS.forEach((key) => {
        if (!(key in binding)) return;
        const value = binding[key];
        if (Array.isArray(value)) {
            area[key] = [...value];
            return;
        }
        if (value && typeof value === "object") {
            area[key] = deepClone(value);
            return;
        }
        area[key] = value;
    });
}

function applyChannelBindingsToCards(channel, cards) {
    if (!Array.isArray(cards)) return;
    const bindings = channel?.bindings && typeof channel.bindings === "object" ? channel.bindings : {};

    cards.forEach((card) => {
        card?.areas?.forEach((area) => {
            resetAreaBindingFields(area);
            const binding = bindings[area.id];
            if (binding) applyAreaBinding(area, binding);
        });
    });
}

function syncChannelBindingsFromCards(channel, cards) {
    if (!channel) return;
    channel.bindings = buildBindingsFromCards(cards);
}

export function createEmptyChannel(name = DEFAULT_CHANNEL_NAME, seed = {}) {
    return {
        id: seed.id || makeId("channel"),
        name: seed.name || name,
        bindings: normalizeBindingMap(seed.bindings),
        toolbarState: seed.toolbarState && typeof seed.toolbarState === "object" && !Array.isArray(seed.toolbarState)
            ? deepClone(seed.toolbarState)
            : {},
    };
}

export function normalizeChannel(channel, index = 0) {
    const fallbackName = `${DEFAULT_CHANNEL_NAME} ${index + 1}`;
    const normalized = createEmptyChannel(channel?.name || fallbackName, channel || {});
    normalized.bindings = normalizeBindingMap(channel?.bindings);
    normalized.toolbarState = channel?.toolbarState && typeof channel.toolbarState === "object" && !Array.isArray(channel.toolbarState)
        ? deepClone(channel.toolbarState)
        : {};
    return normalized;
}

export function createEmptyWorkspace(name = DEFAULT_WORKSPACE_NAME, seed = {}) {
    const cards = Array.isArray(seed.cards) ? seed.cards : [];
    const channels = Array.isArray(seed.channels) && seed.channels.length > 0
        ? seed.channels.map((channel, index) => normalizeChannel(channel, index))
        : [createEmptyChannel(DEFAULT_CHANNEL_NAME, { bindings: buildBindingsFromCards(cards) })];

    const activeChannelId = seed.activeChannelId && channels.some((channel) => channel.id === seed.activeChannelId)
        ? seed.activeChannelId
        : channels[0].id;

    return {
        id: seed.id || makeId("workspace"),
        name: seed.name || name,
        cards,
        activeCardId: seed.activeCardId || null,
        selectedCardIds: Array.isArray(seed.selectedCardIds) ? seed.selectedCardIds : [],
        selectedAreaIds: Array.isArray(seed.selectedAreaIds) ? seed.selectedAreaIds : [],
        painterMode: !!seed.painterMode,
        painterSource: seed.painterSource || null,
        scrollLeft: Number.isFinite(seed.scrollLeft) ? seed.scrollLeft : 0,
        activeChannelId,
        channels,
    };
}

export function normalizeWorkspace(workspace, index = 0) {
    const normalized = createEmptyWorkspace(workspace?.name || `${DEFAULT_WORKSPACE_NAME} ${index + 1}`, workspace || {});
    normalized.cards = Array.isArray(workspace?.cards) ? workspace.cards : [];
    normalized.activeCardId = workspace?.activeCardId || null;
    normalized.selectedCardIds = Array.isArray(workspace?.selectedCardIds) ? workspace.selectedCardIds : [];
    normalized.selectedAreaIds = Array.isArray(workspace?.selectedAreaIds) ? workspace.selectedAreaIds : [];
    normalized.painterMode = !!workspace?.painterMode;
    normalized.painterSource = workspace?.painterSource || null;
    normalized.scrollLeft = Number.isFinite(workspace?.scrollLeft) ? workspace.scrollLeft : 0;

    if (Array.isArray(workspace?.channels) && workspace.channels.length > 0) {
        normalized.channels = workspace.channels.map((channel, channelIndex) => normalizeChannel(channel, channelIndex));
    } else {
        normalized.channels = [createEmptyChannel(DEFAULT_CHANNEL_NAME, { bindings: buildBindingsFromCards(normalized.cards) })];
    }
    normalized.activeChannelId = workspace?.activeChannelId && normalized.channels.some((channel) => channel.id === workspace.activeChannelId)
        ? workspace.activeChannelId
        : normalized.channels[0].id;

    return normalized;
}

const initialWorkspace = createEmptyWorkspace(DEFAULT_WORKSPACE_NAME);
const initialChannel = initialWorkspace.channels[0];

// Runtime mirror: legacy code still reads/writes state.cards and friends.
export const state = {
    schemaVersion: 3,
    activeWorkspaceId: initialWorkspace.id,
    workspaces: [initialWorkspace],

    // active workspace mirror
    cards: initialWorkspace.cards,
    activeCardId: initialWorkspace.activeCardId,
    selectedCardIds: initialWorkspace.selectedCardIds,
    selectedAreaIds: initialWorkspace.selectedAreaIds,
    painterMode: initialWorkspace.painterMode,
    painterSource: initialWorkspace.painterSource,
    activeChannelId: initialWorkspace.activeChannelId,
    channels: initialWorkspace.channels,
    toolbarState: initialChannel?.toolbarState || {},
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
    selectedChannelIds: [],
    lastClickedChannelId: null,
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

export function getChannelIndexById(channelId = state.activeChannelId) {
    return (state.channels || []).findIndex((channel) => channel.id === channelId);
}

export function getActiveChannel() {
    const idx = getChannelIndexById();
    if (idx === -1) return null;
    return state.channels[idx];
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
    if (Array.isArray(state.channels) && state.channels.length > 0) {
        workspace.channels = state.channels;
    } else if (!Array.isArray(workspace.channels) || workspace.channels.length === 0) {
        workspace.channels = [createEmptyChannel(DEFAULT_CHANNEL_NAME)];
    }
    workspace.activeChannelId = state.activeChannelId && workspace.channels.some((channel) => channel.id === state.activeChannelId)
        ? state.activeChannelId
        : workspace.channels[0].id;

    const activeChannel = workspace.channels.find((channel) => channel.id === workspace.activeChannelId) || workspace.channels[0];
    syncChannelBindingsFromCards(activeChannel, workspace.cards);

    state.channels = workspace.channels;
    state.activeChannelId = workspace.activeChannelId;
    state.toolbarState = activeChannel?.toolbarState || {};

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
    state.channels = normalized.channels;
    state.activeChannelId = normalized.activeChannelId;

    const activeChannel = normalized.channels.find((channel) => channel.id === normalized.activeChannelId) || normalized.channels[0];
    state.toolbarState = activeChannel?.toolbarState || {};
    applyChannelBindingsToCards(activeChannel, state.cards);

    appState.lastClickedCardId = null;
    appState.lastClickedAreaId = null;
    appState.selectedChannelIds = [state.activeChannelId];
    appState.lastClickedChannelId = state.activeChannelId;
    return normalized;
}

export function applyChannelToState(channelId) {
    const workspace = getActiveWorkspace();
    if (!workspace) return null;

    if (!Array.isArray(workspace.channels) || workspace.channels.length === 0) {
        workspace.channels = [createEmptyChannel(DEFAULT_CHANNEL_NAME)];
    }

    const targetId = channelId && workspace.channels.some((channel) => channel.id === channelId)
        ? channelId
        : workspace.channels[0].id;
    workspace.activeChannelId = targetId;

    state.channels = workspace.channels;
    state.activeChannelId = targetId;

    const channel = workspace.channels.find((item) => item.id === targetId) || workspace.channels[0];
    state.toolbarState = channel?.toolbarState || {};
    applyChannelBindingsToCards(channel, state.cards);

    appState.selectedChannelIds = [targetId];
    appState.lastClickedChannelId = targetId;
    return channel;
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
    workspace.channels = (current.channels || []).map((channel, index) => {
        const normalized = normalizeChannel(channel, index);
        normalized.id = makeId("channel");
        return normalized;
    });
    if (workspace.channels.length === 0) {
        workspace.channels = [createEmptyChannel(DEFAULT_CHANNEL_NAME, { bindings: buildBindingsFromCards(workspace.cards) })];
    }
    workspace.activeChannelId = workspace.channels[0].id;
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
        schemaVersion: state.schemaVersion || 3,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: state.workspaces.map((workspace, index) => normalizeWorkspace(workspace, index)),
    };
}

export function hydrateStateFromPersisted(persisted = {}) {
    const workspaces = Array.isArray(persisted.workspaces) && persisted.workspaces.length > 0
        ? persisted.workspaces.map((workspace, index) => normalizeWorkspace(workspace, index))
        : [normalizeWorkspace(persisted, 0)];

    state.schemaVersion = persisted.schemaVersion || 3;
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
                const keepIndices = [];
                area.history.forEach((historyUrl, index) => {
                    if (!pathsToRemove.includes(getPathAndQuery(historyUrl))) keepIndices.push(index);
                });
                const originalLength = area.history.length;
                area.history = keepIndices.map((index) => area.history[index]);
                if (Array.isArray(area.inputHistorySnapshots) && area.inputHistorySnapshots.length > 0) {
                    area.inputHistorySnapshots = keepIndices.map((index) => area.inputHistorySnapshots[index]);
                }
                if (Array.isArray(area.textHistory) && area.textHistory.length > 0) {
                    area.textHistory = keepIndices.map((index) => area.textHistory[index]);
                }
                if (Array.isArray(area.textHistoryStatus) && area.textHistoryStatus.length > 0) {
                    area.textHistoryStatus = keepIndices.map((index) => area.textHistoryStatus[index]);
                }

                if (area.history.length !== originalLength) {
                    if (area.history.length === 0) {
                        area.resultUrl = "";
                        area.historyIndex = 0;
                        area.selectedThumbIndices = [];
                        if (Array.isArray(area.textHistory)) area.textContent = "";
                        area.textLoadState = "idle";
                    } else {
                        let newActiveIdx = area.history.indexOf(activeUrl);
                        if (newActiveIdx === -1) newActiveIdx = Math.max(0, area.history.length - 1);
                        area.historyIndex = newActiveIdx;
                        area.resultUrl = area.history[newActiveIdx];
                        syncTextContentWithSelection(area);
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
