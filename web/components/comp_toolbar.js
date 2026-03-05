/**
 * 文件名: comp_toolbar.js
 * 路径: web/components/comp_toolbar.js
 * 职责: 顶部静态工具栏 UI 容器 - 极度瘦身，负责向外暴露组装好的 UI 与事件入口
 */
import { state, appState, saveAndRender } from "./ui_state.js";
import { attachDataIOEvents } from "./actions/action_data_io.js";
import { attachRunEvents } from "./actions/action_run_executor.js";
import { renderDynamicToolbar as renderDynamic, attachDynamicToolbarEvents as attachDynamic } from "./actions/action_module_config.js";
import { showBindingToast, hideBindingToast } from "./ui_utils.js";
import { StateManager } from "../state_manager.js";

// --- 初始化静态工具栏事件 (仅调用一次) ---
export function setupStaticToolbarEvents(panelContainer) {
    // 全局捕获器：彻底解决在模块上点击无法关闭下拉菜单的 Bug
    if (!window._slGlobalDropdownCatcher) {
        document.addEventListener('mousedown', (e) => {
            // 处理静态工具栏上的下拉菜单
            ['sl-import-json-wrapper', 'sl-export-json-wrapper', 'sl-run-btn-wrapper'].forEach(id => {
                const wrapper = document.getElementById(id);
                if (wrapper && !wrapper.contains(e.target)) {
                    const dp = wrapper.querySelector('.sl-custom-select-dropdown');
                    if (dp) dp.style.display = 'none';
                }
            });

            // 处理动态工具栏上的批量同步菜单
            const batchWrapper = document.getElementById('tb-batch-sync-btn')?.parentNode;
            if (batchWrapper && !batchWrapper.contains(e.target)) {
                const dp = document.getElementById('tb-batch-sync-dropdown');
                if (dp) dp.style.display = 'none';
            }

            // 处理所有的下拉选框 (关联节点、参数、填充模式等)
            if (!e.target.closest('.sl-custom-select')) {
                document.querySelectorAll('.sl-custom-select.open').forEach(el => {
                    el.classList.remove('open');
                    const area = el.closest('.sl-area');
                    if (area) area.style.zIndex = '';
                });
            }
        }, true);
        window._slGlobalDropdownCatcher = true;
    }

    // 新建任务
    panelContainer.querySelector("#sl-global-add-card").onclick = () => {
        let insertIndex = state.cards.length; 
        if (state.selectedCardIds && state.selectedCardIds.length > 0) {
            const idx = state.cards.findIndex(c => c.id === state.selectedCardIds[0]);
            if (idx !== -1) insertIndex = idx + 1;
        } else if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
            const cardIdx = state.cards.findIndex(c => c.areas?.some(a => a.id === state.selectedAreaIds[0]));
            if (cardIdx !== -1) insertIndex = cardIdx + 1;
        }

        const newCard = { id: 'card_' + Date.now(), title: ``, areas: [] };
        state.cards.splice(insertIndex, 0, newCard);
        
        state.selectedCardIds = [newCard.id];
        state.activeCardId = newCard.id;
        state.selectedAreaIds = [];
        appState.lastClickedCardId = newCard.id;
        saveAndRender();
        
        setTimeout(() => {
            const container = panelContainer.querySelector("#sl-cards-container");
            if (container) {
                const newCardEl = container.querySelector(`[data-card-id="${newCard.id}"]`);
                if (newCardEl) newCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }, 50);
    };

    // 新建模块
    panelContainer.querySelector("#sl-global-add-module").onclick = () => {
        let targetCard = null;
        let insertIndex = -1;
        
        if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
            const areaId = state.selectedAreaIds[0];
            targetCard = state.cards.find(c => c.areas?.some(a => a.id === areaId));
            if (targetCard) insertIndex = targetCard.areas.findIndex(a => a.id === areaId) + 1;
        } else if (state.selectedCardIds && state.selectedCardIds.length > 0) {
            targetCard = state.cards.find(c => c.id === state.selectedCardIds[0]);
            if (targetCard) insertIndex = targetCard.areas ? targetCard.areas.length : 0;
        }

        if (!targetCard) return alert("请先选中一个任务或模块，以确定新建位置！");

        if (!targetCard.areas) targetCard.areas = [];
        const templateArea = { id: 'area_' + Date.now() + '_' + Math.floor(Math.random() * 1000), type: 'edit', targetNodeId: null, targetWidget: null, value: '', dataType: 'string', autoHeight: true };
        targetCard.areas.splice(insertIndex, 0, templateArea);
        
        state.selectedAreaIds = [templateArea.id];
        state.selectedCardIds = [];
        saveAndRender();
        
        setTimeout(() => {
            const el = document.querySelector(`.sl-area[data-area-id="${templateArea.id}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    };

    // =========================================================================
    // 【关键修复 1】：加载顺序调整！
    // 必须先挂载“导入导出”和“运行”组件，再重构“配置锚点”按钮。
    // 这样能确保所有的按钮都平级插入到了 flex 容器中，彻底恢复正确的 gap 间距！
    // =========================================================================
    attachDataIOEvents(panelContainer);
    attachRunEvents(panelContainer);


    // =========================================================================
    // 【关键修复 2】：配置锚点 UI 重构与纯前端验证引擎
    // =========================================================================
    const configBtn = panelContainer.querySelector("#sl-btn-config");
    if (configBtn && !panelContainer.querySelector("#sl-config-btn-wrapper")) {
        // 去掉了手动写的 margin-left，原生外层的 flex gap 现在会完美生效
        configBtn.outerHTML = `
            <div id="sl-config-btn-wrapper" class="sl-btn-group" style="position:relative; display:inline-flex; align-items:stretch; height: 34px;">
                <button class="sl-btn" id="sl-btn-config" title="创建配置锚点 (将数据保存至工作流)" style="border-top-right-radius:0; border-bottom-right-radius:0; padding:0 10px; border-right:1px solid rgba(255,255,255,0.1); height: 100%; display: flex; align-items: center;">
                    ⚓ 创建配置锚点
                </button>
                <button class="sl-btn" id="sl-config-dropdown-trigger" style="border-top-left-radius:0; border-bottom-left-radius:0; width:24px; padding:0; display:flex; align-items:center; justify-content:center; height: 100%;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div id="sl-config-dropdown" class="sl-custom-select-dropdown" style="display:none; top:calc(100% + 4px); right:0; min-width:180px; z-index:10002;">
                    <div class="sl-custom-select-group-title" style="padding:6px 12px; font-size:11px; font-weight:bold; color:#888; background:rgba(255,255,255,0.03);">数据维护中心</div>
                    <div class="sl-custom-select-item" id="sl-maint-clean-dead">清理失效记录 (404)</div>
                    <div class="sl-custom-select-item" id="sl-maint-resync">重新同步记录 (强制刷新)</div>
                </div>
            </div>
        `;

        if (!window._slConfigDropdownCatcher) {
            document.addEventListener('mousedown', (e) => {
                const wrapper = document.getElementById('sl-config-btn-wrapper');
                if (wrapper && !wrapper.contains(e.target)) {
                    const dp = document.getElementById('sl-config-dropdown');
                    if (dp) dp.style.display = 'none';
                }
            }, true);
            window._slConfigDropdownCatcher = true;
        }

        const wrapper = panelContainer.querySelector("#sl-config-btn-wrapper");
        
        // 创建节点
        wrapper.querySelector("#sl-btn-config").onclick = () => {
            if(window.ShellLink) window.ShellLink.createNode();
        };

        // 展开菜单
        wrapper.querySelector("#sl-config-dropdown-trigger").onclick = (e) => {
            e.stopPropagation();
            const dropdown = wrapper.querySelector("#sl-config-dropdown");
            const isVisible = dropdown.style.display === 'block';
            document.querySelectorAll('.sl-custom-select-dropdown').forEach(d => d.style.display = 'none');
            dropdown.style.display = isVisible ? 'none' : 'block';
        };

        // 【超级功能升级】：重新同步记录 (使用时间戳破除缓存，强制浏览器重新下载本地磁盘文件)
        wrapper.querySelector("#sl-maint-resync").onclick = () => {
            wrapper.querySelector("#sl-config-dropdown").style.display = 'none';
            showBindingToast("🔄 正在强制重新拉取本地资产...", false);

            const now = Date.now();
            let syncCount = 0;

            state.cards.forEach(card => {
                card.areas?.filter(a => a.type === 'preview').forEach(area => {
                    // 更新 history 中的所有 URL，强行追加或替换时间戳 &t=...
                    if (area.history && area.history.length > 0) {
                        area.history = area.history.map(url => {
                            if (!url) return url;
                            try {
                                const urlObj = new URL(url, window.location.origin);
                                urlObj.searchParams.set('t', now); 
                                syncCount++;
                                return urlObj.pathname + urlObj.search;
                            } catch(e) { return url; }
                        });
                    }
                    // 更新当前显示的封面 URL
                    if (area.resultUrl) {
                        try {
                            const urlObj = new URL(area.resultUrl, window.location.origin);
                            urlObj.searchParams.set('t', now);
                            area.resultUrl = urlObj.pathname + urlObj.search;
                        } catch(e) {}
                    }
                });
            });

            if (syncCount === 0) {
                hideBindingToast();
                return alert("当前面板没有任何图像记录需要同步。");
            }

            saveAndRender();
            showBindingToast("✅ 缓存已清理，本地图像已重新加载！");
            setTimeout(hideBindingToast, 2000);
        };

        // 【超级重构】：清理失效记录 (使用纯前端 HEAD 试探验证，彻底告别 405 报错)
        wrapper.querySelector("#sl-maint-clean-dead").onclick = async () => {
            wrapper.querySelector("#sl-config-dropdown").style.display = 'none';
            showBindingToast("🔍 正在扫描失效记录，请稍候...", false);

            const areaMap = []; 

            // 1. 收集所有输出模块的历史记录链接
            state.cards.forEach(card => {
                card.areas?.filter(a => a.type === 'preview').forEach(area => {
                    if (area.history && area.history.length > 0) {
                        area.history.forEach((url) => {
                            if (url) areaMap.push({ areaId: area.id, url: url });
                        });
                    }
                });
            });

            if (areaMap.length === 0) {
                hideBindingToast();
                return alert("当前面板没有任何有效的生成记录需要清理。");
            }

            const deadItems = [];

            // 2. 纯前端的轻量级探针：使用无缓存的 HEAD 请求试探图片死活
            const checkPromises = areaMap.map(async (item) => {
                try {
                    // cache: 'no-store' 确保浏览器不使用残影缓存，真实去服务器问问文件还在不在
                    const res = await fetch(item.url, { method: 'HEAD', cache: 'no-store' });
                    // 只要服务器明确告诉我们 404，它就是彻底被删了
                    if (!res.ok && res.status === 404) {
                        deadItems.push(item);
                    }
                } catch (e) {
                    // 如果网络波动抛出异常，为了防止误杀心血，暂时不计入死链
                    console.warn("[ShellLink] 链接试探异常 (忽略该文件):", item.url);
                }
            });

            // 等待所有的探针检查完毕
            await Promise.all(checkPromises);

            // 3. 执行内存剔除与 UI 刷新
            if (deadItems.length === 0) {
                showBindingToast("✨ 扫描完毕：所有本地资产均完好无损！");
            } else {
                deadItems.forEach(item => {
                    state.cards.forEach(c => {
                        const area = c.areas?.find(a => a.id === item.areaId);
                        if (area && area.history) {
                            const idx = area.history.indexOf(item.url);
                            if (idx !== -1) {
                                area.history.splice(idx, 1);
                                // 如果这刚好是封面，顺带把封面也清掉
                                if (area.resultUrl === item.url) {
                                    area.resultUrl = area.history.length > 0 ? area.history[0] : "";
                                }
                            }
                        }
                    });
                });
                saveAndRender();
                showBindingToast(`🧹 清理完成：已彻底剔除 ${deadItems.length} 条丢失记录。`);
            }
            setTimeout(hideBindingToast, 3000);
        };
    }
}

export function renderDynamicToolbar(container) { renderDynamic(container); }
export function attachDynamicToolbarEvents(container) { attachDynamic(container); }