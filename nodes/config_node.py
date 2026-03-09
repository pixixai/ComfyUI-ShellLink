# 文件名: nodes/config_node.py
# 职责: 在 ComfyUI 后端注册 "CLab_SystemConfig" 节点
# 作用: 作为一个无连线的“数据仓库”，专用于将前端 Creative Lab 面板的 JSON 数据保存在工作流 (.json) 中

class CLabSystemConfig:
    """
    ComfyUI-Creative Lab 全局配置节点
    
    作用：
    作为一个隐式/显式的锚点节点，不参与任何连线。
    利用 ComfyUI 原生的序列化机制，将侧边栏（CLab）的所有卡片配置、绑定关系
    以 JSON 字符串的形式保存在 `scenes_data` 中，随工作流一同保存和加载。
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 存储侧边栏所有状态的 JSON 字符串
                # multiline=True 让它在节点上以多行文本框显示（如果你不想完全隐藏它的话）
                "scenes_data": ("STRING", {
                    "default": "{}", 
                    "multiline": True,
                    "dynamicPrompts": False  # 必须添加：防止 JSON 里的 {} 被 ComfyUI 引擎当作动态提示词错误解析！
                }),
            },
        }

    # 不输出任何内容，完全与物理执行流解耦
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    
    # 必须添加：告诉引擎即使没有输出连线，这也是个合法的终端节点，不要在执行时把它剔除
    OUTPUT_NODE = True
    
    # ComfyUI 的 CATEGORY 决定了它在右键菜单里的位置
    CATEGORY = "Creative Lab"
    
    # 【核心点】：节点执行函数名！如果没有这个，ComfyUI 后端会拒绝加载该节点
    FUNCTION = "execute"

    def execute(self, scenes_data):
        # 作为一个纯粹的数据仓库，它在后端不需要执行任何图像或数据处理。
        # 只是为了满足 ComfyUI 的节点执行规范，返回空元组即可。
        # 实际的参数注入逻辑在前端 JS 拦截 queuePrompt 时就已完成了。
        return ()

# 必须导出的映射字典，以便 __init__.py 能够动态加载并注册到 ComfyUI 中
NODE_CLASS_MAPPINGS = {
    "CLab_SystemConfig": CLabSystemConfig
}

# 自定义节点在 ComfyUI 右键菜单中的显示名称
NODE_DISPLAY_NAME_MAPPINGS = {
    "CLab_SystemConfig": "⚓ CLab System Config"
}