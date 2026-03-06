/**
 * 文件名: module_input.js
 * 职责: 负责卡片内“输入模块”的 UI 渲染与交互 (文本、布尔、下拉、文件上传)
 */
import { state, saveAndRender } from "../ui_state.js";
import { buildCustomSelect, getWidgetDef, truncateString } from "../ui_utils.js";
import { uploadImageToServer } from "../actions/action_data_io.js";
import { app } from "../../../../scripts/app.js";

export function generateInputHTML(area, card) {
    const isAreaSelected = state.selectedAreaIds.includes(area.id);
    
    const editAreas = card.areas.filter(a => a.type === 'edit');
    const editIndex = editAreas.findIndex(a => a.id === area.id) + 1;
    const defaultTitle = `##${editIndex}`;
    const displayTitle = area.title ? area.title : defaultTitle;

    let hintText = '未绑定参数';
    let fullHintText = '未绑定参数'; 
    let primaryNodeId = area.targetNodeId;
    let primaryWidget = area.targetWidget;
    
    let targets = [];
    if (Array.isArray(area.targetWidgets) && area.targetWidgets.length > 0) {
        targets = area.targetWidgets.map(tw => {
            const [nId, wName] = tw.split('||');
            return { nodeId: nId, widget: wName };
        });
    } else if (area.targetNodeId && area.targetWidget) {
        targets = [{ nodeId: area.targetNodeId, widget: area.targetWidget }];
    }

    if (targets.length === 1) {
        const t = targets[0];
        primaryNodeId = t.nodeId;
        primaryWidget = t.widget;
        const node = app.graph ? app.graph.getNodeById(Number(t.nodeId)) : null;
        const nodeName = node ? (node.title || node.type) : `Node:${t.nodeId}`;
        hintText = `${truncateString(t.widget, 8)} (${truncateString(nodeName, 4)})`;
        fullHintText = `节点ID: ${t.nodeId}\n节点名称: ${nodeName}\n绑定参数: ${t.widget}`;
    } else if (targets.length > 1) {
        const firstT = targets[0];
        primaryNodeId = firstT.nodeId;
        primaryWidget = firstT.widget;
        
        const nodeIdsStr = targets.map(t => `[${t.nodeId}]`).join('');
        hintText = `${truncateString(firstT.widget, 8)}${nodeIdsStr}`;
        
        fullHintText = `批量绑定了 ${targets.length} 个参数:\n` + targets.map(t => {
            const n = app.graph ? app.graph.getNodeById(Number(t.nodeId)) : null;
            return `[${t.nodeId}] ${n ? (n.title || n.type) : '未知节点'} : ${t.widget}`;
        }).join('\n');
    } else if (area.targetNodeId) {
        const node = app.graph ? app.graph.getNodeById(Number(area.targetNodeId)) : null;
        const nodeName = node ? (node.title || node.type) : `Node:${area.targetNodeId}`;
        hintText = `未绑定参数 (${truncateString(nodeName, 4)})`;
        fullHintText = `未绑定参数 (${nodeName})`;
    } else if (area.targetWidget) {
        hintText = truncateString(area.targetWidget, 8);
        fullHintText = area.targetWidget;
    }

    const widgetDef = getWidgetDef(primaryNodeId, primaryWidget); 
    
    let inputHtml = '';
    let isUpload = false;
    let uploadType = 'file';
    let comboValues = [];
    
    if (widgetDef) {
        let opts = widgetDef.options || {};
        const isComboWidget = widgetDef.type === "combo" || Array.isArray(widgetDef.type) || Array.isArray(opts.values);
        
        const node = app.graph ? app.graph.getNodeById(Number(primaryNodeId)) : null;
        if (node && node.constructor && node.constructor.nodeData) {
            const nodeData = node.constructor.nodeData;
            const inputs = { ...(nodeData.input?.required || {}), ...(nodeData.input?.optional || {}) };
            
            if (inputs[primaryWidget] && Array.isArray(inputs[primaryWidget]) && inputs[primaryWidget].length > 1) {
                const pyDict = inputs[primaryWidget][1]; 
                if (pyDict && typeof pyDict === 'object') {
                    opts = { ...opts, ...pyDict }; 
                }
            }
        }

        if (opts.image_upload || opts.upload === 'image_upload' || opts.upload === 'image') { isUpload = true; uploadType = 'image'; }
        else if (opts.video_upload || opts.upload === 'video_upload' || opts.upload === 'video') { isUpload = true; uploadType = 'video'; }
        else if (opts.audio_upload || opts.upload === 'audio_upload' || opts.upload === 'audio') { isUpload = true; uploadType = 'audio'; }
        else if (opts.file_upload || opts.upload === 'file_upload' || opts.upload === 'model' || opts.upload === true) { isUpload = true; uploadType = 'file'; }
        
        else if (node && isComboWidget) {
            if (primaryWidget === 'image' && node.type === 'LoadImage') { isUpload = true; uploadType = 'image'; }
            else if (primaryWidget === 'video' && node.type === 'VHS_LoadVideo') { isUpload = true; uploadType = 'video'; }
        }

        if (Array.isArray(widgetDef.type)) {
            comboValues = widgetDef.type;
        } else if (isComboWidget) {
            comboValues = opts.values || [];
        }
    }

    if (isUpload) {
        let iconSvg = '';
        if (uploadType === 'image') {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        } else if (uploadType === 'video') {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
        } else {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
        }

        let acceptType = "*/*";
        if (uploadType === 'image') acceptType = "image/*";
        else if (uploadType === 'video') acceptType = "video/*";
        else if (uploadType === 'audio') acceptType = "audio/*";

        const isMedia = (uploadType === 'image' || uploadType === 'video');
        const ratioStyle = isMedia ? 'aspect-ratio: 16 / 9;' : '';

        if (area.value) {
            let previewHtml = '';
            const fileUrl = `/view?filename=${encodeURIComponent(area.value)}&type=input`;
            
            if (uploadType === 'image') {
                previewHtml = `<img src="${fileUrl}" draggable="false" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: block;" onerror="this.style.display='none';" />`;
            } else if (uploadType === 'video') {
                previewHtml = `<video src="${fileUrl}" draggable="false" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: block;" autoplay loop muted onerror="this.style.display='none';"></video>`;
            } else if (uploadType === 'audio') {
                previewHtml = `<audio src="${fileUrl}" controls style="position: relative; z-index: 1; width: 90%; height: 40px; margin: 20px 5%;" onerror="this.style.display='none';"></audio>`;
            } else {
                previewHtml = `<div style="font-size: 24px; color: #666; padding: 30px 0; position: relative; z-index: 1;">📄</div>`;
            }

            const minHeightStyle = isMedia ? '' : 'min-height: 80px;';

            inputHtml = `
                <div class="sl-upload-zone has-file" data-card="${card.id}" data-area="${area.id}" 
                     style="border: 1px solid #444; border-radius: 6px; padding: 0; position: relative; text-align: center; cursor: pointer; background: rgba(0,0,0,0.3); transition: border-color 0.2s; ${minHeightStyle} ${ratioStyle} display: flex; align-items: center; justify-content: center; overflow: hidden;">
                    <input type="file" class="sl-file-input" accept="${acceptType}" style="display:none;" />
                    ${previewHtml}
                </div>
            `;
        } else {
            const emptyPadding = isMedia ? '' : 'padding: 16px 10px;';
            const emptyFlex = isMedia ? 'display: flex; flex-direction: column; justify-content: center; align-items: center;' : '';

            inputHtml = `
                <div class="sl-upload-zone" data-card="${card.id}" data-area="${area.id}" style="border: 1px dashed #666; border-radius: 6px; text-align: center; cursor: pointer; color: #999; background: rgba(0,0,0,0.1); transition: all 0.2s; box-sizing: border-box; ${emptyPadding} ${emptyFlex} ${ratioStyle}">
                    <input type="file" class="sl-file-input" accept="${acceptType}" style="display:none;" />
                    <div style="margin-bottom: 8px; color: #666;">${iconSvg}</div>
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 4px; color: #ccc;">上传${uploadType === 'image' ? '图片' : uploadType === 'video' ? '视频' : uploadType === 'audio' ? '音频' : '文件'}</div>
                    <div style="font-size: 10px; color: #666;">点击或拖拽至此处上传服务器</div>
                </div>
            `;
        }

        if (comboValues.length > 0) {
            let itemsHtml = comboValues.map(opt => `<div class="sl-custom-select-item ${area.value === opt ? 'selected' : ''}" data-value="${opt}">${opt}</div>`).join('');
            let currentVal = area.value || comboValues[0] || '或选择服务器已有文件...';
            const comboHtml = buildCustomSelect(`area-select-${area.id}`, '100%', currentVal, itemsHtml, false, `data-card-id="${card.id}" data-area-id="${area.id}" data-type="module-combo"`);
            inputHtml += `<div style="margin-top: 6px; position:relative;">${comboHtml}</div>`;
        }

    } else if (comboValues.length > 0) {
        let itemsHtml = comboValues.map(opt => `<div class="sl-custom-select-item ${area.value === opt ? 'selected' : ''}" data-value="${opt}">${opt}</div>`).join('');
        let currentVal = area.value || comboValues[0] || '选择...';
        inputHtml = buildCustomSelect(`area-select-${area.id}`, '100%', currentVal, itemsHtml, false, `data-card-id="${card.id}" data-area-id="${area.id}" data-type="module-combo"`);
    } else if (widgetDef && (widgetDef.type === "toggle" || typeof widgetDef.value === "boolean")) {
        let isChecked = (area.value === true || area.value === 'true');
        inputHtml = `
            <label class="sl-bool-label" style="display:flex; align-items:center; gap:8px; color:#fff; cursor:pointer; font-size:13px; background:rgba(0,0,0,0.5); padding:8px; border-radius:4px; border:1px solid #555; width: 100%; box-sizing: border-box; margin:0;">
                <input type="checkbox" class="sl-edit-val-bool" data-card="${card.id}" data-area="${area.id}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; margin:0; cursor:pointer;"> 
                <span>${isChecked ? 'True' : 'False'}</span>
            </label>
        `;
    } else {
        inputHtml = `<textarea class="sl-input sl-edit-val" data-card="${card.id}" data-area="${area.id}" placeholder="输入参数值..." style="display:block; margin:0; box-sizing:border-box; ${area.autoHeight ? 'height: auto; resize: none; overflow: hidden;' : ''}">${area.value || ''}</textarea>`;
    }

    return `
        <div class="sl-area ${isAreaSelected ? 'active' : ''}" draggable="true" data-card-id="${card.id}" data-area-id="${area.id}" style="overflow: visible;">
            <button class="sl-del-area-btn" data-card="${card.id}" data-area="${area.id}" title="删除输入">✖</button>
            
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:4px; padding: 8px 8px 0 8px;">
                <input class="sl-area-title-input" data-card="${card.id}" data-area="${area.id}" type="text" value="${displayTitle}" placeholder="${defaultTitle}" size="${Math.max(displayTitle.length, 2)}" style="max-width:150px; min-width:15px; background:transparent; border:none; color:#ddd; font-weight:normal; font-size:12px; outline:none; font-family:sans-serif; padding:0; margin:0;" />
                
                <div style="font-size:10px; color:#888; font-weight:normal; text-align:right; white-space:nowrap; pointer-events:none;" title="${fullHintText}">
                    ${hintText}
                </div>
            </div>

            <div style="padding: 0 8px 8px 8px;">
                ${inputHtml}
            </div>
        </div>
    `;
}

export function attachInputEvents(container) {
    const applySurgicalUpdate = (areaId) => {
        if (window._slSurgicallyUpdateArea) {
            window._slSurgicallyUpdateArea(areaId);
            if (window._slJustSave) window._slJustSave();
        } else {
            saveAndRender();
        }
    };

    container.querySelectorAll('.sl-upload-zone').forEach(zone => {
        const fileInput = zone.querySelector('.sl-file-input');
        if (!fileInput) return;

        zone.onclick = (e) => {
            if(e.target.closest('.sl-custom-select')) return; 
            e.stopPropagation();
            fileInput.click();
        };

        const handleUpload = async (file) => {
            if(!file) return;
            const cardId = zone.dataset.card;
            const areaId = zone.dataset.area;
            
            zone.style.pointerEvents = 'none';
            zone.innerHTML = `
                <style>@keyframes sl-spin { 100% { transform: rotate(360deg); } }</style>
                <div style="padding: 16px 10px; text-align: center; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; height: 100%; width: 100%;">
                    <svg style="animation: sl-spin 1s linear infinite; margin-right: 6px; width:16px; height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                        <line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                    </svg>
                    正在加密上传至服务器...
                </div>
            `;

            try {
                const data = await uploadImageToServer(file);
                if (data.name) {
                    const card = state.cards.find(c => c.id === cardId);
                    const area = card?.areas.find(a => a.id === areaId);
                    if (area) {
                        area.value = data.name;
                        state.selectedAreaIds = [areaId];
                        state.selectedCardIds = [];
                        applySurgicalUpdate(areaId);
                    }
                }
            } catch(err) {
                alert('本地文件上传失败: ' + err.message);
                applySurgicalUpdate(areaId);
            }
        };

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            handleUpload(file);
            e.target.value = ''; 
        };

        zone.addEventListener('dragover', (e) => {
            if(e.dataTransfer.types.includes('Files')) {
                e.preventDefault(); e.stopPropagation();
                zone.style.borderColor = '#fff';
                zone.style.background = 'rgba(255,255,255,0.15)';
            }
        });

        zone.addEventListener('dragleave', (e) => {
            if(e.dataTransfer.types.includes('Files')) {
                e.preventDefault(); e.stopPropagation();
                zone.style.borderColor = zone.classList.contains('has-file') ? '#444' : '#666';
                zone.style.background = zone.classList.contains('has-file') ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)';
            }
        });

        zone.addEventListener('drop', (e) => {
            if(e.dataTransfer.types.includes('Files')) {
                e.preventDefault(); e.stopPropagation();
                const file = e.dataTransfer.files[0];
                handleUpload(file);
            }
        });
    });

    container.querySelectorAll('.sl-edit-val-bool').forEach(cb => {
        cb.onchange = (e) => {
            const { card: cardId, area: areaId } = e.target.dataset;
            const card = state.cards.find(c => c.id === cardId);
            const area = card.areas.find(a => a.id === areaId);
            if(area) {
                area.value = e.target.checked;
                state.selectedAreaIds = [areaId];
                state.selectedCardIds = [];
                applySurgicalUpdate(areaId);
            }
        };
    });

    container.querySelectorAll('.sl-edit-val').forEach(ta => {
        if (ta.style.height === 'auto') ta.style.height = (ta.scrollHeight) + 'px';
        ta.oninput = (e) => {
            if (ta.style.height === 'auto' || ta.style.resize === 'none') {
                ta.style.height = 'auto';
                ta.style.height = (ta.scrollHeight) + 'px';
            }
            const { card: cardId, area: areaId } = e.target.dataset;
            const card = state.cards.find(c => c.id === cardId);
            const area = card.areas.find(a => a.id === areaId);
            if(area) {
                area.value = e.target.value;
                if (window._slJustSave) window._slJustSave();
                else if (window.ShellLink) window.ShellLink.saveState(state);
            }
        };
    });
}