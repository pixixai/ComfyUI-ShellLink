/**
 * API 注入器 (Service)
 * 负责拦截 ComfyUI 的运行请求并注入卡片参数，安全管理发包队列
 */
import { api } from "../../scripts/api.js";
import { StateManager } from "./state_manager.js";
import { showBindingToast, hideBindingToast } from "./components/ui_utils.js";

export function setupAPIInjector(app) {
    console.log("[ShellLink] 初始化 API 拦截、动态剪枝与回传系统...");

    window.ShellLink = window.ShellLink || {};
    window._slExecQueue = window._slExecQueue || []; 
    window._slTaskMap = window._slTaskMap || {};     
    window._slLastGeneratedTask = null;              
    window._slCurrentBatchPromptIds = [];            
    window._slCardProgress = window._slCardProgress || {}; 
    window._slHideTimers = window._slHideTimers || {};     
    window._slDoneTasks = window._slDoneTasks || new Set();

    // =========================================================================
    // 【神级修复】：全局媒体加载监听器，实现切换历史记录时动态适配尺寸，且支持无感刷新
    // =========================================================================
    if (!window._slMediaLoadHijacked) {
        const handleMediaLoad = (element, width, height) => {
            if (!width || !height) return;
            const areaEl = element.closest('.sl-area');
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
                    
                    // 【核心修复】：动态适配尺寸时，优先使用局部微创更新，拒绝全屏闪烁！
                    if (window._slSurgicallyUpdateArea) window._slSurgicallyUpdateArea(areaId);
                    else document.dispatchEvent(new CustomEvent("sl_render_ui"));
                }
            }
        };

        document.addEventListener('load', (e) => {
            if (e.target && e.target.tagName === 'IMG' && e.target.classList && e.target.classList.contains('sl-preview-img')) {
                handleMediaLoad(e.target, e.target.naturalWidth, e.target.naturalHeight);
            }
        }, true);

        document.addEventListener('loadeddata', (e) => {
            if (e.target && e.target.tagName === 'VIDEO' && e.target.classList && e.target.classList.contains('sl-preview-img')) {
                handleMediaLoad(e.target, e.target.videoWidth, e.target.videoHeight);
            }
        }, true);

        window._slMediaLoadHijacked = true;
    }

    // =========================================================================
    // 【核弹级 UI 渲染器】：支持报错红灯模式
    // =========================================================================
    const setUIProgress = (cardId, percentage, isHide = false, isError = false, isRestore = false) => {
        if (window._slDoneTasks.has(cardId) && !isHide && !isRestore && percentage < 100) return; 

        if (!isRestore) {
            if (isHide) {
                delete window._slCardProgress[cardId];
            } else {
                window._slCardProgress[cardId] = { percentage, isHide, isError };
                if (window._slHideTimers[cardId]) {
                    clearTimeout(window._slHideTimers[cardId]);
                    delete window._slHideTimers[cardId];
                }
            }
        }

        const progContainer = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${cardId}"]`);
        if (!progContainer) return;
        const bar = progContainer.querySelector('.sl-card-progress-bar');
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
                const freshContainer = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${cardId}"]`);
                if (freshContainer) freshContainer.style.display = 'none';
                const freshBar = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${cardId}"] .sl-card-progress-bar`);
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

    document.addEventListener("sl_render_ui", () => {
        setTimeout(() => {
            const allContainers = document.querySelectorAll('.sl-card-progress-container');
            allContainers.forEach(container => {
                const cardId = container.getAttribute('data-card-prog-id');
                const state = window._slCardProgress[cardId];
                
                if (state && !state.isHide) {
                    setUIProgress(cardId, state.percentage, state.isHide, state.isError, true);
                } else {
                    container.style.display = 'none';
                    container.style.opacity = '0';
                    const bar = container.querySelector('.sl-card-progress-bar');
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
            for (const cardId in window._slCardProgress) {
                const state = window._slCardProgress[cardId];
                if (state && !state.isHide) {
                    setUIProgress(cardId, 100);
                    if (window._slHideTimers[cardId]) clearTimeout(window._slHideTimers[cardId]);
                    window._slHideTimers[cardId] = setTimeout(() => {
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
        const task = window._slTaskMap[pid];
        
        if (task) {
            setUIProgress(task.cardId, 100, false, true);
            
            if (window._slHideTimers[task.cardId]) clearTimeout(window._slHideTimers[task.cardId]);
            window._slHideTimers[task.cardId] = setTimeout(() => {
                setUIProgress(task.cardId, 0, true);
            }, 6000);

            if (window._slCurrentBatchPromptIds && window._slCurrentBatchPromptIds.length > 0) {
                const toDelete = window._slCurrentBatchPromptIds.filter(id => id !== pid);
                if (toDelete.length > 0) {
                    api.fetchApi('/queue', {
                        method: 'POST',
                        body: JSON.stringify({ delete: toDelete })
                    }).catch(err => console.error("[ShellLink] 无法删除后续队列", err));

                    toDelete.forEach(delPid => {
                        const delTask = window._slTaskMap[delPid];
                        if (delTask) setUIProgress(delTask.cardId, 0, true);
                    });
                }
                window._slCurrentBatchPromptIds = [];
            }
        }
    });

    // =========================================================================
    // 1. 坚如磐石的异步执行队列
    // =========================================================================
    window.ShellLink.executeTasks = async function(tasks) {
        window._slCurrentBatchPromptIds = []; 
        window._slDoneTasks = window._slDoneTasks || new Set(); 

        for (let task of tasks) {
            window._slDoneTasks.delete(task.cardId); 
            window._slExecQueue.push(task);
            
            const bar = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${task.cardId}"] .sl-card-progress-bar`);
            if (bar) bar.classList.remove('error'); 
            setUIProgress(task.cardId, 5);
        }

        const count = tasks.length;
        for (let i = 0; i < count; i++) {
            try {
                await app.queuePrompt(0, 1); 
            } catch (submitErr) {
                console.warn("[ShellLink] 🚫 前端图谱校验未通过，触发阻断！", submitErr);
                showBindingToast("❌ 节点前端校验失败！请检查工作流连线或必填参数。", true);
                setTimeout(() => hideBindingToast(), 6000);
                
                if (window._slLastGeneratedTask) {
                    const errorCardId = window._slLastGeneratedTask.cardId;
                    setUIProgress(errorCardId, 100, false, true);
                    
                    if (window._slHideTimers[errorCardId]) clearTimeout(window._slHideTimers[errorCardId]);
                    window._slHideTimers[errorCardId] = setTimeout(() => {
                        setUIProgress(errorCardId, 0, true);
                    }, 6000);

                    window._slLastGeneratedTask = null;
                }

                while (window._slExecQueue.length > 0) {
                    let skippedTask = window._slExecQueue.shift();
                    setUIProgress(skippedTask.cardId, 0, true);
                }
                break;
            }
        }
    };

    const origQueuePrompt = api.queuePrompt;
    api.queuePrompt = async function() {
        const res = await origQueuePrompt.apply(this, arguments);
        if (res && res.prompt_id && window._slLastGeneratedTask) {
            window._slTaskMap[res.prompt_id] = window._slLastGeneratedTask;
            window._slCurrentBatchPromptIds.push(res.prompt_id); 
            window._slLastGeneratedTask = null; 
        }
        return res;
    };

    // =========================================================================
    // 2. 拦截队列请求 (Input 参数注入 & Output 动态剪枝)
    // =========================================================================
    const originalGraphToPrompt = app.graphToPrompt;
    app.graphToPrompt = async function () {
        const result = await originalGraphToPrompt.apply(this, arguments);
        
        let execTask = window._slExecQueue.shift();
        if (!execTask) return result; 

        window._slLastGeneratedTask = execTask;
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
        const task = window._slTaskMap[pid];
        
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
        const task = window._slTaskMap[pid];
        
        if (task && !e.detail.node) {
            window._slDoneTasks = window._slDoneTasks || new Set();
            window._slDoneTasks.add(task.cardId); 

            setUIProgress(task.cardId, 100);
            
            if (window._slHideTimers[task.cardId]) clearTimeout(window._slHideTimers[task.cardId]);
            window._slHideTimers[task.cardId] = setTimeout(() => {
                setUIProgress(task.cardId, 0, true);
            }, 800);
        }
    });

    // =========================================================================
    // 4. 监听引擎执行完成事件 (增强版：截胡转存与无感局部回写闭环)
    // =========================================================================
    api.addEventListener("executed", async (event) => {
        const detail = event.detail;
        const executedNodeId = detail.node;     
        const outputData = detail.output;       
        const prompt_id = detail.prompt_id; 

        const task = (window._slTaskMap && prompt_id) ? window._slTaskMap[prompt_id] : null;
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

                if (targetItems && targetItems.length > 0) {
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

                        const oldParams = new URLSearchParams({ filename: media.filename, type: media.type, subfolder: media.subfolder || "" });
                        const oldUrlStr = `/view?${oldParams.toString()}`;
                        const oldUrl = api.apiURL(oldUrlStr);

                        if (media.type === "temp" || media.type === "output") {
                            try {
                                const asset_type = isVideo ? "video" : (isAudio ? "audio" : "image");
                                const res = await fetch('/shell_link/copy_temp_asset', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        filename: media.filename,
                                        subfolder: media.subfolder || "",
                                        asset_type: asset_type,
                                        source_type: media.type
                                    })
                                });
                                
                                const data = await res.json();
                                if (data.status === "success") {
                                    media.filename = data.new_filename;
                                    media.subfolder = data.new_subfolder;
                                    media.type = data.new_type; 
                                }
                            } catch (err) {
                                console.error("[ShellLink] 截胡资产网络请求失败:", err);
                            }
                        }

                        const newParams = new URLSearchParams({ filename: media.filename, type: media.type, subfolder: media.subfolder || "" });
                        const newUrl = api.apiURL(`/view?${newParams.toString()}`);

                        if (newUrl) {
                            if (!area.history) area.history = [];
                            const foundIdx = area.history.findIndex(h => h === oldUrl || h.includes(oldUrlStr));
                            if (foundIdx !== -1) {
                                area.history[foundIdx] = newUrl;
                            } else {
                                if (!area.history.includes(newUrl)) area.history.push(newUrl);
                            }
                        }

                        if (i === 0 && newUrl) {
                            newUrlFirst = newUrl;
                            isVideoFirst = isVideo;
                            isAudioFirst = isAudio;
                        }
                    }

                    if (newUrlFirst) {
                        area.resultUrl = newUrlFirst;
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
                                    // 【核心修复】：视频运算完尺寸后，依然走外科手术级局部更新
                                    if (window._slSurgicallyUpdateArea) window._slSurgicallyUpdateArea(area.id);
                                    else document.dispatchEvent(new CustomEvent("sl_render_ui"));
                                };
                                tempVid.onerror = (e) => console.error("[ShellLink] 读取视频尺寸失败", e);
                                tempVid.src = newUrlFirst;
                                tempVid.load();
                            } else if (isAudioFirst) {
                                area.ratio = 'auto';
                                StateManager.syncToNode(app.graph);
                                if (window._slSurgicallyUpdateArea) window._slSurgicallyUpdateArea(area.id);
                                else document.dispatchEvent(new CustomEvent("sl_render_ui"));
                            } else {
                                const tempImg = new Image();
                                tempImg.onload = () => {
                                    area.ratio = '自定义比例';
                                    area.width = tempImg.naturalWidth;
                                    area.height = tempImg.naturalHeight;
                                    StateManager.syncToNode(app.graph);
                                    if (window._slSurgicallyUpdateArea) window._slSurgicallyUpdateArea(area.id);
                                    else document.dispatchEvent(new CustomEvent("sl_render_ui"));
                                };
                                tempImg.src = newUrlFirst; 
                            }
                        } else {
                            // 【核心修复】：取消通过派发 shell_link_update_preview 处理，直接统一进行原生手术级更新
                            if (window._slSurgicallyUpdateArea) window._slSurgicallyUpdateArea(area.id);
                            else {
                                document.dispatchEvent(new CustomEvent("shell_link_update_preview", {
                                    detail: { cardId: card.id, areaId: area.id, url: newUrlFirst }
                                }));
                            }
                        }
                    }
                }
            }
        });
    });
}