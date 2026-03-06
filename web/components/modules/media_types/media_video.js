/**
 * 文件名: media_video.js
 * 职责: 视频组件的专属渲染与事件处理 (高精度滚轮寻道 + 点击跳转模式)
 */
import { formatTime, formatTimeWithFrames } from "./media_utils.js";

export function renderVideo(area, objectFit, url, errCall) {
    return `
        <div class="sl-video-player" data-area-id="${area.id}">
            <video id="sl-img-${area.id}" class="sl-preview-img sl-media-target" src="${url}" draggable="false" style="object-fit: ${objectFit}; width: 100%; height: 100%; display: block;" autoplay loop muted playsinline onerror="${errCall}"></video>
            <div class="sl-video-controls">
                <div class="sl-video-toolbar">
                    <!-- 【样式锁定】：强制无衬线体，彻底去除投影 -->
                    <span class="sl-timecode" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important; text-shadow: none !important; -webkit-font-smoothing: antialiased;">00:00 / 00:00</span>
                    <div class="sl-video-tools-right">
                        
                        <!-- 极简音量滑杆 -->
                        <div class="sl-volume-wrap sl-video-controls-interactive" style="background: transparent !important;">
                            <div class="sl-volume-slider-container sl-vid-vol-slider" title="调节音量">
                                <div class="sl-volume-slider-track">
                                    <div class="sl-volume-slider-fill"></div>
                                    <div class="sl-volume-slider-thumb"></div>
                                </div>
                            </div>
                            <button class="sl-media-opt-btn sl-opt-mute" title="静音/取消静音" style="padding: 4px 6px; background: transparent !important; color: #aaa; transition: color 0.2s;" onmouseover="if(this.style.pointerEvents !== 'none') this.style.color='#fff'" onmouseout="if(this.style.pointerEvents !== 'none') this.style.color='#aaa'">
                                <svg class="sl-vol-icon-high" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                <svg class="sl-vol-icon-muted" style="display:none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                                <svg class="sl-vol-icon-none" style="display:none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon></svg>
                            </button>
                        </div>
                        
                        <div class="sl-media-opt-wrapper sl-video-controls-interactive">
                            <button class="sl-media-opt-btn sl-more-toggle">⋮</button>
                            <div class="sl-media-dropdown sl-more-dropdown">
                                <div style="padding: 6px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                    <span style="font-size: 11px; color: #aaa; font-family: sans-serif !important;">播放速度</span>
                                    <div style="display: flex; align-items: center; background: rgba(0,0,0,0.5); border: 1px solid #555; border-radius: 4px; padding: 0 4px;">
                                        <input type="number" class="sl-media-speed-input" value="1.0" step="0.1" min="0.1" max="5.0" style="width: 28px; background: transparent; border: none; color: #eee; font-size: 11px; text-align: center; outline: none; -moz-appearance: textfield;">
                                        <span style="font-size: 10px; color: #aaa; pointer-events: none;">x</span>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                    <span class="sl-vid-speed-opt" data-spd="0.5" style="cursor: pointer; font-size: 10px; color: #eee; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background 0.2s;">0.5</span>
                                    <span class="sl-vid-speed-opt" data-spd="1.0" style="cursor: pointer; font-size: 10px; color: #eee; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background 0.2s;">1.0</span>
                                    <span class="sl-vid-speed-opt" data-spd="1.5" style="cursor: pointer; font-size: 10px; color: #eee; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background 0.2s;">1.5</span>
                                    <span class="sl-vid-speed-opt" data-spd="2.0" style="cursor: pointer; font-size: 10px; color: #eee; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background 0.2s;">2.0</span>
                                </div>
                                <div class="sl-media-dropdown-item sl-opt-pip" style="margin-top: 4px;">画中画</div>
                                <div class="sl-media-dropdown-item sl-opt-fullscreen">全屏</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="sl-video-progress-container sl-video-controls-interactive">
                    <div class="sl-video-progress-bar"></div>
                </div>
            </div>
        </div>
    `;
}

export function updateVideoProgress() {
    document.querySelectorAll('.sl-video-player').forEach(player => {
        const vid = player.querySelector('video');
        if (!vid) return;

        // 音量与静音状态更新
        const muteOpt = player.querySelector('.sl-opt-mute');
        if (muteOpt) {
            let noAudio = false;
            if (vid.audioTracks && vid.audioTracks.length === 0) noAudio = true;
            else if (vid.mozHasAudio === false) noAudio = true;
            else if (vid.currentTime > 0.1 && vid.webkitAudioDecodedByteCount === 0) noAudio = true;

            const iconHigh = muteOpt.querySelector('.sl-vol-icon-high');
            const iconMuted = muteOpt.querySelector('.sl-vol-icon-muted');
            const iconNone = muteOpt.querySelector('.sl-vol-icon-none');
            const slider = player.querySelector('.sl-vid-vol-slider');

            if (noAudio) {
                muteOpt.style.color = '#888'; muteOpt.style.pointerEvents = 'none';
                if (iconHigh) iconHigh.style.display = 'none';
                if (iconMuted) iconMuted.style.display = 'none';
                if (iconNone) iconNone.style.display = 'block';
                if (slider) slider.style.display = 'none';
            } else {
                muteOpt.style.pointerEvents = 'auto';
                if (vid.muted || vid.volume === 0) {
                    if (iconHigh) iconHigh.style.display = 'none';
                    if (iconMuted) iconMuted.style.display = 'block';
                } else {
                    if (iconHigh) iconHigh.style.display = 'block';
                    if (iconMuted) iconMuted.style.display = 'none';
                }
                if (iconNone) iconNone.style.display = 'none';
                if (slider) slider.style.display = 'block';
            }
        }
        
        // 当因为滚轮或拖拽正在 scrubbing 时，不执行默认的时间码更新逻辑
        if (vid.dataset.isScrubbing === 'true') return; 
        
        const bar = player.querySelector('.sl-video-progress-bar');
        const tc = player.querySelector('.sl-timecode');
        if (bar && tc && vid.duration) {
            bar.style.width = `${(vid.currentTime / vid.duration) * 100}%`;
            // 正常播放时显示标准格式
            tc.textContent = `${formatTime(vid.currentTime)} / ${formatTime(vid.duration)}`;
        }
    });
}

export function attachVideoEvents(container) {
    container.querySelectorAll('.sl-video-player').forEach(player => {
        if (player.dataset.binded) return;
        player.dataset.binded = "1";

        const vid = player.querySelector('video');
        if (!vid) return;

        // =========================================================================
        // 【核心修改 1】：高精度滚轮调节，彻底杜绝穿透冒泡，并加入防抖续播逻辑
        // =========================================================================
        player.addEventListener('wheel', (e) => {
            // 只有当视频加载了时长且鼠标没在底部的交互控件上时才响应
            if (!vid.duration || e.target.closest('.sl-video-controls-interactive')) return;

            // 强力拦截：阻止面板滚动条和外层容器滚动条的默认行为，并切断冒泡！
            e.preventDefault();
            e.stopPropagation();

            // 如果视频正在播放，先暂停它，并标记正在 scrubbing
            if (!vid.paused) {
                vid.dataset.wasPlayingBeforeScrub = 'true';
                vid.pause();
            }
            vid.dataset.isScrubbing = 'true';

            // 精度微调：大幅降低倍率 (滚轮卡顿1格通常等于100，100 * 0.002 = 0.2秒)
            const delta = e.deltaY || e.deltaX;
            const step = delta * 0.002;
            
            let newTime = vid.currentTime + step;
            vid.currentTime = Math.max(0, Math.min(vid.duration, newTime));

            // 视觉反馈：即时更新时间码（显示帧格式，并变绿提示正在调节）
            const tc = player.querySelector('.sl-timecode');
            const bar = player.querySelector('.sl-video-progress-bar');
            
            if (bar) {
                 bar.style.width = `${(vid.currentTime / vid.duration) * 100}%`;
            }

            if (tc) {
                // 滚动时显示 分:秒:帧 格式
                tc.textContent = formatTimeWithFrames(vid.currentTime, 30);
                tc.style.color = '#4CAF50';
            }

            // 防抖逻辑：判断是否连续滚动。
            // 每次滚动都清除上一次的定时器。
            clearTimeout(vid._scrubTimer);
            
            // 设置新的定时器。如果超过 400ms 没有新的滚动事件，认为滚动结束
            vid._scrubTimer = setTimeout(() => {
                vid.dataset.isScrubbing = 'false';
                if (tc) tc.style.color = ''; // 恢复颜色
                
                // 如果滚动前是在播放状态，则恢复播放
                if (vid.dataset.wasPlayingBeforeScrub === 'true') {
                    vid.play().catch(()=>{});
                    vid.dataset.wasPlayingBeforeScrub = 'false';
                }
            }, 400); // 400ms 的防抖时间，可以根据手感微调

        }, { passive: false });

        // 【右键处理】：彻底移除进度调节，仅保留呼出菜单
        player.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.sl-video-controls-interactive')) return;
            e.preventDefault();
            e.stopPropagation();
            if (window.ShellLink && window.ShellLink.showPreviewContextMenu) {
                const areaId = player.dataset.areaId;
                const cardEl = player.closest('.sl-card');
                const cardId = cardEl ? cardEl.dataset.cardId : null;
                window.ShellLink.showPreviewContextMenu(e.clientX, e.clientY, cardId, areaId, vid.src);
            }
        }, true);

        // 单击播放/暂停
        player.addEventListener('click', (e) => {
            if (e.target.closest('.sl-video-controls-interactive')) return;
            if (e.button === 0 && e.target.tagName === 'VIDEO') {
                if (vid.paused) vid.play().catch(()=>{});
                else vid.pause();
            }
        });

        // =========================================================================
        // 【核心修改 2】：底部进度条改为纯净的“仅点击跳转”模式
        // =========================================================================
        const progContainer = player.querySelector('.sl-video-progress-container');
        if (progContainer) {
            progContainer.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault(); 
                e.stopPropagation();
                if (!vid.duration) return;

                // 仅仅在按下的瞬间修改进度，不绑定任何后续拖拽事件
                const rect = progContainer.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                vid.currentTime = pos * vid.duration;
                
                const bar = player.querySelector('.sl-video-progress-bar');
                if (bar) bar.style.width = `${pos * 100}%`;
                
                // 让时间码瞬间刷新，不用等下一次 timeupdate
                const tc = player.querySelector('.sl-timecode');
                if (tc) {
                    tc.textContent = `${formatTime(vid.currentTime)} / ${formatTime(vid.duration)}`;
                }
            });
        }

        // 音量逻辑 (保持原样，因为音量通常需要拖拽调节)
        const volContainer = player.querySelector('.sl-vid-vol-slider');
        if (volContainer && vid) {
            const updateVolUI = (vol) => {
                const fill = volContainer.querySelector('.sl-volume-slider-fill');
                const thumb = volContainer.querySelector('.sl-volume-slider-thumb');
                if (fill) fill.style.width = `${vol * 100}%`;
                if (thumb) thumb.style.right = `${vol * 100}%`;
            };
            volContainer.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                const update = (clientX) => {
                    const rect = volContainer.getBoundingClientRect();
                    let v = 1.0 - (clientX - rect.left) / rect.width;
                    v = Math.max(0, Math.min(1, v));
                    vid.muted = false; vid.volume = v; updateVolUI(v);
                };
                update(e.clientX);
                const onMove = (ev) => update(ev.clientX);
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        }

        const muteOpt = player.querySelector('.sl-opt-mute');
        if (muteOpt) {
            muteOpt.onclick = (e) => {
                e.stopPropagation();
                
                const fill = player.querySelector('.sl-volume-slider-fill');
                const thumb = player.querySelector('.sl-volume-slider-thumb');
                
                if (vid.muted || vid.volume === 0) {
                    // 关闭静音，音量设为 80%
                    vid.muted = false;
                    vid.volume = 0.8;
                    if (fill) fill.style.width = `80%`;
                    if (thumb) thumb.style.right = `80%`; // 保持与拖拽时使用的 css 属性一致
                } else {
                    // 开启静音，音量设为 0
                    vid.muted = true;
                    vid.volume = 0;
                    if (fill) fill.style.width = `0%`;
                    if (thumb) thumb.style.right = `0%`;
                }
            };
        }

        // 更多菜单
        const moreToggle = player.querySelector('.sl-more-toggle');
        const moreDropdown = player.querySelector('.sl-more-dropdown');
        if (moreToggle) {
            moreToggle.onclick = (e) => {
                e.stopPropagation();
                moreDropdown.classList.toggle('show');
            };
        }

        const speedInput = player.querySelector('.sl-media-speed-input');
        if (speedInput) {
            speedInput.onchange = (e) => {
                let v = parseFloat(e.target.value);
                vid.playbackRate = Math.max(0.1, Math.min(5, v || 1));
            };
        }
        
        player.querySelectorAll('.sl-vid-speed-opt').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const spd = parseFloat(item.dataset.spd);
                vid.playbackRate = spd;
                if (speedInput) speedInput.value = spd.toFixed(1);
                moreDropdown.classList.remove('show');
            };
        });

        const fsOpt = player.querySelector('.sl-opt-fullscreen');
        if (fsOpt) fsOpt.onclick = (e) => { 
            e.stopPropagation(); 
            if (vid.requestFullscreen) vid.requestFullscreen(); 
            moreDropdown.classList.remove('show'); 
        };
    });
}