/**
 * 文件名: module_media.js
 * 职责: 通用媒体引擎 (Router)，负责根据媒体类型向下级子组件分发渲染与交互请求
 */
import { getAreaResultType, getMediaType } from "./media_types/media_utils.js";
import { renderVideo, attachVideoEvents, updateVideoProgress } from "./media_types/media_video.js";
import { renderAudio, attachAudioEvents, updateAudioProgress } from "./media_types/media_audio.js";
import { renderFile } from "./media_types/media_file.js";
import { renderImage } from "./media_types/media_image.js";
import { renderText, attachTextEvents } from "./media_types/media_text.js";

// =========================================================================
// 1. 动态注入媒体组件专用全局 CSS
// =========================================================================
function injectMediaCSS() {
    if (document.getElementById('clab-media-styles')) return;
    const style = document.createElement('style');
    style.id = 'clab-media-styles';
    style.innerHTML = `
        /* --- 视频组件样式 --- */
        .clab-video-player { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; cursor: pointer; }
        .clab-video-controls { 
            position: absolute; inset: 0; opacity: 0; transition: opacity 0.3s; 
            background: linear-gradient(transparent 70%, rgba(0,0,0,0.8) 100%); 
            pointer-events: none; display: flex; flex-direction: column; justify-content: flex-end;
        }
        .clab-video-player:hover .clab-video-controls { opacity: 1; }
        
        .clab-video-toolbar {
            display: flex; justify-content: space-between; align-items: center;
            padding: 0 12px 10px 12px; width: 100%; box-sizing: border-box; pointer-events: none;
        }
        
        .clab-timecode { color: #fff; font-size: 11px; font-family: sans-serif !important; text-shadow: 1px 1px 2px #000; pointer-events: none; transition: color 0.1s; }
        
        .clab-video-tools-right { display: flex; align-items: center; gap: 8px; pointer-events: auto; }
        .clab-video-controls-interactive { pointer-events: auto; }
        
        /* --- 全新的自定义音量滑杆悬浮效果 --- */
        .clab-volume-wrap { 
            display: flex; align-items: center; justify-content: flex-end; overflow: visible; 
            border-radius: 12px; background: transparent; transition: background 0.2s; 
        }
        .clab-volume-wrap:not(.no-audio):hover, .clab-volume-wrap.is-active { background: rgba(0,0,0,0.6); }
        
        .clab-volume-slider-container { 
            width: 0; opacity: 0; margin: 0; transition: width 0.2s ease, opacity 0.2s ease, margin 0.2s ease; 
            cursor: pointer; height: 24px; display: block; position: relative;
        }
        .clab-volume-wrap:not(.no-audio):hover .clab-volume-slider-container,
        .clab-volume-slider-container.is-dragging { 
            width: 50px; opacity: 1; margin-left: 8px; margin-right: 2px; 
        }
        
        .clab-volume-slider-track {
            width: 100%; height: 3px; background: rgba(255,255,255,0.3); border-radius: 2px; position: absolute; top: 50%; transform: translateY(-50%); pointer-events: none;
        }
        .clab-volume-slider-fill {
            position: absolute; right: 0; top: 0; height: 100%; background: #fff; border-radius: 2px;
        }
        .clab-volume-slider-thumb {
            position: absolute; right: 0; top: 50%; transform: translate(50%, -50%); width: 8px; height: 8px; border-radius: 50%; background: #fff;
        }

        .clab-media-opt-wrapper { position: relative; }
        .clab-media-opt-btn { background: transparent; border: none; color: #fff; cursor: pointer; padding: 4px 6px; border-radius: 4px; transition: background 0.2s, color 0.2s; display: flex; align-items: center; justify-content: center; }
        .clab-media-opt-btn:hover { background: rgba(255,255,255,0.2); }
        
        /* 突破裁切的全局菜单样式 */
        .clab-media-dropdown { 
            position: fixed; 
            background: rgba(30, 30, 30, 0.95); backdrop-filter: blur(5px); border: 1px solid #555; 
            border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.6); 
            display: none; flex-direction: column; min-width: 150px; z-index: 100000; padding: 4px 0;
        }
        .clab-media-dropdown.show { display: flex; }
        .clab-media-dropdown-item { padding: 8px 12px; font-size: 11px; color: #eee; cursor: pointer; white-space: nowrap; transition: background 0.1s; font-family: sans-serif; }
        .clab-media-dropdown-item:hover { background: #2196F3; color: #fff; }

        .clab-vid-speed-opt:hover { background: rgba(255,255,255,0.2) !important; color: #fff !important; }

        .clab-video-progress-container { position: absolute; bottom: 0; left: 0; width: 100%; height: 4px; background: rgba(255,255,255,0.3); cursor: pointer; pointer-events: auto; }
        .clab-video-progress-container:hover { height: 6px; }
        .clab-video-progress-bar { height: 100%; width: 0%; background: #4CAF50; transition: width 0.1s linear; pointer-events: none; }

        /* --- 音频组件样式 --- */
        .clab-audio-player { padding: 12px; box-sizing: border-box; width: 100%; background: rgba(0,0,0,0.4); border-radius: 6px; display: flex; flex-direction: column; justify-content: center; }
        .clab-audio-progress-container { width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; margin-bottom: 12px; cursor: pointer; overflow: hidden; position: relative; }
        .clab-audio-progress-bar { height: 100%; width: 0%; background: #2196F3; pointer-events: none; }
        
        .clab-audio-controls-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .clab-audio-btn { background: #4CAF50; border: none; color: #fff; width: 26px; height: 26px; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; transition: transform 0.1s; font-size: 10px; }
        .clab-audio-btn:active { transform: scale(0.9); }
        
        .clab-audio-vol-wrap { display: flex; align-items: center; gap: 8px; }
        
        /* 音频专用的自定义滑杆 */
        .clab-audio-vol-slider-container {
            width: 50px; height: 24px; display: block; cursor: pointer; position: relative;
        }
        .clab-audio-vol-slider-track {
            width: 100%; height: 3px; background: rgba(255,255,255,0.3); border-radius: 2px; position: absolute; top: 50%; transform: translateY(-50%); pointer-events: none;
        }
        .clab-audio-vol-slider-fill {
            position: absolute; left: 0; top: 0; height: 100%; background: #2196F3; border-radius: 2px;
        }
        .clab-audio-vol-slider-thumb {
            position: absolute; left: 0; top: 50%; transform: translate(-50%, -50%); width: 8px; height: 8px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        
        .clab-media-speed-wrap { 
            display: flex; align-items: center; background: rgba(0,0,0,0.5); 
            border: 1px solid #555; border-radius: 4px; padding: 2px 4px; position: relative;
        }
        .clab-media-speed-input { 
            width: 30px; background: transparent; border: none; color: #eee; 
            font-size: 11px; outline: none; text-align: center; font-family: sans-serif;
        }
        .clab-media-speed-input::-webkit-outer-spin-button, .clab-media-speed-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        /* --- 文件组件样式 --- */
        .clab-file-display { border: 1px dashed #666; border-radius: 6px; text-align: center; color: #999; background: rgba(0,0,0,0.1); display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 15px; width: 100%; box-sizing: border-box;}

        .clab-text-preview-shell {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 10px;
            box-sizing: border-box;
            color: #e8edf5;
            padding-top: 24px;
            background: rgb(25, 25, 25);
        }
        .clab-text-toolbar {
            display: flex;
            align-items: center;
            gap: 14px;
            flex-wrap: wrap;
            padding: 0 2px 2px 2px;
        }
        .clab-text-option {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: rgba(232, 237, 245, 0.9);
            font-size: 11px;
            font-family: sans-serif;
            cursor: pointer;
            user-select: none;
        }
        .clab-text-option input {
            width: 14px;
            height: 14px;
            margin: 0;
            cursor: pointer;
        }
        .clab-text-copy-btn {
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 6px;
            background: rgba(255,255,255,0.08);
            color: #eef3f8;
            font: 11px/1 sans-serif;
            padding: 6px 10px;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
        }
        .clab-text-copy-btn:hover {
            background: rgba(255,255,255,0.14);
            border-color: rgba(255,255,255,0.2);
        }
        .clab-text-copy-btn:disabled {
            cursor: default;
            opacity: 0.75;
        }
        .clab-text-body-scroll {
            width: 100%;
            overflow-x: hidden;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
            background: rgb(32, 32, 32);
            box-sizing: border-box;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.28) transparent;
            cursor: text;
        }
        .clab-text-body-scroll::-webkit-scrollbar {
            width: 5px;
            height: 5px;
        }
        .clab-text-body-scroll::-webkit-scrollbar-track {
            background: transparent;
        }
        .clab-text-body-scroll::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.28);
            border-radius: 999px;
        }
        .clab-text-body-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.4);
        }
        .clab-text-body-content {
            padding: 12px 14px;
            font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            line-height: 1.55;
            color: #eef3f8;
            word-break: break-word;
            user-select: text;
            -webkit-user-select: text;
            cursor: text;
        }
        .clab-text-state {
            min-height: 56px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: rgba(238, 243, 248, 0.72);
            font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            font-size: 12px;
            text-align: center;
        }
        .clab-text-state-missing {
            color: #ff8f8f;
        }
        .clab-text-plain,
        .clab-text-code-pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            font-size: 12px;
            line-height: 1.6;
            user-select: text;
            -webkit-user-select: text;
            cursor: text;
        }
        .clab-text-plain code,
        .clab-text-code-pre code {
            font-family: inherit;
            font-size: inherit;
        }
        .clab-text-inline-code {
            padding: 0.15em 0.35em;
            border-radius: 4px;
            background: rgba(255,255,255,0.08);
            font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            font-size: 0.95em;
        }
        .clab-text-code-block {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
            background: rgba(0,0,0,0.26);
            overflow: hidden;
            margin: 0 0 10px 0;
        }
        .clab-text-code-lang {
            padding: 6px 10px;
            background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.68);
            font-size: 10px;
            font-family: sans-serif;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }
        .clab-text-code-pre {
            padding: 10px 12px;
            overflow-x: auto;
        }
        .clab-text-heading {
            margin: 0 0 10px 0;
            line-height: 1.3;
            font-family: sans-serif;
        }
        .clab-text-heading.h1 { font-size: 22px; }
        .clab-text-heading.h2 { font-size: 19px; }
        .clab-text-heading.h3 { font-size: 16px; }
        .clab-text-heading.h4, .clab-text-heading.h5, .clab-text-heading.h6 { font-size: 14px; }
        .clab-text-paragraph {
            margin: 0 0 10px 0;
            font-size: 12px;
        }
        .clab-text-list {
            margin: 0 0 10px 18px;
            padding: 0;
            font-size: 12px;
        }
        .clab-text-quote {
            margin: 0 0 10px 0;
            padding: 8px 12px;
            border-left: 3px solid rgba(110, 193, 255, 0.7);
            background: rgba(110, 193, 255, 0.08);
            color: rgba(238, 243, 248, 0.9);
        }
        .clab-text-link {
            color: #7fc8ff;
            text-decoration: none;
            cursor: pointer;
        }
        .clab-text-link:hover {
            text-decoration: underline;
        }
        .clab-text-token-string { color: #f7b267; }
        .clab-text-token-number { color: #7fd8be; }
        .clab-text-token-boolean { color: #ff7aa2; }
        .clab-text-token-keyword { color: #7cb7ff; font-weight: 600; }
        .clab-text-token-comment { color: #7f8da1; font-style: italic; }
    `;
    document.head.appendChild(style);
}

// =========================================================================
// 2. 主路由分发渲染 (返回 HTML 字符串)
// =========================================================================
export function renderMedia(area, objectFit) {
    injectMediaCSS();
    
    if (!area.resultUrl && getAreaResultType(area) !== 'text') {
        return `<img id="clab-img-${area.id}" class="clab-preview-img" src="" draggable="false" style="display:none;" />`;
    }

    const type = getAreaResultType(area) || getMediaType(area.resultUrl);
    const url = area.resultUrl;
    const errCall = `if(window.CLab && window.CLab.handleMediaError) window.CLab.handleMediaError('${area.cardId || ""}', '${area.id}', '${url}');`;

    // 根据文件类型，将活分发给专员
    if (type === 'video') return renderVideo(area, objectFit, url, errCall);
    if (type === 'audio') return renderAudio(area, url, errCall);
    if (type === 'text') return renderText(area);
    if (type === 'file') return renderFile(area, url);
    return renderImage(area, objectFit, url, errCall);
}

// =========================================================================
// 3. 全局唯一 RAF 轮询引擎 (中心化的高性能状态更新)
// =========================================================================
if (!window._clabMediaLoopRunning) {
    window._clabMediaLoopRunning = true;
    const mediaLoop = () => {
        // 调用子组件提供的方法，统一更新进度
        updateVideoProgress();
        updateAudioProgress();
        requestAnimationFrame(mediaLoop);
    };
    mediaLoop();
}

// =========================================================================
// 4. 全局交互绑定路由
// =========================================================================
export function attachMediaEvents(container) {
    // 全局清理器：点击任意地方，关闭被剥离到 Body 层的悬浮菜单，并送回原处
    if (!window._clabMediaGlobalEventsBound) {
        const closeDropdownsGlobally = (e) => {
            if (!e.target.closest('.clab-media-opt-wrapper') && !e.target.closest('.clab-media-dropdown')) {
                document.querySelectorAll('.clab-media-dropdown.show').forEach(m => {
                    m.classList.remove('show');
                    if (m._originalParent) m._originalParent.appendChild(m); 
                });
            }
        };
        window.addEventListener('mousedown', closeDropdownsGlobally, true);
        window.addEventListener('wheel', closeDropdownsGlobally, { capture: true, passive: true });
        window._clabMediaGlobalEventsBound = true;
    }

    // 分发到专员执行实际的事件绑定
    attachVideoEvents(container);
    attachAudioEvents(container);
    attachTextEvents(container);
}
