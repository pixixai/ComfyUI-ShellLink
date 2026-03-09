# __init__.py
import os
import importlib
from typing import Dict, Any

def load_nodes():
    node_mappings = {}
    display_mappings = {}
    base_dir = os.path.dirname(__file__)
    
    for root, _, files in os.walk(os.path.join(base_dir, "nodes")):
        for file in files:
            if file.endswith(".py") and not file.startswith("_"):
                module_path = os.path.join(root, file)
                try:
                    rel_path = os.path.relpath(module_path, base_dir)
                    module_name = rel_path.replace(os.path.sep, ".")[:-3]
                    module = importlib.import_module(f".{module_name}", package=__package__)
                    
                    if hasattr(module, "NODE_CLASS_MAPPINGS"):
                        node_mappings.update(module.NODE_CLASS_MAPPINGS)
                    if hasattr(module, "NODE_DISPLAY_NAME_MAPPINGS"):
                        display_mappings.update(module.NODE_DISPLAY_NAME_MAPPINGS)
                        
                except Exception as e:
                    print(f"⚠️ 加载失败: {file}\n错误: {str(e)}")

    return node_mappings, display_mappings

NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS = load_nodes()
WEB_DIRECTORY = "./web" # 指向包含 js 的 web 文件夹

# 【新增】：在这里导入我们刚刚创建的 api.py，让 ComfyUI 启动时挂载路由接口
try:
    from . import api
except Exception as e:
    print(f"[CLab] ⚠️ 后端 API 接口加载失败: {e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]