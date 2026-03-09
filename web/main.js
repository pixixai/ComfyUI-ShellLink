/**
 * ComfyUI-CLab 扩展入口文件
 * 负责向 ComfyUI 注册扩展，统筹 UI 层与底层逻辑的初始化
 */
import { app } from "../../scripts/app.js";
import { StateManager } from "./state_manager.js";
import { setupAPIInjector } from "./api_injector.js";
import { setupUI } from "./ui_panel.js"; 

app.registerExtension({
    name: "ComfyUI.CLab",
    
    async setup() {
        console.log("[CLab] 开始加载...");
        setupUI();
        setupAPIInjector(app);

        // 【新增】：监听图谱清空事件（切换工作流、新建工作流时触发）
        // 在 ComfyUI 加载新图前，一定会先调用 clear 清空旧图，借此机会强制清理残留面板
        const originalClear = app.graph.clear;
        app.graph.clear = function() {
            originalClear.apply(this, arguments);
            console.log("[CLab] 工作流被清空，隔离并重置面板状态...");
            // 此时图为空，调用 load 会自动走到清理逻辑
            StateManager.loadFromNode(app.graph); 
        };
    },

    // 节点加载完成时的钩子：用于打开包含配置节点的工作流时，自动恢复数据
    loadedGraphNode(node, appData) {
        if (node.type === "CLab_SystemConfig") {
            console.log("[CLab] 检测到工作流配置节点，准备同步数据...");
            // 延迟读取，确保 ComfyUI 已经把 JSON 数据完全注入到小部件中
            setTimeout(() => {
                StateManager.loadFromNode(app.graph);
            }, 100);
        }
    },

    // 【新增】：节点被手动创建/粘贴时的钩子
    // 完美支持跨工作流复制：只要你把配置节点 Ctrl+V 进来，立刻覆盖并刷新面板
    nodeCreated(node) {
        if (node.type === "CLab_SystemConfig") {
            console.log("[CLab] 配置节点被创建或粘贴，尝试读取数据...");
            setTimeout(() => {
                StateManager.loadFromNode(app.graph);
            }, 100);
        }
    }
});

/**
 * 暴露全局方法给 UI 层调用
 */
window.CLab = {
    // 供 UI 调用：一键生成配置节点
    createNode() {
        StateManager.createConfigNode(app.graph);
    },
    // 供 UI 调用：保存当前状态到工作流节点
    saveState(newState) {
        Object.assign(StateManager.state, newState);
        StateManager.syncToNode(app.graph);
    }
};