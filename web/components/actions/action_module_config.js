/**
 * 文件名: action_module_config.js
 * 路径: web/components/actions/action_module_config.js
 * 职责: 负责动态悬浮工具栏渲染、模块属性配置、克隆与格式刷逻辑
 */
import { state, saveAndRender } from "../ui_state.js";
import { buildCustomSelect, getCustomNodeMenuHTML, getMultiNodeMenuHTML, getMultiWidgetMenuHTML, getWidgetDef } from "../ui_utils.js";
import { app } from "../../../../scripts/app.js";
import { execSyncParams } from "./action_batch_sync.js";

export function renderDynamicToolbar(toolbarHandleContainer) {
    const separator = toolbarHandleContainer.querySelector('#sl-module-toolbar-separator');
    const tb = toolbarHandleContainer.querySelector('#sl-module-toolbar');
    if (!tb || !separator) return;

    const wasNodeOpen = tb.querySelector('#tb-node-select-custom')?.classList.contains('open');
    const wasWidgetOpen = tb.querySelector('#tb-widget-select-custom')?.classList.contains('open');

    const isAnySelected = (state.selectedCardIds?.length > 0) || (state.selectedAreaIds?.length > 0);
    if (!isAnySelected) {
        tb.style.display = 'none';
        separator.style.display = 'none';
        return;
    }

    tb.style.display = 'flex';
    separator.style.display = 'block';

    let html = ``;
    let mainType = null;
    let mainArea = null;

    if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
        const selectedAreas = [];
        state.cards.forEach(c => {
            c.areas?.forEach(a => { if (state.selectedAreaIds.includes(a.id)) selectedAreas.push({card: c, area: a}); });
        });

        if (selectedAreas.length > 0) {
            mainType = selectedAreas[0].area.type;
            mainArea = selectedAreas[0].area;

            html += `
                <div style="display:flex; border: 1px dashed rgba(255,255,255,0.3); border-radius: 20px; padding: 2px; gap: 2px;">
                    <div class="sl-type-btn ${mainType==='edit'?'active':''}" data-type="edit" style="padding: 4px 14px; border-radius: 16px; cursor: pointer; font-size: 12px; transition: all 0.2s; ${mainType==='edit'?'background: rgba(255,255,255,0.2); color: #fff; font-weight: bold;':'color: #aaa;'}">输入</div>
                    <div class="sl-type-btn ${mainType==='preview'?'active':''}" data-type="preview" style="padding: 4px 14px; border-radius: 16px; cursor: pointer; font-size: 12px; transition: all 0.2s; ${mainType==='preview'?'background: rgba(255,255,255,0.2); color: #fff; font-weight: bold;':'color: #aaa;'}">输出</div>
                </div>
            `;

            if (mainType === 'preview') {
                let nodeName = '关联节点...';
                if (mainArea.targetNodeId && app.graph) {
                    const n = app.graph.getNodeById(Number(mainArea.targetNodeId));
                    if(n) nodeName = `[${n.id}] ${n.title||n.type}`;
                }
                html += `
                    <div style="display:flex; align-items:center; gap:6px;">
                        <button id="tb-node-pick" data-type="${mainType}" style="background:transparent; border:none; color:#aaa; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; transition:color 0.2s; width: 30px; height: 30px;" title="拾取节点" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'">
                            <svg width="18" height="18" viewBox="0 0 9.11 9.11" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M.37.02C.24-.04.08.03.02.17,0,.23,0,.31.02.37l1.62,3.94,1.87,4.54c.09.21.33.31.54.23.1-.04.18-.12.22-.21l1.41-3.13s.03-.04.05-.05l3.13-1.41c.21-.09.3-.34.21-.55-.04-.1-.12-.17-.22-.21L.37.02h0Z"/></svg>
                        </button>
                        ${buildCustomSelect('tb-node-select-custom', '120px', nodeName, getCustomNodeMenuHTML(mainArea.targetNodeId))}
                    </div>
                `;

                const fillModes = ['显示全部', '填充', '拉伸'];
                let fillItems = fillModes.map(m => `<div class="sl-custom-select-item ${mainArea.fillMode===m?'selected':''}" data-value="${m}">${m}</div>`).join('');
                
                const ratios = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '9:21', '自定义比例'];
                let ratioItems = ratios.map(r => `<div class="sl-custom-select-item ${mainArea.ratio===r?'selected':''}" data-value="${r}">${r}</div>`).join('');
                
                html += `
                    <div style="display:flex; align-items:center; gap:6px; margin-left: 8px;">
                        ${buildCustomSelect('tb-ratio-select-custom', '100px', mainArea.ratio || '16:9', ratioItems, mainArea.matchMedia)}
                        <input id="tb-ratio-w" type="number" class="sl-input sl-capsule" style="width:75px; min-height:24px; font-size:12px;" placeholder="W" value="${mainArea.width||''}" ${mainArea.matchMedia ? 'disabled' : ''}>
                        <span style="color:#aaa;">:</span>
                        <input id="tb-ratio-h" type="number" class="sl-input sl-capsule" style="width:75px; min-height:24px; font-size:12px;" placeholder="H" value="${mainArea.height||''}" ${mainArea.matchMedia ? 'disabled' : ''}>
                        <div style="width:1px; height:14px; background:rgba(255,255,255,0.2); margin:0 4px;"></div>
                        ${buildCustomSelect('tb-fill-select-custom', '100px', mainArea.fillMode || '显示全部', fillItems, mainArea.matchMedia)}
                        <label style="font-size:13px; color:#ccc; display:flex; align-items:center; gap:4px; margin-left:8px; cursor:pointer;">
                            <input id="tb-match-media" type="checkbox" ${mainArea.matchMedia ? 'checked' : ''} style="margin:0; width:14px; height:14px;"> 匹配媒体比例
                        </label>
                    </div>
                `;
            } else if (mainType === 'edit') {
                let nodeIds = Array.isArray(mainArea.targetNodeIds) ? mainArea.targetNodeIds : (mainArea.targetNodeId ? [String(mainArea.targetNodeId)] : []);
                let nodeName = nodeIds.length === 0 ? '关联节点...' : (nodeIds.length === 1 ? `[${nodeIds[0]}] 节点` : `已选 ${nodeIds.length} 个节点`);
                let targetWidgets = Array.isArray(mainArea.targetWidgets) ? mainArea.targetWidgets : (mainArea.targetWidget && mainArea.targetNodeId ? [`${mainArea.targetNodeId}||${mainArea.targetWidget}`] : []);
                let widgetName = targetWidgets.length === 0 ? '绑定参数...' : (targetWidgets.length === 1 ? targetWidgets[0].split('||')[1] : `已选 ${targetWidgets.length} 个参数`);

                html += `
                    <div style="display:flex; align-items:center; gap:6px;">
                        <button id="tb-node-pick" data-type="${mainType}" style="background:transparent; border:none; color:#aaa; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; transition:color 0.2s; width: 30px; height: 30px;" title="拾取节点" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'">
                            <svg width="18" height="18" viewBox="0 0 9.11 9.11" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M.37.02C.24-.04.08.03.02.17,0,.23,0,.31.02.37l1.62,3.94,1.87,4.54c.09.21.33.31.54.23.1-.04.18-.12.22-.21l1.41-3.13s.03-.04.05-.05l3.13-1.41c.21-.09.3-.34.21-.55-.04-.1-.12-.17-.22-.21L.37.02h0Z"/></svg>
                        </button>
                        ${buildCustomSelect('tb-node-select-custom', '120px', nodeName, getMultiNodeMenuHTML(nodeIds))}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${buildCustomSelect('tb-widget-select-custom', '140px', widgetName, getMultiWidgetMenuHTML(nodeIds, targetWidgets))}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <label style="font-size:13px; color:#ccc; display:flex; align-items:center; gap:4px; margin-left:8px; cursor:pointer;">
                            <input id="tb-auto-height" type="checkbox" ${mainArea.autoHeight ? 'checked' : ''} style="margin:0; width:14px; height:14px;"> 参数框高度适配
                        </label>
                    </div>
                `;
            }

            // 【UI 优化】：同步参数按钮使用原生 24x24 画布重绘，确保 stroke-width=1.5 视觉完全一致，并带有圆角
            html += `
                <div style="display:flex; align-items:center; margin-left: 4px; gap: 2px;">
                    <button id="tb-reset-module" style="background:transparent; border:none; color:#aaa; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; transition:color 0.2s, transform 0.2s; width: 28px; height: 28px;" title="重置模块参数到新建状态" onmouseover="this.style.color='#fff'; this.style.transform='rotate(-45deg)'" onmouseout="this.style.color='#aaa'; this.style.transform='rotate(0deg)'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    </button>
                    
                    <button class="sl-btn" id="tb-btn-sync-params" title="同步参数至其它任务相同位置" style="padding: 0; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: #aaa; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 12v-2.5c0-1.93 1.57-3.5 3.5-3.5h11"/>
                            <polyline points="15 2 19 6 15 10"/>
                            <path d="M20 12v2.5c0 1.93-1.57 3.5-3.5 3.5h-11"/>
                            <polyline points="9 22 5 18 9 14"/>
                        </svg>
                    </button>
                </div>
            `;
        }
    }

    // 【UI 优化】：垂直分割线间距大幅缩小 (margin 降到 2px，高度降到 16px)
    if (html !== '') html += `<div style="width:1px; height:16px; background:rgba(255,255,255,0.25); margin:0 2px;"></div>`;
    
    html += `
        <div style="display:flex; align-items:center; gap:2px;">
            <button id="tb-clone-btn" class="sl-btn" style="padding:4px 8px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.1); border-color:transparent; color:#aaa;" title="原样克隆选中项" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button id="tb-format-painter" class="sl-btn" style="padding:4px 8px; display:flex; align-items:center; justify-content:center; ${state.painterMode ? 'background:#ff9800; border-color:#ff9800; color:#fff;' : 'background:rgba(255,255,255,0.1); border-color:transparent; color:#aaa;'}" title="格式刷：连续点击覆盖参数或在空白处插入克隆 (ESC/右键/工具栏点击退出)" onmouseover="if(!state.painterMode) this.style.color='#fff'" onmouseout="if(!state.painterMode) this.style.color='#aaa'">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"></path><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"></path></svg>
            </button>
        </div>
    `;

    if (mainType === 'preview') {
        // 【UI 优化】：垂直分割线间距大幅缩小
        html += `<div style="width:1px; height:16px; background:rgba(255,255,255,0.25); margin:0 2px;"></div>`;
        html += `
            <div style="display:flex; align-items:center; gap:2px;">
                <button id="tb-manage-history" class="sl-btn" style="padding:4px 8px; display:flex; align-items:center; justify-content:center; ${mainArea?.isManageMode ? 'background:#4CAF50; border-color:#4CAF50; color:#fff;' : 'background:rgba(255,255,255,0.1); border-color:transparent; color:#aaa;'}" title="管理生成记录 (网格视图与拖拽排序)" onmouseover="if(!${mainArea?.isManageMode}) this.style.color='#fff'" onmouseout="if(!${mainArea?.isManageMode}) this.style.color='#aaa'">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                </button>
            </div>
        `;
    }

    tb.innerHTML = html;
    if (wasNodeOpen) tb.querySelector('#tb-node-select-custom')?.classList.add('open');
    if (wasWidgetOpen) tb.querySelector('#tb-widget-select-custom')?.classList.add('open');
}

export function attachDynamicToolbarEvents(toolbarHandleContainer) {
    const tb = toolbarHandleContainer.querySelector('#sl-module-toolbar');
    if (!tb) return;

    if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
        const selectedAreas = [];
        state.cards.forEach(c => c.areas?.forEach(a => { if (state.selectedAreaIds.includes(a.id)) selectedAreas.push({card: c, area: a}); }));
        const mainType = selectedAreas[0]?.area.type;
        const mainArea = selectedAreas[0]?.area;

        const updateSelected = (updater) => {
            selectedAreas.forEach(sa => { if (sa.area.type === mainType) updater(sa.area); });
            saveAndRender(); 
        };

        tb.querySelector('#tb-manage-history')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if(!mainArea) return;
            const targetState = !mainArea.isManageMode;
            updateSelected(a => {
                a.isManageMode = targetState;
            });
        });

        tb.querySelectorAll('.sl-type-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const newType = btn.dataset.type;
                if (newType === mainType) return;
                selectedAreas.forEach(sa => {
                    sa.area.type = newType;
                    if (newType === 'preview') {
                        sa.area.matchMedia = sa.area.matchMedia ?? true;
                        sa.area.ratio = sa.area.ratio ?? '16:9';
                        sa.area.fillMode = sa.area.fillMode ?? '显示全部';
                        sa.area.isManageMode = false;
                    } else {
                        sa.area.dataType = sa.area.dataType ?? 'string';
                        sa.area.autoHeight = sa.area.autoHeight ?? true;
                    }
                });
                saveAndRender();
            };
        });

        tb.querySelectorAll('.sl-custom-select').forEach(el => {
            if (el.classList.contains('disabled')) return;
            const input = el.querySelector('.sl-custom-select-value');
            const items = el.querySelectorAll('.sl-custom-select-item');

            el.addEventListener('mousedown', e => e.stopPropagation());
            const openDropdown = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.sl-custom-select.open').forEach(other => { if (other !== el) other.classList.remove('open'); });
                el.classList.add('open');
            };

            el.addEventListener('click', openDropdown);
            input.addEventListener('click', (e) => { openDropdown(e); input.select(); });

            input.addEventListener('input', (e) => {
                const keyword = e.target.value.toLowerCase().trim();
                el.classList.add('open');
                const groupTitles = el.querySelectorAll('.sl-custom-select-group-title');
                if (keyword !== '') groupTitles.forEach(title => title.style.display = 'none');
                else groupTitles.forEach(title => title.style.display = 'flex');

                items.forEach(item => {
                    item.style.display = item.textContent.toLowerCase().includes(keyword) ? 'block' : 'none';
                });
            });

            input.addEventListener('blur', () => {
                setTimeout(() => {
                    el.classList.remove('open');
                    items.forEach(item => item.style.display = 'block');
                    el.querySelectorAll('.sl-custom-select-group-title').forEach(title => title.style.display = 'flex');
                    const selected = el.querySelector('.sl-custom-select-item.selected');
                    if (selected) input.value = selected.textContent;
                    else input.value = input.getAttribute('title');
                }, 200);
            });

            items.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const val = item.dataset.value;
                    
                    if (el.id === 'tb-node-select-custom') {
                        if (mainType === 'edit') {
                            const targetNode = app.graph.getNodeById(Number(val));
                            let resolvedTargets = [];
                            if (targetNode && targetNode.type === "PrimitiveNode" && targetNode.outputs && targetNode.outputs[0] && targetNode.outputs[0].links) {
                                targetNode.outputs[0].links.forEach(linkId => {
                                    const link = app.graph.links[linkId];
                                    if (link) {
                                        const realNode = app.graph.getNodeById(link.target_id);
                                        if (realNode && realNode.inputs && realNode.inputs[link.target_slot]) {
                                            resolvedTargets.push({ nodeIdStr: String(realNode.id), widgetName: realNode.inputs[link.target_slot].name });
                                        }
                                    }
                                });
                            }
                            if (resolvedTargets.length === 0) resolvedTargets.push({ nodeIdStr: val, widgetName: null });

                            updateSelected(a => {
                                let ids = Array.isArray(a.targetNodeIds) ? [...a.targetNodeIds] : (a.targetNodeId ? [String(a.targetNodeId)] : []);
                                let widgets = Array.isArray(a.targetWidgets) ? [...a.targetWidgets] : (a.targetWidget && a.targetNodeId ? [`${a.targetNodeId}||${a.targetWidget}`] : []);
                                let firstValidWidgetDef = null, didAdd = false;

                                resolvedTargets.forEach(rt => {
                                    const index = ids.indexOf(rt.nodeIdStr);
                                    if (index !== -1) {
                                        ids.splice(index, 1);
                                        widgets = widgets.filter(w => !w.startsWith(rt.nodeIdStr + '||'));
                                    } else {
                                        ids.push(rt.nodeIdStr);
                                        didAdd = true;
                                        if (rt.widgetName) {
                                            const wVal = `${rt.nodeIdStr}||${rt.widgetName}`;
                                            if (!widgets.includes(wVal)) widgets.push(wVal);
                                            if (!firstValidWidgetDef) firstValidWidgetDef = getWidgetDef(rt.nodeIdStr, rt.widgetName);
                                        }
                                    }
                                });

                                a.targetNodeIds = ids;
                                a.targetNodeId = ids.length > 0 ? ids[0] : null;
                                a.targetWidgets = widgets;
                                a.targetWidget = widgets.length > 0 ? widgets[0].split('||')[1] : null;

                                if (didAdd && firstValidWidgetDef) {
                                    let isManual = true;
                                    if (Array.isArray(firstValidWidgetDef.type) || firstValidWidgetDef.type === "combo" || Array.isArray(firstValidWidgetDef.options?.values)) isManual = false;
                                    if (firstValidWidgetDef.type === "toggle" || typeof firstValidWidgetDef.value === "boolean") isManual = false;
                                    const hasVal = (a.value !== undefined && a.value !== null && a.value !== '');
                                    if (!isManual || !hasVal) a.value = firstValidWidgetDef.value;
                                    if (firstValidWidgetDef.type === "toggle" || typeof firstValidWidgetDef.value === "boolean") a.dataType = 'boolean';
                                    else if (typeof typeof firstValidWidgetDef.value === "number") a.dataType = 'number';
                                    else a.dataType = 'string';
                                }
                            });
                        } else {
                            el.classList.remove('open');
                            updateSelected(a => a.targetNodeId = val);
                        }
                    } else if (el.id === 'tb-fill-select-custom') {
                        el.classList.remove('open');
                        updateSelected(a => a.fillMode = val);
                    } else if (el.id === 'tb-widget-select-custom') {
                        if (!val) return;
                        updateSelected(a => {
                            let widgets = Array.isArray(a.targetWidgets) ? [...a.targetWidgets] : (a.targetWidget && a.targetNodeId ? [`${a.targetNodeId}||${a.targetWidget}`] : []);
                            if (widgets.includes(val)) widgets = widgets.filter(w => w !== val);
                            else widgets.push(val);
                            
                            a.targetWidgets = widgets;
                            
                            if (widgets.length > 0) {
                                const [nId, wName] = widgets[0].split('||');
                                a.targetNodeId = nId;
                                a.targetWidget = wName;
                                const widgetDef = getWidgetDef(nId, wName);
                                if (widgetDef) {
                                    let isManual = true;
                                    if (Array.isArray(widgetDef.type) || widgetDef.type === "combo" || Array.isArray(widgetDef.options?.values)) isManual = false;
                                    if (widgetDef.type === "toggle" || typeof widgetDef.value === "boolean") isManual = false;
                                    const hasVal = (a.value !== undefined && a.value !== null && a.value !== '');
                                    if (!isManual || !hasVal) a.value = widgetDef.value; 
                                    if (widgetDef.type === "toggle" || typeof widgetDef.value === "boolean") a.dataType = 'boolean';
                                    else if (typeof widgetDef.value === "number") a.dataType = 'number';
                                    else a.dataType = 'string';
                                }
                            } else {
                                a.targetWidget = null;
                            }
                        });
                    } else if (el.id === 'tb-ratio-select-custom') {
                        el.classList.remove('open');
                        updateSelected(a => {
                            a.ratio = val;
                            if (val !== '自定义比例' && val.includes(':')) {
                                const parts = val.split(':');
                                if (parts.length === 2) {
                                    a.width = parseInt(parts[0].trim(), 10);
                                    a.height = parseInt(parts[1].trim(), 10);
                                }
                            }
                        });
                    }
                });
            });
        });

        tb.querySelector('#tb-node-pick')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('sl_enter_binding_mode', { detail: mainType }));
        });

        tb.querySelector('#tb-reset-module')?.addEventListener('click', (e) => {
            e.stopPropagation();
            updateSelected(a => {
                a.targetNodeId = null; a.targetWidget = null; a.targetNodeIds = []; a.targetWidgets = []; a.value = ''; a.title = '';
                if (a.type === 'preview') {
                    a.matchMedia = true; a.ratio = '16:9'; a.fillMode = '显示全部'; a.width = ''; a.height = ''; a.resultUrl = '';
                    a.isManageMode = false;
                } else {
                    a.dataType = 'string'; a.autoHeight = true;
                }
            });
        });

        tb.querySelector('#tb-btn-sync-params')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (mainArea && selectedAreas.length > 0) {
                execSyncParams(mainArea, selectedAreas[0].card);
            }
        });

        if (mainType === 'preview') {
            const ratioW = tb.querySelector('#tb-ratio-w');
            const ratioH = tb.querySelector('#tb-ratio-h');
            const onDimKeydown = (e) => {
                if (e.key === 'Enter') { updateSelected(a => { a.ratio = '自定义比例'; a.width = ratioW.value; a.height = ratioH.value; }); e.target.blur(); }
            };
            if(ratioW) ratioW.onkeydown = onDimKeydown;
            if(ratioH) ratioH.onkeydown = onDimKeydown;
            const matchCb = tb.querySelector('#tb-match-media');
            if(matchCb) matchCb.onchange = e => updateSelected(a => a.matchMedia = e.target.checked);
        } else {
            const autoCb = tb.querySelector('#tb-auto-height');
            if(autoCb) autoCb.onchange = e => updateSelected(a => a.autoHeight = e.target.checked);
        }
    }

    // =========================================================================
    // 【核心升级】：多选批量矩阵克隆引擎
    // =========================================================================
    tb.querySelector('#tb-clone-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // 1. 批量克隆模块 (Areas)
        if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
            let newSelectedAreaIds = [];
            
            // 按卡片对选中的模块进行分组，保证在各自的卡片内进行操作
            const areasByCard = {};
            state.selectedAreaIds.forEach(areaId => {
                const card = state.cards.find(c => c.areas?.some(a => a.id === areaId));
                if (card) {
                    if (!areasByCard[card.id]) areasByCard[card.id] = [];
                    areasByCard[card.id].push(areaId);
                }
            });

            // 遍历每个受影响的卡片
            for (const cardId in areasByCard) {
                const card = state.cards.find(c => c.id === cardId);
                if (!card || !card.areas) continue;
                
                // 将该卡片内选中的模块按当前顺序排序
                const sortedAreaIdsToClone = areasByCard[cardId].sort((idA, idB) => {
                    return card.areas.findIndex(a => a.id === idA) - card.areas.findIndex(a => a.id === idB);
                });
                
                // 倒序遍历插入，确保多模块连续克隆时的相对顺序正确 (例如连选 1,2, 克隆后变为 1, 2, 1_copy, 2_copy)
                // 先找到这批模块中最后一个的位置作为插入锚点
                const lastSrcIndex = card.areas.findIndex(a => a.id === sortedAreaIdsToClone[sortedAreaIdsToClone.length - 1]);
                let insertBaseIndex = lastSrcIndex + 1;

                const clonedAreas = [];
                sortedAreaIdsToClone.forEach(areaId => {
                    const srcArea = card.areas.find(a => a.id === areaId);
                    if (srcArea) {
                        const newArea = JSON.parse(JSON.stringify(srcArea));
                        newArea.id = 'area_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
                        // 如果有历史记录也应清空，作为全新克隆体
                        if(newArea.type === 'preview') {
                            newArea.resultUrl = '';
                            newArea.history = [];
                            newArea.historyIndex = 0;
                            newArea.selectedThumbIndices = [];
                        }
                        clonedAreas.push(newArea);
                        newSelectedAreaIds.push(newArea.id);
                    }
                });
                
                // 批量插入克隆体
                card.areas.splice(insertBaseIndex, 0, ...clonedAreas);
            }
            
            // 更新选中状态为所有新克隆的模块
            state.selectedAreaIds = newSelectedAreaIds;
            saveAndRender();
            
            // 滚动定位
            setTimeout(() => {
                if(newSelectedAreaIds.length > 0) {
                     document.querySelector(`.sl-area[data-area-id="${newSelectedAreaIds[newSelectedAreaIds.length - 1]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 50);

        } 
        // 2. 批量克隆任务卡片 (Cards)
        else if (state.selectedCardIds && state.selectedCardIds.length > 0) {
            let newSelectedCardIds = [];
            
            // 按当前卡片顺序排序
            const sortedCardIdsToClone = [...state.selectedCardIds].sort((idA, idB) => {
                return state.cards.findIndex(c => c.id === idA) - state.cards.findIndex(c => c.id === idB);
            });
            
            const lastSrcIndex = state.cards.findIndex(c => c.id === sortedCardIdsToClone[sortedCardIdsToClone.length - 1]);
            let insertBaseIndex = lastSrcIndex + 1;
            
            const clonedCards = [];
            sortedCardIdsToClone.forEach(cardId => {
                const srcCard = state.cards.find(c => c.id === cardId);
                if (srcCard) {
                    const newCard = JSON.parse(JSON.stringify(srcCard));
                    newCard.id = 'card_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
                    // 为克隆卡片内的所有模块生成新ID
                    if (newCard.areas) {
                        newCard.areas.forEach(a => {
                            a.id = 'area_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
                            if(a.type === 'preview') {
                                a.resultUrl = '';
                                a.history = [];
                                a.historyIndex = 0;
                                a.selectedThumbIndices = [];
                            }
                        });
                    }
                    clonedCards.push(newCard);
                    newSelectedCardIds.push(newCard.id);
                }
            });
            
            state.cards.splice(insertBaseIndex, 0, ...clonedCards);
            state.selectedCardIds = newSelectedCardIds;
            state.activeCardId = newSelectedCardIds[newSelectedCardIds.length - 1];
            
            saveAndRender();
            
            setTimeout(() => {
                if(newSelectedCardIds.length > 0) {
                     document.querySelector(`.sl-card[data-card-id="${newSelectedCardIds[newSelectedCardIds.length - 1]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }, 50);
        }
    });
    
    tb.querySelector('#tb-format-painter')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.painterMode) {
            state.painterMode = false;
            state.painterSource = null;
        } else {
            state.painterMode = true;
            if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
                let srcArea = null;
                state.cards.forEach(c => c.areas?.forEach(a => { if (a.id === state.selectedAreaIds[0]) srcArea = a; }));
                state.painterSource = { type: 'area', data: JSON.parse(JSON.stringify(srcArea)) };
            } else if (state.selectedCardIds && state.selectedCardIds.length > 0) {
                const srcCard = state.cards.find(c => c.id === state.selectedCardIds[0]);
                state.painterSource = { type: 'card', data: JSON.parse(JSON.stringify(srcCard)) };
            }
        }
        saveAndRender();
    });
}