/**
 * 文件名: action_run_executor.js
 * 路径: web/components/actions/action_run_executor.js
 * 职责: 负责任务队列编译算法、运行按钮交互分发、以及批量循环执行逻辑
 */
import { state } from "../ui_state.js";
import { app } from "../../../../scripts/app.js";

// 【核心任务编译器】：根据用户的严格规则，将任意选中状态编译为单卡片执行的基础队列
export function buildTasksQueue(isRunAll = false) {
    const tasks = [];

    if (isRunAll) {
        state.cards.forEach(card => {
            const previewAreaIds = card.areas?.filter(a => a.type === 'preview').map(a => a.id) || [];
            if (previewAreaIds.length > 0) tasks.push({ cardId: card.id, previewAreaIds });
        });
        return tasks;
    }

    const selectedPreviewAreaIds = state.selectedAreaIds.filter(id => {
        for (let c of state.cards) if (c.areas?.some(a => a.id === id && a.type === 'preview')) return true;
        return false;
    });

    if (selectedPreviewAreaIds.length > 0) {
        state.cards.forEach(card => {
            const pIds = card.areas?.filter(a => selectedPreviewAreaIds.includes(a.id)).map(a => a.id) || [];
            if (pIds.length > 0) tasks.push({ cardId: card.id, previewAreaIds: pIds });
        });
        return tasks;
    }

    let cardsToRun = new Set();
    const selectedInputAreaIds = state.selectedAreaIds.filter(id => {
        for (let c of state.cards) if (c.areas?.some(a => a.id === id && a.type === 'edit')) return true;
        return false;
    });

    if (selectedInputAreaIds.length > 0) {
        state.cards.forEach(card => {
            if (card.areas?.some(a => selectedInputAreaIds.includes(a.id))) cardsToRun.add(card.id);
        });
    }

    if (state.selectedCardIds && state.selectedCardIds.length > 0) {
        state.selectedCardIds.forEach(id => cardsToRun.add(id));
    }

    if (cardsToRun.size === 0 && state.activeCardId) {
        cardsToRun.add(state.activeCardId);
    }

    cardsToRun.forEach(cardId => {
        const card = state.cards.find(c => c.id === cardId);
        if (card) {
            const previewAreaIds = card.areas?.filter(a => a.type === 'preview').map(a => a.id) || [];
            if (previewAreaIds.length > 0) tasks.push({ cardId: card.id, previewAreaIds });
        }
    });

    return tasks;
}

export function attachRunEvents(panelContainer) {
    const runWrapper = panelContainer.querySelector("#clab-run-btn-wrapper");
    if (runWrapper) {
        const toggleBtn = runWrapper.querySelector("#clab-run-dropdown-toggle");
        const dropdown = runWrapper.querySelector("#clab-run-dropdown-menu");

        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            document.querySelectorAll('.clab-custom-select-dropdown').forEach(d => d.style.display = 'none');
            dropdown.style.display = isVisible ? 'none' : 'block';
        };
    }

    // 辅助函数：实时获取输入框里的循环次数
    const getBatchCount = () => {
        const countInput = panelContainer.querySelector('#clab-run-batch-count');
        if (countInput) {
            let v = parseInt(countInput.value, 10);
            return (!isNaN(v) && v > 0) ? v : 1;
        }
        return 1;
    };

    panelContainer.querySelector("#clab-btn-run").onclick = () => {
        const baseQueue = buildTasksQueue(false);

        if (baseQueue.length === 0) {
            return alert("当前选中项没有可执行的输出模块！请检查是否添加了输出模块。");
        }
        
        // 【核心升级】：应用循环次数，将 1,2,3 复制拼接为 1,2,3, 1,2,3...
        const batchCount = getBatchCount();
        let finalQueue = [];
        for (let i = 0; i < batchCount; i++) {
            // 使用展开运算符断开对象的引用，防止底层的修改相互污染
            finalQueue = finalQueue.concat(baseQueue.map(task => ({ ...task })));
        }
        
        console.log(`[CLab] 局部运行 - 循环 ${batchCount} 遍，共派发 ${finalQueue.length} 个任务:`, finalQueue);
        document.dispatchEvent(new CustomEvent('clab_execution_start', { detail: { tasks: finalQueue } }));

        if (window.CLab && window.CLab.executeTasks) {
            window.CLab.executeTasks(finalQueue);
        } else if (app.queuePrompt) {
            // 降级兼容：如果 api_injector 出了问题，用原生接口连发
            for(let i=0; i<finalQueue.length; i++) app.queuePrompt(0, 1);
        }
    };

    panelContainer.querySelector("#clab-btn-run-all").onclick = (e) => {
        e.stopPropagation();
        const dropdown = panelContainer.querySelector("#clab-run-dropdown-menu");
        if (dropdown) dropdown.style.display = 'none';

        if (!state.cards || state.cards.length === 0) return alert("面板中没有任何任务卡片！");

        const baseQueue = buildTasksQueue(true);
        if (baseQueue.length === 0) return alert("所有卡片均无输出模块，无法执行。");
        
        // 【核心升级】：同样对“运行全部”生效
        const batchCount = getBatchCount();
        let finalQueue = [];
        for (let i = 0; i < batchCount; i++) {
            finalQueue = finalQueue.concat(baseQueue.map(task => ({ ...task })));
        }
        
        console.log(`[CLab] 运行全部 - 循环 ${batchCount} 遍，共派发 ${finalQueue.length} 个任务:`, finalQueue);
        document.dispatchEvent(new CustomEvent('clab_execution_start', { detail: { tasks: finalQueue } }));

        if (window.CLab && window.CLab.executeTasks) {
            window.CLab.executeTasks(finalQueue);
        } else {
            alert("API 拦截器尚未加载完毕，请稍后再试！");
        }
    };
}