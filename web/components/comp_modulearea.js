/**
 * 鏂囦欢鍚? comp_modulearea.js
 * 鑱岃矗: 銆愯矾鐢卞櫒涓庡澹炽€戣礋璐ｅ垎鍙?Input/Output 娓叉煋锛岀鐞嗗澹虫嫋鎷姐€?
 */
import { state, dragState, saveAndRender } from "./ui_state.js";
import { injectDnDCSS, bindComboSelectEvents } from "./ui_utils.js";
import { generateInputHTML, attachInputEvents, refreshInputAreaInPlace } from "./modules/module_input.js";
import { generateOutputHTML, attachOutputEvents } from "./modules/module_output.js";
import { updateSelectionUI } from "./ui_selection.js"; // 銆愭柊澧炪€戯細寮曞叆鏇存柊閫変腑鐘舵€佺殑 UI 鏂规硶
import { app } from "../../../scripts/app.js";

// 銆愭牳蹇冭В鑰︺€戯細浠呬繚瀛樼姸鎬佸埌鍚庡彴鑺傜偣锛屾嫆缁濊Е鍙戝叏灞€鍒锋柊
export function justSave() {
    // Prefer extension save bridge so latest in-memory state is always persisted.
    if (window.CLab && typeof window.CLab.saveState === "function") {
        window.CLab.saveState(state);
        return;
    }
    if (window.StateManager && window.StateManager.syncToNode) {
        const graph = app?.graph || window.app?.graph;
        if (graph) window.StateManager.syncToNode(graph);
    }
}

// 銆愮粓鏋佸畾鐐圭垎鐮淬€戯細鑷甫 Mini-Stash锛堝井鍨嬬墿鐞嗛噾搴擄級锛屽眬閮ㄦ浛鎹?DOM 鏃跺畬缇庝繚鎶よ棰戠姸鎬侊紒
export function surgicallyUpdateArea(areaId) {
    const areaEl = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
    if (!areaEl) return;
    let targetCard = null;
    let targetArea = null;
    state.cards.forEach(c => {
        const a = c.areas?.find(x => x.id === areaId);
        if (a) { targetCard = c; targetArea = a; }
    });
    if (targetCard && targetArea) {
        const mediaEl = areaEl.querySelector('.clab-media-target');
        let stashedMedia = null, stashedSrc = null, stashedTime = 0, stashedPaused = true;

        if (mediaEl && (mediaEl.tagName === 'VIDEO' || mediaEl.tagName === 'AUDIO')) {
            stashedMedia = mediaEl;
            stashedSrc = mediaEl.getAttribute('src') || '';
            stashedTime = mediaEl.currentTime;
            stashedPaused = mediaEl.paused;
            
            if (!window._clabMiniVault) {
                window._clabMiniVault = document.createElement('div');
                window._clabMiniVault.id = 'clab-mini-vault';
                window._clabMiniVault.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0.01; pointer-events: none; z-index: -9999; overflow: hidden;';
                document.body.appendChild(window._clabMiniVault);
            }
            window._clabMiniVault.appendChild(mediaEl);
        }

        const temp = document.createElement('div');
        temp.innerHTML = generateAreaHTML(targetArea, targetCard);
        const newAreaEl = temp.firstElementChild;
        areaEl.replaceWith(newAreaEl);

        if (stashedMedia) {
            const newMediaEl = newAreaEl.querySelector('.clab-media-target');
            if (newMediaEl) {
                const newSrc = newMediaEl.getAttribute('src') || '';
                
                // 銆愭牳蹇冧慨澶嶃€戯細绮剧‘姣斿鏃堕棿鎴?t銆傚鏋滅敤鎴风偣鍑讳簡鈥滈噸鏂板悓姝モ€濓紝t 鍙傛暟浼氭敼鍙橈紝
                // 姝ゆ椂閲戝簱蹇呴』鏀惧純鎷︽埅锛岃瑙嗛鐪熸鍦伴噸鏂板姞杞芥覆鏌擄紝瀹炵幇鐪熸鐨勫己鍒跺埛鏂帮紒
                let isSame = false;
                try {
                    const oU = new URL(stashedSrc, window.location.origin);
                    const nU = new URL(newSrc, window.location.origin);
                    isSame = (oU.pathname === nU.pathname && 
                              oU.searchParams.get('filename') === nU.searchParams.get('filename') && 
                              oU.searchParams.get('t') === nU.searchParams.get('t'));
                } catch(e) {
                    isSame = (stashedSrc === newSrc);
                }
                
                if (isSame && stashedSrc !== '') {
                    newMediaEl.replaceWith(stashedMedia);
                    if (Math.abs(stashedMedia.currentTime - stashedTime) > 0.1) {
                        stashedMedia.currentTime = stashedTime;
                    }
                    if (!stashedPaused) stashedMedia.play().catch(()=>{});
                } else {
                    stashedMedia.remove();
                }
            } else {
                stashedMedia.remove();
            }
        }
        
        attachAreaEvents(newAreaEl.parentElement); 
    }
}

export function refreshAreaForContext(areaId) {
    const areaEl = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
    if (!areaEl) return false;

    let targetCard = null;
    let targetArea = null;
    state.cards.forEach((card) => {
        const area = card.areas?.find((item) => item.id === areaId);
        if (area) {
            targetCard = card;
            targetArea = area;
        }
    });
    if (!targetCard || !targetArea) return false;

    if (targetArea.type === "edit" && refreshInputAreaInPlace(areaEl, targetArea, targetCard)) {
        return true;
    }

    if (targetArea.type === "preview") {
        const temp = document.createElement("div");
        temp.innerHTML = generateAreaHTML(targetArea, targetCard);
        const nextAreaEl = temp.firstElementChild;
        const hasCurrentMedia = !!areaEl.querySelector(".clab-media-target");
        const hasNextMedia = !!nextAreaEl?.querySelector(".clab-media-target");

        if (nextAreaEl && !hasCurrentMedia && !hasNextMedia) {
            areaEl.className = nextAreaEl.className;
            areaEl.dataset.cardId = targetCard.id;
            areaEl.dataset.areaId = targetArea.id;
            areaEl.style.cssText = nextAreaEl.style.cssText;
            areaEl.innerHTML = nextAreaEl.innerHTML;
            attachAreaEvents(areaEl);
            return true;
        }
    }

    surgicallyUpdateArea(areaId);
    return true;
}

// 銆愰瓟娉曠籂鍋忋€戯細闈欓粯鎵弿鍏ㄥ満锛岀粰鎵€鏈夌殑鍗＄墖鍜屾ā鍧楃悊椤烘帓闃熷簭鍙?
export function updateAllDefaultTitles() {
    document.querySelectorAll('.clab-card:not(.clab-add-card-inline)').forEach((cardEl) => {
        const cardId = cardEl.dataset.cardId;
        const stateCardIdx = state.cards.findIndex(c => c.id === cardId);
        if (stateCardIdx === -1) return;

        const stateCard = state.cards[stateCardIdx];
        const defaultCardTitle = `#${stateCardIdx + 1}`;
        const cardTitleInput = cardEl.querySelector('.clab-card-title-input');
        
        if (cardTitleInput) {
            cardTitleInput.placeholder = defaultCardTitle;
            cardTitleInput.dataset.default = defaultCardTitle;
            if (!stateCard.title) {
                cardTitleInput.value = defaultCardTitle;
                cardTitleInput.size = Math.max(defaultCardTitle.length, 2);
            }
        }

        let editCount = 0;
        let previewCount = 0;

        const allAreas = cardEl.querySelectorAll('.clab-area');
        allAreas.forEach((areaEl) => {
            const areaId = areaEl.dataset.areaId;
            const stateArea = stateCard.areas?.find(a => a.id === areaId);
            if (!stateArea) return;

            let currentIdx = 0;
            if (stateArea.type === 'edit') {
                editCount++;
                currentIdx = editCount;
            } else if (stateArea.type === 'preview') {
                previewCount++;
                currentIdx = previewCount;
            }

            const defaultAreaTitle = `##${currentIdx}`;
            const areaTitleInput = areaEl.querySelector('.clab-area-title-input');
            
            if (areaTitleInput) {
                areaTitleInput.placeholder = defaultAreaTitle;
                if (!stateArea.title) {
                    areaTitleInput.value = defaultAreaTitle;
                    areaTitleInput.size = Math.max(defaultAreaTitle.length, 2);
                }
            }
        });
    });
}

// 銆愬叏鏂版礂鐗屽紩鎿庛€戯細褰撴ā鍧楀彂鐢熺墿鐞嗕綅绉绘椂锛岄噸鍐?DOM 涓婃墍鏈夋畫鐣欑殑鍗＄墖 ID 鐑欏嵃
export function updateAreaDOMIdentity(areaId, newCardId) {
    try {
        const el = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
        if (el) {
            el.dataset.cardId = newCardId;
            el.querySelectorAll('[data-card]').forEach(child => child.dataset.card = newCardId);
            el.querySelectorAll('[data-card-id]').forEach(child => child.dataset.cardId = newCardId);
        }
    } catch(e) { console.error("[CLab] DOM 韬唤鏇存柊澶辫触:", e); }
}

window._clabSurgicallyUpdateArea = surgicallyUpdateArea;
window._clabJustSave = justSave;
window._clabUpdateAllDefaultTitles = updateAllDefaultTitles;
window._clabUpdateAreaDOMIdentity = updateAreaDOMIdentity;
window._clabGenerateAreaHTML = generateAreaHTML;
window._clabAttachAreaEvents = attachAreaEvents;
window._clabRefreshAreaForContext = refreshAreaForContext;

export function syncAreaDOMOrder(cardId, newAreasArray) {
    const list = document.querySelector(`.clab-card[data-card-id="${cardId}"] .clab-area-list`);
    if (!list) return;
    newAreasArray.forEach(a => {
        const el = document.querySelector(`.clab-area[data-area-id="${a.id}"]`);
        if (el) list.appendChild(el); 
    });
}

export function generateAreaHTML(area, card) {
    if (area.type === 'edit') return generateInputHTML(area, card);
    if (area.type === 'preview') return generateOutputHTML(area, card);
    return '';
}

export function attachAreaEvents(container) {
    injectDnDCSS();
    attachInputEvents(container);
    attachOutputEvents(container);
    
    bindComboSelectEvents(container, state, () => {
        if (window._clabSurgicallyUpdateArea && appState.lastClickedAreaId) {
            window._clabSurgicallyUpdateArea(appState.lastClickedAreaId);
            justSave();
        } else {
            saveAndRender();
        }
    });

    container.querySelectorAll('.clab-del-area-btn').forEach(btn => {
        if (btn.dataset.clabEventsBound) return;
        btn.dataset.clabEventsBound = "1";
        
        btn.onclick = (e) => {
            e.stopPropagation();
            const { card: cardId, area: areaId } = e.target.dataset;
            const isSelected = state.selectedAreaIds && state.selectedAreaIds.includes(areaId);

            if (isSelected && state.selectedAreaIds.length > 1) {
                state.cards.forEach(c => {
                    if (c.areas) {
                        c.areas = c.areas.filter(a => !state.selectedAreaIds.includes(a.id));
                    }
                });
                state.selectedAreaIds.forEach(id => {
                    const el = document.querySelector(`.clab-area[data-area-id="${id}"]`);
                    if (el) el.remove(); 
                });
                state.selectedAreaIds = [];
            } else {
                const card = state.cards.find(c => c.id === cardId);
                if(card) {
                    card.areas = card.areas.filter(a => a.id !== areaId);
                    if (state.selectedAreaIds) {
                        state.selectedAreaIds = state.selectedAreaIds.filter(id => id !== areaId);
                    }
                    const el = document.querySelector(`.clab-area[data-area-id="${areaId}"]`);
                    if (el) el.remove(); 
                }
            }
            justSave();
            updateAllDefaultTitles(); 
        };
    });

    container.querySelectorAll('.clab-area-title-input').forEach(input => {
        if (input.dataset.clabEventsBound) return;
        input.dataset.clabEventsBound = "1";
        
        input.addEventListener('input', function() {
            this.size = Math.max(this.value.length, 2); 
        });
        input.onchange = (e) => {
            const { card: cardId, area: areaId } = e.target.dataset;
            const card = state.cards.find(c => c.id === cardId);
            const area = card?.areas.find(a => a.id === areaId);
            if (area) {
                const currentVal = e.target.value.trim();
                const defaultTitle = e.target.placeholder;
                area.title = (currentVal === defaultTitle || currentVal === '') ? '' : currentVal;
                justSave();
            }
        };
    });

    container.querySelectorAll('.clab-area').forEach(areaEl => {
        if (areaEl.dataset.clabEventsBound) return;
        areaEl.dataset.clabEventsBound = "1";
        
        // 銆愰槻寰¤ˉ涓併€戯細寮鸿纭繚鎵€鏈夋ā鍧楄妭鐐归兘鍏峰鍘熺敓鐗╃悊鎷栨嫿鑳藉姏
        areaEl.setAttribute('draggable', 'true');

        areaEl.addEventListener('contextmenu', (e) => {
            const areaId = areaEl.dataset.areaId;
            const cardId = areaEl.dataset.cardId;
            const card = state.cards.find(c => c.id === cardId);
            const area = card?.areas.find(a => a.id === areaId);

            if (area && area.type === 'preview' && area.resultUrl) {
                if (e.target.closest('.clab-preview-bg') || e.target.closest('.clab-history-thumb')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.CLab && window.CLab.showPreviewContextMenu) {
                        let targetUrl = area.resultUrl;
                        if (e.target.closest('.clab-history-thumb')) {
                            const thumbIdx = parseInt(e.target.closest('.clab-history-thumb').dataset.index, 10);
                            targetUrl = area.history[thumbIdx];
                        }
                        window.CLab.showPreviewContextMenu(e.clientX, e.clientY, cardId, areaId, targetUrl);
                    }
                }
            }
        });

        areaEl.addEventListener('dragstart', (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName) || e.target.closest('.clab-custom-select') || e.target.closest('.clab-bool-label') || e.target.closest('.clab-upload-zone') || e.target.closest('.clab-history-thumb') || e.target.closest('.clab-text-preview-shell') || e.target.closest('.clab-text-body-scroll') || e.target.closest('.clab-text-body-content')) {
                e.preventDefault();
                return;
            }
            
            e.stopPropagation(); 
            const currentAreaId = areaEl.dataset.areaId;

            let draggedIds = [currentAreaId];
            if (state.selectedAreaIds && state.selectedAreaIds.includes(currentAreaId)) {
                draggedIds = [...state.selectedAreaIds];
            }

            dragState.type = 'area';
            dragState.cardId = areaEl.dataset.cardId;   
            dragState.anchorAreaId = currentAreaId;     
            dragState.areaIds = draggedIds; 

            dragState.sourceInfo = {};
            state.cards.forEach(c => {
                if (c.areas) {
                    c.areas.forEach((a, idx) => {
                        if (draggedIds.includes(a.id)) {
                            dragState.sourceInfo[a.id] = { cardId: c.id, index: idx };
                        }
                    });
                }
            });
            
            // 銆愭牳蹇冧慨澶嶃€戯細涓烘柊鐢熷効锛堟柊寤哄伐浣滄祦涓垰娣诲姞鐨勬ā鍧楋級鎻愪緵鎴峰彛鏈ˉ褰曚繚闄?
            if (!dragState.sourceInfo[currentAreaId]) {
                state.cards.forEach(c => {
                    const idx = c.areas?.findIndex(a => a.id === currentAreaId);
                    if (idx !== -1 && idx !== undefined) {
                        dragState.sourceInfo[currentAreaId] = { cardId: c.id, index: idx };
                    }
                });
            }
            
            e.dataTransfer.effectAllowed = 'copyMove'; // 銆愪慨鏀广€戯細鍏佽鎷栨嫿鍛堢幇涓哄鍒?
            e.dataTransfer.setData('text/plain', 'area');
            
            setTimeout(() => {
                draggedIds.forEach(id => {
                    const el = document.querySelector(`.clab-area[data-area-id="${id}"]`);
                    if (el) el.classList.add('clab-dragging');
                });
            }, 0);
        });

        areaEl.addEventListener('dragend', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.clab-dragging').forEach(el => el.classList.remove('clab-dragging'));
            document.querySelectorAll('.clab-drag-over-area-top, .clab-drag-over-area-bottom').forEach(el => {
                el.classList.remove('clab-drag-over-area-top', 'clab-drag-over-area-bottom');
            });
            document.querySelectorAll('.clab-drag-over-list').forEach(el => el.classList.remove('clab-drag-over-list'));
            dragState.type = null; dragState.cardId = null; dragState.anchorAreaId = null; dragState.areaIds = null; dragState.sourceInfo = null; dragState.isClone = false;
        });

        areaEl.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds) {
                const targetAreaId = areaEl.dataset.areaId;
                const isClone = e.altKey; // 銆愭敞鍏ャ€戯細妫€娴嬫槸鍚︽寜涓嬩簡 Alt

                // 銆愭牳蹇冪獊鐮淬€戯細濡傛灉鏄Щ鍔ㄦā寮忥紝绂佹闄嶈惤鍒拌嚜宸辫韩涓婏紱濡傛灉鏄厠闅嗘ā寮忥紝鍒欏厑璁稿師鍦伴檷钀藉苟鍏嬮殕
                if (dragState.areaIds.includes(targetAreaId) && !isClone) return;

                e.preventDefault(); e.stopPropagation();
                e.dataTransfer.dropEffect = isClone ? 'copy' : 'move'; // 銆愭敞鍏ャ€戯細鏀瑰彉鍏夋爣鐗规晥

                const rect = areaEl.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    areaEl.classList.add('clab-drag-over-area-top');
                    areaEl.classList.remove('clab-drag-over-area-bottom');
                    areaEl.dataset.dropPosition = 'top';
                } else {
                    areaEl.classList.add('clab-drag-over-area-bottom');
                    areaEl.classList.remove('clab-drag-over-area-top');
                    areaEl.dataset.dropPosition = 'bottom';
                }
            }
        });

        areaEl.addEventListener('dragleave', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            e.stopPropagation();
            if (!areaEl.contains(e.relatedTarget)) {
                areaEl.classList.remove('clab-drag-over-area-top', 'clab-drag-over-area-bottom');
                delete areaEl.dataset.dropPosition;
            }
        });

        // 闄嶈惤闃舵 - 銆愬叏鏂扮粷瀵归暅鍍忓钩琛屾嫋鎷藉紩鎿?+ 鍏嬮殕鍒嗚鏀寔銆?
        areaEl.addEventListener('drop', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            if (dragState.type === 'area' && dragState.areaIds) {
                e.preventDefault(); e.stopPropagation();
                const dropPos = areaEl.dataset.dropPosition;
                areaEl.classList.remove('clab-drag-over-area-top', 'clab-drag-over-area-bottom');
                delete areaEl.dataset.dropPosition;
                
                const targetCardId = areaEl.dataset.cardId;
                const targetAreaId = areaEl.dataset.areaId;
                const isClone = e.altKey; // 銆愭牳蹇冩敞鍏ャ€戯細鍒ゆ柇鎸夐敭锛佽繘鍏?Alt 鍏嬮殕妯″紡
                
                if (dragState.areaIds.includes(targetAreaId) && !isClone) return;
                const isSameCard = (targetCardId === dragState.cardId);

                const movedAreasByCard = {};
                const allMovedAreas = []; 
                
                state.cards.forEach((c, cIdx) => {
                    movedAreasByCard[c.id] = [];
                    if (!c.areas) return;
                    const remainingAreas = [];
                    c.areas.forEach((a, aIdx) => {
                        if (dragState.areaIds.includes(a.id)) {
                            if (isClone) {
                                // 娣卞害鎷疯礉鐢熸垚鍏ㄦ柊鍏嬮殕浣擄紙甯︽棤鎹熷巻鍙茶褰曪級
                                const cloned = JSON.parse(JSON.stringify(a));
                                cloned.id = 'area_clone_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '_' + cIdx + '_' + aIdx;
                                movedAreasByCard[c.id].push(cloned);
                                allMovedAreas.push(cloned);
                                remainingAreas.push(a); // 鐣欎笅鍘熸湰鐨勬暟鎹笉鍓旈櫎锛?
                            } else {
                                movedAreasByCard[c.id].push(a);
                                allMovedAreas.push(a);
                            }
                        } else {
                            remainingAreas.push(a);
                        }
                    });
                    if (!isClone) c.areas = remainingAreas; // 浠呭湪绉诲姩鏃舵娊璧板師浠?
                });

                const targetCard = state.cards.find(c => c.id === targetCardId);
                if (targetCard) {
                    if (!targetCard.areas) targetCard.areas = [];
                    let targetIdx = targetCard.areas.findIndex(a => a.id === targetAreaId);
                    
                    if (targetIdx !== -1) {
                        if (dropPos === 'bottom') targetIdx += 1;
                    } else {
                        targetIdx = targetCard.areas.length;
                    }

                    if (isSameCard) {
                        // 銆愭牳蹇冧慨澶嶃€戯細鏀惧純瀹规槗閫犳垚姝т箟鐨勭浉瀵?delta 杩愮畻锛?
                        // 鐩存帴浣跨敤涓荤洰鏍囧崱鐗囩殑缁濆鎻掑叆浣嶇疆 (targetIdx) 浣滀负鍏ㄥ畤瀹欑殑闄嶈惤鍧愭爣锛?
                        state.cards.forEach(c => {
                            const moved = movedAreasByCard[c.id];
                            if (moved && moved.length > 0) {
                                // 寮哄埗鍦ㄥ悓涓€缁濆绱㈠紩澶勬墽琛屾彃鍏ワ紝杈炬垚瀹岀編鐨勫钩琛岄暅鍍忓悓姝ワ紒
                                let absoluteMirrorIdx = Math.max(0, Math.min(targetIdx, c.areas.length));
                                c.areas.splice(absoluteMirrorIdx, 0, ...moved);
                                
                                // 銆愭敞鍏ャ€戯細鍦ㄥ厠闅嗘ā寮忎笅涓哄叏鏂板厓绱犳棤缂濋摵璁?DOM
                                if (isClone) {
                                    const listEl = document.querySelector(`.clab-card[data-card-id="${c.id}"] .clab-area-list`);
                                    if (listEl) {
                                        moved.forEach(a => {
                                            const temp = document.createElement('div');
                                            temp.innerHTML = generateAreaHTML(a, c);
                                            listEl.appendChild(temp.firstElementChild);
                                        });
                                        attachAreaEvents(listEl);
                                    }
                                }

                                syncAreaDOMOrder(c.id, c.areas);
                                if (window._clabUpdateAreaDOMIdentity) moved.forEach(a => window._clabUpdateAreaDOMIdentity(a.id, c.id));
                            }
                        });
                    } else {
                        targetCard.areas.splice(targetIdx, 0, ...allMovedAreas);
                        
                        state.cards.forEach(c => {
                            if (!isClone && movedAreasByCard[c.id] && movedAreasByCard[c.id].length > 0 && c.id !== targetCardId) {
                                syncAreaDOMOrder(c.id, c.areas);
                            }
                        });
                        
                        // 銆愭敞鍏ャ€戯細鍦ㄨ法鍗＄墖鍏嬮殕妯″紡涓嬩负鍏ㄦ柊鍏冪礌鏃犵紳閾鸿 DOM
                        if (isClone) {
                            const listEl = document.querySelector(`.clab-card[data-card-id="${targetCardId}"] .clab-area-list`);
                            if (listEl) {
                                allMovedAreas.forEach(a => {
                                    const temp = document.createElement('div');
                                    temp.innerHTML = generateAreaHTML(a, targetCard);
                                    listEl.appendChild(temp.firstElementChild);
                                });
                                attachAreaEvents(listEl);
                            }
                        }

                        syncAreaDOMOrder(targetCardId, targetCard.areas);
                        if (window._clabUpdateAreaDOMIdentity) allMovedAreas.forEach(a => window._clabUpdateAreaDOMIdentity(a.id, targetCardId));
                    }
                    
                    // 銆愭柊澧炪€戯細鍏嬮殕瀹屾垚鍚庯紝灏嗛€変腑鐘舵€佽嚜鍔ㄨ浆绉诲埌鏂扮敓鎴愮殑鎵€鏈夋ā鍧椾笂
                    if (isClone && allMovedAreas.length > 0) {
                        state.selectedAreaIds = allMovedAreas.map(a => a.id);
                        updateSelectionUI();
                    }
                    
                    justSave();
                    updateAllDefaultTitles(); 
                }
            }
        });
    });
}
