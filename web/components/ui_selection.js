/**
 * 文件名: ui_selection.js
 * 职责: 提供外科手术级局部更新引擎，控制卡片和模块的高亮样式，避免全局重绘
 */
import { state } from "./ui_state.js";
import { app } from "../../../scripts/app.js";
import { renderDynamicToolbar, attachDynamicToolbarEvents } from "./comp_toolbar.js";

export function updateSelectionUI() {
    try {
        // 1. 遍历卡片 DOM，修改高亮
        document.querySelectorAll('.clab-card:not(.clab-add-card-inline)').forEach(card => {
            const cardId = card.dataset.cardId;
            if (state.selectedCardIds && state.selectedCardIds.includes(cardId)) {
                // 【核心修复】：必须同时添加 active 和 selected，匹配 CSS
                card.classList.add('active', 'selected');
                card.style.borderColor = '#4CAF50'; 
            } else {
                // 【核心修复】：必须同时移除 active 和 selected，消除残影
                card.classList.remove('active', 'selected');
                card.style.borderColor = ''; 
            }
        });

        // 2. 遍历模块 DOM，修改高亮
        document.querySelectorAll('.clab-area').forEach(area => {
            const areaId = area.dataset.areaId;
            if (state.selectedAreaIds && state.selectedAreaIds.includes(areaId)) {
                area.classList.add('active');
                area.classList.add('selected');
                area.style.borderColor = '#2196F3'; 
            } else {
                area.classList.remove('active');
                area.classList.remove('selected');
                area.style.borderColor = ''; 
            }
        });

        // 3. 刷新动态工具栏
        const toolbarHandle = document.querySelector('#clab-toolbar-handle');
        if (toolbarHandle) {
            renderDynamicToolbar(toolbarHandle);
            attachDynamicToolbarEvents(toolbarHandle);
        }

        // 4. 静默保存数据到节点 (绝不触发全局渲染事件)
        if (window.CLab && window.CLab.saveState) {
            window.CLab.saveState(state);
        } else if (window.StateManager && window.StateManager.syncToNode) {
            window.StateManager.syncToNode(app.graph);
        }
    } catch (err) {
        console.error("[CLab] ⚠️ 局部刷新引擎遭遇异常，启动防崩溃回退，执行全量重绘:", err);
        if (window.CLab && window.CLab.saveState) window.CLab.saveState(state);
        document.dispatchEvent(new CustomEvent("clab_render_ui"));
    }
}

// 将更新 UI 引擎暴露给全局，方便其他组件调用
window.CLab = window.CLab || {};
window.CLab.updateSelectionUI = updateSelectionUI;