/**
 * 文件名: ui_utils.js
 * 职责: UI 渲染辅助工具、ComfyUI 图谱解析、CSS 样式库
 */
import { app } from "../../../scripts/app.js";
import { appState } from "./ui_state.js";

// =========================================================================
// --- DOM 辅助构建方法 ---
// =========================================================================

export function buildCustomSelect(id, width, valueText, itemsHtml, disabled = false, dataAttrs = '') {
    return `
        <div id="${id}" class="clab-custom-select clab-capsule ${disabled ? 'disabled' : ''}" style="width:${width};" ${dataAttrs}>
            <input type="text" class="clab-custom-select-value" title="${valueText}" value="${valueText}" ${disabled ? 'disabled' : ''} autocomplete="off" spellcheck="false" />
            <div class="clab-custom-select-icon">▼</div>
            <div class="clab-custom-select-dropdown">${itemsHtml}</div>
        </div>
    `;
}

export function getRatioCSS(area) {
    if (area.matchMedia || !area.ratio) return 'aspect-ratio: 16/9;';
    if (area.ratio === '自定义比例' && area.width && area.height) {
        return `aspect-ratio: ${area.width} / ${area.height};`;
    }
    const ratios = {
        '21:9': '21/9', '16:9': '16/9', '3:2': '3/2', '4:3': '4/3', '1:1': '1/1',
        '3:4': '3/4', '2:3': '2/3', '9:16': '9/16', '9:21': '9/21'
    };
    if (ratios[area.ratio]) return `aspect-ratio: ${ratios[area.ratio]};`;
    return 'aspect-ratio: 16/9;';
}

export function truncateString(str, maxLength) {
    return (str && str.length > maxLength) ? str.substring(0, maxLength) + '...' : (str || '');
}

// =========================================================================
// --- ComfyUI 底层数据解析与菜单构建 ---
// =========================================================================

export function getWidgetDef(nodeId, widgetName) {
    if (!nodeId || !widgetName || !app.graph) return null;
    const node = app.graph.getNodeById(Number(nodeId));
    if (!node || !node.widgets) return null;
    return node.widgets.find(w => w.name === widgetName);
}

export function getCustomNodeMenuHTML(selectedNodeId) {
    const tree = { name: "Root", children: {}, nodes: [] };
    if (app.graph && app.graph._nodes) {
        app.graph._nodes.forEach(node => {
            let groupPath = ["未分组"];
            if (app.graph._groups) {
                for (let g of app.graph._groups) {
                    if (node.pos[0] >= g.pos[0] && node.pos[0] <= g.pos[0] + g.size[0] &&
                        node.pos[1] >= g.pos[1] && node.pos[1] <= g.pos[1] + g.size[1]) {
                        groupPath = (g.title || "未命名组").split(/[/|\\]/).map(s => s.trim()).filter(s => s);
                        break;
                    }
                }
            }

            let currentLevel = tree;
            if (groupPath[0] !== "未分组") {
                groupPath.forEach(part => {
                    if (!currentLevel.children[part]) {
                        currentLevel.children[part] = { name: part, children: {}, nodes: [] };
                    }
                    currentLevel = currentLevel.children[part];
                });
            }
            currentLevel.nodes.push(node);
        });
    }

    function renderTree(nodeTree, depth = 0) {
        let html = '';
        const indent = depth * 12;
        nodeTree.nodes.forEach(n => {
            const isSel = n.id == selectedNodeId;
            html += `<div class="clab-custom-select-item ${isSel ? 'selected' : ''}" data-value="${n.id}" style="padding-left:${indent + 12}px;">[${n.id}] ${n.title || n.type}</div>`;
        });
        for (let childName in nodeTree.children) {
            html += `<div class="clab-custom-select-group-title" style="padding-left:${indent + 8}px;">${childName}</div>`;
            html += renderTree(nodeTree.children[childName], depth + 1);
        }
        return html;
    }

    let finalHtml = `<div class="clab-custom-select-item" data-value="" style="color:#aaa;">(清除关联)</div>`;
    if (tree.nodes.length > 0) {
        finalHtml += `<div class="clab-custom-select-group-title">未分组</div>`;
        finalHtml += renderTree({ nodes: tree.nodes, children: {} }, 0);
    }
    for (let childName in tree.children) {
        finalHtml += `<div class="clab-custom-select-group-title">${childName}</div>`;
        finalHtml += renderTree(tree.children[childName], 1);
    }
    return finalHtml;
}

export function getCustomWidgetMenuHTML(nodeId, selectedWidget) {
    let html = `<div class="clab-custom-select-item" data-value="" style="color:#aaa;">(清除绑定)</div>`;
    if (nodeId && app.graph) {
        const node = app.graph.getNodeById(Number(nodeId));
        if (node && node.widgets) {
            node.widgets.forEach(w => {
                const isSel = w.name === selectedWidget;
                html += `<div class="clab-custom-select-item ${isSel ? 'selected' : ''}" data-value="${w.name}">${w.name}</div>`;
            });
        }
    }
    return html;
}

export function getMultiNodeMenuHTML(selectedIds) {
    if (!app.graph) return '';
    const nodes = app.graph._nodes || [];
    let html = '';

    const groups = {};
    nodes.forEach(n => {
        const cat = n.category || '未分类';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(n);
    });

    for (const cat in groups) {
        html += `<div class="clab-custom-select-group-title">${cat}</div>`;
        groups[cat].forEach(n => {
            const isSelected = selectedIds.includes(String(n.id));
            html += `<div class="clab-custom-select-item ${isSelected ? 'selected' : ''}" data-value="${n.id}">[${n.id}] ${n.title || n.type}</div>`;
        });
    }
    return html;
}

export function getMultiWidgetMenuHTML(nodeIds, selectedWidgets) {
    if (!app.graph || !nodeIds || nodeIds.length === 0) return '<div class="clab-custom-select-item" data-value="">请先选择关联节点</div>';

    let html = '';
    nodeIds.forEach(nid => {
        const node = app.graph.getNodeById(Number(nid));
        if (!node) return;

        html += `<div class="clab-custom-select-group-title">[${node.id}] ${node.title || node.type}</div>`;

        let hasWidget = false;
        if (node.widgets && node.widgets.length > 0) {
            node.widgets.forEach(w => {
                if (w.type === 'button') return;
                hasWidget = true;
                const val = `${node.id}||${w.name}`;
                const isSelected = selectedWidgets.includes(val);
                html += `<div class="clab-custom-select-item ${isSelected ? 'selected' : ''}" data-value="${val}">${w.name} <span style="font-size:10px;color:#666;">(${w.type})</span></div>`;
            });
        }
        if (!hasWidget) {
            html += `<div class="clab-custom-select-item disabled" style="color:#666; pointer-events:none;">无可用参数</div>`;
        }
    });
    return html;
}

// =========================================================================
// --- 沉浸式提示 Toast ---
// =========================================================================

export function showBindingToast(msg, isError = false) {
    let toast = document.getElementById('clab-binding-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'clab-binding-toast';
        document.body.appendChild(toast);
    }

    const bgColor = isError ? "rgba(244, 67, 54, 0.95)" : "var(--clab-theme-card, rgba(76, 175, 80, 0.95))";

    toast.style.cssText = `
        position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
        background: ${bgColor}; color: white; padding: 15px 30px;
        border-radius: 40px; z-index: 10000; font-size: 16px; font-weight: bold;
        box-shadow: 0 5px 20px rgba(0,0,0,0.6); pointer-events: none;
        backdrop-filter: blur(5px);
    `;
    toast.innerText = msg;
    toast.style.display = 'block';

    if (window._clabToastTimeout) clearTimeout(window._clabToastTimeout);
    window._clabToastTimeout = setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

export function hideBindingToast() {
    const toast = document.getElementById('clab-binding-toast');
    if (toast) toast.style.display = 'none';
}

// =========================================================================
// --- 通用交互绑定 ---
// =========================================================================

export function bindComboSelectEvents(container, stateObj, saveAndRenderCallback) {
    container.querySelectorAll('.clab-custom-select[data-type="module-combo"]').forEach(el => {
        if (el.classList.contains('disabled')) return;
        const input = el.querySelector('.clab-custom-select-value');
        const items = el.querySelectorAll('.clab-custom-select-item');

        el.addEventListener('mousedown', e => e.stopPropagation());

        const openDropdown = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.clab-custom-select.open').forEach(other => {
                if (other !== el) {
                    other.classList.remove('open');
                    const dp = other.querySelector('.clab-custom-select-dropdown');
                    if (dp) { dp.style.top = ''; dp.style.bottom = ''; dp.style.transform = ''; }
                    const otherArea = other.closest('.clab-area');
                    if (otherArea) otherArea.style.zIndex = '';
                }
            });
            el.classList.add('open');

            const currentArea = el.closest('.clab-area');
            if (currentArea) currentArea.style.zIndex = '9999';

            const dropdown = el.querySelector('.clab-custom-select-dropdown');
            if (dropdown) {
                dropdown.style.top = '';
                dropdown.style.bottom = '';
                dropdown.style.transform = '';
                const dropdownRect = dropdown.getBoundingClientRect();
                const cardBody = el.closest('.clab-card-body');
                let overflowOffset = 0;
                if (cardBody) {
                    const cardRect = cardBody.getBoundingClientRect();
                    const diff = dropdownRect.bottom - (cardRect.bottom - 10);
                    if (diff > 0) overflowOffset = diff;
                } else {
                    const diff = dropdownRect.bottom - (window.innerHeight - 10);
                    if (diff > 0) overflowOffset = diff;
                }
                if (overflowOffset > 0) dropdown.style.transform = `translateY(-${overflowOffset}px)`;
            }
        };

        el.addEventListener('click', openDropdown);
        input.addEventListener('click', (e) => { openDropdown(e); input.select(); });

        input.addEventListener('input', (e) => {
            const keyword = e.target.value.toLowerCase().trim();
            el.classList.add('open');
            const groupTitles = el.querySelectorAll('.clab-custom-select-group-title');
            if (keyword !== '') groupTitles.forEach(title => title.style.display = 'none');
            else groupTitles.forEach(title => title.style.display = 'flex');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(keyword) ? 'block' : 'none';
            });
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                el.classList.remove('open');
                const currentArea = el.closest('.clab-area');
                if (currentArea) currentArea.style.zIndex = '';
                const dp = el.querySelector('.clab-custom-select-dropdown');
                if (dp) { dp.style.top = ''; dp.style.bottom = ''; dp.style.transform = ''; }

                items.forEach(item => item.style.display = 'block');
                const groupTitles = el.querySelectorAll('.clab-custom-select-group-title');
                groupTitles.forEach(title => title.style.display = 'flex');

                const selected = el.querySelector('.clab-custom-select-item.selected');
                if (selected) input.value = selected.textContent;
                else input.value = input.getAttribute('title');
            }, 200);
        });

        items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = item.dataset.value;
                el.classList.remove('open');

                const currentArea = el.closest('.clab-area');
                if (currentArea) currentArea.style.zIndex = '';
                const dp = el.querySelector('.clab-custom-select-dropdown');
                if (dp) { dp.style.top = ''; dp.style.bottom = ''; dp.style.transform = ''; }

                const cardId = el.dataset.cardId;
                const areaId = el.dataset.areaId;
                const card = stateObj.cards.find(c => c.id === cardId);
                const area = card?.areas.find(a => a.id === areaId);

                if (area) {
                    area.value = val;
                    stateObj.selectedAreaIds = [areaId];
                    stateObj.selectedCardIds = [];
                    appState.lastClickedAreaId = areaId;

                    if (window._clabSurgicallyUpdateArea) {
                        window._clabSurgicallyUpdateArea(areaId);
                        if (window._clabJustSave) window._clabJustSave();
                    } else if (saveAndRenderCallback) {
                        saveAndRenderCallback();
                    }
                }
            });
        });
    });
}

// =========================================================================
// --- CSS 全局样式注入 ---
// =========================================================================

export function injectDnDCSS() {
    if (!document.getElementById('clab-area-dnd-styles')) {
        const style = document.createElement('style');
        style.id = 'clab-area-dnd-styles';
        // 【主题引擎】：拖拽样式实时关联 CSS 变量
        style.innerHTML = `
            .clab-drag-over-area-top { border-top: 3px solid var(--clab-theme-card, #4CAF50) !important; background: var(--clab-theme-card-hover, rgba(76, 175, 80, 0.1)) !important; }
            .clab-drag-over-area-bottom { border-bottom: 3px solid var(--clab-theme-card, #4CAF50) !important; background: var(--clab-theme-card-hover, rgba(76, 175, 80, 0.1)) !important; }
            .clab-drag-over-thumb-left { border-left: 3px solid var(--clab-theme-card, #4CAF50) !important; border-radius: 0 !important; }
            .clab-drag-over-thumb-right { border-right: 3px solid var(--clab-theme-card, #4CAF50) !important; border-radius: 0 !important; }
            .clab-history-thumb:hover .clab-thumb-delete { display: flex !important; }
            .clab-thumb-delete:hover { transform: scale(1.15); background: #ff5555 !important; color: #fff !important; }
            .clab-history-thumb:active { cursor: grabbing !important; opacity: 0.8; }
        `;
        document.head.appendChild(style);
    }
}

export function injectCSS() {
    const style = document.createElement("style");
    // 【主题引擎】：全面抛弃硬编码颜色，全线启用 CSS 变量！
    style.innerHTML = `
        #clab-backdrop {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.6); z-index: 9998; 
            opacity: 0; pointer-events: none; transition: opacity 0.25s ease;
        }
        #clab-backdrop.visible { opacity: 1; pointer-events: auto; }

        #clab-panel {
            position: fixed; top: 10vh; left: 10vw; width: 80vw; height: 80vh;
            background: rgba(30, 30, 30, 0.45); 
            backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
            color: var(--fg-color, #eee); font-family: sans-serif;
            border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 9999;
            display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;
            opacity: 0; pointer-events: none; transform: scale(0.95);
            transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        #clab-panel.visible { opacity: 1; pointer-events: auto; transform: scale(1); }

        #clab-panel.clab-painter-active, #clab-panel.clab-painter-active * {
            cursor: crosshair !important;
        }

        .clab-toolbar {
            padding: 15px 20px; background: rgba(0, 0, 0, 0.3); border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex; justify-content: space-between; align-items: center; gap: 10px;
            cursor: grab; user-select: none; flex-wrap: nowrap;
        }
        .clab-toolbar:active { cursor: grabbing; }
        .clab-toolbar button, .clab-toolbar input { cursor: pointer; }
        .clab-toolbar-left,
        .clab-toolbar-right {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }
        .clab-toolbar-left {
            flex: 1 1 auto;
        }
        .clab-toolbar-right {
            flex: 0 0 auto;
            margin-left: auto;
        }
        .clab-module-toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }

        .clab-btn {
            background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px;
            padding: 8px 15px; font-size: 13px; transition: all 0.2s; white-space: nowrap; font-family: sans-serif;
        }
        .clab-btn:hover { background: rgba(255, 255, 255, 0.2); }
        
        .clab-run-wrapper {
            background: rgba(33, 150, 243, 0.8); border: 1px solid rgba(33, 150, 243, 1); border-radius: 6px; 
            display: inline-flex; align-items: stretch; position: relative; transition: all 0.2s;
        }
        .clab-run-wrapper:hover { background: rgba(33, 150, 243, 1); box-shadow: 0 0 10px rgba(33, 150, 243, 0.5); }
        .clab-run-wrapper .clab-btn { background: transparent; border: none; font-weight: bold; margin: 0; display: flex; align-items: center; }
        .clab-run-wrapper .run-btn-main { border-top-right-radius: 0; border-bottom-right-radius: 0; padding-right: 12px; }
        .clab-run-wrapper .run-btn-toggle { border-top-left-radius: 0; border-bottom-left-radius: 0; padding-left: 10px; padding-right: 10px; justify-content: center; }
        .clab-run-wrapper .clab-btn:hover { background: rgba(255, 255, 255, 0.15); }
        
        .clab-btn[disabled] { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
        
        .clab-cards-container { 
            flex: 1; overflow-x: auto; overflow-y: hidden; padding: 20px; 
            display: flex; flex-direction: row; gap: 20px; align-items: stretch;
        }
        .clab-panel-footer {
            display: flex;
            align-items: stretch;
            justify-content: flex-start;
            gap: 0;
            padding: 0;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(0, 0, 0, 0.3);
            flex: 0 0 auto;
            height: 36px;
            box-sizing: border-box;
            width: 100%;
            overflow: hidden;
        }
        #clab-card-width-ctrl {
            position: absolute;
            left: 20px;
            bottom: 60px;
            background: transparent;
            padding: 0;
            border: none;
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 100;
        }
        .clab-workspace-shell {
            display: flex;
            align-items: stretch;
            gap: 0;
            min-width: 0;
            flex: 1 1 auto;
            justify-content: flex-start;
            height: 100%;
        }
        .clab-workspace-tabs {
            display: flex;
            align-items: stretch;
            gap: 0;
            min-width: 0;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
            height: 100%;
        }
        .clab-workspace-tabs::-webkit-scrollbar { display: none; }
        .clab-workspace-tab {
            flex: 0 0 auto;
            height: 100%;
            box-sizing: border-box;
            border: none;
            border-right: 1px solid rgba(255,255,255,0.08);
            border-radius: 0;
            background: transparent;
            color: #aaa;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 16px;
            cursor: pointer;
            transition: all 0.1s ease;
            max-width: 180px;
            font-size: 13px;
        }
        .clab-workspace-tab:hover { background: rgba(255,255,255,0.05); color: #ddd; }
        .clab-workspace-tab.active {
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
            box-shadow: inset 0 -2px 0 var(--clab-theme-card, #4CAF50);
        }
        .clab-workspace-tab.clab-workspace-add {
            flex: 0 0 auto;
            width: 36px;
            padding: 0;
            font-size: 18px;
            font-weight: normal;
            position: sticky;
            right: 0;
            background: #252525;
            border-left: 1px solid rgba(255,255,255,0.08);
            z-index: 10;
            justify-content: center;
            color: #bbb;
        }
        .clab-workspace-tab-index {
            display: none;
        }
        .clab-workspace-tab-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            outline: none;
        }
        .clab-workspace-tab-name[contenteditable="true"] {
            text-overflow: clip;
            cursor: text;
        }
        .clab-workspace-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 0 0 auto;
        }
        .clab-workspace-action {
            padding: 6px 12px;
            height: 30px;
            border-radius: 15px;
        }
        .clab-workspace-action.clab-danger {
            border-color: rgba(255, 80, 80, 0.35);
            color: #ff9a9a;
        }
        .clab-workspace-action.clab-danger:hover {
            background: rgba(255, 80, 80, 0.22);
            color: #fff;
        }
        .clab-cards-container::-webkit-scrollbar, .clab-card-body::-webkit-scrollbar { height: 10px; width: 6px; }
        .clab-cards-container::-webkit-scrollbar-thumb, .clab-card-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 5px; }
        .clab-cards-container::-webkit-scrollbar-track, .clab-card-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        
        .clab-card {
            background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; 
            padding: 15px 15px 5px 15px; transition: border-color 0.2s, border-width 0.2s, box-shadow 0.2s, background 0.2s;
            flex: 0 0 340px; display: flex; flex-direction: column;
            max-height: 100%; overflow: hidden; position: relative;
        }
        .clab-card.active { 
            border-color: var(--clab-theme-card, #4CAF50) !important;
            border-width: var(--clab-theme-card-border, 2px) !important;
            border-style: solid !important;
            box-shadow: 0 0 var(--clab-theme-card-glow, 15px) var(--clab-theme-card-alpha, rgba(76, 175, 80, 0.3)); 
            background: var(--clab-theme-card-bg, rgba(76, 175, 80, 0.08)); 
        }
        
        .clab-card-body {
            flex: 1; overflow-y: auto; overflow-x: hidden; padding-right: 5px; padding-bottom: 10px;
            display: flex; flex-direction: column;
            min-height: 50px; 
        }

        .clab-card-title-bar {
            margin-bottom: 15px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.15);
            display: flex; align-items: center;
        }
        .clab-card-title-input {
            background: transparent; border: none; color: #ddd; font-size: 16px;
            font-weight: bold; width: 85%; padding: 0; outline: none; transition: color 0.2s;
            font-family: sans-serif;
        }
        .clab-card-title-input:focus { color: #fff; }

        .clab-del-card-btn, .clab-del-area-btn {
            position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%;
            background: rgba(255, 255, 255, 0.6); border: none; color: #333; 
            font-size: 12px; font-weight: bold; display: flex; justify-content: center; align-items: center;
            cursor: pointer; opacity: 0; transition: opacity 0.2s, transform 0.2s, background 0.2s, color 0.2s; z-index: 10;
        }
        .clab-del-card-btn:hover, .clab-del-area-btn:hover { transform: scale(1.15); background: #ff5555; color: #fff; }
        .clab-card:hover > .clab-del-card-btn { opacity: 1; }
        .clab-area:hover > .clab-del-area-btn { opacity: 1; }

        .clab-area-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; min-height: 20px; transition: background 0.2s;}
        
        .clab-area { 
            background: rgba(255, 255, 255, 0.05); border: 1px dashed rgba(255, 255, 255, 0.2); 
            border-radius: 6px; font-size: 12px; position: relative; cursor: grab; transition: border-color 0.2s, border-width 0.2s, box-shadow 0.2s, background 0.2s;
            flex-shrink: 0; overflow: hidden;
        }
        .clab-area:active { cursor: grabbing; }
        .clab-area.active { 
            border-color: var(--clab-theme-module, #2196F3) !important;
            border-width: var(--clab-theme-module-border, 1px) !important;
            border-style: solid !important;
            box-shadow: 0 0 var(--clab-theme-module-glow, 10px) var(--clab-theme-module-alpha, rgba(33, 150, 243, 0.4)); 
            background: var(--clab-theme-module-bg, rgba(33, 150, 243, 0.05)); 
        }

        .clab-input { 
            width: 100%; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid #555; 
            padding: 8px; border-radius: 4px; box-sizing: border-box; resize: vertical; 
            min-height: 32px; font-family: sans-serif;
        }
        .clab-input:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .clab-capsule { 
            border-radius: 20px !important; padding-left: 12px !important; padding-right: 12px !important; 
            height: 30px !important; min-height: 30px !important; font-size: 12px !important; line-height: 28px !important;
        }
        .clab-custom-select {
            position: relative; display: inline-flex; align-items: center; justify-content: space-between;
            background: rgba(0,0,0,0.5); border: 1px solid #555;
            color: #fff; cursor: text; outline: none;
            box-sizing: border-box; font-family: sans-serif;
        }
        .clab-custom-select.disabled { opacity: 0.5; pointer-events: none; }
        
        .clab-custom-select-value {
            flex: 1; min-width: 0; background: transparent; border: none; color: inherit;
            font-family: inherit; font-size: inherit; font-weight: inherit; outline: none;
            padding: 0; margin: 0; cursor: text;
            text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
        }
        
        .clab-custom-select-icon { font-size: 8px; color: #888; margin-left: 6px; flex-shrink: 0; cursor: pointer; }
        .clab-custom-select-dropdown {
            position: absolute; top: calc(100% + 4px); left: 0; min-width: 100%;
            background: #2a2a2a; border: 1px solid #555; border-radius: 6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5); z-index: 10001;
            display: none; max-height: 600px; overflow-y: auto; padding: 4px 0;
            cursor: default; text-align: left;
        }
        .clab-custom-select.open .clab-custom-select-dropdown { display: block; }
        .clab-custom-select-item {
            padding: 6px 12px; font-size: 12px; color: #eee; cursor: pointer;
            transition: background 0.1s; white-space: nowrap;
        }
        .clab-custom-select-item:hover { background: var(--clab-theme-card, #4CAF50); color: #fff; }
        .clab-custom-select-item.selected { color: var(--clab-theme-card, #4CAF50); font-weight: bold; }
        .clab-custom-select-group-title {
            padding: 4px 12px; font-size: 10px; color: #aaa; font-weight: bold;
            background: rgba(255,255,255,0.05); margin-top: 4px; pointer-events: none;
            display: flex; align-items: center; gap: 4px;
        }

        .clab-preview-bg {
            background: linear-gradient(135deg, #4a00e0, #8e2de2);
            width: 100%; border-radius: 4px; overflow: hidden;
            display: flex; justify-content: center; align-items: center;
            position: relative; transition: all 0.3s;
        }
        .clab-preview-img { width: 100%; height: 100%; display: none; }
        .clab-preview-placeholder { color: rgba(255,255,255,0.6); font-weight: bold; font-size: 14px; pointer-events: none; padding: 20px; text-align: center; }

        .clab-card-progress-bar.error {
            background-color: #f44336 !important;
            box-shadow: 0 0 10px #f44336;
            animation: error-pulse 1.5s infinite;
        }
        @keyframes error-pulse {
            0% { opacity: 0.7; }
            50% { opacity: 1; }
            100% { opacity: 0.7; }
        }

        .clab-dragging { opacity: 0.5; border-color: var(--clab-theme-card, #4CAF50) !important; }
        .clab-drag-over { border-top: 3px solid var(--clab-theme-card, #4CAF50) !important; background: var(--clab-theme-card-hover, rgba(76, 175, 80, 0.1)) !important;}
        .clab-drag-over-list { background: var(--clab-theme-card-hover, rgba(76, 175, 80, 0.1)) !important; border-radius: 8px; border: 2px dashed var(--clab-theme-card, #4CAF50) !important; box-sizing: border-box;}
        .clab-drag-over-card { border-left: 3px solid var(--clab-theme-card, #4CAF50) !important; }

        /* ========================================================================= */
        /* --- 右键菜单样式 (Context Menu) --- */
        /* ========================================================================= */
        .clab-context-menu {
            position: fixed;
            background: rgba(35, 35, 35, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            padding: 6px 0;
            min-width: 180px;
            z-index: 10005;
            display: none;
            font-family: sans-serif;
            font-size: 13px;
            color: #eee;
        }
        .clab-context-menu-title {
            padding: 4px 15px;
            font-size: 11px;
            color: #aaa;
            font-weight: bold;
            background: rgba(0,0,0,0.2);
            margin: 4px 0;
            pointer-events: none;
            letter-spacing: 1px;
        }
        .clab-context-menu-item {
            padding: 8px 15px;
            cursor: pointer;
            transition: background 0.1s;
            display: flex;
            align-items: center;
        }
        .clab-context-menu-item:hover { background: var(--clab-theme-module, #2196F3); color: #fff; }
        .clab-context-menu-item.clab-danger { color: #ff6b6b; }
        .clab-context-menu-item.clab-danger:hover { background: #f44336; color: #fff; }
        .clab-context-menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 4px 0;
        }
    `;
    document.head.appendChild(style);
}
