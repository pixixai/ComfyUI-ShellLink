/**
 * ui_panel.js：【主入口】负责组装组件、处理全局生命周期事件。
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"; 
import { state, appState, saveAndRender } from "./components/ui_state.js";
import { injectCSS, showBindingToast, hideBindingToast, getWidgetDef } from "./components/ui_utils.js";
import { setupStaticToolbarEvents, renderDynamicToolbar, attachDynamicToolbarEvents } from "./components/comp_toolbar.js";
import { renderCardsList, attachCardEvents } from "./components/comp_taskcard.js";
import { attachAreaEvents } from "./components/comp_modulearea.js";
// 【核心修复1】：彻底删除了此处的静态 import { setupContextMenu }，防止因找不到文件导致整个插件熔断瘫痪

console.log("[ShellLink] UI 拆分重构版本已被成功导入 (极速响应安全版)");

let panelContainer = null;
let backdropContainer = null;

export function setupUI() {
    injectCSS(); 
    
    const overrideStyle = document.createElement("style");
    overrideStyle.innerHTML = `
        .sl-custom-select-item:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
            color: #ffffff !important;
        }

        /* ====== 【修复】：让下拉菜单自适应内容宽度，防止长节点名换行 ====== */
        .sl-custom-select-dropdown {
            width: max-content !important;
        }
        .sl-custom-select-group-title {
            white-space: nowrap !important;
        }
        /* ============================================================= */

        #shell-link-panel {
            --sl-card-width: 320px;
        }
        #shell-link-panel .sl-card {
            width: var(--sl-card-width) !important;
            min-width: var(--sl-card-width) !important;
            max-width: var(--sl-card-width) !important;
            transition: width 0.1s ease, min-width 0.1s ease, max-width 0.1s ease;
        }
        #sl-card-width-input::-webkit-outer-spin-button,
        #sl-card-width-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        #sl-card-width-input[type=number] {
            -moz-appearance: textfield;
        }
        
        /* ========================================================================= */
        /* 右键菜单独立样式 (完美对齐导出选项菜单) */
        /* ========================================================================= */
        .sl-context-menu {
            background: #2a2a2a;
            border: 1px solid #555;
            border-radius: 6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            padding: 4px 0;
            font-family: sans-serif;
            z-index: 10005;
        }
        .sl-context-menu-title {
            padding: 8px 12px;
            font-size: 12px;
            line-height: 1;
            color: #aaa;
            font-weight: bold;
            background: rgba(255,255,255,0.08);
            margin: 0;
            pointer-events: none;
        }
        .sl-context-menu-item {
            padding: 8px 12px;
            font-size: 12px;
            line-height: 1;
            color: #eee;
            cursor: pointer;
            transition: background 0.1s;
            display: flex;
            align-items: center;
        }
        .sl-context-menu-item:hover {
            background-color: rgba(255, 255, 255, 0.15);
            color: #ffffff;
        }
        .sl-context-menu-item.sl-danger {
            color: #ff4d4f;
        }
        .sl-context-menu-item.sl-danger:hover {
            background-color: #ff4d4f;
            color: #ffffff;
        }
        .sl-context-menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 4px 12px;
        }
    `;
    document.head.appendChild(overrideStyle);

    try {
        if (!panelContainer) {
            createPanelDOM();
            setupGlobalEventListeners();
            if (backdropContainer) document.body.appendChild(backdropContainer);
            document.body.appendChild(panelContainer);
            
            // 【核心修复2】：采用“动态异步加载”挂载右键菜单。
            // 这样即使你本地还没建好 comp_contextmenu.js 文件，或者文件里有报错，主界面也能 100% 正常打开！
            import("./components/comp_contextmenu.js").then(module => {
                module.setupContextMenu(panelContainer);
            }).catch(err => {
                console.warn("[ShellLink] 提示：右键菜单模块未找到或内部存在错误，右键功能暂不生效，详情见下方报错：", err);
            });
        }

        if (app.extensionManager && app.extensionManager.registerSidebarTab) {
            app.extensionManager.registerSidebarTab({
                id: "shellLinkSidebar",
                icon: "pi pi-sliders-v shell-link-sidebar-icon", 
                title: "ShellLink 控制台",
                tooltip: "打开 ShellLink 主面板 (快捷键 S)",
                type: "custom",
                render: (el) => {}
            });
            
            const globalSidebarHijacker = (e) => {
                let isOurTab = false;
                
                const tabBtn = e.target.closest('.p-tabview-nav-link, [role="tab"], li');
                const isOurIcon = e.target.classList && e.target.classList.contains('shell-link-sidebar-icon');
                
                if (isOurIcon || (tabBtn && tabBtn.querySelector('.shell-link-sidebar-icon'))) {
                    isOurTab = true;
                }

                if (isOurTab) {
                    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                    if (e.type === 'click') togglePanel();
                }
            };

            window.addEventListener('pointerdown', globalSidebarHijacker, true);
            window.addEventListener('pointerup', globalSidebarHijacker, true);
            window.addEventListener('mousedown', globalSidebarHijacker, true);
            window.addEventListener('mouseup', globalSidebarHijacker, true);
            window.addEventListener('click', globalSidebarHijacker, true);
        }
    } catch (error) {
        console.error("[ShellLink] UI 面板初始化失败:", error);
    }
}

export function togglePanel() {
    if (!panelContainer) return;
    const isVisible = panelContainer.classList.contains('visible');
    if (isVisible) {
        panelContainer.classList.remove('visible');
        if (backdropContainer) backdropContainer.classList.remove('visible');
        state.painterMode = false;
        state.painterSource = null;
    } else {
        panelContainer.classList.add('visible');
        if (backdropContainer) backdropContainer.classList.add('visible');
        performRender(); 
    }
}

document.addEventListener("sl_render_ui", () => {
    performRender();
});

function performRender() {
    if (!panelContainer) return;
    const toolbarHandle = panelContainer.querySelector('#sl-toolbar-handle');
    const cardsContainer = panelContainer.querySelector('#sl-cards-container');
    renderDynamicToolbar(toolbarHandle);
    renderCardsList(cardsContainer);
    attachDynamicToolbarEvents(toolbarHandle);
    attachCardEvents(cardsContainer);
    attachAreaEvents(cardsContainer);
}

function createPanelDOM() {
    backdropContainer = document.createElement("div");
    backdropContainer.id = "sl-backdrop";
    backdropContainer.onclick = () => {
        if (!appState.isBindingMode) togglePanel();
    };

    panelContainer = document.createElement("div");
    panelContainer.id = "shell-link-panel";
    
    panelContainer.innerHTML = `
        <div class="sl-toolbar" id="sl-toolbar-handle">
            <div style="display:flex; gap:10px; align-items:center;">
                <button class="sl-btn" id="sl-global-add-card" title="新建空白任务卡片">+ 新建任务</button>
                <button class="sl-btn" id="sl-global-add-module" title="在当前任务内添加新模块">+ 新建模块</button>
                <div id="sl-module-toolbar-separator" style="width:1px; height:20px; background:rgba(255,255,255,0.2); margin:0 5px; display:none;"></div>
                <div id="sl-module-toolbar" style="display:none; align-items:center; gap:12px;"></div>
            </div>

            <div style="display:flex; gap:10px; align-items:center; margin-left:auto;">
                <div id="sl-run-btn-wrapper" class="sl-run-wrapper">
                    <button class="sl-btn run-btn-main" id="sl-btn-run" title="按规则运行选中任务 (局部)">▶ 运行</button>
                    <div style="width:1px; height:16px; background:rgba(255,255,255,0.4); margin: 0 4px; align-self: center;"></div>
                    <button class="sl-btn run-btn-toggle" id="sl-run-dropdown-toggle" title="展开更多运行选项">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div id="sl-run-dropdown-menu" class="sl-custom-select-dropdown" style="display:none; top: calc(100% + 4px); right: 0; left: auto; min-width: 140px; z-index: 10002;">
                        <div class="sl-custom-select-item" id="sl-btn-run-all" style="display:flex; align-items:center; gap:8px;">
                            <svg width="15" height="15" viewBox="0 0 17.08 15.01" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6.63,6.6L1.95,2.64c-.77-.65-1.95-.11-1.95.91v7.93c0,1.01,1.18,1.56,1.95.91l4.68-3.96c.56-.47.56-1.34,0-1.81Z"/>
                                <path d="M16.74,6.77L9.02.23c-.63-.53-1.59-.09-1.59.74v13.07c0,.82.96,1.27,1.59.74l7.72-6.54c.46-.39.46-1.09,0-1.48Z"/>
                            </svg>
                            运行全部
                        </div>
                    </div>
                </div>
                <button class="sl-btn" id="sl-btn-config" title="在画布创建配置节点">⚓ 创建配置锚点</button>
            </div>
        </div>
        <div class="sl-cards-container" id="sl-cards-container"></div>

        <div id="sl-card-width-ctrl" style="position: absolute; bottom: 16px; left: 16px; z-index: 1000; display: flex; align-items: center; gap: 8px; transition: opacity 0.2s;">
            <svg id="sl-card-width-reset" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="恢复默认宽度" style="cursor: pointer; transition: stroke 0.2s;" onmouseover="this.style.stroke='#fff'" onmouseout="this.style.stroke='#888'">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
            <input type="range" id="sl-card-width-slider" min="260" max="600" value="320" style="width: 80px; accent-color: #888; cursor: pointer; height: 4px; background: rgba(255,255,255,0.2); outline: none; border-radius: 2px; -webkit-appearance: none;">
            <input type="number" id="sl-card-width-input" title="手动输入宽度 (回车确认)" style="width: 36px; background: transparent; border: none; color: #888; font-size: 12px; outline: none; text-align: left; padding: 0; margin: 0; font-family: sans-serif; transition: color 0.2s;" onfocus="this.style.color='#fff'" onblur="this.style.color='#888'">
        </div>
    `;

    setupStaticToolbarEvents(panelContainer);

    panelContainer.addEventListener("click", (e) => {
        if (!state.painterMode) return;
        if (e.target.closest('#tb-format-painter')) return;
        const isToolbar = e.target.closest('#sl-toolbar-handle');
        const isAddCardBtn = e.target.closest('.sl-add-card-inline');

        if (isToolbar || isAddCardBtn) {
            state.painterMode = false;
            state.painterSource = null;
            panelContainer.classList.remove('sl-painter-active');
        }
    }, true);

    const cardsContainer = panelContainer.querySelector("#sl-cards-container");
    const toolbar = panelContainer.querySelector("#sl-toolbar-handle");
    
    cardsContainer.addEventListener("mousedown", (e) => {
        if (state.painterMode) return; 
        const cardEl = e.target.closest('.sl-card:not(.sl-add-card-inline)');
        if (cardEl && cardEl.dataset.cardId) {
            const targetId = cardEl.dataset.cardId;
            if (state.activeCardId !== targetId) state.activeCardId = targetId;
        }
    }, true); 

    const handleDeselectAll = (forceExitPainter = false) => {
        const openDropdowns = document.querySelectorAll('.sl-custom-select.open');
        if (openDropdowns.length > 0) {
            openDropdowns.forEach(el => el.classList.remove('open'));
            return; 
        }
        let changed = false;
        if (forceExitPainter && state.painterMode) {
            state.painterMode = false;
            state.painterSource = null;
            changed = true;
        }
        if (state.selectedCardIds && state.selectedCardIds.length > 0) {
            state.selectedCardIds = [];
            state.activeCardId = null;
            changed = true;
        }
        if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
            state.selectedAreaIds = [];
            changed = true;
        }
        if(changed) saveAndRender();
    };

    cardsContainer.addEventListener("click", (e) => {
        if (state.painterMode && state.painterSource?.type === 'area') return;
        if (state.painterMode && state.painterSource?.type === 'card' && !e.target.closest('.sl-card')) {
            let insertIndex = state.cards.length;
            const cardEls = cardsContainer.querySelectorAll('.sl-card:not(.sl-add-card-inline)');
            for (let i = 0; i < cardEls.length; i++) {
                const rect = cardEls[i].getBoundingClientRect();
                if (e.clientX < rect.left + rect.width / 2) { insertIndex = i; break; }
            }
            const newCard = JSON.parse(JSON.stringify(state.painterSource.data));
            newCard.id = 'card_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            if (newCard.areas) newCard.areas.forEach(a => a.id = 'area_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
            state.cards.splice(insertIndex, 0, newCard);
            saveAndRender();
            return;
        }
        if (e.target === cardsContainer) handleDeselectAll(false);
    });

    toolbar.addEventListener("click", (e) => {
        const isInteractive = ['BUTTON', 'INPUT', 'LABEL', 'SELECT'].includes(e.target.tagName) || 
                              e.target.closest('button, input, label, select, .sl-custom-select, .sl-type-btn');
        if (!isInteractive) handleDeselectAll(true);
    });

    cardsContainer.addEventListener("wheel", (e) => {
        if (e.deltaY === 0) return;
        let isInsideVerticalScrollable = false;
        let elem = e.target;
        while (elem && elem !== cardsContainer) {
            if (elem.scrollHeight > elem.clientHeight) {
                const style = window.getComputedStyle(elem);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    const isAtTop = elem.scrollTop === 0;
                    const isAtBottom = Math.abs(elem.scrollHeight - elem.scrollTop - elem.clientHeight) < 1;
                    if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
                        isInsideVerticalScrollable = true; break;
                    }
                }
            }
            elem = elem.parentNode;
        }
        if (!isInsideVerticalScrollable) {
            e.preventDefault(); 
            cardsContainer.scrollLeft += Math.sign(e.deltaY) * 360;
        }
    }, { passive: false });

    makePanelDraggable();

    const widthSlider = panelContainer.querySelector('#sl-card-width-slider');
    const widthInput = panelContainer.querySelector('#sl-card-width-input');
    const widthResetBtn = panelContainer.querySelector('#sl-card-width-reset');
    const widthCtrlNode = panelContainer.querySelector('#sl-card-width-ctrl');
    
    if (widthSlider && widthInput && widthResetBtn) {
        const savedWidth = localStorage.getItem('shelllink-card-width') || '320';
        widthSlider.value = savedWidth <= 600 ? savedWidth : 600; 
        widthInput.value = savedWidth;
        panelContainer.style.setProperty('--sl-card-width', `${savedWidth}px`);

        const updateWidth = (val) => {
            let numVal = parseInt(val, 10);
            if (isNaN(numVal)) numVal = 320;
            if (numVal < 260) numVal = 260; 
            if (numVal > 1200) numVal = 1200; 

            widthSlider.value = Math.min(numVal, 600); 
            widthInput.value = numVal;
            panelContainer.style.setProperty('--sl-card-width', `${numVal}px`);
            localStorage.setItem('shelllink-card-width', numVal);
        };

        widthSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = e.target.value;
            widthInput.value = val;
            panelContainer.style.setProperty('--sl-card-width', `${val}px`);
        });

        widthSlider.addEventListener('change', (e) => {
            updateWidth(e.target.value);
        });

        widthInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.target.blur(); 
            }
        });
        widthInput.addEventListener('blur', (e) => {
            updateWidth(e.target.value);
        });

        widthResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateWidth(320);
        });

        const stopProp = e => e.stopPropagation();
        widthSlider.addEventListener('mousedown', stopProp);
        widthInput.addEventListener('mousedown', stopProp);
        widthResetBtn.addEventListener('mousedown', stopProp);
        if (widthCtrlNode) {
            widthCtrlNode.addEventListener('mousedown', stopProp);
            widthCtrlNode.addEventListener('click', stopProp);
        }
    }

    // 【新增】：核心的“幽灵文件”防碎图清理机制（向外暴露给媒体标签的 onerror 属性）
    window.ShellLink.handleMediaError = (cardId, areaId, failedUrl) => {
        const card = state.cards.find(c => c.id === cardId);
        const area = card?.areas.find(a => a.id === areaId);
        if (area && area.history && area.history.length > 0) {
            // 利用路径匹配避免跨域编码差异
            const failedPath = new URL(failedUrl, window.location.origin).pathname + new URL(failedUrl, window.location.origin).search;
            const idx = area.history.findIndex(hUrl => {
                const hPath = new URL(hUrl, window.location.origin).pathname + new URL(hUrl, window.location.origin).search;
                return hPath === failedPath;
            });
            
            if (idx !== -1) {
                area.history.splice(idx, 1);
                if (area.history.length === 0) {
                    area.resultUrl = '';
                    area.historyIndex = 0;
                } else {
                    // 如果删掉的是最后一张，索引往前退一位；否则保持原位（自动顶上来一张新的）
                    area.historyIndex = Math.min(idx, area.history.length - 1);
                    area.resultUrl = area.history[area.historyIndex];
                }
                setTimeout(() => saveAndRender(), 10);
            } else if (area.resultUrl === failedUrl) {
                // 异常兜底保护
                area.resultUrl = '';
                setTimeout(() => saveAndRender(), 10);
            }
        } else if (area && area.resultUrl === failedUrl) {
             area.resultUrl = '';
             setTimeout(() => saveAndRender(), 10);
        }
    };
}

function makePanelDraggable() {
    const handle = panelContainer.querySelector('#sl-toolbar-handle');
    let isDragging = false, offsetX = 0, offsetY = 0;

    handle.addEventListener('mousedown', (e) => {
        if (['BUTTON', 'SELECT', 'INPUT', 'LABEL'].includes(e.target.tagName) || e.target.closest('button, select, input, label, .sl-custom-select')) return;
        isDragging = true;
        const rect = panelContainer.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panelContainer.style.left = (e.clientX - offsetX) + 'px';
        panelContainer.style.top = (e.clientY - offsetY) + 'px';
        panelContainer.style.right = 'auto'; 
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = '';
        }
    });
}

// =====================================================================================
// 🎯 核心 UI 进度条引擎
// =====================================================================================

const setUIProgress = (cardId, percentage, isHide = false, isError = false) => {
    const progContainer = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${cardId}"]`);
    if (!progContainer) return;
    const bar = progContainer.querySelector('.sl-card-progress-bar');
    if (!bar) return;

    if (isError) {
        progContainer.style.opacity = '1';
        bar.classList.add('error');
        bar.style.setProperty('transition', 'none', 'important'); 
        bar.style.setProperty('width', '100%', 'important');
    } else if (isHide) {
        if (!bar.classList.contains('error')) {
            progContainer.style.opacity = '0';
            setTimeout(() => {
                if (!bar.classList.contains('error')) {
                    bar.style.setProperty('transition', 'none', 'important');
                    bar.style.setProperty('width', '0%', 'important');
                }
            }, 300);
        }
    } else {
        progContainer.style.opacity = '1';
        if (!bar.classList.contains('error')) {
            bar.style.setProperty('transition', 'width 0.3s ease-out', 'important');
            bar.style.setProperty('width', `${percentage}%`, 'important');
        }
    }
};

const bumpUIProgress = (cardId) => {
    const bar = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${cardId}"] .sl-card-progress-bar`);
    if (bar && !bar.classList.contains('error')) {
        let currentW = parseFloat(bar.style.width) || 5;
        if (currentW < 90) {
            bar.style.setProperty('transition', 'width 0.3s ease-out', 'important');
            bar.style.setProperty('width', `${currentW + (100 - currentW) * 0.15}%`, 'important');
        }
    }
};

function setupGlobalEventListeners() {
    window.addEventListener('contextmenu', (e) => {
        if (appState.isBindingMode) {
            e.preventDefault(); 
            e.stopPropagation();
            return;
        }

        if (state.painterMode) {
            e.preventDefault(); e.stopPropagation();
            state.painterMode = false;
            state.painterSource = null;
            saveAndRender();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (appState.isBindingMode) return; 
        if (e.key === 'Escape' && state.painterMode) {
            state.painterMode = false;
            state.painterSource = null;
            saveAndRender();
            return;
        }

        // 【新增】：历史记录键盘导航逻辑 (左与右)
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.selectedAreaIds.length === 1) {
            // 防误触：如果你正在输入框里打字，绝对不要切换图片！
            if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            
            const areaId = state.selectedAreaIds[0];
            let targetArea = null;
            for (const c of state.cards) {
                const a = c.areas?.find(x => x.id === areaId);
                if (a) { targetArea = a; break; }
            }
            
            // 执行丝滑切换
            if (targetArea && targetArea.type === 'preview' && targetArea.history && targetArea.history.length > 1) {
                e.preventDefault(); // 阻止页面可能发生的滚动
                let idx = targetArea.historyIndex !== undefined ? targetArea.historyIndex : targetArea.history.length - 1;
                
                if (e.key === 'ArrowLeft') {
                    idx = Math.max(0, idx - 1);
                } else {
                    idx = Math.min(targetArea.history.length - 1, idx + 1);
                }
                
                if (targetArea.historyIndex !== idx) {
                    targetArea.historyIndex = idx;
                    targetArea.resultUrl = targetArea.history[idx];
                    saveAndRender();
                }
                return;
            }
        }

        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
        if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            togglePanel();
        }
    });

    // ---------------------------------------------------------------------------------
    // 🚥 原生事件流水线监听器
    // ---------------------------------------------------------------------------------
    let currentExecutingCardId = null;

    document.addEventListener('sl_execution_start', (e) => {
        const tasks = e.detail.tasks || [];
        tasks.forEach(task => {
            const bar = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${task.cardId}"] .sl-card-progress-bar`);
            if (bar) bar.classList.remove('error'); 
            setUIProgress(task.cardId, 5);
        });
    });

    document.addEventListener('sl_execution_error', (e) => {
        const cardId = e.detail?.cardId;
        if (cardId) setUIProgress(cardId, 100, false, true);
    });

    api.addEventListener("execution_start", (e) => {
        const pid = e.detail?.prompt_id;
        if (pid && window.ShellLink && window._slLastGeneratedTask && !window._slTaskMap[pid]) {
            window._slTaskMap[pid] = window._slLastGeneratedTask;
            window._slLastGeneratedTask = null;
        }
        const task = window._slTaskMap[pid];
        if (task) {
            currentExecutingCardId = task.cardId;
            setUIProgress(task.cardId, 5);
        }
    });

    api.addEventListener("progress_state", (e) => {
        const pid = e.detail?.prompt_id;
        const task = window._slTaskMap[pid];
        const cardId = task ? task.cardId : currentExecutingCardId;
        if (cardId && e.detail.nodes) {
            let total = 0, done = 0;
            for (const nid in e.detail.nodes) {
                total += e.detail.nodes[nid].max || 0;
                done += e.detail.nodes[nid].value || 0;
            }
            if (total > 0) setUIProgress(cardId, Math.max(5, (done / total) * 100));
        }
    });

    api.addEventListener("progress", (e) => {
        if (currentExecutingCardId) {
            const { value, max } = e.detail;
            if (max > 0) setUIProgress(currentExecutingCardId, Math.max(5, (value / max) * 100));
        }
    });

    api.addEventListener("executing", (e) => {
        const pid = e.detail?.prompt_id;
        const task = window._slTaskMap[pid];
        const cardId = task ? task.cardId : currentExecutingCardId;
        
        if (cardId) {
            if (e.detail.node) {
                bumpUIProgress(cardId);
            } else {
                setUIProgress(cardId, 100);
                setTimeout(() => setUIProgress(cardId, 0, true), 500);
                if (currentExecutingCardId === cardId) currentExecutingCardId = null;
            }
        }
    });

    // 【新增】：利用核心任务池拦截 Executed 事件，自动将后端返回的文件推入历史数组，彻底独立于各种复杂的老代码
    api.addEventListener("executed", (event) => {
        const detail = event.detail;
        const executedNodeId = detail.node;     
        const outputData = detail.output;       
        const prompt_id = detail.prompt_id; 

        const task = (window._slTaskMap && prompt_id) ? window._slTaskMap[prompt_id] : null;
        if (!task) return;

        const card = state.cards.find(c => c.id === task.cardId);
        if (!card || !card.areas) return;

        card.areas.filter(a => a.type === 'preview').forEach(area => {
            if (task.previewAreaIds && task.previewAreaIds.length > 0) {
                if (!task.previewAreaIds.includes(area.id)) return;
            }

            if (String(area.targetNodeId) === String(executedNodeId)) {
                let newUrl = null;
                // 【核心同步】：支持提取历史记录中的 outputData.audio
                let targetItems = null;
                if (outputData.videos && outputData.videos.length > 0) targetItems = outputData.videos;
                else if (outputData.audio && outputData.audio.length > 0) targetItems = outputData.audio;
                else if (outputData.gifs && outputData.gifs.length > 0) targetItems = outputData.gifs;
                else if (outputData.images && outputData.images.length > 0) targetItems = outputData.images;

                if (targetItems && targetItems.length > 0) {
                    const media = targetItems[0];
                    const params = new URLSearchParams({ filename: media.filename, type: media.type, subfolder: media.subfolder || "" });
                    newUrl = api.apiURL(`/view?${params.toString()}`);
                }
                
                if (newUrl) {
                    if (!area.history) area.history = [];
                    if (area.history.length === 0 || area.history[area.history.length - 1] !== newUrl) {
                        area.history.push(newUrl);
                    }
                    area.historyIndex = area.history.length - 1;
                }
            }
        });
    });

    const handleCached = (e) => {
        const pid = e.detail?.prompt_id;
        if (pid && !window._slTaskMap[pid] && window._slLastGeneratedTask) {
            window._slTaskMap[pid] = window._slLastGeneratedTask;
            window._slLastGeneratedTask = null;
        }
        const task = window._slTaskMap[pid];
        const cardId = task ? task.cardId : currentExecutingCardId;
        if (cardId) {
            setUIProgress(cardId, 100);
            setTimeout(() => setUIProgress(cardId, 0, true), 500);
        }
    };
    api.addEventListener("execution_cached", handleCached);
    api.addEventListener("cached", handleCached);

    api.addEventListener("execution_error", (e) => {
        const pid = e.detail?.prompt_id;
        const task = window._slTaskMap[pid];
        const cardId = task ? task.cardId : currentExecutingCardId;
        if (cardId) setUIProgress(cardId, 100, false, true);
    });

    api.addEventListener("status", (e) => {
        if (e.detail?.exec_info?.queue_remaining === 0) {
            setTimeout(() => {
                document.querySelectorAll('.sl-card-progress-container').forEach(container => {
                    const bar = container.querySelector('.sl-card-progress-bar');
                    if (bar && !bar.classList.contains('error')) {
                        container.style.opacity = '0';
                        setTimeout(() => {
                            bar.style.setProperty('transition', 'none', 'important');
                            bar.style.setProperty('width', '0%', 'important');
                        }, 300);
                    }
                });
            }, 500);
        }
    });

    // ---------------------------------------------------------------------------------

    document.addEventListener("shell_link_update_preview", (e) => {
        const { cardId, areaId, url } = e.detail;
        const areaEl = document.querySelector(`.sl-area[data-area-id="${areaId}"]`);
        if (areaEl) {
            const mediaEl = areaEl.querySelector('.sl-preview-img');
            
            if (!mediaEl) {
                document.dispatchEvent(new CustomEvent("sl_render_ui"));
                return;
            }

            const placeholder = areaEl.querySelector('.sl-preview-placeholder');
            
            const isVideo = url.toLowerCase().match(/\.(mp4|webm|mov|avi|mkv)$/);
            const isAudio = url.toLowerCase().match(/\.(mp3|wav|ogg|flac|aac|m4a)$/);
            
            const tagName = mediaEl.tagName.toLowerCase();
            const isImgTag = tagName === 'img';
            const isVidTag = tagName === 'video';
            const isAudTag = tagName === 'audio';
            
            // 【核心修复】：如果你上一次生成的是图片，这次是音频，DOM 标签 (img 和 audio) 根本不匹配！
            // 此时最安全的做法是：直接触发 sl_render_ui 让 module_media 重新生成对应组件的播放器
            if ((isVideo && !isVidTag) || (isAudio && !isAudTag) || (!isVideo && !isAudio && !isImgTag)) {
                document.dispatchEvent(new CustomEvent("sl_render_ui"));
                return;
            }

            // 如果媒体类型没变，直接替换 src 实现无感更新
            mediaEl.src = url;
            mediaEl.style.display = "block";
            
            if (placeholder) placeholder.style.display = "none";
        }
    });

    document.addEventListener("shell_link_state_loaded", (e) => {
        const loadedState = e.detail || { cards: [], activeCardId: null, selectedCardIds: [], selectedAreaIds: [] };
        Object.assign(state, loadedState);
        if (!state.selectedCardIds) state.selectedCardIds = state.activeCardId ? [state.activeCardId] : [];
        if (!state.selectedAreaIds) state.selectedAreaIds = [];
        state.painterMode = false;
        state.painterSource = null;
        
        state.cards.forEach(card => {
            if (!card.areas) {
                card.areas = [];
                if (card.previewAreas) { card.areas.push(...card.previewAreas.map(a => ({...a, type: 'preview', matchMedia: false, ratio: '16:9'}))); delete card.previewAreas; }
                if (card.editAreas) { card.areas.push(...card.editAreas.map(a => ({...a, type: 'edit', dataType: 'string', autoHeight: true}))); delete card.editAreas; }
            }
        });

        if(panelContainer.classList.contains('visible')) performRender();
    });

    document.addEventListener("shell_link_state_cleared", () => {
        Object.assign(state, { cards: [], activeCardId: null, selectedCardIds: [], selectedAreaIds: [], painterMode: false, painterSource: null });
        if(panelContainer.classList.contains('visible')) performRender();
    });

    document.addEventListener('sl_enter_binding_mode', (e) => {
        enterBindingModeForSelected(e.detail);
    });
}

function enterBindingModeForSelected(targetType) {
    if (!state.selectedAreaIds || state.selectedAreaIds.length === 0) return;

    appState.isBindingMode = true;
    panelContainer.classList.remove('visible');
    if (backdropContainer) backdropContainer.classList.remove('visible');
    
    showBindingToast("🖱️ 请在工作流中点击节点 (左键=替换，右键=追加，点击空白处取消)...");
    
    if (app.canvas) {
        app.canvas.deselectAllNodes();
        
        if (!app.canvas._slHijackedContextMenu) {
            const origProcessContextMenu = app.canvas.processContextMenu;
            app.canvas.processContextMenu = function() {
                if (appState.isBindingMode) return; 
                return origProcessContextMenu.apply(this, arguments);
            };
            app.canvas._slHijackedContextMenu = true;
        }
    }

    const onPointerUp = (e) => {
        if (e.button !== 0 && e.button !== 2) return;

        const isAppend = (e.button === 2);

        setTimeout(() => {
            hideBindingToast();
            appState.isBindingMode = false;
            panelContainer.classList.add('visible');
            if (backdropContainer) backdropContainer.classList.add('visible');

            let targetNode = null;
            if (app.canvas && app.canvas.graph) {
                const selectedNodes = Object.values(app.canvas.selected_nodes || {});
                if (!isAppend && selectedNodes.length > 0) {
                    targetNode = selectedNodes[0];
                } else {
                    const mx = app.canvas.graph_mouse[0];
                    const my = app.canvas.graph_mouse[1];
                    targetNode = app.canvas.graph.getNodeOnPos(mx, my);
                }
            }

            if (targetNode) {
                let resolvedTargets = [];
                if (targetNode.type === "PrimitiveNode" && targetNode.outputs && targetNode.outputs[0] && targetNode.outputs[0].links) {
                    targetNode.outputs[0].links.forEach(linkId => {
                        const link = app.graph.links[linkId];
                        if (link) {
                            const realNode = app.graph.getNodeById(link.target_id);
                            if (realNode && realNode.inputs && realNode.inputs[link.target_slot]) {
                                resolvedTargets.push({
                                    nodeIdStr: String(realNode.id),
                                    widgetName: realNode.inputs[link.target_slot].name
                                });
                            }
                        }
                    });
                }
                
                if (resolvedTargets.length === 0) {
                    resolvedTargets.push({
                        nodeIdStr: String(targetNode.id),
                        widgetName: null
                    });
                }

                state.selectedAreaIds.forEach(id => {
                    state.cards.forEach(c => {
                        const a = c.areas?.find(x => x.id === id);
                        if (a && a.type === targetType) {
                            if (targetType === 'edit') {
                                
                                let ids = Array.isArray(a.targetNodeIds) ? [...a.targetNodeIds] : (a.targetNodeId ? [String(a.targetNodeId)] : []);
                                let widgets = Array.isArray(a.targetWidgets) ? [...a.targetWidgets] : (a.targetWidget && a.targetNodeId ? [`${a.targetNodeId}||${a.targetWidget}`] : []);
                                
                                if (!isAppend) {
                                    ids = [];
                                    widgets = [];
                                }

                                let firstValidWidgetDef = null;

                                resolvedTargets.forEach(rt => {
                                    if (!ids.includes(rt.nodeIdStr)) {
                                        ids.push(rt.nodeIdStr);
                                    }
                                    if (rt.widgetName) {
                                        const wVal = `${rt.nodeIdStr}||${rt.widgetName}`;
                                        if (!widgets.includes(wVal)) {
                                            widgets.push(wVal);
                                        }
                                        if (!firstValidWidgetDef) {
                                            firstValidWidgetDef = getWidgetDef(rt.nodeIdStr, rt.widgetName);
                                        }
                                    }
                                });

                                a.targetNodeIds = ids;
                                a.targetNodeId = ids.length > 0 ? ids[0] : null;
                                
                                a.targetWidgets = widgets;
                                a.targetWidget = widgets.length > 0 ? widgets[0].split('||')[1] : null;

                                if (firstValidWidgetDef) {
                                    let isManual = true;
                                    if (Array.isArray(firstValidWidgetDef.type) || firstValidWidgetDef.type === "combo" || Array.isArray(firstValidWidgetDef.options?.values)) isManual = false;
                                    if (firstValidWidgetDef.type === "toggle" || typeof firstValidWidgetDef.value === "boolean") isManual = false;
                                    
                                    const hasVal = (a.value !== undefined && a.value !== null && a.value !== '');
                                    
                                    if (!isManual || !hasVal) {
                                        a.value = firstValidWidgetDef.value;
                                    }

                                    if (firstValidWidgetDef.type === "toggle" || typeof firstValidWidgetDef.value === "boolean") {
                                        a.dataType = 'boolean';
                                    } else if (typeof firstValidWidgetDef.value === "number") {
                                        a.dataType = 'number';
                                    } else {
                                        a.dataType = 'string';
                                    }
                                }
                            } else {
                                a.targetNodeId = resolvedTargets[0].nodeIdStr;
                            }
                        }
                    });
                });
                saveAndRender();
            }
        }, 150); 
        
        window.removeEventListener("pointerup", onPointerUp, true);
    };
    
    setTimeout(() => {
        window.addEventListener("pointerup", onPointerUp, true);
    }, 100);
}