/**
 * 文件名: comp_contextmenu.js
 * 职责: 负责“输出模块”专属的全局右键菜单的生成、定位及核心记录管理逻辑
 */
import { state, saveAndRender } from "./ui_state.js";
import { execSyncParams, execSelectSameModules, execDeleteSameModules, execMoveBackward, execMoveForward } from "./actions/action_batch_sync.js";

let contextMenuEl = null;

export function showOutputContextMenu(e, card, area) {
    e.preventDefault();
    e.stopPropagation();

    // 1. 单例模式：创建或获取全局唯一的菜单 DOM
    if (!contextMenuEl) {
        contextMenuEl = document.createElement('div');
        contextMenuEl.id = 'sl-output-context-menu';
        contextMenuEl.className = 'sl-custom-select-dropdown';
        // 复用你的 UI 风格，加入适当的层级与阴影
        contextMenuEl.style.cssText = 'display:none; position:fixed; z-index:10005; min-width: 180px; padding: 4px 0; border: 1px solid #555; background: #2a2a2a; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); font-size: 13px;';
        document.body.appendChild(contextMenuEl);

        // 全局点击隐藏菜单
        document.addEventListener('mousedown', (evt) => {
            if (!contextMenuEl.contains(evt.target)) {
                contextMenuEl.style.display = 'none';
            }
        }, true);
    }

    // 2. 注入菜单 HTML (严格按照你的层级要求设计)
    contextMenuEl.innerHTML = `
        <div style="padding: 6px 10px 2px 10px; font-size: 11px; color: #888; font-weight: bold;">内容</div>
        <div class="sl-custom-select-item" id="ctx-download">⬇️ 下载</div>
        <div class="sl-custom-select-item" id="ctx-download-all">⏬ 下载全部生成记录</div>
        <div style="height: 1px; background: #444; margin: 4px 0;"></div>
        <div class="sl-custom-select-item" id="ctx-remove">➖ 移除</div>
        <div class="sl-custom-select-item" style="color:#ff4d4f;" id="ctx-remove-del">🗑️ 移除并删除本地文件</div>
        <div class="sl-custom-select-item" id="ctx-clear">🧹 清除</div>
        <div class="sl-custom-select-item" style="color:#ff4d4f;" id="ctx-clear-del">💣 清除并删除本地文件</div>

        <div style="padding: 10px 10px 2px 10px; font-size: 11px; color: #888; font-weight: bold;">模块</div>
        <div class="sl-custom-select-item" id="ctx-sync">🔄 同步参数</div>
        <div class="sl-custom-select-item" id="ctx-sel-same">🔲 选择相同模块</div>
        <div class="sl-custom-select-item" style="color:#ff4d4f;" id="ctx-del-same">❌ 删除相同模块</div>
        <div style="height: 1px; background: #444; margin: 4px 0;"></div>
        <div class="sl-custom-select-item" id="ctx-move-back">⏪ 批量向后移动</div>
        <div class="sl-custom-select-item" id="ctx-move-fwd">⏩ 批量向前移动</div>
    `;

    // 3. 计算坐标并显示 (防屏幕溢出)
    contextMenuEl.style.display = 'block';
    const rect = contextMenuEl.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    if (x + rect.width > window.innerWidth) x -= rect.width;
    if (y + rect.height > window.innerHeight) y -= rect.height;
    contextMenuEl.style.left = `${x}px`;
    contextMenuEl.style.top = `${y}px`;

    // -------------------------------------------------------------------------
    // 4. 核心功能逻辑区
    // -------------------------------------------------------------------------
    const hide = () => contextMenuEl.style.display = 'none';

    // 【辅助方法】下载单个文件
    const triggerDownload = (urlStr) => {
        if (!urlStr) return;
        const a = document.createElement('a');
        a.href = urlStr;
        try {
            const urlObj = new URL(urlStr, window.location.origin);
            a.download = urlObj.searchParams.get('filename') || 'download';
        } catch(e) { a.download = 'download'; }
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // 【辅助方法】调用后端 API 删除本地文件
    const deleteLocalFile = async (urlStr) => {
        if (!urlStr) return;
        try {
            const urlObj = new URL(urlStr, window.location.origin);
            const filename = urlObj.searchParams.get('filename');
            const subfolder = urlObj.searchParams.get('subfolder') || "";
            const type = urlObj.searchParams.get('type') || "output";

            if (filename) {
                await fetch('/shell_link/delete_file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, subfolder, type })
                });
            }
        } catch (err) { console.error("[ShellLink] 本地删除失败:", err); }
    };

    // --- 内容管理事件绑定 ---
    
    // 1. 下载当前
    contextMenuEl.querySelector('#ctx-download').onclick = (evt) => {
        evt.stopPropagation(); hide();
        triggerDownload(area.resultUrl);
    };

    // 2. 下载全部记录
    contextMenuEl.querySelector('#ctx-download-all').onclick = (evt) => {
        evt.stopPropagation(); hide();
        if (area.history && area.history.length > 0) {
            // 设置延时防止浏览器拦截批量下载
            area.history.forEach((url, idx) => {
                setTimeout(() => triggerDownload(url), idx * 200); 
            });
        }
    };

    // 3. 移除逻辑 (单张移除)
    const handleRemove = async (withDelete) => {
        if (!area.history || area.history.length === 0) return;
        const targetUrl = area.resultUrl;

        if (withDelete) await deleteLocalFile(targetUrl);

        const idx = area.history.findIndex(u => u === targetUrl);
        if (idx !== -1) {
            area.history.splice(idx, 1);
            if (area.history.length === 0) {
                area.resultUrl = '';
                area.historyIndex = 0;
            } else {
                area.historyIndex = Math.min(idx, area.history.length - 1);
                area.resultUrl = area.history[area.historyIndex];
            }
            saveAndRender();
        }
    };

    contextMenuEl.querySelector('#ctx-remove').onclick = (evt) => {
        evt.stopPropagation(); hide(); handleRemove(false);
    };
    contextMenuEl.querySelector('#ctx-remove-del').onclick = (evt) => {
        evt.stopPropagation(); hide(); handleRemove(true);
    };

    // 4. 清除逻辑 (清空全部历史)
    const handleClear = async (withDelete) => {
        if (!area.history || area.history.length === 0) return;
        
        if (withDelete) {
            // 并发删除所有本地文件
            await Promise.all(area.history.map(url => deleteLocalFile(url)));
        }

        area.history = [];
        area.historyIndex = 0;
        area.resultUrl = '';
        saveAndRender();
    };

    contextMenuEl.querySelector('#ctx-clear').onclick = (evt) => {
        evt.stopPropagation(); hide(); handleClear(false);
    };
    contextMenuEl.querySelector('#ctx-clear-del').onclick = (evt) => {
        evt.stopPropagation(); hide(); handleClear(true);
    };


    // --- 模块批处理事件绑定 (复用 action_batch_sync) ---
    contextMenuEl.querySelector('#ctx-sync').onclick = (evt) => {
        evt.stopPropagation(); hide(); execSyncParams(area, card);
    };
    contextMenuEl.querySelector('#ctx-sel-same').onclick = (evt) => {
        evt.stopPropagation(); hide(); execSelectSameModules([{area, card}]);
    };
    contextMenuEl.querySelector('#ctx-del-same').onclick = (evt) => {
        evt.stopPropagation(); hide(); execDeleteSameModules(area, card);
    };
    contextMenuEl.querySelector('#ctx-move-back').onclick = (evt) => {
        evt.stopPropagation(); hide(); execMoveBackward(state.selectedAreaIds);
    };
    contextMenuEl.querySelector('#ctx-move-fwd').onclick = (evt) => {
        evt.stopPropagation(); hide(); execMoveForward(state.selectedAreaIds);
    };
}