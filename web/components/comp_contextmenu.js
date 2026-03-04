/**
 * 文件名: comp_contextmenu.js
 * 路径: web/components/comp_contextmenu.js
 * 职责: 拦截模块（输入/输出）的右键事件，生成动态菜单，并支持多选批量操作与全局资产清理
 */
import { state, saveAndRender } from "./ui_state.js";
import { showBindingToast, hideBindingToast } from "./ui_utils.js";
import { execSelectSameModules, execDeleteSameModules, execMoveBackward, execMoveForward } from "./actions/action_batch_sync.js";

// 辅助方法：触发定时消失的提示
function showAutoToast(msg, isError = false) {
    showBindingToast(msg, isError);
    setTimeout(hideBindingToast, 3000); // 3秒后自动隐藏
}

// =========================================================================
// 全局资产清理引擎：从所有输出模块中彻底移除指定的 URL，避免残影
// =========================================================================
window.ShellLink = window.ShellLink || {};
window.ShellLink.showAutoToast = showAutoToast;
window.ShellLink.globalRemoveHistoryUrls = function(urlsToRemove) {
    if (!urlsToRemove || urlsToRemove.length === 0) return;
    
    // 【核心修复】：强大的 URL 解析器。屏蔽相对路径和绝对路径的差异，只匹配核心路径和文件名
    const getPathAndQuery = (urlStr) => {
        if (!urlStr) return '';
        try {
            const u = new URL(urlStr, window.location.origin);
            return u.pathname + u.search;
        } catch(e) { 
            return urlStr; 
        }
    };
    
    const pathsToRemove = urlsToRemove.map(getPathAndQuery);

    state.cards.forEach(c => {
        c.areas?.forEach(a => {
            if (a.type === 'preview') {
                // 如果有历史记录数组，则在数组中过滤
                if (a.history && a.history.length > 0) {
                    const activeUrl = a.resultUrl;
                    const originalLength = a.history.length;
                    
                    // 过滤掉匹配的残影
                    a.history = a.history.filter(h => !pathsToRemove.includes(getPathAndQuery(h)));
                    
                    if (a.history.length !== originalLength) {
                        if (a.history.length === 0) {
                            a.resultUrl = '';
                            a.historyIndex = 0;
                            a.selectedThumbIndices = []; // 清空选中状态
                        } else {
                            // 修正当前显示的索引，如果当前查看的图被删了，跳到最后一张
                            let newActiveIdx = a.history.indexOf(activeUrl);
                            if (newActiveIdx === -1) newActiveIdx = Math.max(0, a.history.length - 1);
                            a.historyIndex = newActiveIdx;
                            a.resultUrl = a.history[newActiveIdx];
                            
                            // 清理可能越界的选中索引
                            if (a.selectedThumbIndices) {
                                a.selectedThumbIndices = a.selectedThumbIndices.filter(i => i < a.history.length);
                            }
                        }
                    }
                } 
                // 如果是单图模式（没有history但有resultUrl）
                else if (a.resultUrl && pathsToRemove.includes(getPathAndQuery(a.resultUrl))) {
                    a.resultUrl = '';
                }
            }
        });
    });
    saveAndRender();
};

// =========================================================================
// 内部辅助方法：调用后端物理删除文件 API
// =========================================================================
async function deletePhysicalFile(urlStr) {
    if (!urlStr) return;
    try {
        const urlObj = new URL(urlStr, window.location.origin);
        const filename = urlObj.searchParams.get('filename');
        const subfolder = urlObj.searchParams.get('subfolder') || '';
        if (!filename) return;

        await fetch('/shell_link/delete_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, subfolder })
        });
    } catch (e) {
        console.error("[ShellLink] 删除本地文件失败", e);
    }
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
    // 1. 在页面中创建隐藏的全局新菜单容器
    const menuEl = document.createElement('div');
    menuEl.className = 'sl-context-menu';
    document.body.appendChild(menuEl);

    // 2. 全局点击关闭菜单
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

    // 3. 抽离出的公共唤出逻辑
    const showMenu = (clientX, clientY, clickedAreaId) => {
        // 找到当前选中的所有模块对象
        const selectedAreaObjs = [];
        state.cards.forEach(c => {
            c.areas?.forEach(a => {
                if (state.selectedAreaIds.includes(a.id)) {
                    selectedAreaObjs.push({ card: c, area: a });
                }
            });
        });

        // 找到当前点击的那个模块
        const mainObj = selectedAreaObjs.find(o => o.area.id === clickedAreaId);
        if (!mainObj) return;

        // 【判断显示分组】：只有当点击的是“输出模块”时，才显示“内容”分组
        const showContentGroup = mainObj.area.type === 'preview';

        // 4. 动态渲染菜单内部 HTML
        let menuHTML = ``;

        if (showContentGroup) {
            menuHTML += `
                <div class="sl-context-menu-title">内容</div>
                <div class="sl-context-menu-item" id="sl-ctx-download">下载</div>
                <div class="sl-context-menu-item" id="sl-ctx-download-all">下载全部生成记录</div>
                <div class="sl-context-menu-divider"></div>
                <div class="sl-context-menu-item" id="sl-ctx-remove">移除 (仅限此模块)</div>
                <div class="sl-context-menu-item sl-danger" id="sl-ctx-remove-del">移除并删除本地文件</div>
                <div class="sl-context-menu-item" id="sl-ctx-clear">清除所有 (仅限此模块)</div>
                <div class="sl-context-menu-item sl-danger" id="sl-ctx-clear-del">清除所有并删除本地文件</div>
            `;
        }

        menuHTML += `
            <div class="sl-context-menu-title">模块</div>
            <div class="sl-context-menu-item" id="sl-ctx-select-same">选择相同模块</div>
            <div class="sl-context-menu-item sl-danger" id="sl-ctx-del-same">删除相同模块</div>
            <div class="sl-context-menu-divider"></div>
            <div class="sl-context-menu-item" id="sl-ctx-move-back">批量向后移动</div>
            <div class="sl-context-menu-item" id="sl-ctx-move-fwd">批量向前移动</div>
        `;

        menuEl.innerHTML = menuHTML;

        // 防止菜单超出屏幕边界
        menuEl.style.display = 'block';
        let left = clientX;
        let top = clientY;
        const menuRect = menuEl.getBoundingClientRect();
        if (left + menuRect.width > window.innerWidth) left -= menuRect.width;
        if (top + menuRect.height > window.innerHeight) top -= menuRect.height;
        menuEl.style.left = `${left}px`;
        menuEl.style.top = `${top}px`;

        // =========================================================
        // 5. 绑定点击事件 (智能适配历史记录结构并支持多选)
        // =========================================================
        const getHistoryArr = (area) => area.history || area.historyUrls || area.results || [];
        const getHistoryIdx = (area) => area.historyIndex !== undefined ? area.historyIndex : (area.currentRecordIndex || 0);
        const getCurrentUrl = (area) => {
            const arr = getHistoryArr(area);
            const idx = getHistoryIdx(area);
            return area.resultUrl || (arr.length > 0 ? arr[idx] : null);
        };

        // --- 内容区事件 ---
        if (showContentGroup) {
            menuEl.querySelector('#sl-ctx-download').onclick = () => {
                menuEl.style.display = 'none';
                selectedAreaObjs.forEach(o => {
                    const url = getCurrentUrl(o.area);
                    if (url) downloadFile(url);
                });
            };

            menuEl.querySelector('#sl-ctx-download-all').onclick = () => {
                menuEl.style.display = 'none';
                selectedAreaObjs.forEach(o => {
                    const arr = getHistoryArr(o.area);
                    if (arr.length > 0) arr.forEach(url => downloadFile(url));
                    else if (o.area.resultUrl) downloadFile(o.area.resultUrl);
                });
            };

            // 【局部移除】：仅在当前模块内移除当前显示的媒体，绝不影响其他模块
            menuEl.querySelector('#sl-ctx-remove').onclick = () => {
                menuEl.style.display = 'none';
                selectedAreaObjs.forEach(o => {
                    const arr = getHistoryArr(o.area);
                    if (arr.length > 0) {
                        const idx = getHistoryIdx(o.area);
                        arr.splice(idx, 1);
                        const newIdx = Math.max(0, arr.length - 1);
                        if (o.area.historyIndex !== undefined) o.area.historyIndex = newIdx;
                        else if (o.area.currentRecordIndex !== undefined) o.area.currentRecordIndex = newIdx;
                        o.area.resultUrl = arr.length > 0 ? arr[newIdx] : null;
                    } else {
                        o.area.resultUrl = null;
                    }
                    if (o.area.selectedThumbIndices) o.area.selectedThumbIndices = []; // 清理选中状态
                });
                saveAndRender(); 
            };

            // 【全局移除并删除】：删除物理文件，并强制全局清空所有模块的该图残影
            menuEl.querySelector('#sl-ctx-remove-del').onclick = async () => {
                menuEl.style.display = 'none';
                let urlsToRemove = [];
                for (let o of selectedAreaObjs) {
                    const url = getCurrentUrl(o.area);
                    if (url) {
                        await deletePhysicalFile(url);
                        urlsToRemove.push(url);
                    }
                    
                    // 为了保证当前模块立刻生效，先执行一次局部移除
                    const arr = getHistoryArr(o.area);
                    if (arr.length > 0) {
                        const idx = getHistoryIdx(o.area);
                        arr.splice(idx, 1);
                        const newIdx = Math.max(0, arr.length - 1);
                        if (o.area.historyIndex !== undefined) o.area.historyIndex = newIdx;
                        else if (o.area.currentRecordIndex !== undefined) o.area.currentRecordIndex = newIdx;
                        o.area.resultUrl = arr.length > 0 ? arr[newIdx] : null;
                    } else {
                        o.area.resultUrl = null;
                    }
                    if (o.area.selectedThumbIndices) o.area.selectedThumbIndices = [];
                }
                
                // 然后交给全局引擎去清理其他模块的残影
                if (window.ShellLink && window.ShellLink.globalRemoveHistoryUrls) {
                    window.ShellLink.globalRemoveHistoryUrls(urlsToRemove); 
                } else {
                    saveAndRender();
                }
                showAutoToast("已移除并删除选中的媒体文件");
            };

            // 【局部清除】：仅清空当前模块的所有媒体，绝不影响其他模块
            menuEl.querySelector('#sl-ctx-clear').onclick = () => {
                menuEl.style.display = 'none';
                selectedAreaObjs.forEach(o => {
                    o.area.resultUrl = null;
                    if (o.area.history) o.area.history = [];
                    if (o.area.historyUrls) o.area.historyUrls = [];
                    if (o.area.results) o.area.results = [];
                    if (o.area.historyIndex !== undefined) o.area.historyIndex = 0;
                    if (o.area.currentRecordIndex !== undefined) o.area.currentRecordIndex = 0;
                    if (o.area.selectedThumbIndices) o.area.selectedThumbIndices = [];
                });
                saveAndRender(); 
            };

            // 【全局清除并删除】：删除当前模块所有物理文件，并强制全局清空残影
            menuEl.querySelector('#sl-ctx-clear-del').onclick = async () => {
                menuEl.style.display = 'none';
                let deleteCount = 0;
                let urlsToRemove = [];
                for (let o of selectedAreaObjs) {
                    const arr = getHistoryArr(o.area);
                    const allUrls = arr.length > 0 ? [...arr] : (o.area.resultUrl ? [o.area.resultUrl] : []);
                    for (let url of allUrls) {
                        await deletePhysicalFile(url);
                        urlsToRemove.push(url);
                        deleteCount++;
                    }
                    
                    // 当前模块立即清空
                    o.area.resultUrl = null;
                    if (o.area.history) o.area.history = [];
                    if (o.area.historyUrls) o.area.historyUrls = [];
                    if (o.area.results) o.area.results = [];
                    if (o.area.historyIndex !== undefined) o.area.historyIndex = 0;
                    if (o.area.currentRecordIndex !== undefined) o.area.currentRecordIndex = 0;
                    if (o.area.selectedThumbIndices) o.area.selectedThumbIndices = [];
                }
                
                // 全局清扫残影
                if (window.ShellLink && window.ShellLink.globalRemoveHistoryUrls) {
                    window.ShellLink.globalRemoveHistoryUrls(urlsToRemove); 
                } else {
                    saveAndRender();
                }
                showAutoToast(`已彻底清除并删除 ${deleteCount} 个本地文件`);
            };
        }

        // --- 模块区事件 ---
        menuEl.querySelector('#sl-ctx-select-same').onclick = () => { 
            menuEl.style.display = 'none'; 
            execSelectSameModules(selectedAreaObjs); 
        };
        menuEl.querySelector('#sl-ctx-del-same').onclick = () => { 
            menuEl.style.display = 'none'; 
            // 批量删除同名模块
            selectedAreaObjs.forEach(o => execDeleteSameModules(o.area, o.card));
        };
        menuEl.querySelector('#sl-ctx-move-back').onclick = () => { 
            menuEl.style.display = 'none'; 
            execMoveBackward(state.selectedAreaIds); 
        };
        menuEl.querySelector('#sl-ctx-move-fwd').onclick = () => { 
            menuEl.style.display = 'none'; 
            execMoveForward(state.selectedAreaIds); 
        };
    };

    // 5. 劫持旧的 Preview API（用于媒体元素内部点击）
    window.ShellLink.showPreviewContextMenu = (x, y, cardId, areaId, url) => {
        // 如果是格式刷模式，直接屏蔽菜单弹出，并且关闭格式刷状态
        if (state.painterMode) {
            state.painterMode = false;
            state.painterSource = null;
            saveAndRender();
            return;
        }

        // 如果右键的不是当前选中的模块之一，则重置选中为仅该模块
        if (!state.selectedAreaIds.includes(areaId)) {
            state.selectedAreaIds = [areaId];
            saveAndRender();
        }
        showMenu(x, y, areaId);
    };

    // 6. 模块容器通用右键监听（用于模块空白区域点击）
    panelContainer.addEventListener('contextmenu', (e) => {
        // 如果是格式刷模式，直接屏蔽菜单弹出，并且关闭格式刷状态
        if (state.painterMode) {
            e.preventDefault();
            e.stopPropagation();
            state.painterMode = false;
            state.painterSource = null;
            saveAndRender();
            return;
        }

        const areaEl = e.target.closest('.sl-area');
        if (!areaEl) return;

        const areaId = areaEl.dataset.areaId;
        
        // 逻辑同上：如果未选中则单选，已选中则保留多选
        if (!state.selectedAreaIds.includes(areaId)) {
            state.selectedAreaIds = [areaId];
            saveAndRender();
        }

        e.preventDefault(); 
        e.stopPropagation();
        showMenu(e.clientX, e.clientY, areaId);
    });
}