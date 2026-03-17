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
class CLabSaveImage(nodes.SaveImage):
    CATEGORY = "Creative Lab"
    def save_images(self, images, filename_prefix="CLab/Pix", prompt=None, extra_pnginfo=None):
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
            
            # 【核心修改】：修复无限覆盖补丁，并将 :05 修改为 :02，实现 pix_01.png 的命名规则
            file = f"{filename_with_batch_num}_{counter:02}.png"
            while os.path.exists(os.path.join(full_output_folder, file)):
                counter += 1
                file = f"{filename_with_batch_num}_{counter:02}.png"
            
            img.save(os.path.join(full_output_folder, file), pnginfo=metadata, compress_level=self.compress_level)
            results.append({
                "filename": file,
                "subfolder": subfolder,
                "type": self.type
            })
            counter += 1

        return { "ui": { "images": results } }

nodes.NODE_CLASS_MAPPINGS["CLab_SaveImage"] = CLabSaveImage
nodes.NODE_DISPLAY_NAME_MAPPINGS["CLab_SaveImage"] = "💾 CLab Save Image"


# =========================================================================
# 2. 注册 CLab 的专属操作接口 (删除 & 整理)
# =========================================================================
@server.PromptServer.instance.routes.post("/clab/delete_file")
async def clab_delete_file(request):
    try:
        data = await request.json()
        filename = data.get("filename")
        subfolder = data.get("subfolder", "")
        type_dir = data.get("type", "output")
        
        if type_dir == "input": base_dir = folder_paths.get_input_directory()
        elif type_dir == "temp": base_dir = folder_paths.get_temp_directory()
        else: base_dir = folder_paths.get_output_directory()
            
        full_path = os.path.normpath(os.path.join(base_dir, subfolder, filename))
        base_dir_norm = os.path.abspath(base_dir)
        
        # 【安全补丁】：使用 commonpath 严格防御目录穿越，确保全路径没有逃离沙箱
        if os.path.commonpath([base_dir_norm, os.path.abspath(full_path)]) != base_dir_norm:
            return web.json_response({"status": "error", "error": "非法路径访问 (Directory Traversal Detected)！"})
        
        if os.path.exists(full_path):
            os.remove(full_path)
            print(f"[CLab] 🗑️ 已成功删除本地文件: {full_path}")
            return web.json_response({"status": "success"})
        else:
            return web.json_response({"status": "error", "error": "文件不存在或已被删除"})
    except Exception as e:
        return web.json_response({"status": "error", "error": str(e)})


@server.PromptServer.instance.routes.post("/clab/organize_files")
async def clab_organize_files(request):
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
            base_dir_norm = os.path.abspath(base_dir)

            # 【安全补丁】：防御源文件目录穿越
            if os.path.commonpath([base_dir_norm, os.path.abspath(source_path)]) != base_dir_norm:
                continue

            target_base_dir = folder_paths.get_output_directory()
            target_dir = os.path.normpath(os.path.join(target_base_dir, target_subfolder))

            # 【安全补丁】：防御目标子文件夹越界
            if os.path.commonpath([os.path.abspath(target_base_dir), os.path.abspath(target_dir)]) != os.path.abspath(target_base_dir):
                continue

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
        print(f"[CLab] 组织文件发生错误: {str(e)}")
        return web.json_response({"status": "error", "error": str(e)})

# =========================================================================
# 3. 截胡转移专用接口 (复制 temp 或 output 文件到专属归档目录)
# =========================================================================
@server.PromptServer.instance.routes.post("/clab/copy_temp_asset")
async def clab_copy_temp_asset(request):
    try:
        data = await request.json()
        filename = data.get("filename")
        subfolder = data.get("subfolder", "")
        # 目标类型：video, audio, image, file
        asset_type = data.get("asset_type", "file") 
        
        # 【核心修复】：兼容前端传 type 还是 source_type。找不到 source_type 时回退到 type，彻底解决截胡报 404 错误
        source_type = data.get("source_type", data.get("type", "temp")) 
        
        archive_dir = data.get("archive_dir", "CLab")
        archive_dir = "".join(c for c in archive_dir if c.isalnum() or c in (' ', '.', '_', '-')).strip()
        if not archive_dir:
            archive_dir = "CLab"
            
        # 【新增】：接收并过滤自定义前缀和删除临时文件的开关
        delete_temp = data.get("delete_temp", False)
        file_prefix = data.get("file_prefix", "pix")
        file_prefix = "".join(c for c in file_prefix if c.isalnum() or c in ('_', '-')).strip()
        if not file_prefix:
            file_prefix = "pix"
        
        # 根据文件来源获取基础目录
        if source_type == "output":
            source_base_dir = folder_paths.get_output_directory()
        else:
            source_base_dir = folder_paths.get_temp_directory()
            
        source_path = os.path.normpath(os.path.join(source_base_dir, subfolder, filename))
        source_base_norm = os.path.abspath(source_base_dir)

        # 【安全补丁】：防御源文件目录穿越
        if os.path.commonpath([source_base_norm, os.path.abspath(source_path)]) != source_base_norm:
            return web.json_response({"status": "error", "error": "非法的源文件路径！"})
        
        if not os.path.exists(source_path):
            return web.json_response({"status": "error", "error": f"源文件不存在: {source_path}"})

        # 确定目标目录 (应用自定义的文件夹名称)
        target_base_dir = folder_paths.get_output_directory()
        if asset_type == "image":
            target_subfolder = archive_dir
        else:
            target_subfolder = f"{archive_dir}/{asset_type}"
            
        target_dir = os.path.normpath(os.path.join(target_base_dir, target_subfolder))
        os.makedirs(target_dir, exist_ok=True)
        
        # 提取扩展名
        ext = os.path.splitext(filename)[1]
        
        # 【核心修改】：应用用户设置的文件名前缀
        counter = 1
        new_filename = f"{file_prefix}_{counter:02}{ext}"
        target_path = os.path.normpath(os.path.join(target_dir, new_filename))
        
        while os.path.exists(target_path):
            counter += 1
            new_filename = f"{file_prefix}_{counter:02}{ext}"
            target_path = os.path.normpath(os.path.join(target_dir, new_filename))
            
        # 【核心新增】：若用户开启清理缓存，且当前确实是 temp 文件，使用 move 斩草除根
        if delete_temp and source_type == "temp":
            shutil.move(source_path, target_path)
            print(f"[CLab] 🎯 成功截胡并销毁原缓存: {filename} -> {target_subfolder}/{new_filename}")
        else:
            shutil.copy2(source_path, target_path)
            print(f"[CLab] 🎯 成功截胡资产: {filename} -> {target_subfolder}/{new_filename}")
        
        return web.json_response({
            "status": "success", 
            "new_filename": new_filename,
            "new_subfolder": target_subfolder,
            "new_type": "output" # 告诉前端现在这已经是个 output 级的文件了
        })
        
    except Exception as e:
        print(f"[CLab] 截胡转移资产时发生错误: {str(e)}")
        return web.json_response({"status": "error", "error": str(e)})