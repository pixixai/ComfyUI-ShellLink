/**
 * 文件名: action_binding.js
 * 职责: 负责“进入绑定模式”后，拦截画布交互，抓取并解析用户点击的目标节点，并完成参数映射
 */
import { app } from "../../../../scripts/app.js";
import { state, appState, saveAndRender } from "../ui_state.js";
import { showBindingToast, hideBindingToast, getWidgetDef } from "../ui_utils.js";

export function enterBindingModeForSelected(targetType, panelContainer, backdropContainer) {
    if (!state.selectedAreaIds || state.selectedAreaIds.length === 0) return;

    appState.isBindingMode = true;
    if (panelContainer) panelContainer.classList.remove('visible');
    if (backdropContainer) backdropContainer.classList.remove('visible');
    
    showBindingToast("🖱️ 请在工作流中点击节点 (左键=替换，右键=追加，点击空白处取消)...");
    
    if (app.canvas) {
        app.canvas.deselectAllNodes();
        
        if (!app.canvas._clabHijackedContextMenu) {
            const origProcessContextMenu = app.canvas.processContextMenu;
            app.canvas.processContextMenu = function() {
                if (appState.isBindingMode) return; 
                return origProcessContextMenu.apply(this, arguments);
            };
            app.canvas._clabHijackedContextMenu = true;
        }
    }

    const onPointerUp = (e) => {
        if (e.button !== 0 && e.button !== 2) return;

        const isAppend = (e.button === 2);

        setTimeout(() => {
            hideBindingToast();
            appState.isBindingMode = false;
            if (panelContainer) panelContainer.classList.add('visible');
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