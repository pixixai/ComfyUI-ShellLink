from aiohttp import web
import os
import folder_paths
import server
import nodes
import json
import numpy as np
import shutil
from PIL import Image
from PIL.PngImagePlugin import PngInfo

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
            
            # 【重要保留】：修复无限覆盖的自增判定补丁
            file = f"{filename_with_batch_num}_{counter:05}.png"
            while os.path.exists(os.path.join(full_output_folder, file)):
                counter += 1
                file = f"{filename_with_batch_num}_{counter:05}.png"
            
            img.save(os.path.join(full_output_folder, file), pnginfo=metadata, compress_level=self.compress_level)
            results.append({
                "filename": file,
                "subfolder": subfolder,
                "type": self.type
            })
            counter += 1

        return { "ui": { "images": results } }

nodes.NODE_CLASS_MAPPINGS["ShellLinkSaveImage"] = ShellLinkSaveImage
nodes.NODE_DISPLAY_NAME_MAPPINGS["ShellLinkSaveImage"] = "ShellLink Save Image"


# =========================================================================
# 2. 注册 ShellLink 的专属操作接口 (删除 & 整理)
# =========================================================================
@server.PromptServer.instance.routes.post("/shell_link/delete_file")
async def shell_link_delete_file(request):
    try:
        data = await request.json()
        filename = data.get("filename")
        subfolder = data.get("subfolder", "")
        type_dir = data.get("type", "output")
        
        if type_dir == "input": base_dir = folder_paths.get_input_directory()
        elif type_dir == "temp": base_dir = folder_paths.get_temp_directory()
        else: base_dir = folder_paths.get_output_directory()
            
        full_path = os.path.normpath(os.path.join(base_dir, subfolder, filename))
        
        if not full_path.startswith(os.path.normpath(base_dir)):
            return web.json_response({"status": "error", "error": "非法路径访问！"})
        
        if os.path.exists(full_path):
            os.remove(full_path)
            print(f"[ShellLink] 🗑️ 已成功删除本地文件: {full_path}")
            return web.json_response({"status": "success"})
        else:
            return web.json_response({"status": "error", "error": "文件不存在或已被删除"})
    except Exception as e:
        return web.json_response({"status": "error", "error": str(e)})


@server.PromptServer.instance.routes.post("/shell_link/organize_files")
async def shell_link_organize_files(request):
    try:
        data = await request.json()
        action = data.get("action", "move")
        files = data.get("files", [])
        results = []

        for f in files:
            file_id = f.get("id")
            filename = f.get("filename")
            subfolder = f.get("subfolder", "")
            file_type = f.get("type", "output")
            target_subfolder = f.get("target_subfolder", "")
            target_filename = f.get("target_filename", "")

            if file_type == "input": base_dir = folder_paths.get_input_directory()
            elif file_type == "temp": base_dir = folder_paths.get_temp_directory()
            else: base_dir = folder_paths.get_output_directory()
            
            source_path = os.path.normpath(os.path.join(base_dir, subfolder, filename))

            target_base_dir = folder_paths.get_output_directory()
            target_dir = os.path.normpath(os.path.join(target_base_dir, target_subfolder))

            if not os.path.exists(target_dir):
                os.makedirs(target_dir, exist_ok=True)

            ext = os.path.splitext(filename)[1]
            new_filename = f"{target_filename}{ext}"
            target_path = os.path.normpath(os.path.join(target_dir, new_filename))

            counter = 1
            base_target_filename = target_filename
            while os.path.exists(target_path) and (action == 'copy' or source_path != target_path):
                new_filename = f"{base_target_filename}_{counter}{ext}"
                target_path = os.path.normpath(os.path.join(target_dir, new_filename))
                counter += 1

            if os.path.exists(source_path):
                if os.path.abspath(source_path) != os.path.abspath(target_path):
                    if action == "move":
                        shutil.move(source_path, target_path)
                    else:
                        shutil.copy2(source_path, target_path)

                results.append({
                    "old_id": file_id,
                    "old_filename": filename,
                    "new_filename": new_filename,
                    "new_subfolder": target_subfolder
                })

        return web.json_response({"status": "success", "results": results})
    except Exception as e:
        print(f"[ShellLink] 组织文件发生错误: {str(e)}")
        return web.json_response({"status": "error", "error": str(e)})