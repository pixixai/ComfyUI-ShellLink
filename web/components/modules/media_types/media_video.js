/**
 * 文件名: media_video.js
 * 职责: 视频组件的专属渲染与事件处理
 */
import { formatTime, formatTimeWithFrames } from "./media_utils.js";

export function renderVideo(area, objectFit, url, errCall) {
    return `
        <div class="sl-video-player" data-area-id="${area.id}">
            <video id="sl-img-${area.id}" class="sl-preview-img sl-media-target" src="${url}" draggable="false" style="object-fit: ${objectFit}; width: 100%; height: 100%; display: block;" autoplay loop muted playsinline onerror="${errCall}"></video>
            <div class="sl-video-controls">
                <div class="sl-video-toolbar">
                    <span class="sl-timecode" style="font-family: sans-serif;">00:00 / 00:00</span>
                    <div class="sl-video-tools-right">
                        
                        <!-- 极简音量滑杆 (同步音频组件的透明无背景风格) -->
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
                                    <span style="font-size: 11px; color: #aaa; font-family: sans-serif;">播放速度</span>
                                    <div style="display: flex; align-items: center; background: rgba(0,0,0,0.5); border: 1px solid #555; border-radius: 4px; padding: 0 4px;">
                                        <input type="number" class="sl-media-speed-input" value="1.0" step="0.1" min="0.1" max="5.0" style="width: 28px; background: transparent; border: none; color: #eee; font-size: 11px; text-align: center; outline: none; -moz-appearance: textfield;">
                                        <span style="font-size: 10px; color: #aaa; pointer-events: none;">x</span>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                    <span class="sl-vid-speed-opt" data-spd="0.5" style="cursor: pointer; font-size: 10px; color: #eee; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background 0.2s; font-family: sans-serif;">0.5</span>
                                    <span class="sl-vid-speed-opt" data-spd="1.0" style="cursor: pointer; font-size: 10px; color: #eee; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background 0.2s; font-family: sans-serif;">1.0</span>
                                    <span class="sl-vid-speed-opt" data-spd="1.5" style="cursor: pointer; font-size: 10px; color: #eee; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background 0.2s; font-family: sans-serif;">1.5</span>
                                    <span class="sl-vid-speed-opt" data-spd="2.0" style="cursor: pointer; font-size: 10px; color: #eee; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background 0.2s; font-family: sans-serif;">2.0</span>
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

        // 音量探测与图标控制
        const muteOpt = player.querySelector('.sl-opt-mute');
        const volWrap = player.querySelector('.sl-volume-wrap');
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
                if (volWrap) volWrap.classList.add('no-audio');
                muteOpt.style.color = '#888';
                muteOpt.style.pointerEvents = 'none';
                muteOpt.title = '无音频';
                if (iconHigh) iconHigh.style.display = 'none';
                if (iconMuted) iconMuted.style.display = 'none';
                if (iconNone) iconNone.style.display = 'block';
                if (slider) slider.style.display = 'none';
            } else {
                if (volWrap) volWrap.classList.remove('no-audio');
                if (muteOpt.style.color === 'rgb(136, 136, 136)' || muteOpt.style.color === '#888') {
                    muteOpt.style.color = '#aaa'; 
                }
                muteOpt.style.pointerEvents = 'auto';
                muteOpt.title = (vid.muted || vid.volume === 0) ? '取消静音' : '静音';
                if (slider) slider.style.display = 'block';
                
                if (vid.muted || vid.volume === 0) {
                    if (iconHigh) iconHigh.style.display = 'none';
                    if (iconMuted) iconMuted.style.display = 'block';
                    if (iconNone) iconNone.style.display = 'none';
                } else {
                    if (iconHigh) iconHigh.style.display = 'block';
                    if (iconMuted) iconMuted.style.display = 'none';
                    if (iconNone) iconNone.style.display = 'none';
                }
            }
        }

        if (vid.dataset.isScrubbing === 'true') return; 
        
        const bar = player.querySelector('.sl-video-progress-bar');
        const tc = player.querySelector('.sl-timecode');
        if (bar && tc && vid.duration) {
            bar.style.width = `${(vid.currentTime / vid.duration) * 100}%`;
            tc.textContent = `${formatTime(vid.currentTime)} / ${formatTime(vid.duration)}`;
        }
    });
}

export function attachVideoEvents(container) {
    container.querySelectorAll('.sl-video-player').forEach(player => {
        if (player.dataset.binded) return;
        player.dataset.binded = "1";
        
        let hasRightDragged = false;
        let blockContextMenu = false;

        const updateMuteButtonState = () => {
            const vid = player.querySelector('video');
            const muteOpt = player.querySelector('.sl-opt-mute');
            const volWrap = player.querySelector('.sl-volume-wrap');
            if (!vid || !muteOpt) return;
            
            let noAudio = false;
            if (vid.audioTracks && vid.audioTracks.length === 0) noAudio = true;
            else if (vid.mozHasAudio === false) noAudio = true;
            else if (vid.currentTime > 0.1 && vid.webkitAudioDecodedByteCount === 0) noAudio = true;

            const iconHigh = muteOpt.querySelector('.sl-vol-icon-high');
            const iconMuted = muteOpt.querySelector('.sl-vol-icon-muted');
            const iconNone = muteOpt.querySelector('.sl-vol-icon-none');
            const slider = player.querySelector('.sl-vid-vol-slider');

            if (noAudio) {
                if (volWrap) volWrap.classList.add('no-audio');
                muteOpt.style.color = '#888';
                muteOpt.style.pointerEvents = 'none';
                muteOpt.style.cursor = 'default';
                muteOpt.title = '无音频';
                if (iconHigh) iconHigh.style.display = 'none';
                if (iconMuted) iconMuted.style.display = 'none';
                if (iconNone) iconNone.style.display = 'block';
                if (slider) slider.style.display = 'none';
            } else {
                if (volWrap) volWrap.classList.remove('no-audio');
                if (muteOpt.style.color === 'rgb(136, 136, 136)' || muteOpt.style.color === '#888') {
                    muteOpt.style.color = '#aaa'; 
                }
                muteOpt.style.pointerEvents = 'auto';
                muteOpt.style.cursor = 'pointer';
                muteOpt.title = (vid.muted || vid.volume === 0) ? '取消静音' : '静音';
                if (slider) slider.style.display = 'block';
                
                if (vid.muted || vid.volume === 0) {
                    if (iconHigh) iconHigh.style.display = 'none';
                    if (iconMuted) iconMuted.style.display = 'block';
                    if (iconNone) iconNone.style.display = 'none';
                } else {
                    if (iconHigh) iconHigh.style.display = 'block';
                    if (iconMuted) iconMuted.style.display = 'none';
                    if (iconNone) iconNone.style.display = 'none';
                }
            }
        };

        const initialVid = player.querySelector('video');
        if (initialVid) {
            initialVid.addEventListener('loadeddata', updateMuteButtonState);
            initialVid.addEventListener('timeupdate', updateMuteButtonState); 
        }

        // 1. 鼠标按下事件：左键播放/暂停，右键准备拖拽
        player.addEventListener('mousedown', (e) => {
            if (e.target.closest('.sl-video-controls-interactive')) return;

            const currentVid = player.querySelector('video');
            if (!currentVid) return;

            if (e.button === 0) { 
                if (currentVid.paused) currentVid.play().catch(()=>{});
                else currentVid.pause();
            } else if (e.button === 2) { 
                if (!currentVid.duration) return;

                const startX = e.clientX;
                const startPlayTime = currentVid.currentTime;
                const wasPlaying = !currentVid.paused;
                
                hasRightDragged = false;
                blockContextMenu = false;
                currentVid.dataset.isScrubbing = 'true';
                currentVid.pause(); 

                const onMove = (ev) => {
                    const freshVid = player.querySelector('video');
                    if (!freshVid) return;

                    const deltaX = ev.clientX - startX;
                    if (!hasRightDragged && Math.abs(deltaX) > 3) hasRightDragged = true;

                    if (hasRightDragged) {
                        const width = player.offsetWidth || 300;
                        let newTime = startPlayTime + (deltaX / width) * freshVid.duration;
                        newTime = Math.max(0, Math.min(freshVid.duration, newTime));

                        freshVid.currentTime = newTime;

                        const bar = player.querySelector('.sl-video-progress-bar');
                        if (bar) bar.style.width = `${(newTime / freshVid.duration) * 100}%`;
                        const tc = player.querySelector('.sl-timecode');
                        if (tc) {
                            tc.textContent = formatTimeWithFrames(newTime, 30);
                            tc.style.color = '#4CAF50'; 
                            tc.style.fontFamily = 'sans-serif !important';
                        }
                    }
                };

                const onUp = (ev) => {
                    if (ev.button === 2) {
                        const freshVid = player.querySelector('video');
                        if (freshVid) freshVid.dataset.isScrubbing = 'false';

                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);

                        const tc = player.querySelector('.sl-timecode');
                        if (tc) tc.style.color = '';

                        if (hasRightDragged) {
                            const globalCtxBlocker = (ctxEvent) => {
                                ctxEvent.preventDefault();
                                ctxEvent.stopPropagation();
                            };
                            window.addEventListener('contextmenu', globalCtxBlocker, true);
                            setTimeout(() => {
                                window.removeEventListener('contextmenu', globalCtxBlocker, true);
                            }, 100);

                            blockContextMenu = true; 
                            if (wasPlaying && freshVid) freshVid.play().catch(()=>{});
                            setTimeout(() => { blockContextMenu = false; }, 100);
                        } else {
                            if (wasPlaying && freshVid) freshVid.play().catch(()=>{});
                        }
                    }
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            }
        });

        // 2. 拦截右键菜单
        player.addEventListener('contextmenu', (e) => {
            if (blockContextMenu) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // 3. 底部进度条点击与拖拽快速定位
        const progContainer = player.querySelector('.sl-video-progress-container');
        if (progContainer) {
            progContainer.addEventListener('mousedown', (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                if (e.button !== 0) return; 

                const currentVid = player.querySelector('video');
                if (!currentVid || !currentVid.duration) return;
                
                let isDraggingBar = true;
                const wasPlaying = !currentVid.paused;
                
                currentVid.pause(); 
                currentVid.dataset.isScrubbing = 'true';
                
                const updateProgress = (clientX) => {
                    const freshVid = player.querySelector('video');
                    if (!freshVid) return;
                    const rect = progContainer.getBoundingClientRect();
                    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                    const newTime = pos * freshVid.duration;
                    freshVid.currentTime = newTime;
                    
                    const bar = player.querySelector('.sl-video-progress-bar');
                    if (bar) bar.style.width = `${pos * 100}%`;
                    
                    const tc = player.querySelector('.sl-timecode');
                    if (tc) {
                        tc.textContent = formatTimeWithFrames(newTime, 30);
                        tc.style.color = '#4CAF50';
                        tc.style.fontFamily = 'sans-serif !important';
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
                    const freshVid = player.querySelector('video');
                    if (freshVid) freshVid.dataset.isScrubbing = 'false';
                    
                    const tc = player.querySelector('.sl-timecode');
                    if (tc) tc.style.color = '';
                    
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    
                    if (wasPlaying && freshVid) {
                        freshVid.play().catch(()=>{});
                    } else if (freshVid) {
                        freshVid.dataset.manualPause = 'true';
                    }
                };
                
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        }

        // 4. 音量滑杆交互 (左大右小)
        const volContainer = player.querySelector('.sl-vid-vol-slider');
        const volWrap = player.querySelector('.sl-volume-wrap');
        const currentVidNode = player.querySelector('video');
        
        if (volContainer && currentVidNode) {
            const updateVolUI = (vol) => {
                const fill = volContainer.querySelector('.sl-volume-slider-fill');
                const thumb = volContainer.querySelector('.sl-volume-slider-thumb');
                if (fill) fill.style.width = `${vol * 100}%`;
                if (thumb) thumb.style.right = `${vol * 100}%`;
            };

            if (currentVidNode.muted || currentVidNode.volume === 0) updateVolUI(0);
            else updateVolUI(currentVidNode.volume);

            volContainer.addEventListener('mousedown', (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                if (e.button !== 0) return;
                
                const vid = player.querySelector('video');
                if (!vid) return;

                volContainer.classList.add('is-dragging');
                if (volWrap) volWrap.classList.add('is-active'); 
                let isDraggingVol = true;

                const updateVolume = (clientX) => {
                    const rect = volContainer.getBoundingClientRect();
                    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                    const newVol = 1.0 - pos;
                    
                    vid.muted = false; 
                    vid.volume = newVol;
                    updateVolUI(newVol);
                };

                updateVolume(e.clientX);

                const onMove = (ev) => {
                    if (!isDraggingVol) return;
                    updateVolume(ev.clientX);
                };

                const onUp = (ev) => {
                    if (ev.button !== 0) return;
                    isDraggingVol = false;
                    volContainer.classList.remove('is-dragging');
                    if (volWrap) volWrap.classList.remove('is-active');
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
                const vid = player.querySelector('video');
                if (vid) {
                    if (vid.muted || vid.volume === 0) {
                        vid.muted = false;
                        vid.volume = 0.8;
                        const fill = player.querySelector('.sl-volume-slider-fill');
                        const thumb = player.querySelector('.sl-volume-slider-thumb');
                        if (fill) fill.style.width = `80%`;
                        if (thumb) thumb.style.right = `80%`;
                    } else {
                        vid.muted = true;
                        vid.volume = 0;
                        const fill = player.querySelector('.sl-volume-slider-fill');
                        const thumb = player.querySelector('.sl-volume-slider-thumb');
                        if (fill) fill.style.width = `0%`;
                        if (thumb) thumb.style.right = `0%`;
                    }
                }
            };
        }

        // 5. 突破裁切的全局下拉菜单 (游离挂载技术)
        const moreToggle = player.querySelector('.sl-more-toggle');
        const moreDropdown = player.querySelector('.sl-more-dropdown');

        if (moreToggle && moreDropdown) {
            moreToggle.onclick = (e) => {
                e.stopPropagation();
                const isShow = moreDropdown.classList.contains('show');
                
                document.querySelectorAll('.sl-media-dropdown.show').forEach(m => {
                    m.classList.remove('show');
                    if (m._originalParent) m._originalParent.appendChild(m);
                });
                
                if (!isShow) {
                    if (!moreDropdown._originalParent) moreDropdown._originalParent = moreDropdown.parentNode;
                    document.body.appendChild(moreDropdown);
                    
                    const rect = moreToggle.getBoundingClientRect();
                    moreDropdown.style.bottom = `${window.innerHeight - rect.top + 8}px`;
                    moreDropdown.style.right = `${window.innerWidth - rect.right}px`;
                    moreDropdown.style.left = 'auto';
                    moreDropdown.classList.add('show');
                }
            };
        }
        
        const pipOpt = moreDropdown?.querySelector('.sl-opt-pip');
        if (pipOpt) pipOpt.onclick = (e) => { 
            e.stopPropagation(); 
            const currentVid = player.querySelector('video');
            if (!currentVid) return;
            if (document.pictureInPictureElement) document.exitPictureInPicture(); 
            else currentVid.requestPictureInPicture().catch(()=>{}); 
            moreDropdown.classList.remove('show'); 
            if (moreDropdown._originalParent) moreDropdown._originalParent.appendChild(moreDropdown);
        };
        
        const fsOpt = moreDropdown?.querySelector('.sl-opt-fullscreen');
        if (fsOpt) fsOpt.onclick = (e) => { 
            e.stopPropagation(); 
            const currentVid = player.querySelector('video');
            if (!currentVid) return;
            if (currentVid.requestFullscreen) currentVid.requestFullscreen(); 
            else if (currentVid.webkitRequestFullscreen) currentVid.webkitRequestFullscreen(); 
            moreDropdown.classList.remove('show'); 
            if (moreDropdown._originalParent) moreDropdown._originalParent.appendChild(moreDropdown);
        };

        const speedInput = moreDropdown?.querySelector('.sl-media-speed-input');
        if (speedInput) {
            speedInput.onclick = (e) => { e.stopPropagation(); }; 
            speedInput.onchange = (e) => {
                let v = parseFloat(e.target.value);
                if (isNaN(v) || v < 0.1) v = 1.0;
                if (v > 5.0) v = 5.0;
                e.target.value = v.toFixed(1);
                const currentVid = player.querySelector('video');
                if(currentVid) currentVid.playbackRate = v;
            };
        }
        
        moreDropdown?.querySelectorAll('.sl-vid-speed-opt').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const spd = parseFloat(item.dataset.spd);
                if (speedInput) speedInput.value = spd.toFixed(1);
                const currentVid = player.querySelector('video');
                if(currentVid) currentVid.playbackRate = spd;
                moreDropdown.classList.remove('show');
                if (moreDropdown._originalParent) moreDropdown._originalParent.appendChild(moreDropdown);
            };
        });
    });
}