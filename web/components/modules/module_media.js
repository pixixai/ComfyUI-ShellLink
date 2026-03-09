/**
 * 文件名: module_media.js
 * 职责: 通用媒体引擎 (Router)，负责根据媒体类型向下级子组件分发渲染与交互请求
 */
import { getMediaType } from "./media_types/media_utils.js";
import { renderVideo, attachVideoEvents, updateVideoProgress } from "./media_types/media_video.js";
import { renderAudio, attachAudioEvents, updateAudioProgress } from "./media_types/media_audio.js";
import { renderFile } from "./media_types/media_file.js";
import { renderImage } from "./media_types/media_image.js";

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
    `;
    document.head.appendChild(style);
}

// =========================================================================
// 2. 主路由分发渲染 (返回 HTML 字符串)
// =========================================================================
export function renderMedia(area, objectFit) {
    injectMediaCSS();
    
    if (!area.resultUrl) {
        return `<img id="clab-img-${area.id}" class="clab-preview-img" src="" draggable="false" style="display:none;" />`;
    }

    const type = getMediaType(area.resultUrl);
    const url = area.resultUrl;
    const errCall = `if(window.CLab && window.CLab.handleMediaError) window.CLab.handleMediaError('${area.cardId || ""}', '${area.id}', '${url}');`;

    // 根据文件类型，将活分发给专员
    if (type === 'video') return renderVideo(area, objectFit, url, errCall);
    if (type === 'audio') return renderAudio(area, url, errCall);
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
}