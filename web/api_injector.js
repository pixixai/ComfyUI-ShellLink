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
    window._slExecQueue = window._slExecQueue || []; // 安全的任务队列
    window._slTaskMap = window._slTaskMap || {};     // 记录 prompt_id -> 任务映射
    window._slLastGeneratedTask = null;              // 桥接前后端的暂存任务
    window._slCurrentBatchPromptIds = [];            // 记录当前批次的所有 prompt_id
    window._slCardProgress = window._slCardProgress || {}; // 独立缓存进度条状态，防止UI重绘时丢失
    window._slHideTimers = window._slHideTimers || {};     // 定时器管家，防止不同任务的隐藏动画互相打架
    window._slDoneTasks = window._slDoneTasks || new Set(); // 【新增】：完成名单，防止后端发送迟到的信号导致进度条诈尸

    // =========================================================================
    // 【神级防护】：拦截全局重绘事件，使用“DOM 拔插术”实现视频真正 0 闪烁播放
    // =========================================================================
    if (!window._slDispatchHijacked) {
        const originalDispatchEvent = document.dispatchEvent;
        document.dispatchEvent = function(event) {
            let savedVideoDOMs = null;
            
            // 阶段 1：在发送重绘信号前，把页面上所有的真实 <video> DOM 节点暂时拔下来，藏在内存里！
            if (event && event.type === "sl_render_ui") {
                savedVideoDOMs = new Map();
                document.querySelectorAll('video').forEach(v => {
                    // 【核心修复】：必须是 ID 和 SRC 的强绑定！防止切换历史记录时旧视频鸠占鹊巢
                    const key = v.id ? `${v.id}|${v.src}` : v.src;
                    if (key) {
                        const state = { time: v.currentTime, paused: v.paused };
                        // 拔下真实的 video 节点，不销毁它的解码器和播放状态
                        v.parentNode.removeChild(v);
                        savedVideoDOMs.set(key, { element: v, state: state });
                    }
                });
            }
            
            // 执行真正的 DOM 刷新 (innerHTML 被全量覆盖，生成了全新的空 <video> 标签)
            const result = originalDispatchEvent.apply(this, arguments);
            
            // 阶段 2：重绘完成后，立刻同步把我们保护好的真实 <video> DOM 节点塞回去！
            if (event && event.type === "sl_render_ui" && savedVideoDOMs && savedVideoDOMs.size > 0) {
                document.querySelectorAll('video').forEach(newVideo => {
                    const key = newVideo.id ? `${newVideo.id}|${newVideo.src}` : newVideo.src;
                    if (key && savedVideoDOMs.has(key)) {
                        const data = savedVideoDOMs.get(key);
                        const realVideo = data.element;
                        
                        // 继承新渲染出的样式或类名（比如由于匹配比例引发的宽高变化）
                        realVideo.className = newVideo.className;
                        realVideo.style.cssText = newVideo.style.cssText;
                        
                        // 狸猫换太子：把空壳 video 换成我们一直在平稳播放的真 video
                        newVideo.parentNode.replaceChild(realVideo, newVideo);
                        
                        // 瞬间恢复播放进度和状态
                        realVideo.currentTime = data.state.time;
                        if (!data.state.paused) {
                            const p = realVideo.play();
                            if (p !== undefined) p.catch(() => {});
                        }
                    }
                });
                savedVideoDOMs.clear();
            }
            return result;
        };
        window._slDispatchHijacked = true;
    }

    // =========================================================================
    // 【神级修复】：全局媒体加载监听器，实现切换历史记录时动态适配尺寸
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
                // 只有当尺寸确实发生了变化，才去触发重绘，避免无限循环死锁
                if (area.width !== width || area.height !== height || area.ratio !== '自定义比例') {
                    area.ratio = '自定义比例';
                    area.width = width;
                    area.height = height;
                    StateManager.syncToNode(app.graph);
                    document.dispatchEvent(new CustomEvent("sl_render_ui"));
                }
            }
        };

        // 捕获阶段监听所有的图片加载 (天然支持从内存缓存极速加载的情况)
        document.addEventListener('load', (e) => {
            if (e.target && e.target.tagName === 'IMG' && e.target.classList && e.target.classList.contains('sl-preview-img')) {
                handleMediaLoad(e.target, e.target.naturalWidth, e.target.naturalHeight);
            }
        }, true);

        // 捕获阶段监听所有的视频数据加载
        document.addEventListener('loadeddata', (e) => {
            if (e.target && e.target.tagName === 'VIDEO' && e.target.classList && e.target.classList.contains('sl-preview-img')) {
                handleMediaLoad(e.target, e.target.videoWidth, e.target.videoHeight);
            }
        }, true);

        window._slMediaLoadHijacked = true;
    }

    // =========================================================================
    // 【核弹级 UI 渲染器】：支持报错红灯模式，最高权限 (!important) 压制闪烁
    // =========================================================================
    const setUIProgress = (cardId, percentage, isHide = false, isError = false, isRestore = false) => {
        // 【防诈尸锁】：如果这个任务已经被标记为完成，且不是在执行最终隐藏或恢复，直接拦截！
        if (window._slDoneTasks.has(cardId) && !isHide && !isRestore && percentage < 100) {
            return; 
        }

        // 保存状态到内存，防止重绘丢失
        if (!isRestore) {
            if (isHide) {
                // 只要收到隐藏指令，立刻从缓存中彻底抹除！绝不等动画！
                delete window._slCardProgress[cardId];
            } else {
                window._slCardProgress[cardId] = { percentage, isHide, isError };
                // 新任务开始时，立刻清理可能残留的隐藏倒计时
                if (window._slHideTimers[cardId]) {
                    clearTimeout(window._slHideTimers[cardId]);
                    delete window._slHideTimers[cardId];
                }
            }
        }

        // 【核心修复】：每次操作都重新获取 DOM，防止操作到被 sl_render_ui 销毁的旧元素
        const progContainer = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${cardId}"]`);
        if (!progContainer) return;
        const bar = progContainer.querySelector('.sl-card-progress-bar');
        if (!bar) return;

        if (isError) {
            progContainer.style.display = 'block'; // 唤醒物理布局
            progContainer.style.opacity = '1';
            bar.classList.add('error');
            bar.style.setProperty('transition', 'none', 'important'); 
            bar.style.setProperty('width', '100%', 'important');
        } else if (isHide) {
            bar.classList.remove('error');
            progContainer.style.opacity = '0'; // 开始透明度渐隐
            setTimeout(() => {
                // 动画结束后，重新再查一次 DOM！并执行彻底的物理隐藏
                const freshContainer = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${cardId}"]`);
                if (freshContainer) {
                    freshContainer.style.display = 'none'; // 【核心修复】：彻底剔除灰色底边
                }
                const freshBar = document.querySelector(`.sl-card-progress-container[data-card-prog-id="${cardId}"] .sl-card-progress-bar`);
                if (freshBar) {
                    freshBar.style.setProperty('transition', 'none', 'important');
                    freshBar.style.setProperty('width', '0%', 'important');
                }
            }, 300);
        } else {
            progContainer.style.display = 'block'; // 唤醒物理布局
            progContainer.style.opacity = '1';
            if (isRestore) {
                // 恢复模式下，直接赋予宽度，避免从0开始的动画闪烁
                bar.style.setProperty('transition', 'none', 'important');
                bar.style.setProperty('width', `${percentage}%`, 'important');
                void bar.offsetWidth; // 强制DOM重绘应用样式
            }
            bar.style.setProperty('transition', 'width 0.3s ease-out', 'important');
            bar.style.setProperty('width', `${percentage}%`, 'important');
        }
    };

    // =========================================================================
    // 【核心修复】：监听 UI 重绘事件，防僵尸进度条机制
    // =========================================================================
    document.addEventListener("sl_render_ui", () => {
        // 延迟 100ms，确保 DOM 已经完全真实替换完毕
        setTimeout(() => {
            const allContainers = document.querySelectorAll('.sl-card-progress-container');
            
            allContainers.forEach(container => {
                const cardId = container.getAttribute('data-card-prog-id');
                const state = window._slCardProgress[cardId];
                
                if (state && !state.isHide) {
                    // 场景A：该卡片正在排队/运行中，静默恢复它的进度蓝色条
                    setUIProgress(cardId, state.percentage, state.isHide, state.isError, true);
                } else {
                    // 场景B：该卡片不在运行队列中（已经跑完或从未跑过）。
                    // 【终极暴力隐藏】：彻底杀死任何可能暴露的“僵尸”底线！
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

    // =========================================================================
    // 【新增底线兜底】：全局监听 ComfyUI 队列清空事件
    // =========================================================================
    api.addEventListener("status", (e) => {
        // 当右上角的运行队列变为 0 时，执行终极清理，不管之前漏了什么信号，全部清盘！
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

    // 监听后端的运行报错，弹出 Toast 提示并直接中断当前批次的后续任务！
    api.addEventListener("execution_error", (e) => {
        showBindingToast("❌ 工作流后台运行报错！请关闭面板，查看详细错误提示。", true);
        setTimeout(() => hideBindingToast(), 6000);
        
        const pid = e.detail?.prompt_id;
        const task = window._slTaskMap[pid];
        
        if (task) {
            // 1. 将当前后端报错的卡片瞬间标红 100%
            setUIProgress(task.cardId, 100, false, true);
            
            // 6秒后自动把红色的进度条抹除，不留僵尸状态
            if (window._slHideTimers[task.cardId]) clearTimeout(window._slHideTimers[task.cardId]);
            window._slHideTimers[task.cardId] = setTimeout(() => {
                setUIProgress(task.cardId, 0, true);
            }, 6000);

            // 2. 将当前批次中的其他后续任务全部从 ComfyUI 后端队列中直接删除（强力拦截）
            if (window._slCurrentBatchPromptIds && window._slCurrentBatchPromptIds.length > 0) {
                const toDelete = window._slCurrentBatchPromptIds.filter(id => id !== pid);
                
                if (toDelete.length > 0) {
                    api.fetchApi('/queue', {
                        method: 'POST',
                        body: JSON.stringify({ delete: toDelete })
                    }).catch(err => console.error("[ShellLink] 无法删除后续队列", err));

                    // 3. 隐藏被成功拦截（删除）的无辜排队任务的 5% 蓝条
                    toDelete.forEach(delPid => {
                        const delTask = window._slTaskMap[delPid];
                        if (delTask) {
                            setUIProgress(delTask.cardId, 0, true);
                        }
                    });
                }
                // 清空当前批次记录
                window._slCurrentBatchPromptIds = [];
            }
        }
    });

    // =========================================================================
    // 1. 坚如磐石的异步执行队列
    // =========================================================================
    window.ShellLink.executeTasks = async function(tasks) {
        window._slCurrentBatchPromptIds = []; 
        window._slDoneTasks = window._slDoneTasks || new Set(); // 初始化完成名单

        for (let task of tasks) {
            window._slDoneTasks.delete(task.cardId); // 【重置锁】：新任务发车前解除限制
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

    // 拦截 api.queuePrompt 以精准捕获生成的 prompt_id
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

        if (!execTask) {
            console.log(`[ShellLink] 🟢 原生运行模式：完全隔离 (不注入参数、不修改路径、不剪枝)`);
            return result; 
        }

        window._slLastGeneratedTask = execTask;
        console.log(`[ShellLink] 🚀 插件运行模式：当前注入任务卡片: ${execTask.cardId}`);

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

        // --- 阶段 A.5: 偷天换日 (修改保存节点) ---
        if (activeCard.areas) {
            activeCard.areas.forEach(area => {
                if (area.type === 'preview') {
                    if (execTask.previewAreaIds.includes(area.id) && area.targetNodeId && promptOutput[area.targetNodeId]) {
                        const nodeData = promptOutput[area.targetNodeId];
                        let prefix = `ShellLink/Pix`;
                        
                        if (nodeData.class_type === 'PreviewImage' || nodeData.class_type === 'SaveImage') {
                            nodeData.class_type = 'ShellLinkSaveImage';
                            if (!nodeData.inputs) nodeData.inputs = {};
                            nodeData.inputs.filename_prefix = prefix;
                        } else if (nodeData.class_type === 'ShellLinkSaveImage' || nodeData.class_type.includes('VideoCombine')) {
                            if (!nodeData.inputs) nodeData.inputs = {};
                            if (nodeData.inputs.filename_prefix !== undefined) nodeData.inputs.filename_prefix = prefix;
                            else if (nodeData.inputs.save_prefix !== undefined) nodeData.inputs.save_prefix = prefix;
                            else nodeData.inputs.filename_prefix = prefix;
                        }
                    }
                }
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
        
        // 当 e.detail.node 为 null 时，表示整个队列(prompt_id)中的所有节点都执行完毕了！
        if (task && !e.detail.node) {
            window._slDoneTasks = window._slDoneTasks || new Set();
            window._slDoneTasks.add(task.cardId); // 【核心防线】：写入完成名单

            setUIProgress(task.cardId, 100);
            
            if (window._slHideTimers[task.cardId]) clearTimeout(window._slHideTimers[task.cardId]);
            window._slHideTimers[task.cardId] = setTimeout(() => {
                setUIProgress(task.cardId, 0, true);
            }, 800);
        }
    });

    // =========================================================================
    // 4. 监听引擎执行完成事件 (增强版：支持多种格式的视频识别与获取尺寸)
    // =========================================================================
    api.addEventListener("executed", (event) => {
        const detail = event.detail;
        const executedNodeId = detail.node;     
        const outputData = detail.output;       
        const prompt_id = detail.prompt_id; 

        const task = (window._slTaskMap && prompt_id) ? window._slTaskMap[prompt_id] : null;
        if (!task) return;

        const card = StateManager.state.cards.find(c => c.id === task.cardId);
        if (!card || !card.areas) return;

        card.areas.filter(a => a.type === 'preview').forEach(area => {
            if (task.previewAreaIds && task.previewAreaIds.length > 0) {
                if (!task.previewAreaIds.includes(area.id)) return;
            }

            if (String(area.targetNodeId) === String(executedNodeId)) {
                let newUrl = null;
                let isVideo = false;
                let isAudio = false;

                // 【核心修复1】：支持读取 outputData.audio 数组！
                let targetItems = null;
                if (outputData.videos && outputData.videos.length > 0) targetItems = outputData.videos;
                else if (outputData.audio && outputData.audio.length > 0) targetItems = outputData.audio;
                else if (outputData.gifs && outputData.gifs.length > 0) targetItems = outputData.gifs;
                else if (outputData.images && outputData.images.length > 0) targetItems = outputData.images;

                if (targetItems && targetItems.length > 0) {
                    const media = targetItems[0];
                    const params = new URLSearchParams({ filename: media.filename, type: media.type, subfolder: media.subfolder || "" });
                    newUrl = api.apiURL(`/view?${params.toString()}`);
                    
                    const ext = media.filename.split('.').pop().toLowerCase();
                    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext) || (media.format && media.format.startsWith('video/'))) {
                        isVideo = true;
                    } else if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext) || (media.format && media.format.startsWith('audio/'))) {
                        isAudio = true;
                    }
                }

                if (newUrl) {
                    area.resultUrl = newUrl;

                    if (area.matchMedia) {
                        if (isVideo) {
                            const tempVid = document.createElement('video');
                            tempVid.muted = true;
                            tempVid.playsInline = true;
                            tempVid.onloadeddata = () => {
                                area.ratio = '自定义比例';
                                area.width = tempVid.videoWidth;
                                area.height = tempVid.videoHeight;
                                StateManager.syncToNode(app.graph);
                                document.dispatchEvent(new CustomEvent("sl_render_ui"));
                            };
                            tempVid.onerror = (e) => console.error("[ShellLink] 读取视频尺寸失败", e);
                            tempVid.src = newUrl;
                            tempVid.load();
                        } else if (isAudio) {
                            // 【核心修复2】：音频没有天然尺寸，如果开启了“匹配媒体比例”，则跳过尺寸计算直接渲染
                            area.ratio = 'auto';
                            StateManager.syncToNode(app.graph);
                            document.dispatchEvent(new CustomEvent("sl_render_ui"));
                        } else {
                            const tempImg = new Image();
                            tempImg.onload = () => {
                                area.ratio = '自定义比例';
                                area.width = tempImg.naturalWidth;
                                area.height = tempImg.naturalHeight;
                                StateManager.syncToNode(app.graph);
                                document.dispatchEvent(new CustomEvent("sl_render_ui"));
                            };
                            tempImg.src = newUrl; 
                        }
                    } else {
                        StateManager.syncToNode(app.graph);
                        document.dispatchEvent(new CustomEvent("shell_link_update_preview", {
                            detail: { cardId: card.id, areaId: area.id, url: newUrl }
                        }));
                    }
                }
            }
        });
    });
}

// =========================================================================
// 拦截 api.queuePrompt：专为面板运行的视频任务重定向保存路径
// =========================================================================
const originalQueuePrompt = api.queuePrompt;
api.queuePrompt = async function(number, payload) {
    if (window._slLastGeneratedTask && payload && payload.output) {
        for (const nodeId in payload.output) {
            const node = payload.output[nodeId];
            
            // 【核心修复3】：把音频保存节点 (SaveAudio) 也纳入自动路径分类管理
            if (node.class_type === "VHS_VideoCombine" || (node.class_type && node.class_type.includes("Video")) || (node.class_type && node.class_type.includes("Audio"))) {
                
                const targetPrefix = "ShellLink/media/Pix";
                
                if (node.inputs) {
                    if (node.inputs.save_prefix !== undefined) {
                        node.inputs.save_prefix = targetPrefix;
                    } 
                    else if (node.inputs.filename_prefix !== undefined) {
                        node.inputs.filename_prefix = targetPrefix;
                    } 
                    else {
                        node.inputs.save_prefix = targetPrefix;
                    }
                }
            }
        }
    }
    return originalQueuePrompt.apply(this, arguments);
};