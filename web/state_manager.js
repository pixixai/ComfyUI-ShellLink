/**
 * State manager for CLab workspace persistence.
 */
import {
    state,
    buildPersistedState,
    createEmptyWorkspace,
    hydrateStateFromPersisted,
    ensureWorkspaceRuntime,
    syncStateToActiveWorkspace,
    applyWorkspaceToState,
} from "./components/ui_state.js";
import { loadAllTextHistory } from "./components/modules/media_types/media_utils.js";

export const StateManager = {
    state,
    _lastSyncedJSON: "",
    _watchdogTimer: null,

    startWatchdog(graph) {
        if (this._watchdogTimer) return;

        this._watchdogTimer = setInterval(() => {
            if (!graph) return;
            const node = this.getConfigNode(graph);

            if (!node && this._lastSyncedJSON !== "") {
                this.loadFromNode(graph);
                return;
            }

            if (node) {
                const widget = node.widgets?.find((w) => w.name === "scenes_data");
                if (widget && widget.value && widget.value !== this._lastSyncedJSON) {
                    this.loadFromNode(graph);
                }
            }
        }, 800);
    },

    getConfigNode(graph) {
        if (!graph) return null;
        const nodes = graph._nodes.filter((n) => n.type === "CLab_SystemConfig");
        if (nodes.length === 0) return null;

        for (let i = nodes.length - 1; i >= 0; i -= 1) {
            const widget = nodes[i].widgets?.find((w) => w.name === "scenes_data");
            if (widget && widget.value && widget.value.length > 20) {
                return nodes[i];
            }
        }

        return nodes[nodes.length - 1];
    },

    syncToNode(graph) {
        const node = this.getConfigNode(graph);
        if (node) {
            const widget = node.widgets?.find((w) => w.name === "scenes_data");
            if (widget) {
                syncStateToActiveWorkspace();
                const persisted = buildPersistedState();
                const jsonStr = JSON.stringify(persisted);
                widget.value = jsonStr;
                this._lastSyncedJSON = jsonStr;
            }
        }

        this.startWatchdog(graph);
    },

    async loadFromNode(graph) {
        const node = this.getConfigNode(graph);
        if (!node) {
            const blank = createEmptyWorkspace();
            state.schemaVersion = 3;
            state.workspaces = [blank];
            state.activeWorkspaceId = blank.id;
            applyWorkspaceToState(blank);
            this._lastSyncedJSON = "";
            document.dispatchEvent(new CustomEvent("clab_state_cleared"));
            this.startWatchdog(graph);
            return;
        }

        const widget = node.widgets?.find((w) => w.name === "scenes_data");
        if (!widget || !widget.value) {
            const blank = createEmptyWorkspace();
            state.schemaVersion = 3;
            state.workspaces = [blank];
            state.activeWorkspaceId = blank.id;
            applyWorkspaceToState(blank);
            this._lastSyncedJSON = "";
            document.dispatchEvent(new CustomEvent("clab_state_cleared"));
            this.startWatchdog(graph);
            return;
        }

        try {
            this._lastSyncedJSON = widget.value;
            const parsed = JSON.parse(widget.value);
            hydrateStateFromPersisted(parsed);

            state.cards.forEach((card) => {
                if (!card.areas) {
                    card.areas = [];
                    if (card.previewAreas) {
                        card.areas.push(...card.previewAreas.map((area) => ({ ...area, type: "preview", matchMedia: false, ratio: "16:9" })));
                        delete card.previewAreas;
                    }
                    if (card.editAreas) {
                        card.areas.push(...card.editAreas.map((area) => ({ ...area, type: "edit", dataType: "string", autoHeight: true })));
                        delete card.editAreas;
                    }
                }
            });

            await this.syncLocalHistoryToOutputAreas();
            await this.reloadTextHistoriesFromFiles();
            document.dispatchEvent(new CustomEvent("clab_state_loaded", { detail: state }));
        } catch (e) {
            console.error("[CLab] Failed to parse saved state:", e);
        }

        this.startWatchdog(graph);
    },

    async syncLocalHistoryToOutputAreas() {
        try {
            const resp = await fetch("/clab/get_local_history");
            const data = await resp.json();

            if (data.status !== "success" || !data.history || data.history.length === 0) return;

            const localUrls = data.history.map((item) => item.url);
            if (!state.cards) return;

            state.cards.forEach((card) => {
                card.areas?.forEach((area) => {
                    if (area.type !== "output" && area.type !== "preview") return;
                    if (!area.history) area.history = [];

                    const newUrls = localUrls.filter((url) => !area.history.some((historyUrl) => historyUrl.split("&t=")[0] === url.split("&t=")[0]));

                    if (newUrls.length > 0) {
                        area.history = [...area.history, ...newUrls];
                        if (!area.resultUrl && area.history.length > 0) {
                            area.historyIndex = area.history.length - 1;
                            area.resultUrl = area.history[area.historyIndex];
                        }
                    }
                });
            });
        } catch (e) {
            console.error("[CLab] syncLocalHistoryToOutputAreas failed:", e);
        }
    },

    async reloadTextHistoriesFromFiles() {
        if (!Array.isArray(state.cards) || state.cards.length === 0) return;

        const tasks = [];
        state.cards.forEach((card) => {
            card.areas?.forEach((area) => {
                if (area.type !== "preview") return;
                tasks.push(loadAllTextHistory(area, { force: true, refresh: false }));
            });
        });

        if (tasks.length === 0) return;

        try {
            await Promise.all(tasks);
        } catch (e) {
            console.error("[CLab] reloadTextHistoriesFromFiles failed:", e);
        }
    },

    showToast(msg, bg = "rgba(76, 175, 80, 0.95)") {
        const toast = document.createElement("div");
        toast.style.cssText = `
            position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
            background: ${bg}; color: white; padding: 12px 24px;
            border-radius: 8px; z-index: 10005; font-size: 14px; font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4); pointer-events: none;
            opacity: 0; transition: opacity 0.3s ease; backdrop-filter: blur(4px);
        `;
        toast.innerText = msg;
        document.body.appendChild(toast);

        requestAnimationFrame(() => (toast.style.opacity = "1"));
        setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    },

    createConfigNode(graph) {
        if (this.getConfigNode(graph)) {
            this.showToast("Configuration node already exists in the graph.", "rgba(255, 152, 0, 0.95)");
            return;
        }

        const node = LiteGraph.createNode("CLab_SystemConfig");

        let posX = 400;
        let posY = 300;
        try {
            posX = (window.innerWidth / 2) - 150;
            posY = (window.innerHeight / 2) - 100;
        } catch (e) {}

        node.pos = [posX, posY];
        graph.add(node);

        this.syncToNode(graph);
        this.showToast("Configuration node created.");
    },

    getActiveCard() {
        return this.state.cards.find((card) => card.id === this.state.activeCardId);
    },

    getActiveWorkspace() {
        const idx = this.state.workspaces.findIndex((workspace) => workspace.id === this.state.activeWorkspaceId);
        return idx === -1 ? null : this.state.workspaces[idx];
    },

    ensureRuntime() {
        ensureWorkspaceRuntime();
    },
};

if (typeof window !== "undefined") {
    window.StateManager = StateManager;
}
