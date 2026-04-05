/**
 * 文件名: comp_contextmenu.js
 * 路径: web/components/comp_contextmenu.js
 * 职责: 拦截模块（输入/输出）的右键事件，生成动态菜单，并支持多选批量操作与局部资产清理
 */
import { state, saveAndRender } from "./ui_state.js";
import { showBindingToast, hideBindingToast } from "./ui_utils.js";
import { execSelectSameModules, execDeleteSameModules, execMoveBackward, execMoveForward } from "./actions/action_batch_sync.js";
import { updateSelectionUI } from "./ui_selection.js";
import { clearPreviewHistory, getMediaType, loadAllTextHistory, loadSelectedTextContent, loadTextHistoryEntry, removePreviewHistoryIndex, syncTextContentWithSelection } from "./modules/media_types/media_utils.js";

// 辅助方法：触发定时消失的提示
function showAutoToast(msg, isError = false) {
    if (window.CLab && window.CLab.showAutoToast) {
        window.CLab.showAutoToast(msg, isError);
    } else {
        showBindingToast(msg, isError);
        setTimeout(hideBindingToast, 3000); 
    }
}

function showMediaMissingFallback(areaId) {
    const areaEl = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
    if (!areaEl) return;

    const mediaEl = areaEl.querySelector(".clab-preview-img, .clab-media-target, video, audio, img");
    if (!mediaEl) return;

    mediaEl.style.display = "none";
    const parent = mediaEl.parentElement;
    if (parent && !parent.querySelector(".clab-media-dead-fallback")) {
        parent.insertAdjacentHTML("beforeend", `
            <div class="clab-media-dead-fallback" style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#1e1e1e; color:#ff5555; z-index:10; pointer-events:none;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <span style="font-size:10px; margin-top:4px; color:#ccc;">媒体丢失</span>
            </div>
        `);
    }
}

async function probeMissingAndFallback(areaProbes) {
    const checks = areaProbes.map(async (item) => {
        if (!item || !item.url) return;
        try {
            const res = await fetch(item.url, { method: "HEAD", cache: "no-store" });
            if (!res.ok && res.status === 404) showMediaMissingFallback(item.areaId);
        } catch (_) {
            // ignore transient network errors here
        }
    });
    await Promise.all(checks);
}

// 辅助方法：触发浏览器下载
function downloadFile(url) {
    if (!url) return;
    try {
        const urlObj = new URL(url, window.location.origin);
        const filename = urlObj.searchParams.get('filename') || `image_${Date.now()}.png`;
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) { console.error("下载失败", e); }
}

// =========================================================================
// 核心：初始化与挂载右键菜单
// =========================================================================
export function setupContextMenu(panelContainer) {
    const menuEl = document.createElement('div');
    menuEl.className = 'clab-context-menu';
    document.body.appendChild(menuEl);

    const closeMenuGlobally = (e) => {
        if (menuEl.style.display === 'block' && !menuEl.contains(e.target)) {
            menuEl.style.display = 'none';
        }
    };
    window.addEventListener('mousedown', closeMenuGlobally, true);
    window.addEventListener('contextmenu', (e) => {
        if (menuEl.style.display === 'block' && !menuEl.contains(e.target)) {
            menuEl.style.display = 'none';
        }
    }, true);

    const showMenu = (clientX, clientY, clickedAreaId) => {
        const selectedAreaObjs = [];
        state.cards.forEach(c => {
            c.areas?.forEach(a => {
                if (state.selectedAreaIds.includes(a.id)) {
                    selectedAreaObjs.push({ card: c, area: a });
                }
            });
        });

        const mainObj = selectedAreaObjs.find(o => o.area.id === clickedAreaId);
        if (!mainObj) return;

        const showContentGroup = mainObj.area.type === 'preview';
        let menuHTML = ``;

        if (showContentGroup) {
            menuHTML += `
                <div class="clab-context-menu-title">内容</div>
                <div class="clab-context-menu-item" id="clab-ctx-download">下载</div>
                <div class="clab-context-menu-item" id="clab-ctx-download-all">下载全部生成记录</div>
                <div class="clab-context-menu-divider"></div>
                <div class="clab-context-menu-item" id="clab-ctx-remove">移除</div>
                <div class="clab-context-menu-item" id="clab-ctx-clear">清除所有生成记录</div>
                <div class="clab-context-menu-divider"></div>
                <div class="clab-context-menu-item" id="clab-ctx-clean-dead">清理失效记录 (404)</div>
                <div class="clab-context-menu-item" id="clab-ctx-resync">重新同步记录 (强制刷新)</div>
            `;
        }

        menuHTML += `
            <div class="clab-context-menu-title">模块</div>
            <div class="clab-context-menu-item" id="clab-ctx-select-same">选择相同模块</div>
            <div class="clab-context-menu-item clab-danger" id="clab-ctx-del-same">删除相同模块</div>
            <div class="clab-context-menu-divider"></div>
            <div class="clab-context-menu-item" id="clab-ctx-move-back">批量向后移动</div>
            <div class="clab-context-menu-item" id="clab-ctx-move-fwd">批量向前移动</div>
        `;

        menuEl.innerHTML = menuHTML;
        menuEl.style.display = 'block';
        
        let left = clientX;
        let top = clientY;
        const menuRect = menuEl.getBoundingClientRect();
        if (left + menuRect.width > window.innerWidth) left -= menuRect.width;
        if (top + menuRect.height > window.innerHeight) top -= menuRect.height;
        menuEl.style.left = `${left}px`;
        menuEl.style.top = `${top}px`;

        const getHistoryArr = (area) => area.history || area.historyUrls || area.results || [];
        const getHistoryIdx = (area) => area.historyIndex !== undefined ? area.historyIndex : (area.currentRecordIndex || 0);
        const getCurrentUrl = (area) => {
            const arr = getHistoryArr(area);
            const idx = getHistoryIdx(area);
            return area.resultUrl || (arr.length > 0 ? arr[idx] : null);
        };

        if (showContentGroup) {
            menuEl.querySelector('#clab-ctx-download').onclick = () => {
                menuEl.style.display = 'none';
                selectedAreaObjs.forEach(o => {
                    const url = getCurrentUrl(o.area);
                    if (url) downloadFile(url);
                });
            };

            menuEl.querySelector('#clab-ctx-download-all').onclick = () => {
                menuEl.style.display = 'none';
                selectedAreaObjs.forEach(o => {
                    const arr = getHistoryArr(o.area);
                    if (arr.length > 0) arr.forEach(url => downloadFile(url));
                    else if (o.area.resultUrl) downloadFile(o.area.resultUrl);
                });
            };

            // 【彻底抛弃重绘】：仅移除当前记录（局部更新）
            menuEl.querySelector('#clab-ctx-remove').onclick = () => {
                menuEl.style.display = 'none';
                selectedAreaObjs.forEach(o => {
                    const arr = getHistoryArr(o.area);
                    if (arr.length > 0) {
                        const idx = getHistoryIdx(o.area);
                        removePreviewHistoryIndex(o.area, idx);
                        const newIdx = Math.max(0, (o.area.history || []).length - 1);
                        if (o.area.historyIndex === undefined && o.area.currentRecordIndex !== undefined) {
                            o.area.currentRecordIndex = newIdx;
                        }
                        void loadSelectedTextContent(o.area, { refresh: false });
                    } else {
                        o.area.resultUrl = null;
                    }
                    if (o.area.selectedThumbIndices) o.area.selectedThumbIndices = []; 
                    
                    if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(o.area.id);
                });
                if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
            };

            // 【彻底抛弃重绘】：仅清除当前模块所有记录（局部更新）
            menuEl.querySelector('#clab-ctx-clear').onclick = () => {
                menuEl.style.display = 'none';
                selectedAreaObjs.forEach(o => {
                    clearPreviewHistory(o.area);
                    o.area.resultUrl = null;
                    if (o.area.historyUrls) o.area.historyUrls = [];
                    if (o.area.results) o.area.results = [];
                    if (o.area.historyIndex !== undefined) o.area.historyIndex = 0;
                    if (o.area.currentRecordIndex !== undefined) o.area.currentRecordIndex = 0;
                    if (o.area.selectedThumbIndices) o.area.selectedThumbIndices = [];
                    
                    if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(o.area.id);
                });
                if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
            };

            // 【彻底抛弃重绘】：清理失效记录 (纯前端试探，仅针对选中的模块局部刷新)
            menuEl.querySelector('#clab-ctx-clean-dead').onclick = async () => {
                menuEl.style.display = 'none';
                showAutoToast("🔍 正在扫描失效记录，请稍候...", false);

                let totalChecked = 0;
                const checkPromises = [];

                selectedAreaObjs.forEach(o => {
                    const arr = getHistoryArr(o.area);
                    if (arr && arr.length > 0) {
                        arr.forEach((url, index) => {
                            if (!url) return;
                            totalChecked++;
                            if (getMediaType(url) === "text") {
                                const p = (async () => {
                                    await loadTextHistoryEntry(o.area, index, { force: true, refresh: false });
                                    return (o.area.textHistoryStatus?.[index] || "") === "missing"
                                        ? { area: o.area, url: url }
                                        : null;
                                })();
                                checkPromises.push(p);
                                return;
                            }
                            const p = fetch(url, { method: 'HEAD', cache: 'no-store' }).then(res => {
                                if (!res.ok && res.status === 404) {
                                    return { area: o.area, url: url };
                                }
                                return null;
                            }).catch(err => null); // 忽略网络波动错误
                            checkPromises.push(p);
                        });
                    }
                });

                if (totalChecked === 0) {
                    showAutoToast("选中模块没有任何有效的生成记录需要清理。");
                    return;
                }

                const results = await Promise.all(checkPromises);
                const deadItems = results.filter(item => item !== null);

                if (deadItems.length === 0) {
                    showAutoToast("✨ 扫描完毕：选中模块的本地资产均完好无损！");
                } else {
                    deadItems.forEach(item => {
                        const area = item.area;
                        const arr = getHistoryArr(area);
                        if (arr) {
                            const idx = arr.indexOf(item.url);
                            if (idx !== -1) {
                                removePreviewHistoryIndex(area, idx);
                                if (area.resultUrl === item.url) {
                                    area.resultUrl = arr.length > 0 ? arr[0] : "";
                                    if (area.historyIndex !== undefined) area.historyIndex = 0;
                                    if (area.currentRecordIndex !== undefined) area.currentRecordIndex = 0;
                                }
                            }
                        }
                    });
                    
                    selectedAreaObjs.forEach(o => {
                        syncTextContentWithSelection(o.area);
                        void loadSelectedTextContent(o.area, { refresh: false });
                        if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(o.area.id);
                    });
                    if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
                    
                    showAutoToast(`🧹 清理完成：已彻底剔除该模块 ${deadItems.length} 条丢失记录。`);
                }
            };

            // 【彻底抛弃重绘】：重新同步记录
            menuEl.querySelector('#clab-ctx-resync').onclick = async () => {
                menuEl.style.display = 'none';
                showAutoToast("🔄 正在强制重新拉取选中模块的本地资产...", false);
                const now = Date.now();
                let syncCount = 0;
                const areaProbes = [];
                const textReloadTasks = [];

                selectedAreaObjs.forEach(o => {
                    if (o.area.history && o.area.history.length > 0) {
                        o.area.history = o.area.history.map(url => {
                            if (!url) return url;
                            try {
                                const urlObj = new URL(url, window.location.origin);
                                urlObj.searchParams.set('t', now);
                                syncCount++;
                                return urlObj.pathname + urlObj.search;
                            } catch(e) { return url; }
                        });
                    }
                    if (o.area.resultUrl) {
                        try {
                            const urlObj = new URL(o.area.resultUrl, window.location.origin);
                            urlObj.searchParams.set('t', now);
                            o.area.resultUrl = urlObj.pathname + urlObj.search;
                            areaProbes.push({ areaId: o.area.id, url: o.area.resultUrl });
                        } catch(e) {}
                    }
                    syncTextContentWithSelection(o.area);
                    if (o.area.history?.some(url => getMediaType(url) === "text")) {
                        textReloadTasks.push(loadAllTextHistory(o.area, { force: true, refresh: false }));
                    }
                    
                    if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(o.area.id);
                });

                if (syncCount === 0) {
                    showAutoToast("选中模块没有任何媒体记录需要同步。");
                    return;
                }

                if (textReloadTasks.length > 0) {
                    await Promise.all(textReloadTasks);
                }
                if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
                if (areaProbes.length > 0) {
                    // Proactively probe refreshed URLs so deleted videos can switch to missing state immediately.
                    await probeMissingAndFallback(areaProbes);
                }
                showAutoToast("✅ 缓存已清理，选中输出模块已重新加载媒体！");
            };
        }

        // --- 模块区事件 ---
        menuEl.querySelector('#clab-ctx-select-same').onclick = () => { 
            menuEl.style.display = 'none'; 
            execSelectSameModules(selectedAreaObjs); 
        };
        menuEl.querySelector('#clab-ctx-del-same').onclick = () => { 
            menuEl.style.display = 'none'; 
            selectedAreaObjs.forEach(o => execDeleteSameModules(o.area, o.card));
        };
        menuEl.querySelector('#clab-ctx-move-back').onclick = () => { 
            menuEl.style.display = 'none'; 
            execMoveBackward(state.selectedAreaIds); 
        };
        menuEl.querySelector('#clab-ctx-move-fwd').onclick = () => { 
            menuEl.style.display = 'none'; 
            execMoveForward(state.selectedAreaIds); 
        };
    };

    window.CLab.showPreviewContextMenu = (x, y, cardId, areaId, url) => {
        if (state.painterMode) {
            state.painterMode = false;
            state.painterSource = null;
            document.getElementById('clab-panel')?.classList.remove('clab-painter-active');
            updateSelectionUI();
            if (window._clabJustSave) window._clabJustSave();
            return;
        }

        if (!state.selectedAreaIds.includes(areaId)) {
            state.selectedAreaIds = [areaId];
            updateSelectionUI();
        }
        showMenu(x, y, areaId);
    };

    panelContainer.addEventListener('contextmenu', (e) => {
        if (state.painterMode) {
            e.preventDefault();
            e.stopPropagation();
            state.painterMode = false;
            state.painterSource = null;
            document.getElementById('clab-panel')?.classList.remove('clab-painter-active');
            updateSelectionUI();
            if (window._clabJustSave) window._clabJustSave();
            return;
        }

        const areaEl = e.target.closest('.clab-area');
        if (!areaEl) return;

        const areaId = areaEl.dataset.areaId;
        
        if (!state.selectedAreaIds.includes(areaId)) {
            state.selectedAreaIds = [areaId];
            updateSelectionUI();
        }

        e.preventDefault(); 
        e.stopPropagation();
        showMenu(e.clientX, e.clientY, areaId);
    });
}
