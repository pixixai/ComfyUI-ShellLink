/**
 * API 注入器 (Service)
 * 负责拦截 ComfyUI 的运行请求并注入卡片参数，安全管理发包队列
 */
import { api } from "../../scripts/api.js";
import { StateManager } from "./state_manager.js";
import { showBindingToast, hideBindingToast } from "./components/ui_utils.js";
import { pushPreviewHistoryEntry, syncTextContentWithSelection } from "./components/modules/media_types/media_utils.js";

export function setupAPIInjector(app) {
    console.log("[CLab] 初始化 API 拦截、动态剪枝与回传系统...");

    window.CLab = window.CLab || {};
    window._clabExecQueue = window._clabExecQueue || []; 
    window._clabTaskMap = window._clabTaskMap || {};     
    window._clabLastGeneratedTask = null;              
    window._clabCurrentBatchPromptIds = [];            
    window._clabCardProgress = window._clabCardProgress || {}; 
    window._clabHideTimers = window._clabHideTimers || {};     
    window._clabDoneTasks = window._clabDoneTasks || new Set();

    const normalizeTextResult = (value) => {
        if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join("\n\n");
        if (value == null) return "";
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        if (typeof value === "object") {
            try {
                return JSON.stringify(value, null, 2);
            } catch (_) {
                return String(value);
            }
        }
        return String(value);
    };

    const extractTextFromOutputData = (outputData) => {
        if (!outputData || typeof outputData !== "object") return "";
        const directKeys = ["text", "texts", "string", "strings", "markdown", "value"];
        for (const key of directKeys) {
            if (!(key in outputData)) continue;
            const candidate = normalizeTextResult(outputData[key]);
            if (candidate.trim()) return candidate;
        }
        return "";
    };

    const extractTextFromNodeWidgets = (node) => {
        const widgets = node?.widgets || [];
        if (!widgets.length) return "";

        const candidates = [];
        widgets.forEach((widget) => {
            const value = normalizeTextResult(widget?.value);
            if (!value.trim()) return;

            const name = String(widget?.name || "");
            const score =
                (/^preview_(markdown|text)$/i.test(name) ? 100 : 0) +
                (/(markdown|text|preview|result|output)/i.test(name) ? 20 : 0) +
                ((widget?.options?.read_only || widget?.element?.readOnly) ? 10 : 0) +
                Math.min(10, Math.floor(value.length / 200));

            candidates.push({ score, value });
        });

        candidates.sort((left, right) => right.score - left.score);
        return candidates[0]?.value || "";
    };

    const saveTextAsset = async (text) => {
        const response = await fetch("/clab/save_text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                archive_dir: window._clabArchiveDir || "CLab",
                file_prefix: window._clabFilePrefix || "pix",
            }),
        });

        const data = await response.json();
        if (data.status !== "success") {
            throw new Error(data.error || "save_text failed");
        }

        const params = new URLSearchParams({
            filename: data.new_filename,
            type: data.new_type,
            subfolder: data.new_subfolder || "",
        });
        return api.apiURL(`/view?${params.toString()}`);
    };

    // =========================================================================
    // 【神级修复】：全局媒体加载监听器，实现切换历史记录时动态适配尺寸
    // =========================================================================
    if (!window._clabMediaLoadHijacked) {
        const handleMediaLoad = (element, width, height) => {
            if (!width || !height) return;
            const areaEl = element.closest('.clab-area');
            if (!areaEl) return;
            const cardId = areaEl.dataset.cardId;
            const areaId = areaEl.dataset.areaId;
            const card = StateManager.state.cards.find(c => c.id === cardId);
            const area = card?.areas.find(a => a.id === areaId);
            
            if (area && area.matchMedia) {
                if (area.width !== width || area.height !== height || area.ratio !== '自定义比例') {
                    area.ratio = '自定义比例';
                    area.width = width;
                    area.height = height;
                    StateManager.syncToNode(app.graph);
                    
                    // 【点穴修复】：读取完自适应尺寸后，放弃全局核弹，改用点穴更新
                    if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(areaId);
                    else document.dispatchEvent(new CustomEvent("clab_render_ui"));
                }
            }
        };

        document.addEventListener('load', (e) => {
            if (e.target && e.target.tagName === 'IMG' && e.target.classList && e.target.classList.contains('clab-preview-img')) {
                handleMediaLoad(e.target, e.target.naturalWidth, e.target.naturalHeight);
            }
        }, true);

        document.addEventListener('loadeddata', (e) => {
            if (e.target && e.target.tagName === 'VIDEO' && e.target.classList && e.target.classList.contains('clab-preview-img')) {
                handleMediaLoad(e.target, e.target.videoWidth, e.target.videoHeight);
            }
        }, true);

        window._clabMediaLoadHijacked = true;
    }

    // =========================================================================
    // 【核弹级 UI 渲染器】：支持报错红灯模式
    // =========================================================================
    const setUIProgress = (cardId, percentage, isHide = false, isError = false, isRestore = false) => {
        if (window._clabDoneTasks.has(cardId) && !isHide && !isRestore && percentage < 100) return; 

        if (!isRestore) {
            if (isHide) {
                delete window._clabCardProgress[cardId];
            } else {
                window._clabCardProgress[cardId] = { percentage, isHide, isError };
                if (window._clabHideTimers[cardId]) {
                    clearTimeout(window._clabHideTimers[cardId]);
                    delete window._clabHideTimers[cardId];
                }
            }
        }

        const progContainer = document.querySelector(`.clab-card-progress-container[data-card-prog-id="${cardId}"]`);
        if (!progContainer) return;
        const bar = progContainer.querySelector('.clab-card-progress-bar');
        if (!bar) return;

        if (isError) {
            progContainer.style.display = 'block';
            progContainer.style.opacity = '1';
            bar.classList.add('error');
            bar.style.setProperty('transition', 'none', 'important'); 
            bar.style.setProperty('width', '100%', 'important');
        } else if (isHide) {
            bar.classList.remove('error');
            progContainer.style.opacity = '0';
            setTimeout(() => {
                const freshContainer = document.querySelector(`.clab-card-progress-container[data-card-prog-id="${cardId}"]`);
                if (freshContainer) freshContainer.style.display = 'none';
                const freshBar = document.querySelector(`.clab-card-progress-container[data-card-prog-id="${cardId}"] .clab-card-progress-bar`);
                if (freshBar) {
                    freshBar.style.setProperty('transition', 'none', 'important');
                    freshBar.style.setProperty('width', '0%', 'important');
                }
            }, 300);
        } else {
            progContainer.style.display = 'block';
            progContainer.style.opacity = '1';
            if (isRestore) {
                bar.style.setProperty('transition', 'none', 'important');
                bar.style.setProperty('width', `${percentage}%`, 'important');
                void bar.offsetWidth; 
            }
            bar.style.setProperty('transition', 'width 0.3s ease-out', 'important');
            bar.style.setProperty('width', `${percentage}%`, 'important');
        }
    };

    document.addEventListener("clab_render_ui", () => {
        setTimeout(() => {
            const allContainers = document.querySelectorAll('.clab-card-progress-container');
            allContainers.forEach(container => {
                const cardId = container.getAttribute('data-card-prog-id');
                const state = window._clabCardProgress[cardId];
                
                if (state && !state.isHide) {
                    setUIProgress(cardId, state.percentage, state.isHide, state.isError, true);
                } else {
                    container.style.display = 'none';
                    container.style.opacity = '0';
                    const bar = container.querySelector('.clab-card-progress-bar');
                    if (bar) {
                        bar.style.setProperty('transition', 'none', 'important');
                        bar.style.setProperty('width', '0%', 'important');
                    }
                }
            });
        }, 100);
    });

    api.addEventListener("status", (e) => {
        if (e.detail && e.detail.exec_info && e.detail.exec_info.queue_remaining === 0) {
            for (const cardId in window._clabCardProgress) {
                const state = window._clabCardProgress[cardId];
                if (state && !state.isHide) {
                    setUIProgress(cardId, 100);
                    if (window._clabHideTimers[cardId]) clearTimeout(window._clabHideTimers[cardId]);
                    window._clabHideTimers[cardId] = setTimeout(() => {
                        setUIProgress(cardId, 0, true);
                    }, 800);
                }
            }
        }
    });

    api.addEventListener("execution_error", (e) => {
        showBindingToast("❌ 工作流后台运行报错！请关闭面板，查看详细错误提示。", true);
        setTimeout(() => hideBindingToast(), 6000);
        
        const pid = e.detail?.prompt_id;
        const task = window._clabTaskMap[pid];
        
        if (task) {
            setUIProgress(task.cardId, 100, false, true);
            
            if (window._clabHideTimers[task.cardId]) clearTimeout(window._clabHideTimers[task.cardId]);
            window._clabHideTimers[task.cardId] = setTimeout(() => {
                setUIProgress(task.cardId, 0, true);
            }, 6000);

            // 【核心】：根据 HaltOnError 设置决定是否清空后续队列
            if (window._clabHaltOnError !== false) {
                if (window._clabCurrentBatchPromptIds && window._clabCurrentBatchPromptIds.length > 0) {
                    const toDelete = window._clabCurrentBatchPromptIds.filter(id => id !== pid);
                    if (toDelete.length > 0) {
                        api.fetchApi('/queue', {
                            method: 'POST',
                            body: JSON.stringify({ delete: toDelete })
                        }).catch(err => console.error("[CLab] 无法删除后续队列", err));

                        toDelete.forEach(delPid => {
                            const delTask = window._clabTaskMap[delPid];
                            if (delTask) setUIProgress(delTask.cardId, 0, true);
                        });
                    }
                    window._clabCurrentBatchPromptIds = [];
                }
            }
        }
    });

    // =========================================================================
    // 1. 坚如磐石的异步执行队列
    // =========================================================================
    window.CLab.executeTasks = async function(tasks) {
        window._clabCurrentBatchPromptIds = []; 
        window._clabDoneTasks = window._clabDoneTasks || new Set(); 

        for (let task of tasks) {
            window._clabDoneTasks.delete(task.cardId); 
            window._clabExecQueue.push(task);
            
            const bar = document.querySelector(`.clab-card-progress-container[data-card-prog-id="${task.cardId}"] .clab-card-progress-bar`);
            if (bar) bar.classList.remove('error'); 
            setUIProgress(task.cardId, 5);
        }

        const count = tasks.length;
        for (let i = 0; i < count; i++) {
            try {
                await app.queuePrompt(0, 1); 
            } catch (submitErr) {
                console.warn("[CLab] 🚫 前端图谱校验未通过，触发阻断！", submitErr);
                showBindingToast("❌ 节点前端校验失败！请检查工作流连线或必填参数。", true);
                setTimeout(() => hideBindingToast(), 6000);
                
                if (window._clabLastGeneratedTask) {
                    const errorCardId = window._clabLastGeneratedTask.cardId;
                    setUIProgress(errorCardId, 100, false, true);
                    
                    if (window._clabHideTimers[errorCardId]) clearTimeout(window._clabHideTimers[errorCardId]);
                    window._clabHideTimers[errorCardId] = setTimeout(() => {
                        setUIProgress(errorCardId, 0, true);
                    }, 6000);

                    window._clabLastGeneratedTask = null;
                }

                // 【核心】：根据 HaltOnError 设置决定是否清空前端排队任务
                if (window._clabHaltOnError !== false) {
                    while (window._clabExecQueue.length > 0) {
                        let skippedTask = window._clabExecQueue.shift();
                        setUIProgress(skippedTask.cardId, 0, true);
                    }
                    break;
                } else {
                    // 若关闭了异常阻断，则跳过当前报错任务，继续执行队列里的下一个任务
                    continue;
                }
            }
        }
    };

    const origQueuePrompt = api.queuePrompt;
    api.queuePrompt = async function() {
        const res = await origQueuePrompt.apply(this, arguments);
        if (res && res.prompt_id && window._clabLastGeneratedTask) {
            window._clabTaskMap[res.prompt_id] = window._clabLastGeneratedTask;
            window._clabCurrentBatchPromptIds.push(res.prompt_id); 
            window._clabLastGeneratedTask = null; 
        }
        return res;
    };

    // =========================================================================
    // 2. 拦截队列请求 (Input 参数注入 & Output 动态剪枝)
    // =========================================================================
    const originalGraphToPrompt = app.graphToPrompt;
    app.graphToPrompt = async function () {
        const result = await originalGraphToPrompt.apply(this, arguments);
        
        let execTask = window._clabExecQueue.shift();
        if (!execTask) return result; 

        window._clabLastGeneratedTask = execTask;
        const activeCard = StateManager.state.cards.find(c => c.id === execTask.cardId);
        if (!activeCard) return result;

        const promptOutput = JSON.parse(JSON.stringify(result.output));
        result.output = promptOutput;

        // --- 阶段 A: 参数注入 ---
        if (activeCard.areas && activeCard.areas.length > 0) {
            activeCard.areas.filter(a => a.type === 'edit').forEach(area => {
                let targets = [];
                if (Array.isArray(area.targetWidgets) && area.targetWidgets.length > 0) {
                    targets = area.targetWidgets.map(tw => {
                        const [nId, wName] = tw.split('||');
                        return { nodeId: nId, widget: wName };
                    });
                } else if (area.targetNodeId && area.targetWidget) {
                    targets = [{ nodeId: area.targetNodeId, widget: area.targetWidget }];
                }

                targets.forEach(t => {
                    const nodeData = promptOutput[t.nodeId];
                    if (nodeData && nodeData.inputs) {
                        let injectValue = area.value;
                        if (area.dataType === 'number') injectValue = Number(injectValue);
                        else if (area.dataType === 'boolean') injectValue = (injectValue === 'true' || injectValue === true);
                        else if (area.dataType === 'json') {
                            try { injectValue = JSON.parse(injectValue); } catch (e) {}
                        }
                        nodeData.inputs[t.widget] = injectValue;
                    }
                });
            });
        }

        // --- 阶段 B: 动态剪枝 ---
        const targetPreviewAreas = activeCard.areas?.filter(a => a.type === 'preview' && a.targetNodeId && execTask.previewAreaIds.includes(a.id)) || [];
        
        if (targetPreviewAreas.length > 0) {
            const keepNodes = new Set();
            function traceDependencies(nodeId) {
                const strId = String(nodeId);
                if (keepNodes.has(strId)) return;
                const nodeData = promptOutput[strId];
                if (!nodeData) return; 
                keepNodes.add(strId);
                if (nodeData.inputs) {
                    for (const key in nodeData.inputs) {
                        const val = nodeData.inputs[key];
                        if (Array.isArray(val) && val.length > 0) traceDependencies(val[0]); 
                    }
                }
            }
            targetPreviewAreas.forEach(area => traceDependencies(area.targetNodeId));
            
            const allNodeIds = Object.keys(promptOutput);
            allNodeIds.forEach(id => {
                if (!keepNodes.has(id)) delete promptOutput[id];
            });
        }
        return result;
    };

    // =========================================================================
    // 3. 全局进度监听
    // =========================================================================
    api.addEventListener("progress_state", (e) => {
        const pid = e.detail?.prompt_id;
        const nodes = e.detail?.nodes;
        const task = window._clabTaskMap[pid];
        
        if (task && nodes) {
            let total = 0;
            let done = 0;
            for (const nid in nodes) {
                const nodeState = nodes[nid];
                total += nodeState.max || 0;
                done += nodeState.value || 0;
            }
            if (total > 0) {
                const percent = Math.max(5, (done / total) * 100);
                setUIProgress(task.cardId, percent);
            }
        }
    });

    api.addEventListener("executing", (e) => {
        const pid = e.detail?.prompt_id;
        const task = window._clabTaskMap[pid];
        
        if (task && !e.detail.node) {
            window._clabDoneTasks = window._clabDoneTasks || new Set();
            window._clabDoneTasks.add(task.cardId); 

            setUIProgress(task.cardId, 100);
            
            if (window._clabHideTimers[task.cardId]) clearTimeout(window._clabHideTimers[task.cardId]);
            window._clabHideTimers[task.cardId] = setTimeout(() => {
                setUIProgress(task.cardId, 0, true);
            }, 800);
        }
    });

    // =========================================================================
    // 4. 监听引擎执行完成事件 (增强版：截胡转存与状态回写闭环)
    // =========================================================================
    api.addEventListener("executed", async (event) => {
        const detail = event.detail;
        const executedNodeId = detail.node;     
        const outputData = detail.output;       
        const prompt_id = detail.prompt_id; 

        const task = (window._clabTaskMap && prompt_id) ? window._clabTaskMap[prompt_id] : null;
        if (!task) return;

        const card = StateManager.state.cards.find(c => c.id === task.cardId);
        if (!card || !card.areas) return;

        card.areas.filter(a => a.type === 'preview').forEach(async area => {
            if (task.previewAreaIds && task.previewAreaIds.length > 0) {
                if (!task.previewAreaIds.includes(area.id)) return;
            }

            if (String(area.targetNodeId) === String(executedNodeId)) {
                let newUrlFirst = null;
                let isVideoFirst = false;
                let isAudioFirst = false;

                let targetItems = null;
                if (outputData.videos && outputData.videos.length > 0) targetItems = outputData.videos;
                else if (outputData.audio && outputData.audio.length > 0) targetItems = outputData.audio;
                else if (outputData.gifs && outputData.gifs.length > 0) targetItems = outputData.gifs;
                else if (outputData.images && outputData.images.length > 0) targetItems = outputData.images;
                const targetNode = app.graph?.getNodeById(Number(executedNodeId));
                const textFromOutput = extractTextFromOutputData(outputData);
                const textFromWidgets = extractTextFromNodeWidgets(targetNode);
                const textContent = (textFromOutput || textFromWidgets || "").trim();

                if (targetItems && targetItems.length > 0) {
                    
                    // 🔥【优化】：遍历所有的生成资产（处理多图批次出图），彻底消灭漏网之鱼
                    for (let i = 0; i < targetItems.length; i++) {
                        let media = targetItems[i];
                        
                        const ext = media.filename.split('.').pop().toLowerCase();
                        let isVideo = false;
                        let isAudio = false;
                        if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext) || (media.format && media.format.startsWith('video/'))) {
                            isVideo = true;
                        } else if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext) || (media.format && media.format.startsWith('audio/'))) {
                            isAudio = true;
                        }

                        // 记录原始的临时路径，等会要去 history 里面“抓人”
                        const oldParams = new URLSearchParams({ filename: media.filename, type: media.type, subfolder: media.subfolder || "" });
                        const oldUrlStr = `/view?${oldParams.toString()}`;
                        const oldUrl = api.apiURL(oldUrlStr);

                        // 🛡️ 截胡归档系统
                        if (media.type === "temp" || media.type === "output") {
                            try {
                                const asset_type = isVideo ? "video" : (isAudio ? "audio" : "image");
                                const res = await fetch('/clab/copy_temp_asset', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        filename: media.filename,
                                        subfolder: media.subfolder || "",
                                        asset_type: asset_type,
                                        source_type: media.type,
                                        archive_dir: window._clabArchiveDir || "CLab",
                                        delete_temp: window._clabDeleteTemp === true,
                                        file_prefix: window._clabFilePrefix || "pix"
                                    })
                                });
                                
                                const data = await res.json();
                                if (data.status === "success") {
                                    media.filename = data.new_filename;
                                    media.subfolder = data.new_subfolder;
                                    media.type = data.new_type; 
                                } else {
                                    console.error("[CLab] 截胡资产失败:", data.error);
                                }
                            } catch (err) {
                                console.error("[CLab] 截胡资产网络请求失败:", err);
                            }
                        }

                        // 构造后端复制完毕后的永久物理路径
                        const newParams = new URLSearchParams({ filename: media.filename, type: media.type, subfolder: media.subfolder || "" });
                        const newUrl = api.apiURL(`/view?${newParams.toString()}`);

                        // 🔥 【核心状态回写】：强制纠正由于异步时间差被提前写进去的 temp 路径！
                        if (newUrl) {
                            if (!area.history) area.history = [];
                            
                            // 查找是否已经存在于 history 中（匹配完整路径或包含参数）
                            const foundIdx = area.history.findIndex(h => h === oldUrl || h.includes(oldUrlStr));
                            if (foundIdx !== -1) {
                                // 替换为永久资产路径
                                area.history[foundIdx] = newUrl;
                            } else {
                                // 如果没被别处拦截写入，那么我们主动帮它存入历史记录里，防止丢失
                                if (!area.history.includes(newUrl)) {
                                    area.history.push(newUrl);
                                    
                                    // 【核心注入】：应用历史容量上限
                                    const maxLimit = window._clabMaxHistory || 50;
                                    while (area.history.length > maxLimit) {
                                        area.history.shift();
                                    }
                                }
                            }
                        }

                        // 记录第一项结果用于设置封面和触发排版
                        if (i === 0 && newUrl) {
                            newUrlFirst = newUrl;
                            isVideoFirst = isVideo;
                            isAudioFirst = isAudio;
                        }
                    }

                    if (newUrlFirst) {
                        area.resultUrl = newUrlFirst;
                        area.resultKind = isVideoFirst ? 'video' : (isAudioFirst ? 'audio' : 'image');

                        // 🔥 状态变更后，立即序列化同步到 ComfyUI 图谱内保存配置！
                        StateManager.syncToNode(app.graph);

                        if (area.matchMedia) {
                            if (isVideoFirst) {
                                const tempVid = document.createElement('video');
                                tempVid.muted = true;
                                tempVid.playsInline = true;
                                tempVid.onloadeddata = () => {
                                    area.ratio = '自定义比例';
                                    area.width = tempVid.videoWidth;
                                    area.height = tempVid.videoHeight;
                                    StateManager.syncToNode(app.graph);
                                    
                                    // 【点穴修复】：读取完视频尺寸后进行点穴更新
                                    if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(area.id);
                                    else document.dispatchEvent(new CustomEvent("clab_render_ui"));
                                };
                                tempVid.onerror = (e) => console.error("[CLab] 读取视频尺寸失败", e);
                                tempVid.src = newUrlFirst;
                                tempVid.load();
                            } else if (isAudioFirst) {
                                area.ratio = 'auto';
                                StateManager.syncToNode(app.graph);
                                
                                // 【点穴修复】：音频文件不需要获取高宽，直接点穴更新
                                if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(area.id);
                                else document.dispatchEvent(new CustomEvent("clab_render_ui"));
                            } else {
                                const tempImg = new Image();
                                tempImg.onload = () => {
                                    area.ratio = '自定义比例';
                                    area.width = tempImg.naturalWidth;
                                    area.height = tempImg.naturalHeight;
                                    StateManager.syncToNode(app.graph);
                                    
                                    // 【点穴修复】：读取完图片尺寸后进行点穴更新
                                    if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(area.id);
                                    else document.dispatchEvent(new CustomEvent("clab_render_ui"));
                                };
                                tempImg.src = newUrlFirst; 
                            }
                        } else {
                            // 【核心修复】：取消通过派发 clab_update_preview 处理，直接统一进行原生手术级更新
                            if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(area.id);
                            else {
                                document.dispatchEvent(new CustomEvent("clab_update_preview", {
                                    detail: { cardId: card.id, areaId: area.id, url: newUrlFirst }
                                }));
                            }
                        }
                    }
                } else if (textContent) {
                    try {
                        const textUrl = await saveTextAsset(textContent);
                        pushPreviewHistoryEntry(area, textUrl, { kind: "text", text: textContent });
                        syncTextContentWithSelection(area);
                        StateManager.syncToNode(app.graph);

                        if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(area.id);
                        else document.dispatchEvent(new CustomEvent("clab_render_ui"));
                    } catch (textErr) {
                        console.error("[CLab] Text capture failed:", textErr);
                    }
                }
            }
        });
    });
}
