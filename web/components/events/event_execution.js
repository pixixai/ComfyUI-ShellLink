/**
 * 文件名: event_execution.js
 * 职责: 负责监听 ComfyUI 后端引擎的执行状态 (开始、进度、完成、报错)，并更新 UI 进度条与媒体资产历史
 */
import { api } from "../../../../scripts/api.js";
import { state } from "../ui_state.js";
// 引入咱们自己的全局 Toast 弹窗组件
import { showBindingToast, hideBindingToast } from "../ui_utils.js";

// =====================================================================================
// 🎯 核心 UI 进度条引擎
// =====================================================================================
const setUIProgress = (cardId, percentage, isHide = false, isError = false) => {
    const progContainer = document.querySelector(`.clab-card-progress-container[data-card-prog-id="${cardId}"]`);
    if (!progContainer) return;
    const bar = progContainer.querySelector('.clab-card-progress-bar');
    if (!bar) return;

    if (isError) {
        progContainer.style.opacity = '1';
        bar.classList.add('error');
        bar.style.setProperty('transition', 'none', 'important'); 
        bar.style.setProperty('width', '100%', 'important');
    } else if (isHide) {
        if (!bar.classList.contains('error')) {
            progContainer.style.opacity = '0';
            setTimeout(() => {
                if (!bar.classList.contains('error')) {
                    bar.style.setProperty('transition', 'none', 'important');
                    bar.style.setProperty('width', '0%', 'important');
                }
            }, 300);
        }
    } else {
        progContainer.style.opacity = '1';
        if (!bar.classList.contains('error')) {
            bar.style.setProperty('transition', 'width 0.3s ease-out', 'important');
            bar.style.setProperty('width', `${percentage}%`, 'important');
        }
    }
};

const bumpUIProgress = (cardId) => {
    const bar = document.querySelector(`.clab-card-progress-container[data-card-prog-id="${cardId}"] .clab-card-progress-bar`);
    if (bar && !bar.classList.contains('error')) {
        let currentW = parseFloat(bar.style.width) || 5;
        if (currentW < 90) {
            bar.style.setProperty('transition', 'width 0.3s ease-out', 'important');
            bar.style.setProperty('width', `${currentW + (100 - currentW) * 0.15}%`, 'important');
        }
    }
};

// =====================================================================================
// 🚥 原生事件流水线监听器
// =====================================================================================
export function setupExecutionEvents() {
    let currentExecutingCardId = null;

    document.addEventListener('clab_execution_start', (e) => {
        const tasks = e.detail.tasks || [];
        tasks.forEach(task => {
            const bar = document.querySelector(`.clab-card-progress-container[data-card-prog-id="${task.cardId}"] .clab-card-progress-bar`);
            if (bar) bar.classList.remove('error'); 
            setUIProgress(task.cardId, 5);
        });
    });

    // 🎯 增强版：处理由前端发出的校验错误事件
    document.addEventListener('clab_execution_error', (e) => {
        const cardId = e.detail?.cardId;
        if (cardId) {
            setUIProgress(cardId, 100, false, true);
            showBindingToast("❌ 节点校验或运行失败！请检查必填参数与连线。", true);
            
            if (!window._clabHideTimers) window._clabHideTimers = {};
            if (window._clabHideTimers[cardId]) clearTimeout(window._clabHideTimers[cardId]);
            window._clabHideTimers[cardId] = setTimeout(() => {
                setUIProgress(cardId, 0, true);
            }, 6000);
            
            // 遇到校验错误，直接清空等待队列，防止后续卡片卡死
            if (window._clabExecQueue) {
                while (window._clabExecQueue.length > 0) {
                    let skippedTask = window._clabExecQueue.shift();
                    setUIProgress(skippedTask.cardId, 0, true);
                }
            }
        }
    });

    // 🛡️ 核弹级补丁：从最底层拦截队列发送，彻底捕获“图谱校验失败” (修复空对象判定误伤BUG)
    if (!window._clabValidationCatcherInjected) {
        const origQueue = api.queuePrompt;
        api.queuePrompt = async function() {
            try {
                const res = await origQueue.apply(this, arguments);
                
                // 【核心修复】：精确判定 node_errors 是否真的包含错误项，而不是一个空对象 {}
                const hasError = !!res.error;
                const hasNodeErrors = res.node_errors && Object.keys(res.node_errors).length > 0;

                if (res && (hasError || hasNodeErrors)) {
                    console.warn("[CLab] 🚫 捕获到后端校验拒绝:", res.error || res.node_errors);
                    const targetCardId = window._clabLastGeneratedTask ? window._clabLastGeneratedTask.cardId : currentExecutingCardId;
                    if (targetCardId) {
                        document.dispatchEvent(new CustomEvent('clab_execution_error', { detail: { cardId: targetCardId } }));
                    } else {
                        showBindingToast("❌ 节点校验失败！请检查工作流连线。", true);
                        setTimeout(hideBindingToast, 6000);
                    }
                }
                return res;
            } catch (err) {
                // 如果遭遇严重网络错误
                const targetCardId = window._clabLastGeneratedTask ? window._clabLastGeneratedTask.cardId : currentExecutingCardId;
                if (targetCardId) {
                    document.dispatchEvent(new CustomEvent('clab_execution_error', { detail: { cardId: targetCardId } }));
                }
                throw err;
            }
        };
        window._clabValidationCatcherInjected = true;
    }

    api.addEventListener("execution_start", (e) => {
        const pid = e.detail?.prompt_id;
        if (pid && window.CLab && window._clabLastGeneratedTask && !window._clabTaskMap[pid]) {
            window._clabTaskMap[pid] = window._clabLastGeneratedTask;
            window._clabLastGeneratedTask = null;
        }
        const task = window._clabTaskMap[pid];
        if (task) {
            currentExecutingCardId = task.cardId;
            setUIProgress(task.cardId, 5);
        }
    });

    api.addEventListener("progress_state", (e) => {
        const pid = e.detail?.prompt_id;
        const task = window._clabTaskMap[pid];
        const cardId = task ? task.cardId : currentExecutingCardId;
        if (cardId && e.detail.nodes) {
            let total = 0, done = 0;
            for (const nid in e.detail.nodes) {
                total += e.detail.nodes[nid].max || 0;
                done += e.detail.nodes[nid].value || 0;
            }
            if (total > 0) setUIProgress(cardId, Math.max(5, (done / total) * 100));
        }
    });

    api.addEventListener("progress", (e) => {
        if (currentExecutingCardId) {
            const { value, max } = e.detail;
            if (max > 0) setUIProgress(currentExecutingCardId, Math.max(5, (value / max) * 100));
        }
    });

    api.addEventListener("executing", (e) => {
        const pid = e.detail?.prompt_id;
        const task = window._clabTaskMap[pid];
        const cardId = task ? task.cardId : currentExecutingCardId;
        
        if (cardId) {
            if (e.detail.node) {
                bumpUIProgress(cardId);
            } else {
                setUIProgress(cardId, 100);
                setTimeout(() => setUIProgress(cardId, 0, true), 500);
                if (currentExecutingCardId === cardId) currentExecutingCardId = null;
            }
        }
    });

    api.addEventListener("executed", (event) => {
        const detail = event.detail;
        const executedNodeId = detail.node;     
        const outputData = detail.output;       
        const prompt_id = detail.prompt_id; 

        const task = (window._clabTaskMap && prompt_id) ? window._clabTaskMap[prompt_id] : null;
        if (!task) return;

        const card = state.cards.find(c => c.id === task.cardId);
        if (!card || !card.areas) return;

        card.areas.filter(a => a.type === 'preview').forEach(area => {
            if (task.previewAreaIds && task.previewAreaIds.length > 0) {
                if (!task.previewAreaIds.includes(area.id)) return;
            }

            if (String(area.targetNodeId) === String(executedNodeId)) {
                let newUrl = null;
                let targetItems = null;
                if (outputData.videos && outputData.videos.length > 0) targetItems = outputData.videos;
                else if (outputData.audio && outputData.audio.length > 0) targetItems = outputData.audio;
                else if (outputData.gifs && outputData.gifs.length > 0) targetItems = outputData.gifs;
                else if (outputData.images && outputData.images.length > 0) targetItems = outputData.images;

                if (targetItems && targetItems.length > 0) {
                    const media = targetItems[0];
                    const params = new URLSearchParams({ filename: media.filename, type: media.type, subfolder: media.subfolder || "" });
                    newUrl = api.apiURL(`/view?${params.toString()}`);
                }
                
                if (newUrl) {
                    if (!area.history) area.history = [];
                    if (area.history.length === 0 || area.history[area.history.length - 1] !== newUrl) {
                        area.history.push(newUrl);
                    }
                    area.historyIndex = area.history.length - 1;
                }
            }
        });
    });

    const handleCached = (e) => {
        const pid = e.detail?.prompt_id;
        if (pid && !window._clabTaskMap[pid] && window._clabLastGeneratedTask) {
            window._clabTaskMap[pid] = window._clabLastGeneratedTask;
            window._clabLastGeneratedTask = null;
        }
        const task = window._clabTaskMap[pid];
        const cardId = task ? task.cardId : currentExecutingCardId;
        if (cardId) {
            setUIProgress(cardId, 100);
            setTimeout(() => setUIProgress(cardId, 0, true), 500);
        }
    };
    
    api.addEventListener("execution_cached", handleCached);
    api.addEventListener("cached", handleCached);

    // =====================================================================================
    // ⚠️ 终极报错拦截与熔断系统 (处理运行时崩溃)
    // =====================================================================================
    api.addEventListener("execution_error", (e) => {
        // 1. 弹出醒目的全局报错 Toast
        showBindingToast("❌ 工作流后台运行报错！请关闭面板，查看详细错误提示。", true);
        setTimeout(() => hideBindingToast(), 6000);

        const pid = e.detail?.prompt_id;
        const task = window._clabTaskMap[pid];
        const cardId = task ? task.cardId : currentExecutingCardId;
        
        if (cardId) {
            // 2. 将当前报错的进度条拉满并标红闪烁
            setUIProgress(cardId, 100, false, true);
            
            // 3. 6秒后自动隐藏红色进度条
            if (!window._clabHideTimers) window._clabHideTimers = {};
            if (window._clabHideTimers[cardId]) clearTimeout(window._clabHideTimers[cardId]);
            window._clabHideTimers[cardId] = setTimeout(() => {
                setUIProgress(cardId, 0, true);
            }, 6000);
        }

        // 4. 熔断机制：如果在批量运行多张卡片时报错，自动拦截并取消排队中的后续任务！
        if (window._clabCurrentBatchPromptIds && window._clabCurrentBatchPromptIds.length > 0) {
            const toDelete = window._clabCurrentBatchPromptIds.filter(id => id !== pid);
            if (toDelete.length > 0) {
                // 调用 ComfyUI 的队列清理 API
                api.fetchApi('/queue', {
                    method: 'POST',
                    body: JSON.stringify({ delete: toDelete })
                }).catch(err => console.error("[CLab] 无法删除后续队列", err));

                // 隐藏掉那些被无辜牵连、还没开始跑的蓝条
                toDelete.forEach(delPid => {
                    const delTask = window._clabTaskMap[delPid];
                    if (delTask) setUIProgress(delTask.cardId, 0, true);
                });
            }
            window._clabCurrentBatchPromptIds = [];
        }
    });

    api.addEventListener("status", (e) => {
        if (e.detail?.exec_info?.queue_remaining === 0) {
            setTimeout(() => {
                document.querySelectorAll('.clab-card-progress-container').forEach(container => {
                    const bar = container.querySelector('.clab-card-progress-bar');
                    if (bar && !bar.classList.contains('error')) {
                        container.style.opacity = '0';
                        setTimeout(() => {
                            bar.style.setProperty('transition', 'none', 'important');
                            bar.style.setProperty('width', '0%', 'important');
                        }, 300);
                    }
                });
            }, 500);
        }
    });
}