/**
 * 文件: module_input.js
 * 职责: 渲染并处理输入模块 UI（文本、布尔、下拉、媒体上传等）。
 */
import { state, saveAndRender } from "../ui_state.js";
import { buildCustomSelect, getWidgetDef, truncateString } from "../ui_utils.js";
import { uploadImageToServer } from "../actions/action_data_io.js";
import { app } from "../../../../scripts/app.js";
import { renderVideo } from "./media_types/media_video.js";
import { renderAudio } from "./media_types/media_audio.js";
import { attachMediaEvents } from "./module_media.js";

export function generateInputHTML(area, card) {
    const isAreaSelected = state.selectedAreaIds.includes(area.id);
    const nodeBypassedClass = (area.runtimeNodeBypassed === true || area.runtimeNodeDisabled === true) ? "clab-node-bypassed" : "";
    
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
    
    // 关键修复：即使 widgetDef 暂时为空，也提前初始化 opts/wType，避免后续分支漏判。
    let opts = widgetDef ? (widgetDef.options || {}) : {};
    let wType = widgetDef ? widgetDef.type : null;
    let isComboWidget = widgetDef ? (wType === "combo" || Array.isArray(wType) || Array.isArray(opts.values)) : false;

    const node = app.graph ? app.graph.getNodeById(Number(primaryNodeId)) : null;
    
    // 核心兜底：ComfyUI 刚启动时 widgetDef 可能尚未懒加载完成（为 null），
    // 但 constructor.nodeData 仍可读取到原始输入定义，可用于判断参数类型与上传能力。
    if (node && node.constructor && node.constructor.nodeData) {
        const nodeData = node.constructor.nodeData;
        const inputs = { ...(nodeData.input?.required || {}), ...(nodeData.input?.optional || {}) };
        
        if (inputs[primaryWidget]) {
            const pyType = inputs[primaryWidget][0];
            const pyDict = inputs[primaryWidget][1];
            
            if (Array.isArray(pyType)) {
                wType = "combo";
                comboValues = pyType;
                isComboWidget = true;
            } else if (!wType) {
                wType = pyType;
            }

            if (pyDict && typeof pyDict === 'object') {
                opts = { ...opts, ...pyDict }; 
            }
        }
    }

    // 只要 options 中带 upload 标记，就强制走媒体上传组件渲染（不依赖 widgetDef 是否可用）。
    if (opts.image_upload || opts.upload === 'image_upload' || opts.upload === 'image') { isUpload = true; uploadType = 'image'; }
    else if (opts.video_upload || opts.upload === 'video_upload' || opts.upload === 'video') { isUpload = true; uploadType = 'video'; }
    else if (opts.audio_upload || opts.upload === 'audio_upload' || opts.upload === 'audio') { isUpload = true; uploadType = 'audio'; }
    else if (opts.file_upload || opts.upload === 'file_upload' || opts.upload === 'model' || opts.upload === true) { isUpload = true; uploadType = 'file'; }
    else if (node && isComboWidget) {
        if (primaryWidget === 'image' && node.type === 'LoadImage') { isUpload = true; uploadType = 'image'; }
        else if (primaryWidget === 'video' && node.type === 'VHS_LoadVideo') { isUpload = true; uploadType = 'video'; }
    }

    if (!comboValues.length) {
        if (Array.isArray(wType)) {
            comboValues = wType;
        } else if (isComboWidget && Array.isArray(opts.values)) {
            comboValues = opts.values;
        }
    }

    const escapeHtml = (str = '') => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    if (isUpload) {
        let iconSvg = '';
        const cloudUploadIconSvg = `<svg width="15" height="15" viewBox="0 0 171.37 147.71" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M43.68,51.32h116.52c3.4,0,6.16,2.76,6.16,6.16v79.08c0,3.4-2.76,6.16-6.16,6.16H37.52V57.48c0-3.4,2.76-6.16,6.16-6.16Z" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M141.73,51.32v-16.5c0-3.4-2.76-6.16-6.16-6.16h-45.57c-3.4,0-6.16-2.76-6.16-6.16v-11.33c0-3.4-2.76-6.16-6.16-6.16H11.16c-3.4,0-6.16,2.76-6.16,6.16v125.39c0,3.4,2.76,6.16,6.16,6.16h26.36" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><line x1="79.44" y1="97.02" x2="124.44" y2="97.02" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><line x1="101.94" y1="119.52" x2="101.94" y2="74.52" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const fileIconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"></path><path d="M14 2v5h5"></path></svg>`;
        const fileTopIconSvg = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"></path><path d="M14 2v5h5"></path></svg>`;
        const removeIconSvg = `<svg width="15" height="15" viewBox="0 0 174.7 167.95" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line x1="46.03" y1="6" x2="158.33" y2="139.83" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><line x1="80.57" y1="91.05" x2="45.49" y2="120.48" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><line x1="123.23" y1="55.25" x2="102.18" y2="72.92" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M47.29,51.39l-22.8,19.13C2.59,88.9-.27,121.56,18.11,143.46h0c18.38,21.9,51.03,24.76,72.93,6.38l22.8-19.13" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M83.65,20.88l-14.75,12.37,66.55,79.31,14.75-12.37c21.9-18.38,24.76-51.03,6.38-72.93h0c-18.38-21.9-51.03-24.76-72.93-6.38Z" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const getDisplayFileName = (rawPath) => {
            const raw = String(rawPath || '');
            if (!raw) return '';
            const parts = raw.split(/[\\/]/);
            return parts[parts.length - 1] || raw;
        };
        const buildFileUploadPanel = (rawFileName, hasFile) => {
            const fileName = hasFile ? getDisplayFileName(rawFileName) : 'No file selected';
            const safeName = escapeHtml(fileName);
            const removeDisabledAttr = hasFile ? '' : 'disabled';
            const removeDisabledStyle = hasFile ? '' : 'opacity: 0.45; cursor: not-allowed; pointer-events: none;';
            return `
                <div class="clab-file-upload-shell" style="width: 100%; display: flex; flex-direction: column; gap: 8px; position: relative; z-index: 1; align-items: center;">
                    <div class="clab-file-upload-top" style="width: 100%; min-height: 84px; border: 1px solid #4a4a4a; border-radius: 6px; background: rgba(255,255,255,0.03); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 10px 12px; box-sizing: border-box;">
                        <span style="display:flex; align-items:center; justify-content:center; color: ${hasFile ? '#9aa4b2' : '#666'};">${fileTopIconSvg}</span>
                        <span class="clab-file-upload-name" title="${safeName}" style="max-width: 100%; min-width: 0; font-size: 12px; color: ${hasFile ? '#ddd' : '#888'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;">${safeName}</span>
                    </div>
                    <div class="clab-file-upload-actions" style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <button type="button" class="clab-file-upload-btn clab-icon-only-btn" title="Upload file"
                            style="height: 24px; width: 24px; min-width: 24px; padding: 0; border: none; border-radius: 0; background: transparent; color: #cfcfcf; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: none; outline: none; appearance: none; -webkit-appearance: none; opacity: 0.82; transition: opacity 0.16s ease, filter 0.16s ease, color 0.16s ease;">
                            ${cloudUploadIconSvg}
                        </button>
                        <button type="button" class="clab-file-remove-btn clab-icon-only-btn" title="Remove file" ${removeDisabledAttr}
                            style="height: 24px; width: 24px; min-width: 24px; padding: 0; border: none; border-radius: 0; background: transparent; color: #cfcfcf; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: none; outline: none; appearance: none; -webkit-appearance: none; opacity: 0.82; transition: opacity 0.16s ease, filter 0.16s ease, color 0.16s ease; ${removeDisabledStyle}">
                            ${removeIconSvg}
                        </button>
                    </div>
                </div>
            `;
        };
        if (uploadType === 'image') {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        } else if (uploadType === 'video') {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
        } else if (uploadType === 'audio') {
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
        } else {
            iconSvg = fileIconSvg;
        }

        let acceptType = "*/*";
        if (uploadType === 'image') acceptType = "image/*";
        else if (uploadType === 'video') acceptType = "video/*";
        else if (uploadType === 'audio') acceptType = "audio/*";

        const isImageUpload = uploadType === 'image';
        const isVideoUpload = uploadType === 'video';
        const isAudioUpload = uploadType === 'audio';
        const isFileUpload = uploadType === 'file';
        const useButtonUpload = isImageUpload || isVideoUpload || isAudioUpload;
        const mediaAutoRatio = (isImageUpload || isVideoUpload) && area.autoHeight !== false;
        const isMedia = (uploadType === 'image' || uploadType === 'video');
        const ratioStyle = isMedia ? 'aspect-ratio: 16 / 9;' : '';

        if (area.value) {
            let previewHtml = '';
            const fileUrl = `/view?filename=${encodeURIComponent(area.value)}&type=input`;
            const errCall = `if(window.CLab && window.CLab.handleMediaError) window.CLab.handleMediaError('${card.id}', '${area.id}', '${fileUrl}');`;
            
            const fallbackHtml = `
                <div class="clab-upload-fallback" style="display: none; position: absolute; inset: 0; flex-direction: column; justify-content: center; align-items: center; z-index: 2; background: rgba(0,0,0,0.2);">
                    <div style="margin-bottom: 8px; color: #ff5555;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </div>
                    <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px; color: #ccc;">文件已失效 / 格式不匹配</div>
                    <div style="font-size: 10px; color: #888;">点击重新上传覆盖此参数</div>
                </div>
            `;

            if (uploadType === 'image') {
                const imageOnLoad = mediaAutoRatio
                    ? "const p=this.parentElement; if(p&&this.naturalWidth&&this.naturalHeight){p.style.aspectRatio=this.naturalWidth + ' / ' + this.naturalHeight; p.style.height='auto';}"
                    : "";
                previewHtml = `
                    <img class="clab-preview-img clab-media-target" src="${fileUrl}" draggable="false" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: block;" onload="${imageOnLoad}" onerror="this.style.display='none'; const fb=this.parentElement.querySelector('.clab-upload-fallback'); if(fb) fb.style.display='flex';" />
                    ${fallbackHtml}
                `;
            } else if (uploadType === 'video') {
                previewHtml = renderVideo({ ...area, id: area.id }, 'contain', fileUrl, errCall);
            } else if (uploadType === 'audio') {
                previewHtml = renderAudio({ ...area, id: area.id, matchMedia: false }, fileUrl, errCall);
            } else if (uploadType === 'file') {
                previewHtml = buildFileUploadPanel(area.value, true);
            } else {
                previewHtml = `<div style="color: #666; padding: 30px 0; position: relative; z-index: 1; display: flex; align-items: center; justify-content: center;">${fileIconSvg}</div>`;
            }

            const minHeightStyle = isMedia ? '' : (isFileUpload ? 'min-height: 96px;' : 'min-height: 80px;');
            const zonePadding = isFileUpload ? 'padding: 8px;' : 'padding: 0;';
            const zoneTextAlign = isFileUpload ? 'text-align: left;' : 'text-align: center;';
            const zoneLayout = isFileUpload ? 'display: block;' : 'display: flex; align-items: center; justify-content: center;';
            const zoneCursor = isFileUpload ? 'cursor: default;' : 'cursor: pointer;';

            inputHtml = `
                <div class="clab-upload-zone has-file" data-card="${card.id}" data-area="${area.id}" data-upload-type="${uploadType}" data-auto-ratio="${mediaAutoRatio ? '1' : '0'}"
                     style="border: 1px solid #444; border-radius: 6px; ${zonePadding} position: relative; ${zoneTextAlign} ${zoneCursor} background: rgba(0,0,0,0.3); transition: border-color 0.2s; ${minHeightStyle} ${ratioStyle} ${zoneLayout} overflow: hidden;">
                    <input type="file" class="clab-file-input" data-upload-type="${uploadType}" accept="${acceptType}" style="display:none;" />
                    ${previewHtml}
                </div>
            `;
        } else {
            const emptyPadding = isMedia ? '' : (isFileUpload ? 'padding: 8px;' : 'padding: 16px 10px;');
            const emptyFlex = isMedia ? 'display: flex; flex-direction: column; justify-content: center; align-items: center;' : '';
            const emptyTextAlign = isFileUpload ? 'text-align: left;' : 'text-align: center;';
            const emptyCursor = isFileUpload ? 'cursor: default;' : 'cursor: pointer;';
            let emptyInnerHtml = `
                    <div style="margin-bottom: 8px; color: #666;">${iconSvg}</div>
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 4px; color: #ccc;">上传${uploadType === 'image' ? '图片' : uploadType === 'video' ? '视频' : uploadType === 'audio' ? '音频' : '文件'}</div>
                    <div style="font-size: 10px; color: #666;">点击、粘贴或拖拽上传到服务器</div>
            `;
            if (isFileUpload) {
                emptyInnerHtml = buildFileUploadPanel('', false);
            }

            inputHtml = `
                <div class="clab-upload-zone" data-card="${card.id}" data-area="${area.id}" data-upload-type="${uploadType}" data-auto-ratio="${mediaAutoRatio ? '1' : '0'}" style="border: 1px dashed #666; border-radius: 6px; ${emptyTextAlign} ${emptyCursor} color: #999; background: rgba(0,0,0,0.1); transition: all 0.2s; box-sizing: border-box; ${emptyPadding} ${emptyFlex} ${ratioStyle}">
                    <input type="file" class="clab-file-input" data-upload-type="${uploadType}" accept="${acceptType}" style="display:none;" />
                    ${emptyInnerHtml}
                </div>
            `;
        }

        const uploadButtonHtml = useButtonUpload ? `
            <button type="button" class="clab-upload-trigger-btn clab-icon-only-btn" data-card="${card.id}" data-area="${area.id}" title="Upload media"
                style="height: 24px; width: 24px; min-width: 24px; padding: 0; border: none; border-radius: 0; background: transparent; color: #cfcfcf; cursor: pointer; display:flex; align-items:center; justify-content:center; box-shadow:none; outline:none; appearance:none; -webkit-appearance:none; opacity: 0.82; transition: opacity 0.16s ease, filter 0.16s ease, color 0.16s ease;">
                ${cloudUploadIconSvg}
            </button>
        ` : '';
        const clearDisabledAttr = area.value ? '' : 'disabled';
        const clearDisabledStyle = area.value ? '' : 'opacity: 0.45; cursor: not-allowed; pointer-events: none;';
        const clearButtonHtml = useButtonUpload ? `
            <button type="button" class="clab-upload-clear-btn clab-icon-only-btn" data-card="${card.id}" data-area="${area.id}" title="Clear media" ${clearDisabledAttr}
                style="height: 24px; width: 24px; min-width: 24px; padding: 0; border: none; border-radius: 0; background: transparent; color: #cfcfcf; cursor: pointer; display:flex; align-items:center; justify-content:center; box-shadow:none; outline:none; appearance:none; -webkit-appearance:none; opacity: 0.82; transition: opacity 0.16s ease, filter 0.16s ease, color 0.16s ease; ${clearDisabledStyle}">
                ${removeIconSvg}
            </button>
        ` : '';
        const mediaActionButtons = useButtonUpload ? `
            <div style="display:flex; align-items:center; gap:6px;">
                ${uploadButtonHtml}
                ${clearButtonHtml}
            </div>
        ` : '';

        if (comboValues.length > 0) {
            let itemsHtml = comboValues.map(opt => `<div class="clab-custom-select-item ${area.value === opt ? 'selected' : ''}" data-value="${opt}">${opt}</div>`).join('');
            let currentVal = area.value || comboValues[0] || '或选择服务器已有文件...';
            const comboHtml = buildCustomSelect(`area-select-${area.id}`, '100%', currentVal, itemsHtml, false, `data-card-id="${card.id}" data-area-id="${area.id}" data-type="module-combo"`);
            if (useButtonUpload) {
                inputHtml += `
                    <div style="margin-top: 6px; position:relative; display:flex; align-items:center; gap:6px;">
                        <div style="position: relative; flex: 1; min-width: 0;">${comboHtml}</div>
                        ${mediaActionButtons}
                    </div>
                `;
            } else {
                inputHtml += `<div style="margin-top: 6px; position:relative;">${comboHtml}</div>`;
            }
        } else if (useButtonUpload) {
            inputHtml += `<div style="margin-top: 6px; display:flex; justify-content:flex-end;">${mediaActionButtons}</div>`;
        }

    } else if (comboValues.length > 0) {
        let itemsHtml = comboValues.map(opt => `<div class="clab-custom-select-item ${area.value === opt ? 'selected' : ''}" data-value="${opt}">${opt}</div>`).join('');
        let currentVal = area.value || comboValues[0] || '选择...';
        inputHtml = buildCustomSelect(`area-select-${area.id}`, '100%', currentVal, itemsHtml, false, `data-card-id="${card.id}" data-area-id="${area.id}" data-type="module-combo"`);
    } else if (widgetDef && (widgetDef.type === "toggle" || typeof widgetDef.value === "boolean")) {
        let isChecked = (area.value === true || area.value === 'true');
        inputHtml = `
            <label class="clab-bool-label" style="display:flex; align-items:center; gap:8px; color:#fff; cursor:pointer; font-size:13px; background:rgba(0,0,0,0.5); padding:8px; border-radius:4px; border:1px solid #555; width: 100%; box-sizing: border-box; margin:0;">
                <input type="checkbox" class="clab-edit-val-bool" data-card="${card.id}" data-area="${area.id}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; margin:0; cursor:pointer;"> 
                <span>${isChecked ? 'True' : 'False'}</span>
            </label>
        `;
    } else {
        // 文本框高度防抖更新：移除 height:auto 造成的跳动，并显式取消 max-height 限制。
        inputHtml = `<textarea class="clab-input clab-edit-val" data-card="${card.id}" data-area="${area.id}" placeholder="输入参数值..." style="display:block; margin:0; box-sizing:border-box; ${area.autoHeight ? 'min-height: 40px; resize: none; overflow: hidden; max-height: none !important;' : ''}">${area.value || ''}</textarea>`;
    }

    return `
        <div class="clab-area ${isAreaSelected ? 'active' : ''} ${nodeBypassedClass}" draggable="true" data-card-id="${card.id}" data-area-id="${area.id}" style="overflow: visible;">
            <button class="clab-del-area-btn" data-card="${card.id}" data-area="${area.id}" title="删除输入">&#10006;</button>
            
            <div class="clab-input-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:4px; padding: 8px 8px 0 8px;">
                <input class="clab-area-title-input" data-card="${card.id}" data-area="${area.id}" type="text" value="${displayTitle}" placeholder="${defaultTitle}" size="${Math.max(displayTitle.length, 2)}" style="max-width:150px; min-width:15px; background:transparent; border:none; color:#ddd; font-weight:normal; font-size:12px; outline:none; font-family:sans-serif; padding:0; margin:0;" />
                
                <div class="clab-input-binding-hint" style="font-size:10px; color:#888; font-weight:normal; text-align:right; white-space:nowrap; pointer-events:none;" title="${fullHintText}">
                    ${hintText}
                </div>
            </div>

            <div class="clab-input-body" style="padding: 0 8px 8px 8px;">
                ${inputHtml}
            </div>
        </div>
    `;
}

function getInputRefreshSignature(root) {
    if (!root) return "none";
    const parts = [];
    if (root.querySelector(".clab-upload-zone")) parts.push("upload");
    if (root.querySelector('.clab-custom-select[data-type="module-combo"]')) parts.push("combo");
    if (root.querySelector(".clab-edit-val-bool")) parts.push("bool");
    if (root.querySelector(".clab-edit-val")) parts.push("text");
    return parts.join("+") || "none";
}

function withFrozenAreaLayout(areaEl, updater) {
    if (!areaEl || typeof updater !== "function") return false;

    const bodyEl = areaEl.querySelector(".clab-input-body");
    const areaHeight = areaEl.offsetHeight;
    const bodyHeight = bodyEl?.offsetHeight || 0;
    const prevAreaMinHeight = areaEl.style.minHeight;
    const prevBodyMinHeight = bodyEl?.style.minHeight || "";

    if (areaHeight > 0) areaEl.style.minHeight = `${areaHeight}px`;
    if (bodyEl && bodyHeight > 0) bodyEl.style.minHeight = `${bodyHeight}px`;

    let result = false;
    try {
        result = updater();
    } finally {
        window.requestAnimationFrame(() => {
            areaEl.style.minHeight = prevAreaMinHeight;
            if (bodyEl) bodyEl.style.minHeight = prevBodyMinHeight;
        });
    }
    return result;
}

function refreshInputBody(areaEl, nextAreaEl) {
    const body = areaEl.querySelector(".clab-input-body");
    const nextBody = nextAreaEl.querySelector(".clab-input-body");
    if (!body || !nextBody) return false;

    return withFrozenAreaLayout(areaEl, () => {
        body.innerHTML = nextBody.innerHTML;
        if (window._clabAttachAreaEvents) window._clabAttachAreaEvents(areaEl);
        return true;
    });
}

export function refreshInputAreaInPlace(areaEl, area, card) {
    if (!areaEl || !area || !card) return false;

    const temp = document.createElement("div");
    temp.innerHTML = generateInputHTML(area, card);
    const nextAreaEl = temp.firstElementChild;
    if (!nextAreaEl) return false;

    areaEl.dataset.cardId = card.id;
    areaEl.dataset.areaId = area.id;
    areaEl.className = nextAreaEl.className;
    areaEl.style.cssText = nextAreaEl.style.cssText;

    const deleteBtn = areaEl.querySelector(".clab-del-area-btn");
    const nextDeleteBtn = nextAreaEl.querySelector(".clab-del-area-btn");
    if (deleteBtn && nextDeleteBtn) {
        deleteBtn.dataset.card = nextDeleteBtn.dataset.card;
        deleteBtn.dataset.area = nextDeleteBtn.dataset.area;
        deleteBtn.title = nextDeleteBtn.title;
        deleteBtn.style.cssText = nextDeleteBtn.style.cssText;
    }

    const titleInput = areaEl.querySelector(".clab-area-title-input");
    const nextTitleInput = nextAreaEl.querySelector(".clab-area-title-input");
    if (titleInput && nextTitleInput) {
        titleInput.dataset.card = nextTitleInput.dataset.card;
        titleInput.dataset.area = nextTitleInput.dataset.area;
        titleInput.placeholder = nextTitleInput.placeholder;
        if (document.activeElement !== titleInput) {
            titleInput.value = nextTitleInput.value;
            titleInput.size = Math.max(nextTitleInput.value.length, 2);
        }
    }

    const hintEl = areaEl.querySelector(".clab-input-binding-hint");
    const nextHintEl = nextAreaEl.querySelector(".clab-input-binding-hint");
    if (hintEl && nextHintEl) {
        hintEl.textContent = nextHintEl.textContent;
        hintEl.title = nextHintEl.title;
    }

    const signature = getInputRefreshSignature(areaEl);
    const nextSignature = getInputRefreshSignature(nextAreaEl);
    if (signature !== nextSignature) {
        return refreshInputBody(areaEl, nextAreaEl);
    }

    if (signature === "text") {
        const textarea = areaEl.querySelector(".clab-edit-val");
        const nextTextarea = nextAreaEl.querySelector(".clab-edit-val");
        if (!textarea || !nextTextarea) return false;

        textarea.dataset.card = nextTextarea.dataset.card;
        textarea.dataset.area = nextTextarea.dataset.area;
        textarea.placeholder = nextTextarea.placeholder;
        textarea.style.cssText = nextTextarea.style.cssText;
        if (document.activeElement !== textarea) {
            textarea.value = nextTextarea.value;
        }
        return true;
    }

    if (signature === "bool") {
        const checkbox = areaEl.querySelector(".clab-edit-val-bool");
        const nextCheckbox = nextAreaEl.querySelector(".clab-edit-val-bool");
        const labelText = checkbox?.closest(".clab-bool-label")?.querySelector("span");
        const nextLabelText = nextCheckbox?.closest(".clab-bool-label")?.querySelector("span");
        if (!checkbox || !nextCheckbox || !labelText || !nextLabelText) return false;

        checkbox.dataset.card = nextCheckbox.dataset.card;
        checkbox.dataset.area = nextCheckbox.dataset.area;
        checkbox.checked = nextCheckbox.checked;
        checkbox.style.cssText = nextCheckbox.style.cssText;
        labelText.textContent = nextLabelText.textContent;
        return true;
    }

    if (signature === "upload") {
        const zone = areaEl.querySelector(".clab-upload-zone");
        const nextZone = nextAreaEl.querySelector(".clab-upload-zone");
        if (!zone || !nextZone) return false;

        if (zone.innerHTML !== nextZone.innerHTML) {
            return withFrozenAreaLayout(areaEl, () => {
                zone.innerHTML = nextZone.innerHTML;
                zone.className = nextZone.className;
                zone.style.cssText = nextZone.style.cssText;
                zone.dataset.card = nextZone.dataset.card;
                zone.dataset.area = nextZone.dataset.area;
                zone.dataset.uploadType = nextZone.dataset.uploadType;
                zone.dataset.autoRatio = nextZone.dataset.autoRatio;
                if (window._clabAttachAreaEvents) window._clabAttachAreaEvents(areaEl);
                return true;
            });
        }

        zone.dataset.card = nextZone.dataset.card;
        zone.dataset.area = nextZone.dataset.area;
        zone.dataset.uploadType = nextZone.dataset.uploadType;
        zone.dataset.autoRatio = nextZone.dataset.autoRatio;
        zone.className = nextZone.className;
        zone.style.cssText = nextZone.style.cssText;

        const fileInput = zone.querySelector(".clab-file-input");
        const nextFileInput = nextZone.querySelector(".clab-file-input");
        if (fileInput && nextFileInput) {
            fileInput.accept = nextFileInput.accept;
            fileInput.dataset.card = nextFileInput.dataset.card;
            fileInput.dataset.area = nextFileInput.dataset.area;
            fileInput.dataset.uploadType = nextFileInput.dataset.uploadType;
        }
        return true;
    }

    if (signature === "combo") {
        const select = areaEl.querySelector('.clab-custom-select[data-type="module-combo"]');
        const nextSelect = nextAreaEl.querySelector('.clab-custom-select[data-type="module-combo"]');
        if (!select || !nextSelect) return false;

        return withFrozenAreaLayout(areaEl, () => {
            select.id = nextSelect.id;
            select.className = nextSelect.className;
            select.style.cssText = nextSelect.style.cssText;
            select.dataset.cardId = nextSelect.dataset.cardId;
            select.dataset.areaId = nextSelect.dataset.areaId;
            select.dataset.type = nextSelect.dataset.type;
            select.classList.remove("open");
            delete select.dataset.clabComboBound;

            const valueInput = select.querySelector(".clab-custom-select-value");
            const nextValueInput = nextSelect.querySelector(".clab-custom-select-value");
            if (valueInput && nextValueInput) {
                valueInput.value = nextValueInput.value;
                valueInput.title = nextValueInput.title;
                valueInput.disabled = nextValueInput.disabled;
            }

            const icon = select.querySelector(".clab-custom-select-icon");
            const nextIcon = nextSelect.querySelector(".clab-custom-select-icon");
            if (icon && nextIcon) {
                icon.innerHTML = nextIcon.innerHTML;
            }

            const dropdown = select.querySelector(".clab-custom-select-dropdown");
            const nextDropdown = nextSelect.querySelector(".clab-custom-select-dropdown");
            if (dropdown && nextDropdown) {
                dropdown.innerHTML = nextDropdown.innerHTML;
            }

            if (window._clabAttachAreaEvents) window._clabAttachAreaEvents(areaEl);
            return true;
        });
    }

    return refreshInputBody(areaEl, nextAreaEl);
}

export function attachInputEvents(container) {
    const applySurgicalUpdate = (areaId) => {
        if (window._clabSurgicallyUpdateArea) {
            window._clabSurgicallyUpdateArea(areaId);
            if (window._clabJustSave) window._clabJustSave();
        } else {
            saveAndRender();
        }
    };

    // ==========================================
    // 建立全局唯一的“离屏文本测量器”，用于稳定计算 textarea 自适应高度
    // ==========================================
    let ghostMeasurer = document.getElementById('clab-ghost-textarea-measurer');
    if (!ghostMeasurer) {
        ghostMeasurer = document.createElement('textarea');
        ghostMeasurer.id = 'clab-ghost-textarea-measurer';
        // 绝对定位并隐藏，固定 1px 高度，使 scrollHeight 可反映真实内容高度且不参与页面布局。
        ghostMeasurer.style.cssText = 'position: absolute; top: -9999px; left: -9999px; visibility: hidden; z-index: -1000; overflow: hidden; height: 1px !important; min-height: 1px !important; max-height: none !important; word-wrap: break-word; white-space: pre-wrap;';
        ghostMeasurer.tabIndex = -1;
        document.body.appendChild(ghostMeasurer);
    }

    attachMediaEvents(container);

    if (!window._clabUploadHandlers) {
        window._clabUploadHandlers = new Map();
    }
    if (!document.getElementById('clab-icon-only-btn-style')) {
        const btnStyle = document.createElement('style');
        btnStyle.id = 'clab-icon-only-btn-style';
        btnStyle.textContent = `
            .clab-icon-only-btn:hover:not(:disabled) {
                opacity: 1 !important;
                color: #ffffff !important;
                filter: brightness(1.18) drop-shadow(0 0 3px rgba(255, 255, 255, 0.22));
            }
            .clab-icon-only-btn:active:not(:disabled) {
                filter: brightness(1.28) drop-shadow(0 0 4px rgba(255, 255, 255, 0.3));
            }
            .clab-icon-only-btn:disabled {
                opacity: 0.45 !important;
                cursor: not-allowed !important;
                pointer-events: none !important;
            }
        `;
        document.head.appendChild(btnStyle);
    }

    const EXT_MAP = {
        image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'svg'],
        video: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
    };

    const getFileExt = (file) => {
        const name = (file?.name || '').toLowerCase();
        const dot = name.lastIndexOf('.');
        return dot >= 0 ? name.slice(dot + 1) : '';
    };

    const isUploadTypeMatch = (file, uploadType) => {
        if (!file || !uploadType) return false;
        if (uploadType === 'file') return true;

        const mime = (file.type || '').toLowerCase();
        const ext = getFileExt(file);

        if (uploadType === 'image') {
            return mime.startsWith('image/') || EXT_MAP.image.includes(ext);
        }
        if (uploadType === 'video') {
            return mime.startsWith('video/') || EXT_MAP.video.includes(ext);
        }
        if (uploadType === 'audio') {
            return mime.startsWith('audio/') || EXT_MAP.audio.includes(ext);
        }
        return false;
    };

    const useButtonUploadType = (uploadType) => uploadType === 'image' || uploadType === 'video' || uploadType === 'audio';

    const isVideoAutoplayEnabled = () => {
        const raw = window._clabVideoAutoplay;
        if (typeof raw === 'string') {
            const normalized = raw.trim().toLowerCase();
            if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
            if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
        }
        return raw !== false;
    };

    const enforceInputVideoAutoplaySetting = (zone) => {
        if (!zone || (zone.dataset.uploadType || '') !== 'video') return;
        if (isVideoAutoplayEnabled()) return;

        const vid = zone.querySelector('video.clab-media-target, video');
        if (!vid) return;

        vid.removeAttribute('autoplay');
        vid.autoplay = false;

        const pauseIfNeeded = () => {
            if (!isVideoAutoplayEnabled() && !vid.paused) {
                vid.pause();
            }
        };

        pauseIfNeeded();
        if (vid.readyState >= 1) {
            requestAnimationFrame(pauseIfNeeded);
        } else {
            vid.addEventListener('loadedmetadata', pauseIfNeeded, { once: true });
            vid.addEventListener('canplay', pauseIfNeeded, { once: true });
        }
    };

    const applyMediaAutoRatio = (zone) => {
        if (!zone || zone.dataset.autoRatio !== '1') return;
        const uploadType = zone.dataset.uploadType || '';

        if (uploadType === 'image') {
            const img = zone.querySelector('img.clab-media-target, img');
            if (!img) return;
            const applyRatio = () => {
                if (img.naturalWidth && img.naturalHeight) {
                    zone.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
                    zone.style.height = 'auto';
                }
            };
            if (img.complete) applyRatio();
            else img.addEventListener('load', applyRatio, { once: true });
            return;
        }

        if (uploadType === 'video') {
            const vid = zone.querySelector('video.clab-media-target, video');
            if (!vid) return;
            const applyRatio = () => {
                if (vid.videoWidth && vid.videoHeight) {
                    zone.style.aspectRatio = `${vid.videoWidth} / ${vid.videoHeight}`;
                    zone.style.height = 'auto';
                }
            };
            if (vid.readyState >= 1) applyRatio();
            else vid.addEventListener('loadedmetadata', applyRatio, { once: true });
        }
    };

    if (!window._clabMediaPasteUploadBoundV2) {
        document.addEventListener('paste', (e) => {
            if (e.defaultPrevented) return;
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

            const selectedAreaIds = Array.isArray(state.selectedAreaIds) ? state.selectedAreaIds : [];
            if (!selectedAreaIds.length) return;

            const itemFiles = Array.from(e.clipboardData?.items || [])
                .filter(item => item.kind === 'file')
                .map(item => item.getAsFile())
                .filter(Boolean);
            const clipboardFiles = [...itemFiles, ...Array.from(e.clipboardData?.files || [])].filter(Boolean);
            if (!clipboardFiles.length) return;

            for (const areaId of selectedAreaIds) {
                const handlerEntry = window._clabUploadHandlers?.get(areaId);
                if (!handlerEntry || typeof handlerEntry.upload !== 'function') continue;

                const matchedFile = clipboardFiles.find(file => isUploadTypeMatch(file, handlerEntry.uploadType));
                if (!matchedFile) continue;

                const areaEl = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
                const zone = areaEl?.querySelector(`.clab-upload-zone[data-upload-type="${handlerEntry.uploadType}"]`);
                if (!zone) continue;

                e.preventDefault();
                e.stopPropagation();
                handlerEntry.upload(matchedFile);
                return;
            }
        }, true);
        window._clabMediaPasteUploadBoundV2 = true;
    }

    container.querySelectorAll('.clab-upload-zone').forEach(zone => {
        const fileInput = zone.querySelector('.clab-file-input');
        if (!fileInput) return;
        const uploadType = zone.dataset.uploadType || fileInput.dataset.uploadType || 'file';
        const useButtonUpload = useButtonUploadType(uploadType);

        zone.onclick = (e) => {
            if (useButtonUpload || uploadType === 'file') return;
            if(e.target.closest('.clab-custom-select')) return; 
            e.stopPropagation();
            fileInput.click();
        };

        const areaEl = zone.closest('.clab-area');
        const uploadBtn = areaEl ? areaEl.querySelector('.clab-upload-trigger-btn') : null;
        if (uploadBtn && !uploadBtn.dataset.clabEventsBound) {
            uploadBtn.dataset.clabEventsBound = "1";
            uploadBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileInput.click();
            };
        }

        const fileUploadBtn = zone.querySelector('.clab-file-upload-btn');
        if (fileUploadBtn && !fileUploadBtn.dataset.clabEventsBound) {
            fileUploadBtn.dataset.clabEventsBound = "1";
            fileUploadBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileInput.click();
            };
        }

        const clearFileValue = () => {
            const cardId = zone.dataset.card;
            const areaId = zone.dataset.area;
            const card = state.cards.find(c => c.id === cardId);
            const area = card?.areas.find(a => a.id === areaId);
            if (!area) return;
            area.value = '';
            state.selectedAreaIds = [areaId];
            state.selectedCardIds = [];
            applySurgicalUpdate(areaId);
        };

        const clearMediaBtn = areaEl ? areaEl.querySelector('.clab-upload-clear-btn') : null;
        if (clearMediaBtn && !clearMediaBtn.dataset.clabEventsBound) {
            clearMediaBtn.dataset.clabEventsBound = "1";
            clearMediaBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (clearMediaBtn.disabled) return;
                clearFileValue();
            };
        }

        const fileRemoveBtn = zone.querySelector('.clab-file-remove-btn');
        if (fileRemoveBtn && !fileRemoveBtn.dataset.clabEventsBound) {
            fileRemoveBtn.dataset.clabEventsBound = "1";
            fileRemoveBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (fileRemoveBtn.disabled) return;
                clearFileValue();
            };
        }

        const handleUpload = async (file) => {
            if(!file) return;
            if (!isUploadTypeMatch(file, uploadType)) {
                if (uploadType === 'image') alert('Only image files are supported.');
                else if (uploadType === 'video') alert('Only video files are supported.');
                else if (uploadType === 'audio') alert('Only audio files are supported.');
                return;
            }

            const cardId = zone.dataset.card;
            const areaId = zone.dataset.area;
            
            zone.style.pointerEvents = 'none';
            zone.innerHTML = `
                <style>@keyframes clab-spin { 100% { transform: rotate(360deg); } }</style>
                <div style="padding: 16px 10px; text-align: center; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; height: 100%; width: 100%;">
                    <svg style="animation: clab-spin 1s linear infinite; margin-right: 6px; width:16px; height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                        <line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                    </svg>
                    正在上传到服务器...
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

        window._clabUploadHandlers.set(zone.dataset.area, {
            uploadType,
            upload: handleUpload
        });

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

        enforceInputVideoAutoplaySetting(zone);
        applyMediaAutoRatio(zone);
    });

    container.querySelectorAll('.clab-edit-val-bool').forEach(cb => {
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

    container.querySelectorAll('.clab-edit-val').forEach(ta => {
        
        let resizeTimeout;

        // 核心计算：requestAnimationFrame + 轻量防抖，保证快速输入时也平滑。
        const handleAutoResize = () => {
            if (ta.style.resize !== 'none') return;
            
            window.requestAnimationFrame(() => {
                // 1. 将真实输入框的关键样式同步到离屏测量器
                const comp = window.getComputedStyle(ta);
                ghostMeasurer.style.width = comp.width;
                ghostMeasurer.style.fontFamily = comp.fontFamily;
                ghostMeasurer.style.fontSize = comp.fontSize;
                ghostMeasurer.style.lineHeight = comp.lineHeight;
                ghostMeasurer.style.padding = comp.padding;
                ghostMeasurer.style.border = comp.border;
                ghostMeasurer.style.boxSizing = comp.boxSizing;
                ghostMeasurer.style.letterSpacing = comp.letterSpacing;
                
                ghostMeasurer.value = ta.value || ta.placeholder || 'A';
                
                // 2. 读取离屏测量器的 scrollHeight
                const borders = (parseFloat(comp.borderTopWidth) || 0) + (parseFloat(comp.borderBottomWidth) || 0);
                
                // 3. 增加 8px 安全余量，避免中英文混排时出现截断
                const calculatedHeight = ghostMeasurer.scrollHeight + borders + 8;
                
                // 4. 直接回写最终高度，避免反复 height:auto 导致重排抖动
                ta.style.height = calculatedHeight + 'px';
            });
        };

        // 监听宽度变化并做防抖，减少拖拽面板时的频繁重算
        if (window.ResizeObserver) {
            let lastWidth = null;
            const ro = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    if (entry.contentRect.width !== lastWidth) {
                        lastWidth = entry.contentRect.width;
                        clearTimeout(resizeTimeout);
                        resizeTimeout = setTimeout(handleAutoResize, 10);
                    }
                }
            });
            ro.observe(ta);
        }

        // 初始化一次高度
        setTimeout(handleAutoResize, 50);

        ta.oninput = (e) => {
            handleAutoResize();
            
            const { card: cardId, area: areaId } = e.target.dataset;
            const card = state.cards.find(c => c.id === cardId);
            const area = card.areas.find(a => a.id === areaId);
            if(area) {
                area.value = e.target.value;
                if (window._clabJustSave) window._clabJustSave();
                else if (window.CLab) window.CLab.saveState(state);
            }
        };
    });
}

