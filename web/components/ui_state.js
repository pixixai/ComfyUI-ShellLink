/**
 * ui_state.js：全局状态管理器（存放数据和触发重绘的方法）。
 */

// 核心业务状态
export const state = {
    cards: [],
    activeCardId: null,
    selectedCardIds: [], 
    selectedAreaIds: [],
    painterMode: false, // 格式刷模式状态
    painterSource: null // 格式刷的源数据 { type: 'card'|'area', data: {...} }
};

// 拖拽操作的状态机
export const dragState = {
    type: null,
    cardId: null,
    areaId: null
};

// 应用级 UI 状态
export const appState = {
    isBindingMode: false,
    lastClickedCardId: null
};

/**
 * 核心调度方法：保存状态到画布，并触发全局 UI 重绘
 * 组件中修改完 state 后，直接调用此方法即可
 */
export function saveAndRender() {
    // 调用底层暴露的 saveState 方法存入节点
    if (window.CLab) window.CLab.saveState(state);
    
    // 派发自定义事件，通知 ui_panel.js 执行 performRender
    document.dispatchEvent(new CustomEvent("clab_render_ui"));
}

// =========================================================================
// 全局资产清理引擎：从所有输出模块中彻底移除指定的 URL，避免残影
// =========================================================================
export const removeUrlsGlobally = (urlsToRemove) => {
    if (!urlsToRemove || urlsToRemove.length === 0) return;
    const getPathAndQuery = (urlStr) => {
        if (!urlStr) return '';
        try { return new URL(urlStr, window.location.origin).pathname + new URL(urlStr, window.location.origin).search; } 
        catch(e) { return urlStr; }
    };
    
    const pathsToRemove = urlsToRemove.map(getPathAndQuery);

    state.cards.forEach(c => {
        c.areas?.forEach(a => {
            if (a.type === 'preview') {
                if (a.history && a.history.length > 0) {
                    const activeUrl = a.resultUrl;
                    const originalLength = a.history.length;
                    a.history = a.history.filter(h => !pathsToRemove.includes(getPathAndQuery(h)));
                    
                    if (a.history.length !== originalLength) {
                        if (a.history.length === 0) {
                            a.resultUrl = '';
                            a.historyIndex = 0;
                            a.selectedThumbIndices = [];
                        } else {
                            let newActiveIdx = a.history.indexOf(activeUrl);
                            if (newActiveIdx === -1) newActiveIdx = Math.max(0, a.history.length - 1);
                            a.historyIndex = newActiveIdx;
                            a.resultUrl = a.history[newActiveIdx];
                            if (a.selectedThumbIndices) {
                                a.selectedThumbIndices = a.selectedThumbIndices.filter(i => i < a.history.length);
                            }
                        }
                    }
                } else if (a.resultUrl && pathsToRemove.includes(getPathAndQuery(a.resultUrl))) {
                    a.resultUrl = '';
                }
            }
        });
    });
    saveAndRender();
};