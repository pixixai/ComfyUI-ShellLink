/**
 * 文件名: media_audio.js
 * 职责: 音频组件的专属渲染与事件处理 (纯净渲染版，不再需要DOM缓存)
 */
import { formatTime } from "./media_utils.js";

export function renderAudio(area, url, errCall) {
    let filename = "未知音频文件";
    try { filename = new URL(url, window.location.origin).searchParams.get('filename') || filename; } catch(e){}

    const dimensionStyle = area.matchMedia 
        ? "aspect-ratio: auto; height: auto;" 
        : "aspect-ratio: 16/9; height: 100%;";

    return `
        <div class="clab-audio-player" data-area-id="${area.id}" style="${dimensionStyle} box-sizing: border-box; width: 100%; padding: 32px 20px 16px 20px; background-color: #000; background-image: radial-gradient(circle at 100% 50%, rgba(20, 80, 40, 0.4) 0%, rgba(10, 40, 20, 0.1) 40%, rgba(0, 0, 0, 1) 80%); border-radius: 6px; display: flex; flex-direction: column; justify-content: center;">
            
            <!-- 直接渲染原生的 <audio> 标签，不再使用 slot 占位符和全局拔插机制 -->
            <audio id="clab-img-${area.id}" class="clab-preview-img clab-media-target" src="${url}" loop style="display:none;" onerror="${errCall}"></audio>
            
            <!-- 1. 顶部：音频名称 (左对齐) -->
            <div style="font-size: 13px; font-weight: bold; color: #eee; word-break: break-all; text-align: left; margin-bottom: 12px; font-family: sans-serif; letter-spacing: 0.5px;">
                ${filename}
            </div>

            <!-- 2. 中间：进度条 -->
            <div class="clab-audio-progress-container clab-video-controls-interactive" style="width: 100%; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; cursor: pointer; overflow: hidden; position: relative; margin-bottom: 4px !important;">
                <div class="clab-audio-progress-bar" style="height: 100%; width: 0%; background: #2196F3; pointer-events: none;"></div>
            </div>

            <!-- 3. 进度条下方：分列左右的时间码 (极紧凑间距) -->
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #aaa; font-family: sans-serif; margin-top: 0px; margin-bottom: 10px; font-variant-numeric: tabular-nums;">
                <span class="clab-timecode-current">00:00</span>
                <span class="clab-timecode-total">00:00</span>
            </div>

            <!-- 4. 底部：所有控制按钮 -->
            <div class="clab-audio-controls-row" style="display: flex; align-items: center;">
                
                <!-- 纯净无背景的播放按钮 -->
                <button class="clab-audio-btn clab-audio-play clab-video-controls-interactive" style="background: transparent; border: none; color: #aaa; padding: 0; width: 28px; height: 28px; display: flex; justify-content: center; align-items: center; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'">
                    <svg class="clab-play-icon" style="display: block;" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    <svg class="clab-pause-icon" style="display: none;" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                </button>

                <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
                    
                    <!-- 音量滑杆，去除悬停背景色块，颜色统一 -->
                    <div class="clab-volume-wrap clab-video-controls-interactive" style="background: transparent !important;">
                        <div class="clab-volume-slider-container clab-aud-vol-slider" title="调节音量">
                            <div class="clab-volume-slider-track">
                                <div class="clab-volume-slider-fill"></div>
                                <div class="clab-volume-slider-thumb"></div>
                            </div>
                        </div>
                        <button class="clab-media-opt-btn clab-opt-mute" title="静音/取消静音" style="padding: 4px 6px; background: transparent !important; color: #aaa; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'">
                            <svg class="clab-vol-icon-high" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                            <svg class="clab-vol-icon-muted" style="display:none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                        </button>
                    </div>

                    <!-- 胶囊形状的播放倍速下拉框，统一颜色，去除加粗，动态效果统一 -->
                    <div class="clab-media-opt-wrapper clab-video-controls-interactive">
                        <button class="clab-media-opt-btn clab-audio-speed-toggle" style="background: transparent; border: 1px solid #aaa; border-radius: 20px; padding: 3px 10px; font-size: 11px; color: #aaa; cursor: pointer; display: flex; align-items: center; justify-content: center; min-width: 44px; transition: color 0.2s, border-color 0.2s;" onmouseover="this.style.color='#fff'; this.style.borderColor='#fff'" onmouseout="this.style.color='#aaa'; this.style.borderColor='#aaa'">
                            <span class="clab-audio-speed-val" style="font-weight: normal; color: inherit;">1.0x</span>
                        </button>
                        <!-- 下拉菜单：半透明背景，适配模块整体风格 -->
                        <div class="clab-media-dropdown clab-audio-speed-dropdown" style="min-width: 80px; text-align: center; background: rgba(30,30,30,0.85); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);">
                            <div class="clab-media-dropdown-item clab-audio-preset" data-spd="0.5">0.5x</div>
                            <div class="clab-media-dropdown-item clab-audio-preset" data-spd="1.0">1.0x</div>
                            <div class="clab-media-dropdown-item clab-audio-preset" data-spd="1.5">1.5x</div>
                            <div class="clab-media-dropdown-item clab-audio-preset" data-spd="2.0">2.0x</div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;
}

export function updateAudioProgress() {
    document.querySelectorAll('.clab-audio-player').forEach(player => {
        const aud = player.querySelector('audio');
        if (!aud) return;

        const muteOpt = player.querySelector('.clab-opt-mute');
        if (muteOpt) {
            const iconHigh = muteOpt.querySelector('.clab-vol-icon-high');
            const iconMuted = muteOpt.querySelector('.clab-vol-icon-muted');
            if (aud.muted || aud.volume === 0) {
                if (iconHigh) iconHigh.style.display = 'none';
                if (iconMuted) iconMuted.style.display = 'block';
            } else {
                if (iconHigh) iconHigh.style.display = 'block';
                if (iconMuted) iconMuted.style.display = 'none';
            }
        }

        if (aud.dataset.isScrubbing === 'true') return;

        const bar = player.querySelector('.clab-audio-progress-bar');
        const tcCurr = player.querySelector('.clab-timecode-current');
        const tcTot = player.querySelector('.clab-timecode-total');
        const btn = player.querySelector('.clab-audio-play');
        
        if (aud.duration) {
            if (bar) bar.style.width = `${(aud.currentTime / aud.duration) * 100}%`;
            if (tcCurr) tcCurr.textContent = formatTime(aud.currentTime);
            if (tcTot) tcTot.textContent = formatTime(aud.duration);
        }
        
        if (btn) {
            const playIcon = btn.querySelector('.clab-play-icon');
            const pauseIcon = btn.querySelector('.clab-pause-icon');
            if (playIcon && pauseIcon) {
                if (aud.paused) {
                    playIcon.style.display = 'block';
                    pauseIcon.style.display = 'none';
                } else {
                    playIcon.style.display = 'none';
                    pauseIcon.style.display = 'block';
                }
            }
        }
    });
}

export function attachAudioEvents(container) {
    container.querySelectorAll('.clab-audio-player').forEach(player => {
        if (player.dataset.binded) return;
        player.dataset.binded = "1";
        
        // 【核心清理】：直接拿节点，再也不需要去缓存池里查字典了
        const aud = player.querySelector('audio'); 
        if (!aud) return;

        // 突破父级限制。如果音频启用了 matchMedia，强行重写外部画框的比例
        const previewBg = player.closest('.clab-preview-bg');
        if (previewBg) {
            if (player.style.height === 'auto') {
                previewBg.style.setProperty('aspect-ratio', 'auto', 'important');
                previewBg.style.setProperty('height', 'auto', 'important');
            } else {
                previewBg.style.setProperty('aspect-ratio', '16/9', 'important');
                previewBg.style.setProperty('height', '100%', 'important');
            }
        }

        // 初始化倍速文本
        const speedValSpan = player.querySelector('.clab-audio-speed-val');
        if (speedValSpan) speedValSpan.textContent = aud.playbackRate.toFixed(1) + 'x';

        // 1. 播放/暂停
        const playBtn = player.querySelector('.clab-audio-play');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                if (aud.paused) aud.play().catch(e => console.log("播放等待交互:", e)); 
                else aud.pause();
            });
        }

        // 2. 音量防劫持滑杆
        const audVolContainer = player.querySelector('.clab-aud-vol-slider');
        const volWrap = player.querySelector('.clab-volume-wrap');
        
        if (audVolContainer) {
            const updateAudVolUI = (vol) => {
                const fill = audVolContainer.querySelector('.clab-volume-slider-fill');
                const thumb = audVolContainer.querySelector('.clab-volume-slider-thumb');
                if (fill) fill.style.width = `${vol * 100}%`;
                if (thumb) thumb.style.right = `${vol * 100}%`;
            };

            if (aud.muted || aud.volume === 0) updateAudVolUI(0);
            else updateAudVolUI(aud.volume);

            audVolContainer.addEventListener('mousedown', (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                if (e.button !== 0) return;

                audVolContainer.classList.add('is-dragging');
                if (volWrap) volWrap.classList.add('is-active');
                let isDraggingVol = true;

                const updateVolume = (clientX) => {
                    const rect = audVolContainer.getBoundingClientRect();
                    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                    const newVol = 1.0 - pos; 
                    aud.muted = false; 
                    aud.volume = newVol;
                    updateAudVolUI(newVol);
                };

                updateVolume(e.clientX);

                const onMove = (ev) => {
                    if (!isDraggingVol) return;
                    updateVolume(ev.clientX);
                };

                const onUp = (ev) => {
                    if (ev.button !== 0) return;
                    isDraggingVol = false;
                    audVolContainer.classList.remove('is-dragging');
                    if (volWrap) volWrap.classList.remove('is-active');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        }

        // 静音按钮点击
        const muteOpt = player.querySelector('.clab-opt-mute');
        if (muteOpt) {
            muteOpt.onclick = (e) => { 
                e.stopPropagation(); 
                if (aud.muted || aud.volume === 0) {
                    aud.muted = false;
                    aud.volume = 0.8;
                    const fill = player.querySelector('.clab-volume-slider-fill');
                    const thumb = player.querySelector('.clab-volume-slider-thumb');
                    if (fill) fill.style.width = `80%`;
                    if (thumb) thumb.style.right = `80%`;
                } else {
                    aud.muted = true;
                    aud.volume = 0;
                    const fill = player.querySelector('.clab-volume-slider-fill');
                    const thumb = player.querySelector('.clab-volume-slider-thumb');
                    if (fill) fill.style.width = `0%`;
                    if (thumb) thumb.style.right = `0%`;
                }
            };
        }

        // 3. 进度条拖拽定位
        const progContainer = player.querySelector('.clab-audio-progress-container');
        if (progContainer) {
            progContainer.addEventListener('mousedown', (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                if (e.button !== 0) return;
                
                if (!aud.duration) return;
                
                let isDraggingBar = true;
                const wasPlaying = !aud.paused;
                aud.pause();
                aud.dataset.isScrubbing = 'true';
                
                const updateProgress = (clientX) => {
                    const rect = progContainer.getBoundingClientRect();
                    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                    const newTime = pos * aud.duration;
                    aud.currentTime = newTime;
                    
                    const bar = player.querySelector('.clab-audio-progress-bar');
                    if (bar) bar.style.width = `${pos * 100}%`;
                    
                    const tcCurr = player.querySelector('.clab-timecode-current');
                    if (tcCurr) {
                        tcCurr.textContent = formatTime(newTime);
                        tcCurr.style.color = '#4CAF50'; 
                    }
                };

                updateProgress(e.clientX);

                const onMove = (ev) => {
                    if (!isDraggingBar) return;
                    updateProgress(ev.clientX);
                };
                const onUp = (ev) => {
                    if (ev.button !== 0) return;
                    isDraggingBar = false;
                    aud.dataset.isScrubbing = 'false';
                    
                    const tcCurr = player.querySelector('.clab-timecode-current');
                    if (tcCurr) tcCurr.style.color = '';

                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    
                    if (wasPlaying) aud.play().catch(()=>{});
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        }

        // 4. 倍速胶囊控制菜单 
        const speedToggle = player.querySelector('.clab-audio-speed-toggle');
        const dropdown = player.querySelector('.clab-audio-speed-dropdown');
        
        if (speedToggle && dropdown) {
            speedToggle.onclick = (e) => {
                e.stopPropagation();
                const isShow = dropdown.classList.contains('show');
                document.querySelectorAll('.clab-media-dropdown.show').forEach(m => {
                    m.classList.remove('show');
                    if (m._originalParent) m._originalParent.appendChild(m);
                });
                
                if (!isShow) {
                    if (!dropdown._originalParent) dropdown._originalParent = dropdown.parentNode;
                    document.body.appendChild(dropdown);
                    
                    const rect = speedToggle.getBoundingClientRect();
                    dropdown.style.bottom = `${window.innerHeight - rect.top + 8}px`;
                    dropdown.style.left = `${rect.left}px`;
                    dropdown.style.right = 'auto';
                    dropdown.classList.add('show');
                }
            };

            const dropdownOpts = dropdown.querySelectorAll('.clab-audio-preset');
            if (dropdownOpts) {
                dropdownOpts.forEach(item => {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        const spd = parseFloat(item.dataset.spd);
                        if (speedValSpan) speedValSpan.textContent = spd.toFixed(1) + 'x';
                        aud.playbackRate = spd;
                        
                        dropdown.classList.remove('show');
                        if (dropdown._originalParent) dropdown._originalParent.appendChild(dropdown);
                    };
                });
            }
        }
    });
}