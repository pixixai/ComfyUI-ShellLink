/**
 * 文件名: action_data_io.js
 * 路径: web/components/actions/action_data_io.js
 * 职责: 负责导入JSON、导出JSON、媒体打包下载、后端本地文件整理
 */
import { state, appState, saveAndRender } from "../ui_state.js";
import { showBindingToast, hideBindingToast } from "../ui_utils.js";
import { app } from "../../../../scripts/app.js";

export function attachDataIOEvents(panelContainer) {
    // ----------------------------------------------------
    // 1. JSON 导入功能
    // ----------------------------------------------------
    const addModuleBtn = panelContainer.querySelector("#sl-global-add-module");
    if (addModuleBtn && !panelContainer.querySelector("#sl-import-json-wrapper")) {
        addModuleBtn.insertAdjacentHTML('afterend', `
            <div id="sl-import-json-wrapper" style="position:relative; display:inline-flex; align-items:center;">
                <button class="sl-btn" id="sl-import-json-btn" title="批量导入JSON快速构建" style="padding: 0; width: 34px; height: 34px; display:flex; align-items:center; justify-content:center;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div id="sl-import-json-dropdown" class="sl-custom-select-dropdown" style="display:none; top: calc(100% + 4px); left: 0; min-width: 170px; z-index: 10002;">
                    <div class="sl-custom-select-group-title" style="padding: 6px 12px; font-size: 12px; margin-top: 0; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05);">从剪切板导入JSON数据</div>
                    <div class="sl-custom-select-item" id="sl-import-new-clip">创建任务</div>
                    <div class="sl-custom-select-item" id="sl-import-append-smart-clip">追加模块</div>
                    <div class="sl-custom-select-item" id="sl-import-append-sel-clip">追加模块到选中</div>
                    
                    <div class="sl-custom-select-group-title" style="padding: 6px 12px; font-size: 12px; margin-top: 4px; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05);">从本地文件导入JSON数据</div>
                    <div class="sl-custom-select-item" id="sl-import-new-local">创建任务</div>
                    <div class="sl-custom-select-item" id="sl-import-append-smart-local">追加模块</div>
                    <div class="sl-custom-select-item" id="sl-import-append-sel-local">追加模块到选中</div>
                </div>
            </div>
        `);

        const wrapper = panelContainer.querySelector("#sl-import-json-wrapper");
        const btn = wrapper.querySelector("#sl-import-json-btn");
        const dropdown = wrapper.querySelector("#sl-import-json-dropdown");

        btn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            document.querySelectorAll('.sl-custom-select-dropdown').forEach(d => d.style.display = 'none');
            dropdown.style.display = isVisible ? 'none' : 'block';
        };

        const processImportedJSON = (jsonStr, mode) => {
            try {
                const data = JSON.parse(jsonStr);
                let dataArray = Array.isArray(data) ? data : [data];
                if (dataArray.length === 0) return alert("导入的数据为空！");

                let smartAppendStartIndex = 0;

                if (mode === 'new') {
                    const newCards = [];
                    dataArray.forEach((obj, cIdx) => {
                        if (typeof obj !== 'object' || obj === null) return;
                        const card = { id: 'card_' + Date.now() + '_' + Math.floor(Math.random()*1000) + cIdx, title: '', areas: [] };
                        let aIdx = 0;
                        for (const [key, value] of Object.entries(obj)) {
                            let finalValue = value;
                            if (typeof value === 'object' && value !== null) finalValue = JSON.stringify(value);
                            else if (value === null) finalValue = "";
                            else finalValue = String(value);

                            card.areas.push({
                                id: 'area_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + aIdx++,
                                type: 'edit', title: key, value: finalValue, targetNodeId: null, targetWidget: null, dataType: 'string', autoHeight: true
                            });
                        }
                        newCards.push(card);
                    });

                    if (newCards.length > 0) {
                        state.cards.push(...newCards);
                        state.selectedCardIds = [newCards[0].id];
                        state.activeCardId = newCards[0].id;
                        state.selectedAreaIds = [];
                        appState.lastClickedCardId = newCards[0].id;
                    }

                } else if (mode === 'smart_append') {
                    let startIndex = 0;
                    if (state.selectedCardIds && state.selectedCardIds.length > 0) {
                        const foundIndex = state.cards.findIndex(c => c.id === state.selectedCardIds[0]);
                        if (foundIndex !== -1) startIndex = foundIndex;
                    }
                    smartAppendStartIndex = startIndex;

                    dataArray.forEach((obj, indexOffset) => {
                        if (typeof obj !== 'object' || obj === null) return;
                        const targetIndex = startIndex + indexOffset;
                        let targetCard;

                        if (targetIndex < state.cards.length) targetCard = state.cards[targetIndex];
                        else {
                            targetCard = { id: 'card_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + indexOffset, title: '', areas: [] };
                            state.cards.push(targetCard);
                        }

                        if (!targetCard.areas) targetCard.areas = [];
                        let aIdx = 0;
                        for (const [key, value] of Object.entries(obj)) {
                            let finalValue = value;
                            if (typeof finalValue === 'object' && finalValue !== null) finalValue = JSON.stringify(finalValue);
                            else if (finalValue === null) finalValue = "";
                            else finalValue = String(finalValue);

                            targetCard.areas.push({
                                id: 'area_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + aIdx++,
                                type: 'edit', title: key, value: finalValue, targetNodeId: null, targetWidget: null, dataType: 'string', autoHeight: true
                            });
                        }
                    });
                } else if (mode === 'append_selected') {
                    if (!state.selectedCardIds || state.selectedCardIds.length === 0) {
                        return alert("【追加失败】\n请先点击选中一个或多个任务卡片（支持 Ctrl 多选），然后再执行“追加模块到选中”！");
                    }
                    state.selectedCardIds.forEach((cardId, index) => {
                        const card = state.cards.find(c => c.id === cardId);
                        const obj = dataArray[index]; 
                        if (card && obj && typeof obj === 'object' && obj !== null) {
                            if (!card.areas) card.areas = [];
                            let aIdx = 0;
                            for (const [key, value] of Object.entries(obj)) {
                                let finalValue = value;
                                if (typeof finalValue === 'object' && finalValue !== null) finalValue = JSON.stringify(finalValue);
                                else if (finalValue === null) finalValue = "";
                                else finalValue = String(finalValue);

                                card.areas.push({
                                    id: 'area_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + aIdx++,
                                    type: 'edit', title: key, value: finalValue, targetNodeId: null, targetWidget: null, dataType: 'string', autoHeight: true
                                });
                            }
                        }
                    });
                }
                
                saveAndRender();
                setTimeout(() => {
                    const container = panelContainer.querySelector("#sl-cards-container");
                    if (!container) return;
                    if (mode === 'new' || mode === 'smart_append') container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
                }, 50);

            } catch (e) {
                alert("导入失败：无法解析 JSON 数据。\n" + e.message);
            }
        };

        const handleClipboardImport = async (mode) => {
            dropdown.style.display = 'none';
            try {
                const text = await navigator.clipboard.readText();
                if (!text) return alert("剪切板为空，请先复制 JSON 数据！");
                processImportedJSON(text, mode);
            } catch (err) {
                alert("无法读取剪切板。\n" + err.message);
            }
        };

        const handleLocalImport = (mode) => {
            dropdown.style.display = 'none';
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.onchange = (ev) => {
                const file = ev.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e2) => processImportedJSON(e2.target.result, mode);
                reader.readAsText(file);
            };
            fileInput.click();
        };

        wrapper.querySelector("#sl-import-new-clip").onclick = (e) => { e.stopPropagation(); handleClipboardImport('new'); };
        wrapper.querySelector("#sl-import-append-smart-clip").onclick = (e) => { e.stopPropagation(); handleClipboardImport('smart_append'); };
        wrapper.querySelector("#sl-import-append-sel-clip").onclick = (e) => { e.stopPropagation(); handleClipboardImport('append_selected'); };
        wrapper.querySelector("#sl-import-new-local").onclick = (e) => { e.stopPropagation(); handleLocalImport('new'); };
        wrapper.querySelector("#sl-import-append-smart-local").onclick = (e) => { e.stopPropagation(); handleLocalImport('smart_append'); };
        wrapper.querySelector("#sl-import-append-sel-local").onclick = (e) => { e.stopPropagation(); handleLocalImport('append_selected'); };
    }

    // ----------------------------------------------------
    // 2. 导出与媒体下载功能
    // ----------------------------------------------------
    const configBtn = panelContainer.querySelector("#sl-btn-config");
    if (configBtn && !panelContainer.querySelector("#sl-export-json-wrapper")) {
        configBtn.insertAdjacentHTML('beforebegin', `
            <div id="sl-export-json-wrapper" style="position:relative; display:inline-flex; align-items:center;">
                <button class="sl-btn" id="sl-export-json-btn" title="导出与下载" style="padding: 0; width: 34px; height: 34px; display:flex; align-items:center; justify-content:center;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </button>
                <div id="sl-export-json-dropdown" class="sl-custom-select-dropdown" style="display:none; top: calc(100% + 4px); right: 0; left: auto; min-width: 230px; z-index: 10002;">
                    
                    <div class="sl-custom-select-group-title" style="padding: 6px 12px; font-size: 12px; margin-top: 0; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05); display: flex; align-items: center; white-space: nowrap; gap: 12px;">打包为ZIP</div>
                    <div class="sl-custom-select-item" id="sl-export-media-all">下载全部</div>
                    <div class="sl-custom-select-item" id="sl-export-media-sel">下载选中</div>
                    <div class="sl-custom-select-item" id="sl-export-media-all-history">下载全部 (含所有生成记录)</div>
                    <div class="sl-custom-select-item" id="sl-export-media-sel-history">下载选中 (含所有生成记录)</div>
                    
                    <div class="sl-custom-select-group-title" style="padding: 6px 12px; font-size: 12px; margin-top: 4px; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05);">收集整理</div>
                    <div class="sl-custom-select-item" id="sl-export-org-move">移动到子文件夹</div>
                    <div class="sl-custom-select-item" id="sl-export-org-copy">复制到子文件夹</div>
                    
                    <div class="sl-custom-select-group-title" style="padding: 0 0 0 12px; height: 28px; font-size: 12px; margin-top: 4px; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; white-space: nowrap;">
                        <span>导出JSON数据</span>
                        <div style="display: flex; height: 100%; align-items: center; pointer-events: auto;">
                            <div id="sl-json-action-copy" style="height: 100%; width: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: #2a2a2a; color: #fff; transition: all 0.2s;" title="点亮：点击下方项复制到剪切板">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </div>
                            <div id="sl-json-action-download" style="height: 100%; width: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: transparent; color: #888; transition: all 0.2s;" title="点亮：点击下方项下载到本地">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </div>
                        </div>
                    </div>
                    <div class="sl-custom-select-item" id="sl-export-json-input">输入模块</div>
                    <div class="sl-custom-select-item" id="sl-export-json-output">输出模块</div>
                    <div class="sl-custom-select-item" id="sl-export-json-all">全部模块</div>
                </div>
            </div>
        `);

        const exportWrapper = panelContainer.querySelector("#sl-export-json-wrapper");
        const exportBtn = exportWrapper.querySelector("#sl-export-json-btn");
        const exportDropdown = exportWrapper.querySelector("#sl-export-json-dropdown");

        exportBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = exportDropdown.style.display === 'block';
            document.querySelectorAll('.sl-custom-select-dropdown').forEach(d => d.style.display = 'none');
            exportDropdown.style.display = isVisible ? 'none' : 'block';
        };

        const downloadMediaFiles = async (mode, includeHistory = false) => {
            exportDropdown.style.display = 'none';
            const urlsToDownload = [];
            
            const extractUrlsFromArea = (a) => {
                if (a.type === 'preview') {
                    if (includeHistory && a.history && a.history.length > 0) {
                        urlsToDownload.push(...a.history);
                    } else if (a.resultUrl) {
                        urlsToDownload.push(a.resultUrl);
                    }
                }
            };

            if (mode === 'selected') {
                if (state.selectedAreaIds && state.selectedAreaIds.length > 0) {
                    state.cards.forEach(c => c.areas?.forEach(a => {
                        if (state.selectedAreaIds.includes(a.id)) extractUrlsFromArea(a);
                    }));
                } else if (state.selectedCardIds && state.selectedCardIds.length > 0) {
                    state.cards.filter(c => state.selectedCardIds.includes(c.id)).forEach(c => {
                        c.areas?.forEach(a => extractUrlsFromArea(a));
                    });
                } else return alert("请先选中需要下载的任务卡片或输出模块！");
            } else {
                state.cards.forEach(c => c.areas?.forEach(a => extractUrlsFromArea(a)));
            }

            const uniqueUrls = [...new Set(urlsToDownload)];
            if (uniqueUrls.length === 0) return alert("没有找到可下载的媒体文件！");

            if (uniqueUrls.length === 1) {
                try {
                    const url = uniqueUrls[0];
                    const urlObj = new URL(url, window.location.origin);
                    const filename = urlObj.searchParams.get('filename') || `media_${Date.now()}`;
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl; a.download = filename; 
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                } catch (err) { alert("下载失败: " + err.message); }
            } else {
                if (typeof showBindingToast === 'function') showBindingToast("📦 正在拉取文件并打包 ZIP，请稍候...", false);
                try {
                    if (!window.JSZip) {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
                            script.onload = resolve; script.onerror = reject;
                            document.head.appendChild(script);
                        });
                    }
                    const zip = new window.JSZip();
                    const folder = zip.folder("ShellLink_Export");
                    
                    for (let i = 0; i < uniqueUrls.length; i++) {
                        const url = uniqueUrls[i];
                        const urlObj = new URL(url, window.location.origin);
                        const filename = urlObj.searchParams.get('filename') || `media_${Date.now()}_${i}`;
                        const response = await fetch(url);
                        const blob = await response.blob();
                        folder.file(filename, blob);
                    }
                    
                    const zipBlob = await zip.generateAsync({ type: "blob" });
                    const zipUrl = URL.createObjectURL(zipBlob);
                    const a = document.createElement('a');
                    a.href = zipUrl; a.download = `ShellLink_Media_${Date.now()}.zip`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(zipUrl);
                    if (typeof hideBindingToast === 'function') hideBindingToast();
                } catch (err) {
                    if (typeof hideBindingToast === 'function') hideBindingToast();
                    alert("网络原因无法加载打包组件，将为您逐个下载...");
                    for (let i = 0; i < uniqueUrls.length; i++) {
                        try {
                            const url = uniqueUrls[i];
                            const urlObj = new URL(url, window.location.origin);
                            const filename = urlObj.searchParams.get('filename') || `media_${Date.now()}_${i}`;
                            const response = await fetch(url);
                            const blob = await response.blob();
                            const blobUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = blobUrl; a.download = filename; 
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            URL.revokeObjectURL(blobUrl);
                            await new Promise(res => setTimeout(res, 300));
                        } catch (e) {}
                    }
                }
            }
        };

        exportWrapper.querySelector("#sl-export-media-all").onclick = (e) => { e.stopPropagation(); downloadMediaFiles('all', false); };
        exportWrapper.querySelector("#sl-export-media-sel").onclick = (e) => { e.stopPropagation(); downloadMediaFiles('selected', false); };
        exportWrapper.querySelector("#sl-export-media-all-history").onclick = (e) => { e.stopPropagation(); downloadMediaFiles('all', true); };
        exportWrapper.querySelector("#sl-export-media-sel-history").onclick = (e) => { e.stopPropagation(); downloadMediaFiles('selected', true); };

        let currentJsonAction = 'copy'; 
        const copyActionBtn = exportWrapper.querySelector("#sl-json-action-copy");
        const downloadActionBtn = exportWrapper.querySelector("#sl-json-action-download");

        const updateJsonActionState = () => {
            if (currentJsonAction === 'copy') {
                copyActionBtn.style.background = '#2a2a2a'; copyActionBtn.style.color = '#fff';
                downloadActionBtn.style.background = 'transparent'; downloadActionBtn.style.color = '#888';
            } else {
                copyActionBtn.style.background = 'transparent'; copyActionBtn.style.color = '#888';
                downloadActionBtn.style.background = '#2a2a2a'; downloadActionBtn.style.color = '#fff';
            }
        };

        copyActionBtn.onclick = (e) => { e.stopPropagation(); currentJsonAction = 'copy'; updateJsonActionState(); };
        downloadActionBtn.onclick = (e) => { e.stopPropagation(); currentJsonAction = 'download'; updateJsonActionState(); };

        const generateExportJSON = (mode) => {
            const result = [];
            const cardsToExport = (state.selectedCardIds && state.selectedCardIds.length > 0) 
                ? state.cards.filter(c => state.selectedCardIds.includes(c.id)) : state.cards;

            cardsToExport.forEach((card) => {
                const cardObj = {};
                let unnamedInputCount = 1, unnamedOutputCount = 1;
                
                if (mode === 'input' || mode === 'all') {
                    card.areas?.filter(a => a.type === 'edit').forEach((a) => {
                        cardObj[a.title || `##${unnamedInputCount++}`] = a.value || "";
                    });
                }
                
                if (mode === 'output' || mode === 'all') {
                    card.areas?.filter(a => a.type === 'preview').forEach((a) => {
                        let val = a.resultUrl || "";
                        if (val) {
                            try {
                                const urlObj = new URL(val, window.location.origin);
                                const filename = urlObj.searchParams.get('filename');
                                let subfolder = urlObj.searchParams.get('subfolder');
                                if (filename) val = subfolder ? `${subfolder.replace(/\\/g, '/')}/${filename}` : filename;
                            } catch (e) {}
                        }
                        cardObj[a.title || `##${unnamedOutputCount++}`] = val;
                    });
                }
                result.push(cardObj);
            });
            return JSON.stringify(result, null, 4);
        };

        const handleJsonExport = async (mode) => {
            exportDropdown.style.display = 'none';
            const jsonStr = generateExportJSON(mode);
            if (currentJsonAction === 'copy') {
                try {
                    await navigator.clipboard.writeText(jsonStr);
                    alert("✅ JSON 数据已成功复制到剪切板！");
                } catch (err) { alert("❌ 复制失败。\n" + err.message); }
            } else if (currentJsonAction === 'download') {
                const blob = new Blob([jsonStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `ShellLink_Export_${mode}_${Date.now()}.json`;
                a.click(); URL.revokeObjectURL(url);
            }
        };

        exportWrapper.querySelector("#sl-export-json-input").onclick = (e) => { e.stopPropagation(); handleJsonExport('input'); };
        exportWrapper.querySelector("#sl-export-json-output").onclick = (e) => { e.stopPropagation(); handleJsonExport('output'); };
        exportWrapper.querySelector("#sl-export-json-all").onclick = (e) => { e.stopPropagation(); handleJsonExport('all'); };

        const organizeOutputFiles = async (action) => {
            exportDropdown.style.display = 'none';
            let workflowName = "Unsaved_Workflow";
            const configNode = app.graph._nodes.find(n => n.type === "ShellLinkSystemConfig");
            if (configNode && configNode.title && configNode.title !== "⚓ ShellLink 配置中心") workflowName = configNode.title;
            else if (app?.extensionManager?.workflow?.activeWorkflow?.filename) workflowName = app.extensionManager.workflow.activeWorkflow.filename.replace(".json", "");
            workflowName = workflowName.replace(/[\\/:"*?<>|]/g, "_").trim();

            const filesToProcess = [];
            state.cards.forEach((card, cardIndex) => {
                const taskName = card.title ? card.title.replace(/[\\/:"*?<>|]/g, "_").trim() : String(cardIndex + 1);
                let previewCount = 0;
                
                card.areas?.forEach((area) => {
                    if (area.type === 'preview') {
                        previewCount++;
                        if (area.resultUrl) {
                            try {
                                const urlObj = new URL(area.resultUrl, window.location.origin);
                                const filename = urlObj.searchParams.get('filename');
                                if (filename) {
                                    const subfolder = urlObj.searchParams.get('subfolder') || "";
                                    const areaName = area.title ? area.title.replace(/[\\/:"*?<>|]/g, "_").trim() : String(previewCount);
                                    
                                    filesToProcess.push({
                                        id: area.id, 
                                        filename: filename,
                                        type: urlObj.searchParams.get('type') || "output", 
                                        subfolder: subfolder,
                                        target_subfolder: `ShellLink/${workflowName}`,
                                        target_filename: `${taskName}_${areaName}`
                                    });
                                }
                            } catch (e) {}
                        }
                    }
                });
            });

            if (filesToProcess.length === 0) return alert("当前面板没有找到任何带有输出图像的模块！");

            try {
                const response = await fetch('/shell_link/organize_files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action, files: filesToProcess }) });
                const res = await response.json();
                if (res.status === 'success') {
                    if (action === 'move') {
                        res.results.forEach(r => {
                            state.cards.forEach(c => c.areas?.forEach(a => {
                                if (a.id === r.old_id) {
                                    if (a.resultUrl) {
                                        const urlObj = new URL(a.resultUrl, window.location.origin);
                                        urlObj.searchParams.set('filename', r.new_filename);
                                        urlObj.searchParams.set('subfolder', r.new_subfolder);
                                        a.resultUrl = urlObj.toString();
                                    }
                                    
                                    if (a.history && a.history.length > 0) {
                                        a.history = a.history.map(hUrl => {
                                            try {
                                                const hObj = new URL(hUrl, window.location.origin);
                                                if (hObj.searchParams.get('filename') === r.old_filename) {
                                                    hObj.searchParams.set('filename', r.new_filename);
                                                    hObj.searchParams.set('subfolder', r.new_subfolder);
                                                    return hObj.toString();
                                                }
                                            } catch(e){}
                                            return hUrl;
                                        });
                                    }
                                }
                            }));
                        });
                    }
                    saveAndRender();
                    alert(`✅ 成功${action === 'move' ? '移动' : '复制'}并重命名了 ${res.results.length} 个文件到 ${workflowName} 文件夹！`);
                } else alert("❌ 操作失败: " + (res.error || "未知错误"));
            } catch (err) { alert("❌ 请求后端接口失败。\n" + err.message); }
        };

        exportWrapper.querySelector("#sl-export-org-move").onclick = (e) => { e.stopPropagation(); organizeOutputFiles('move'); };
        exportWrapper.querySelector("#sl-export-org-copy").onclick = (e) => { e.stopPropagation(); organizeOutputFiles('copy'); };
    }
}