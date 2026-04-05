/**
 * 文件名: action_data_io.js
 * 路径: web/components/actions/action_data_io.js
 * 职责: 负责导入JSON、导出JSON、媒体打包下载、后端本地文件整理、文件上传 (全微创更新版)
 */
import { state, appState, saveAndRender, getActiveWorkspace } from "../ui_state.js";
import { showBindingToast, hideBindingToast } from "../ui_utils.js";
import { app } from "../../../../scripts/app.js";

// 【引入微创渲染引擎与静态保存】
import { generateSingleCardHTML, attachCardEvents } from "../comp_taskcard.js"; 
import { generateAreaHTML, attachAreaEvents, justSave } from "../comp_modulearea.js"; 
import { updateSelectionUI } from "../ui_selection.js";

// =========================================================================
// 核心网络请求：上传本地文件到服务器并返回文件名
// =========================================================================
export async function uploadImageToServer(file) {
    const formData = new FormData();
    formData.append('image', file);
    const resp = await fetch('/upload/image', {
        method: 'POST',
        body: formData
    });
    if(!resp.ok) throw new Error(resp.statusText);
    const data = await resp.json();
    if (!data.name) throw new Error(data.error || '上传失败，未返回文件名');
    return data;
}

export function attachDataIOEvents(panelContainer) {
    // ----------------------------------------------------
    // 1. JSON 导入功能
    // ----------------------------------------------------
    const addModuleBtn = panelContainer.querySelector("#clab-global-add-module");
    if (addModuleBtn && !panelContainer.querySelector("#clab-import-json-wrapper")) {
        addModuleBtn.insertAdjacentHTML('afterend', `
            <div id="clab-import-json-wrapper" style="position:relative; display:inline-flex; align-items:center;">
                <button class="clab-btn" id="clab-import-json-btn" title="批量导入JSON快速构建" style="padding: 0; width: 34px; height: 34px; display:flex; align-items:center; justify-content:center;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div id="clab-import-json-dropdown" class="clab-custom-select-dropdown" style="display:none; top: calc(100% + 4px); left: 0; min-width: 170px; z-index: 10002;">
                    <div class="clab-custom-select-group-title" style="padding: 6px 12px; font-size: 12px; margin-top: 0; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05);">从剪切板导入JSON数据</div>
                    <div class="clab-custom-select-item" id="clab-import-new-clip">创建任务</div>
                    <div class="clab-custom-select-item" id="clab-import-append-smart-clip">追加模块</div>
                    <div class="clab-custom-select-item" id="clab-import-append-sel-clip">追加模块到选中</div>
                    
                    <div class="clab-custom-select-group-title" style="padding: 6px 12px; font-size: 12px; margin-top: 4px; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05);">从本地文件导入JSON数据</div>
                    <div class="clab-custom-select-item" id="clab-import-new-local">创建任务</div>
                    <div class="clab-custom-select-item" id="clab-import-append-smart-local">追加模块</div>
                    <div class="clab-custom-select-item" id="clab-import-append-sel-local">追加模块到选中</div>
                </div>
            </div>
        `);

        const wrapper = panelContainer.querySelector("#clab-import-json-wrapper");
        const btn = wrapper.querySelector("#clab-import-json-btn");
        const dropdown = wrapper.querySelector("#clab-import-json-dropdown");

        btn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            document.querySelectorAll('.clab-custom-select-dropdown').forEach(d => d.style.display = 'none');
            dropdown.style.display = isVisible ? 'none' : 'block';
        };

        const processImportedJSON = (jsonStr, mode) => {
            try {
                const data = JSON.parse(jsonStr);
                let dataArray = Array.isArray(data) ? data : [data];
                if (dataArray.length === 0) return alert("导入的数据为空！");

                let smartAppendStartIndex = 0;
                let newCardsToDOM = []; // 暂存需要插入 DOM 的新卡片
                let newAreasToDOM = {}; // 暂存需要插入 DOM 的新模块

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
                        const insertIndex = state.cards.length;
                        state.cards.push(...newCards);
                        state.selectedCardIds = [newCards[0].id];
                        state.activeCardId = newCards[0].id;
                        state.selectedAreaIds = [];
                        appState.lastClickedCardId = newCards[0].id;
                        
                        newCards.forEach((c, idx) => {
                            newCardsToDOM.push({ card: c, index: insertIndex + idx });
                        });
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
                        let isNewCard = false;

                        if (targetIndex < state.cards.length) targetCard = state.cards[targetIndex];
                        else {
                            targetCard = { id: 'card_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + indexOffset, title: '', areas: [] };
                            state.cards.push(targetCard);
                            isNewCard = true;
                        }

                        if (!targetCard.areas) targetCard.areas = [];
                        let aIdx = 0;
                        const addedAreas = [];
                        for (const [key, value] of Object.entries(obj)) {
                            let finalValue = value;
                            if (typeof finalValue === 'object' && finalValue !== null) finalValue = JSON.stringify(finalValue);
                            else if (finalValue === null) finalValue = "";
                            else finalValue = String(finalValue);

                            addedAreas.push({
                                id: 'area_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + aIdx++,
                                type: 'edit', title: key, value: finalValue, targetNodeId: null, targetWidget: null, dataType: 'string', autoHeight: true
                            });
                        }
                        
                        targetCard.areas.push(...addedAreas);

                        if (isNewCard) {
                            newCardsToDOM.push({ card: targetCard, index: targetIndex });
                        } else {
                            if (!newAreasToDOM[targetCard.id]) newAreasToDOM[targetCard.id] = [];
                            newAreasToDOM[targetCard.id].push(...addedAreas);
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
                            const addedAreas = [];
                            for (const [key, value] of Object.entries(obj)) {
                                let finalValue = value;
                                if (typeof finalValue === 'object' && finalValue !== null) finalValue = JSON.stringify(finalValue);
                                else if (finalValue === null) finalValue = "";
                                else finalValue = String(finalValue);

                                addedAreas.push({
                                    id: 'area_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + aIdx++,
                                    type: 'edit', title: key, value: finalValue, targetNodeId: null, targetWidget: null, dataType: 'string', autoHeight: true
                                });
                            }
                            card.areas.push(...addedAreas);
                            if (!newAreasToDOM[card.id]) newAreasToDOM[card.id] = [];
                            newAreasToDOM[card.id].push(...addedAreas);
                        }
                    });
                }
                
                // =========================================================
                // 【核心引擎替换】：彻底抛弃 saveAndRender，采用无感 DOM 物理拼贴
                // =========================================================
                const cardsWrapper = document.querySelector('.clab-cards-wrapper');
                
                // 1. 批量插入全新生成的任务卡片
                if (newCardsToDOM.length > 0 && cardsWrapper) {
                    const temp = document.createElement('div');
                    newCardsToDOM.forEach(item => {
                        temp.innerHTML += generateSingleCardHTML(item.card, item.index);
                    });
                    
                    const frag = document.createDocumentFragment();
                    while(temp.firstChild) frag.appendChild(temp.firstChild);
                    
                    // 【直接追加】：剔除寻找幽灵按钮的代码，直接追加碎片
                    cardsWrapper.appendChild(frag);
                    
                    attachCardEvents(cardsWrapper);
                    // 为通过 JSON 凭空生成的新卡片内部模块，补绑拖拽和监听事件！
                    if (window._clabAttachAreaEvents) window._clabAttachAreaEvents(cardsWrapper);
                }
                
                // 2. 批量追加新模块到现有的任务卡片中
                for (let cardId in newAreasToDOM) {
                    const card = state.cards.find(c => c.id === cardId);
                    const cardBody = document.querySelector(`.clab-card[data-card-id="${cardId}"] .clab-area-list`);
                    if (cardBody && card) {
                        const temp = document.createElement('div');
                        newAreasToDOM[cardId].forEach(area => {
                            temp.innerHTML += generateAreaHTML(area, card);
                        });
                        const frag = document.createDocumentFragment();
                        while(temp.firstChild) frag.appendChild(temp.firstChild);
                        cardBody.appendChild(frag);
                        attachAreaEvents(cardBody);
                    }
                }

                // 3. 静默保存数据与更新 UI，全程不闪屏
                justSave();
                updateSelectionUI();
                if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
                if (window._clabUpdateCardsLayout) window._clabUpdateCardsLayout();
                
                setTimeout(() => {
                    const container = panelContainer.querySelector("#clab-cards-container");
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

        wrapper.querySelector("#clab-import-new-clip").onclick = (e) => { e.stopPropagation(); handleClipboardImport('new'); };
        wrapper.querySelector("#clab-import-append-smart-clip").onclick = (e) => { e.stopPropagation(); handleClipboardImport('smart_append'); };
        wrapper.querySelector("#clab-import-append-sel-clip").onclick = (e) => { e.stopPropagation(); handleClipboardImport('append_selected'); };
        wrapper.querySelector("#clab-import-new-local").onclick = (e) => { e.stopPropagation(); handleLocalImport('new'); };
        wrapper.querySelector("#clab-import-append-smart-local").onclick = (e) => { e.stopPropagation(); handleLocalImport('smart_append'); };
        wrapper.querySelector("#clab-import-append-sel-local").onclick = (e) => { e.stopPropagation(); handleLocalImport('append_selected'); };
    }

    // ----------------------------------------------------
    // 2. 导出与媒体下载功能
    // ----------------------------------------------------
    const configBtn = panelContainer.querySelector("#clab-btn-config");
    if (configBtn && !panelContainer.querySelector("#clab-export-json-wrapper")) {
        configBtn.insertAdjacentHTML('beforebegin', `
            <div id="clab-export-json-wrapper" style="position:relative; display:inline-flex; align-items:center;">
                <button class="clab-btn" id="clab-export-json-btn" title="导出与下载" style="padding: 0; width: 34px; height: 34px; display:flex; align-items:center; justify-content:center;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </button>
                <div id="clab-export-json-dropdown" class="clab-custom-select-dropdown" style="display:none; top: calc(100% + 4px); right: 0; left: auto; min-width: 250px; z-index: 10002;">
                    
                    <div class="clab-custom-select-group-title" style="padding: 6px 12px; font-size: 12px; margin-top: 0; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05); display: flex; align-items: center; white-space: nowrap; gap: 12px;">打包为ZIP</div>
                    <div class="clab-custom-select-item" id="clab-export-media-all">下载全部</div>
                    <div class="clab-custom-select-item" id="clab-export-media-sel">下载选中</div>
                    <div class="clab-custom-select-item" id="clab-export-media-all-history">下载全部 (含所有生成记录)</div>
                    <div class="clab-custom-select-item" id="clab-export-media-sel-history">下载选中 (含所有生成记录)</div>
                    
                    <div class="clab-custom-select-group-title" style="padding: 6px 12px; font-size: 12px; margin-top: 4px; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05);">收集整理</div>
                    <div class="clab-custom-select-item" id="clab-export-org-copy">复制到子文件夹</div>
                    <div class="clab-custom-select-item" id="clab-export-org-copy-history">复制到子文件夹 (含所有生成记录)</div>
                    
                    <div class="clab-custom-select-group-title" style="padding: 0 0 0 12px; height: 28px; font-size: 12px; margin-top: 4px; box-sizing: border-box; font-weight: bold; color: #aaa; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; white-space: nowrap;">
                        <span>导出JSON数据</span>
                        <div style="display: flex; height: 100%; align-items: center; pointer-events: auto;">
                            <div id="clab-json-action-copy" style="height: 100%; width: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: #2a2a2a; color: #fff; transition: all 0.2s;" title="点亮：点击下方项复制到剪切板">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </div>
                            <div id="clab-json-action-download" style="height: 100%; width: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: transparent; color: #888; transition: all 0.2s;" title="点亮：点击下方项下载到本地">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </div>
                        </div>
                    </div>
                    <div class="clab-custom-select-item" id="clab-export-json-input">输入模块</div>
                    <div class="clab-custom-select-item" id="clab-export-json-output">输出模块</div>
                    <div class="clab-custom-select-item" id="clab-export-json-all">全部模块</div>
                    <div class="clab-custom-select-item" id="clab-export-json-output-history">输出模块 (含所有生成记录)</div>
                    <div class="clab-custom-select-item" id="clab-export-json-all-history">全部模块 (含所有生成记录)</div>
                </div>
            </div>
        `);

        const exportWrapper = panelContainer.querySelector("#clab-export-json-wrapper");
        const exportBtn = exportWrapper.querySelector("#clab-export-json-btn");
        const exportDropdown = exportWrapper.querySelector("#clab-export-json-dropdown");

        exportBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = exportDropdown.style.display === 'block';
            document.querySelectorAll('.clab-custom-select-dropdown').forEach(d => d.style.display = 'none');
            exportDropdown.style.display = isVisible ? 'none' : 'block';
        };

        const sanitizeZipNamePart = (value) => {
            if (value == null) return "";
            return String(value)
                .replace(/[\\/:*?"<>|]/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        };

        const toSnapshotValueString = (value) => {
            if (value == null) return "";
            if (typeof value === "string") return value;
            if (typeof value === "number" || typeof value === "boolean") return String(value);
            try {
                return JSON.stringify(value);
            } catch (_) {
                return String(value);
            }
        };

        const trimSnapshotValue = (value) => {
            const safe = sanitizeZipNamePart(toSnapshotValueString(value));
            return safe.length > 10 ? safe.slice(0, 10) : safe;
        };

        const normalizeHistoryUrl = (urlStr) => {
            if (!urlStr) return "";
            try {
                const u = new URL(urlStr, window.location.origin);
                const params = new URLSearchParams(u.search);
                params.delete("t");
                const normalized = params.toString();
                return `${u.pathname}?${normalized}`;
            } catch (_) {
                return String(urlStr).replace(/([?&])t=[^&]*/g, "").replace(/[?&]$/, "");
            }
        };

        const parseNumberedDefaultTitle = (title) => {
            const text = (title || "").trim();
            if (!text) return null;
            const match = text.match(/^#+\s*(\d+)$/);
            return match ? match[1] : null;
        };

        const resolveCardLabel = (card, cardIndex) => {
            const fallback = String(cardIndex + 1);
            const numbered = parseNumberedDefaultTitle(card?.title || "");
            if (numbered) return numbered;
            const safe = sanitizeZipNamePart(card?.title || "");
            return safe || fallback;
        };

        const resolveOutputLabel = (area, previewOrder) => {
            const fallback = String(previewOrder);
            const numbered = parseNumberedDefaultTitle(area?.title || "");
            if (numbered) return numbered;
            const safe = sanitizeZipNamePart(area?.title || "");
            return safe || fallback;
        };

        const parseFilenameAndExt = (urlStr, fallbackIndex = 0) => {
            try {
                const urlObj = new URL(urlStr, window.location.origin);
                const filename = urlObj.searchParams.get('filename') || `media_${Date.now()}_${fallbackIndex}`;
                const extMatch = filename.match(/(\.[^./\\]+)$/);
                return { filename, ext: extMatch ? extMatch[1] : "" };
            } catch (_) {
                return { filename: `media_${Date.now()}_${fallbackIndex}`, ext: "" };
            }
        };

        const buildParamTokensFromSnapshot = (snapshotEntries) => {
            if (!Array.isArray(snapshotEntries) || snapshotEntries.length === 0) return [];
            const tokens = [];

            snapshotEntries.forEach((entry, entryIndex) => {
                if (!entry || typeof entry !== "object") return;

                const rawValue = trimSnapshotValue(entry.value);
                const widgetNames = [];

                if (Array.isArray(entry.targetWidgets) && entry.targetWidgets.length > 0) {
                    entry.targetWidgets.forEach((item) => {
                        const parts = String(item).split("||");
                        const widget = parts[1] == null ? "" : String(parts[1]).trim();
                        if (widget) widgetNames.push(widget);
                    });
                }

                if (widgetNames.length === 0 && entry.targetWidget) {
                    const singleWidget = String(entry.targetWidget).trim();
                    if (singleWidget) widgetNames.push(singleWidget);
                }

                if (widgetNames.length === 0 && entry.title) {
                    const titleName = String(entry.title).trim();
                    if (titleName) widgetNames.push(titleName);
                }

                const uniqueNames = [...new Set(widgetNames)];
                if (uniqueNames.length === 0) return;

                uniqueNames.forEach((name, nameIndex) => {
                    const safeName = sanitizeZipNamePart(name) || `param${entryIndex + 1}_${nameIndex + 1}`;
                    tokens.push(`[${safeName}-${rawValue}]`);
                });
            });

            return tokens;
        };

        const buildZipEntryFilename = (entry) => {
            const cardPart = sanitizeZipNamePart(entry.cardLabel) || String(entry.cardOrder);
            const outputPart = sanitizeZipNamePart(entry.outputLabel) || String(entry.outputOrder);
            const historyPart = String(entry.historyOrder || 1);

            const prefix = `${cardPart}_${outputPart}_${historyPart}`;
            const paramTokens = buildParamTokensFromSnapshot(entry.snapshot);
            const ext = entry.ext || "";
            const maxLength = 120;

            let paramBlock = "";
            for (const token of paramTokens) {
                const candidateParamBlock = `${paramBlock}${token}`;
                const candidateName = `${prefix}_${candidateParamBlock}`;
                if ((candidateName + ext).length > maxLength) break;
                paramBlock = candidateParamBlock;
            }

            let baseName = paramBlock ? `${prefix}_${paramBlock}` : prefix;
            if ((baseName + ext).length > maxLength) {
                const keepLen = Math.max(1, maxLength - ext.length);
                baseName = baseName.slice(0, keepLen).replace(/[_\s]+$/g, "").trim();
            }
            if (!baseName) baseName = `media_${Date.now()}`;
            return `${baseName}${ext}`;
        };

        const ensureUniqueFilename = (filename, usedNames) => {
            const safe = filename || `media_${Date.now()}`;
            const dotIndex = safe.lastIndexOf(".");
            const hasExt = dotIndex > 0;
            const base = hasExt ? safe.slice(0, dotIndex) : safe;
            const ext = hasExt ? safe.slice(dotIndex) : "";
            const keyOf = (name) => String(name).toLowerCase();

            let candidate = safe;
            let suffix = 2;
            const maxLength = 120;
            while (usedNames.has(keyOf(candidate))) {
                const suffixText = `_${suffix++}`;
                const keepLen = Math.max(1, maxLength - ext.length - suffixText.length);
                const nextBase = base.slice(0, keepLen).replace(/[_\s]+$/g, "").trim() || "media";
                candidate = `${nextBase}${suffixText}${ext}`;
            }
            usedNames.add(keyOf(candidate));
            return candidate;
        };

        const downloadMediaFiles = async (mode, includeHistory = false) => {
            exportDropdown.style.display = 'none';
            const mediaEntries = [];
            const selectedAreaIds = new Set(state.selectedAreaIds || []);
            const selectedCardIds = new Set(state.selectedCardIds || []);

            if (mode === 'selected' && selectedAreaIds.size === 0 && selectedCardIds.size === 0) {
                return alert("请先选中需要下载的任务卡片或输出模块！");
            }

            const pushEntry = (card, cardIndex, area, previewOrder, urlStr, historyIndex) => {
                if (!urlStr) return;
                const { filename, ext } = parseFilenameAndExt(urlStr, mediaEntries.length);
                const snapshot = (Array.isArray(area.inputHistorySnapshots) && historyIndex >= 0)
                    ? area.inputHistorySnapshots[historyIndex]
                    : null;

                mediaEntries.push({
                    url: urlStr,
                    filename,
                    ext,
                    cardOrder: cardIndex + 1,
                    outputOrder: previewOrder,
                    historyOrder: historyIndex >= 0 ? historyIndex + 1 : 1,
                    cardLabel: resolveCardLabel(card, cardIndex),
                    outputLabel: resolveOutputLabel(area, previewOrder),
                    snapshot,
                });
            };

            state.cards.forEach((card, cardIndex) => {
                const shouldByCard = mode === 'all' || (mode === 'selected' && selectedAreaIds.size === 0 && selectedCardIds.has(card.id));
                let previewOrder = 0;

                card.areas?.forEach((area) => {
                    if (area.type !== 'preview') return;
                    previewOrder += 1;

                    const shouldByArea = mode === 'selected' && selectedAreaIds.size > 0 && selectedAreaIds.has(area.id);
                    if (!shouldByCard && !shouldByArea) return;

                    if (includeHistory && Array.isArray(area.history) && area.history.length > 0) {
                        area.history.forEach((historyUrl, idx) => pushEntry(card, cardIndex, area, previewOrder, historyUrl, idx));
                        return;
                    }

                    if (!area.resultUrl) return;
                    let historyIndex = -1;
                    if (Array.isArray(area.history) && area.history.length > 0) {
                        const activeNorm = normalizeHistoryUrl(area.resultUrl);
                        historyIndex = area.history.findIndex((historyUrl) => normalizeHistoryUrl(historyUrl) === activeNorm);
                        if (historyIndex < 0 && Number.isInteger(area.historyIndex) && area.historyIndex >= 0 && area.historyIndex < area.history.length) {
                            historyIndex = area.historyIndex;
                        }
                    }
                    pushEntry(card, cardIndex, area, previewOrder, area.resultUrl, historyIndex);
                });
            });

            if (mediaEntries.length === 0) return alert("没有找到可下载的媒体文件！");

            // 同步获取自定义的文件夹名称用于 Zip 命名
            const archiveBase = window._clabArchiveDir || "CLab";

            if (mediaEntries.length === 1) {
                try {
                    const entry = mediaEntries[0];
                    const response = await fetch(entry.url);
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = buildZipEntryFilename(entry);
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
                    const folder = zip.folder(`${archiveBase}_Export`);
                    const usedNames = new Set();
                    
                    for (let i = 0; i < mediaEntries.length; i++) {
                        const entry = mediaEntries[i];
                        const response = await fetch(entry.url);
                        const blob = await response.blob();
                        const targetName = ensureUniqueFilename(buildZipEntryFilename(entry), usedNames);
                        folder.file(targetName, blob);
                    }
                    
                    const zipBlob = await zip.generateAsync({ type: "blob" });
                    const zipUrl = URL.createObjectURL(zipBlob);
                    const a = document.createElement('a');
                    a.href = zipUrl; a.download = `${archiveBase}_Media_${Date.now()}.zip`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(zipUrl);
                    if (typeof hideBindingToast === 'function') hideBindingToast();
                } catch (err) {
                    if (typeof hideBindingToast === 'function') hideBindingToast();
                    alert("网络原因无法加载打包组件，将为您逐个下载...");
                    const usedNames = new Set();
                    for (let i = 0; i < mediaEntries.length; i++) {
                        try {
                            const entry = mediaEntries[i];
                            const response = await fetch(entry.url);
                            const blob = await response.blob();
                            const blobUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = ensureUniqueFilename(buildZipEntryFilename(entry), usedNames);
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            URL.revokeObjectURL(blobUrl);
                            await new Promise(res => setTimeout(res, 300));
                        } catch (e) {}
                    }
                }
            }
        };

        exportWrapper.querySelector("#clab-export-media-all").onclick = (e) => { e.stopPropagation(); downloadMediaFiles('all', false); };
        exportWrapper.querySelector("#clab-export-media-sel").onclick = (e) => { e.stopPropagation(); downloadMediaFiles('selected', false); };
        exportWrapper.querySelector("#clab-export-media-all-history").onclick = (e) => { e.stopPropagation(); downloadMediaFiles('all', true); };
        exportWrapper.querySelector("#clab-export-media-sel-history").onclick = (e) => { e.stopPropagation(); downloadMediaFiles('selected', true); };

        let currentJsonAction = 'copy'; 
        const copyActionBtn = exportWrapper.querySelector("#clab-json-action-copy");
        const downloadActionBtn = exportWrapper.querySelector("#clab-json-action-download");

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

            const formatUrl = (val) => {
                if (!val) return "";
                try {
                    const urlObj = new URL(val, window.location.origin);
                    const filename = urlObj.searchParams.get('filename');
                    let subfolder = urlObj.searchParams.get('subfolder');
                    if (filename) return subfolder ? `${subfolder.replace(/\\/g, '/')}/${filename}` : filename;
                } catch (e) {}
                return val;
            };

            cardsToExport.forEach((card) => {
                const cardObj = {};
                let unnamedInputCount = 1, unnamedOutputCount = 1;
                
                if (mode === 'input' || mode === 'all' || mode === 'all_history') {
                    card.areas?.filter(a => a.type === 'edit').forEach((a) => {
                        cardObj[a.title || `##${unnamedInputCount++}`] = a.value || "";
                    });
                }
                
                if (mode === 'output' || mode === 'all' || mode === 'output_history' || mode === 'all_history') {
                    const includeHistory = mode.includes('_history');
                    card.areas?.filter(a => a.type === 'preview').forEach((a) => {
                        let exportValue;
                        if (includeHistory && a.history && a.history.length > 0) {
                            exportValue = a.history.map(h => formatUrl(h)).filter(h => h !== "");
                        } else {
                            exportValue = formatUrl(a.resultUrl || "");
                        }
                        cardObj[a.title || `##${unnamedOutputCount++}`] = exportValue;
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
                a.href = url; a.download = `CLab_Export_${mode}_${Date.now()}.json`;
                a.click(); URL.revokeObjectURL(url);
            }
        };

        exportWrapper.querySelector("#clab-export-json-input").onclick = (e) => { e.stopPropagation(); handleJsonExport('input'); };
        exportWrapper.querySelector("#clab-export-json-output").onclick = (e) => { e.stopPropagation(); handleJsonExport('output'); };
        exportWrapper.querySelector("#clab-export-json-all").onclick = (e) => { e.stopPropagation(); handleJsonExport('all'); };
        exportWrapper.querySelector("#clab-export-json-output-history").onclick = (e) => { e.stopPropagation(); handleJsonExport('output_history'); };
        exportWrapper.querySelector("#clab-export-json-all-history").onclick = (e) => { e.stopPropagation(); handleJsonExport('all_history'); };

        // =========================================================================
        // 【核心升级】：支持遍历所有生成记录的物理文件重排与归档
        // =========================================================================
        const organizeOutputFiles = async (action, includeHistory = false) => {
            exportDropdown.style.display = 'none';
            let workflowName = "Unsaved_Workflow";
            let workspaceName = "工作区 1";
            const configNode = app.graph._nodes.find(n => n.type === "CLab_SystemConfig");
            
            // 【核心修复】：将中英文的默认节点名称（包含各种空格变体）都加入白名单，防止多语言翻译导致误判
            const defaultTitles = [
                "⚓ CLab System Config", 
                "⚓ CLab系统配置", 
                "⚓ CLab 系统配置", 
                "CLab_SystemConfig"
            ];
            
            if (configNode && configNode.title && !defaultTitles.includes(configNode.title.trim())) {
                workflowName = configNode.title;
            } else if (app?.extensionManager?.workflow?.activeWorkflow?.filename) {
                workflowName = app.extensionManager.workflow.activeWorkflow.filename.replace(".json", "");
            }

            const activeWorkspace = getActiveWorkspace();
            if (activeWorkspace && activeWorkspace.name) {
                workspaceName = activeWorkspace.name;
            }
            
            workflowName = workflowName.replace(/[\\/:"*?<>|]/g, "_").trim();
            workspaceName = workspaceName.replace(/[\\/:"*?<>|]/g, "_").trim();
            const workflowWorkspaceName = `${workflowName || "Unsaved_Workflow"}_${workspaceName || "工作区 1"}`;

            const filesToProcess = [];
            const archiveBase = window._clabArchiveDir || "CLab"; // 同步获取用户设置的归档路径

            state.cards.forEach((card, cardIndex) => {
                const taskName = card.title ? card.title.replace(/[\\/:"*?<>|]/g, "_").trim() : String(cardIndex + 1);
                let previewCount = 0;
                
                card.areas?.forEach((area) => {
                    if (area.type === 'preview') {
                        previewCount++;
                        const areaName = area.title ? area.title.replace(/[\\/:"*?<>|]/g, "_").trim() : String(previewCount);
                        
                        const extractUrl = (urlStr, indexSuffix = "") => {
                            if (!urlStr) return;
                            try {
                                const urlObj = new URL(urlStr, window.location.origin);
                                const filename = urlObj.searchParams.get('filename');
                                if (filename) {
                                    const subfolder = urlObj.searchParams.get('subfolder') || "";
                                    filesToProcess.push({
                                        id: area.id, 
                                        filename: filename,
                                        type: urlObj.searchParams.get('type') || "output", 
                                        subfolder: subfolder,
                                        target_subfolder: `${archiveBase}/${workflowWorkspaceName}`, // 归档到“工作流名_工作区名”
                                        // 为历史记录添加有序后缀 (例如: _v1, _v2)，防止依赖后端容错导致排序错乱
                                        target_filename: indexSuffix ? `${taskName}_${areaName}${indexSuffix}` : `${taskName}_${areaName}`
                                    });
                                }
                            } catch (e) {}
                        };

                        if (includeHistory && area.history && area.history.length > 0) {
                            area.history.forEach((hUrl, idx) => {
                                extractUrl(hUrl, `_v${idx + 1}`);
                            });
                        } else if (area.resultUrl) {
                            extractUrl(area.resultUrl, "");
                        }
                    }
                });
            });

            if (filesToProcess.length === 0) return alert("当前面板没有找到任何可处理的输出媒体文件！");

            try {
                const response = await fetch('/clab/organize_files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action, files: filesToProcess }) });
                const res = await response.json();
                if (res.status === 'success') {
                    if (action === 'move') {
                        let affectedAreaIds = [];
                        res.results.forEach(r => {
                            state.cards.forEach(c => c.areas?.forEach(a => {
                                if (a.id === r.old_id) {
                                    if (a.resultUrl) {
                                        try {
                                            const urlObj = new URL(a.resultUrl, window.location.origin);
                                            if (urlObj.searchParams.get('filename') === r.old_filename) {
                                                urlObj.searchParams.set('filename', r.new_filename);
                                                urlObj.searchParams.set('subfolder', r.new_subfolder);
                                                a.resultUrl = urlObj.toString();
                                            }
                                        } catch(e) {}
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
                                    if (!affectedAreaIds.includes(a.id)) affectedAreaIds.push(a.id);
                                }
                            }));
                        });
                        
                        if (affectedAreaIds.length > 0) {
                            affectedAreaIds.forEach(id => {
                                if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(id);
                            });
                            if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
                        }
                    }
                    alert(`✅ 成功复制并重命名了 ${res.results.length} 个文件到 ${archiveBase}/${workflowWorkspaceName} 文件夹！`);
                } else alert("❌ 操作失败: " + (res.error || "未知错误"));
            } catch (err) { alert("❌ 请求后端接口失败。\n" + err.message); }
        };

        const copyBtn = exportWrapper.querySelector("#clab-export-org-copy");
        if (copyBtn) copyBtn.onclick = (e) => { e.stopPropagation(); organizeOutputFiles('copy', false); };
        const copyHistoryBtn = exportWrapper.querySelector("#clab-export-org-copy-history");
        if (copyHistoryBtn) copyHistoryBtn.onclick = (e) => { e.stopPropagation(); organizeOutputFiles('copy', true); };
    }
}
