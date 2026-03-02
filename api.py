from aiohttp import web
import os
import folder_paths
import server
import nodes
import json
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

# 兼容不同版本的 ComfyUI 启动参数
try:
    from comfy.cli_args import args
    disable_metadata = args.disable_metadata
except ImportError:
    disable_metadata = False

# =========================================================================
# 1. 动态注入专属保存节点 (去除原版 SaveImage 讨厌的尾部下划线)
# =========================================================================
class ShellLinkSaveImage(nodes.SaveImage):
    def save_images(self, images, filename_prefix="ShellLink/Pix", prompt=None, extra_pnginfo=None):
        filename_prefix += self.prefix_append
        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(filename_prefix, self.output_dir, images[0].shape[1], images[0].shape[0])
        results = list()
        for (batch_number, image) in enumerate(images):
            i = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            metadata = None
            if not disable_metadata:
                metadata = PngInfo()
                if prompt is not None:
                    metadata.add_text("prompt", json.dumps(prompt))
                if extra_pnginfo is not None:
                    for x in extra_pnginfo:
                        metadata.add_text(x, json.dumps(extra_pnginfo[x]))

            filename_with_batch_num = filename.replace("%batch_num%", str(batch_number))
            
            # 【核心修改】：去除了原版 ComfyUI 这里的下划线 _ 
            file = f"{filename_with_batch_num}_{counter:05}.png"
            
            img.save(os.path.join(full_output_folder, file), pnginfo=metadata, compress_level=self.compress_level)
            results.append({
                "filename": file,
                "subfolder": subfolder,
                "type": self.type
            })
            counter += 1

        return { "ui": { "images": results } }

# 将专属节点动态挂载到系统，免去了修改 __init__.py 的麻烦
nodes.NODE_CLASS_MAPPINGS["ShellLinkSaveImage"] = ShellLinkSaveImage
nodes.NODE_DISPLAY_NAME_MAPPINGS["ShellLinkSaveImage"] = "ShellLink Save Image"


# =========================================================================
# 2. 注册 ShellLink 的专属删除接口
# =========================================================================
@server.PromptServer.instance.routes.post("/shell_link/delete_file")
async def shell_link_delete_file(request):
    try:
        data = await request.json()
        filename = data.get("filename")
        subfolder = data.get("subfolder", "")
        type_dir = data.get("type", "output")
        
        # 1. 确定基础目录
        if type_dir == "input":
            base_dir = folder_paths.get_input_directory()
        elif type_dir == "temp":
            base_dir = folder_paths.get_temp_directory()
        else:
            base_dir = folder_paths.get_output_directory()
            
        # 2. 拼接完整路径
        full_path = os.path.normpath(os.path.join(base_dir, subfolder, filename))
        
        # 3. 核心安全校验：防止路径穿越攻击
        if not full_path.startswith(os.path.normpath(base_dir)):
            return web.json_response({"status": "error", "error": "非法路径访问！"})
        
        # 4. 执行删除
        if os.path.exists(full_path):
            os.remove(full_path)
            print(f"[ShellLink] 🗑️ 已成功删除本地文件: {full_path}")
            return web.json_response({"status": "success"})
        else:
            return web.json_response({"status": "error", "error": "文件不存在或已被删除"})
            
    except Exception as e:
        print(f"[ShellLink] 删除文件发生错误: {str(e)}")
        return web.json_response({"status": "error", "error": str(e)})