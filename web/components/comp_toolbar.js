/**
 * 文件名: comp_toolbar.js
 * 职责: 顶部静态工具栏 UI 容器
 */
import { state, appState, saveAndRender } from "./ui_state.js";
import { attachDataIOEvents } from "./actions/action_data_io.js";
import { attachRunEvents } from "./actions/action_run_executor.js";
import { renderDynamicToolbar as renderDynamic, attachDynamicToolbarEvents as attachDynamic } from "./actions/action_module_config.js";
import { showBindingToast, hideBindingToast } from "./ui_utils.js";
import { generateSingleCardHTML, attachCardEvents } from "./comp_taskcard.js";
import { generateAreaHTML, attachAreaEvents, justSave } from "./comp_modulearea.js";
import { updateSelectionUI } from "./ui_selection.js";

// --- 初始化静态工具栏事件 ---
export function setupStaticToolbarEvents(panelContainer) {
    if (!window._slGlobalDropdownCatcher) {
        document.addEventListener('mousedown', (e) => {
            ['sl-import-json-wrapper', 'sl-export-json-wrapper', 'sl-run-btn-wrapper'].forEach(id => {
                const wrapper = document.getElementById(id);
                if (wrapper && !wrapper.contains(e.target)) {
                    const dp = wrapper.querySelector('.sl-custom-select-dropdown');
                    if (dp) dp.style.display = 'none';
                }
            });
            const batchWrapper = document.getElementById('tb-batch-sync-btn')?.parentNode;
            if (batchWrapper && !batchWrapper.contains(e.target)) {
                const dp = document.getElementById('tb-batch-sync-dropdown');
                if (dp) dp.style.display = 'none';
            }
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

    // 【极速新建任务】：使用 insertAdjacentHTML 做外科手术拼贴
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
        
        const wrapper = panelContainer.querySelector('.sl-cards-wrapper');
        if (wrapper) {
            const temp = document.createElement('div');
            temp.innerHTML = generateSingleCardHTML(newCard, insertIndex);
            const newEl = temp.firstElementChild;
            
            if (insertIndex >= state.cards.length - 1) {
                const addBtn = wrapper.querySelector('.sl-add-card-inline');
                wrapper.insertBefore(newEl, addBtn);
            } else {
                const nextCard = state.cards[insertIndex + 1];
                const nextEl = wrapper.querySelector(`.sl-card[data-card-id="${nextCard.id}"]`);
                wrapper.insertBefore(newEl, nextEl);
            }
            attachCardEvents(wrapper);
        }

        justSave();
        updateSelectionUI();
        
        setTimeout(() => {
            const container = panelContainer.querySelector("#sl-cards-container");
            if (container) {
                const newCardEl = container.querySelector(`[data-card-id="${newCard.id}"]`);
                if (newCardEl) newCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }, 50);
    };

    // 【极速新建模块】：物理拼贴到对应的卡片容器中
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

        const cardBody = document.querySelector(`.sl-card[data-card-id="${targetCard.id}"] .sl-area-list`);
        if (cardBody) {
            const temp = document.createElement('div');
            temp.innerHTML = generateAreaHTML(templateArea, targetCard);
            const newEl = temp.firstElementChild;
            
            if (insertIndex >= targetCard.areas.length - 1) {
                cardBody.appendChild(newEl);
            } else {
                const nextArea = targetCard.areas[insertIndex + 1];
                const nextEl = cardBody.querySelector(`.sl-area[data-area-id="${nextArea.id}"]`);
                cardBody.insertBefore(newEl, nextEl);
            }
            attachAreaEvents(cardBody);
        }

        justSave();
        updateSelectionUI();
        
        setTimeout(() => {
            const el = document.querySelector(`.sl-area[data-area-id="${templateArea.id}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    };

    attachDataIOEvents(panelContainer);
    attachRunEvents(panelContainer);

    const configBtn = panelContainer.querySelector("#sl-btn-config");
    if (configBtn && !panelContainer.querySelector("#sl-config-btn-wrapper")) {
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
        
        wrapper.querySelector("#sl-btn-config").onclick = () => {
            if(window.ShellLink) window.ShellLink.createNode();
        };

        wrapper.querySelector("#sl-config-dropdown-trigger").onclick = (e) => {
            e.stopPropagation();
            const dropdown = wrapper.querySelector("#sl-config-dropdown");
            const isVisible = dropdown.style.display === 'block';
            document.querySelectorAll('.sl-custom-select-dropdown').forEach(d => d.style.display = 'none');
            dropdown.style.display = isVisible ? 'none' : 'block';
        };

        // 清理缓存重置（此功能本就代表用户需要彻底刷新，所以保留全量重绘）
        wrapper.querySelector("#sl-maint-resync").onclick = () => {
            wrapper.querySelector("#sl-config-dropdown").style.display = 'none';
            showBindingToast("🔄 正在强制重新拉取本地资产...", false);
            const now = Date.now();
            let syncCount = 0;
            state.cards.forEach(card => {
                card.areas?.filter(a => a.type === 'preview').forEach(area => {
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

        wrapper.querySelector("#sl-maint-clean-dead").onclick = async () => {
            wrapper.querySelector("#sl-config-dropdown").style.display = 'none';
            showBindingToast("🔍 正在扫描失效记录，请稍候...", false);
            const areaMap = []; 
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
            const checkPromises = areaMap.map(async (item) => {
                try {
                    const res = await fetch(item.url, { method: 'HEAD', cache: 'no-store' });
                    if (!res.ok && res.status === 404) deadItems.push(item);
                } catch (e) {}
            });
            await Promise.all(checkPromises);
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