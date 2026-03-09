/**
 * 文件名: action_batch_sync.js
 * 路径: web/components/actions/action_batch_sync.js
 * 职责: 负责任务卡片之间的模块同步、匹配、删除及批量位移逻辑 (全微创更新版)
 */
import { state, saveAndRender } from "../ui_state.js";
import { updateSelectionUI } from "../ui_selection.js"; // 【修复】：直接引入纯净选择态引擎
import { generateSingleCardHTML, attachCardEvents } from "../comp_taskcard.js"; // 【修复】：引入物理级卡片创建引擎

// 获取模块比对的标题（如果未命名则根据类型计算默认的 ##1, ##2）
export function getAreaDisplayTitle(card, area) {
    if (area.title) return area.title;
    const sameTypeAreas = card.areas.filter(a => a.type === area.type);
    const idx = sameTypeAreas.findIndex(a => a.id === area.id) + 1;
    return `##${idx}`;
}

// =========================================================================
// 核心逻辑 1：同步参数 (点穴级多目标爆破)
// =========================================================================
export function execSyncParams(mainArea, mainCard) {
    const matchTitle = getAreaDisplayTitle(mainCard, mainArea);
    if (!mainArea.title && !confirm(`当前选中模块未命名 (默认标记为 ${matchTitle})。确定要将参数同步给其它任务中对应位置的模块吗？`)) {
        return;
    }
    
    let updatedIds = [];
    state.cards.forEach(card => {
        card.areas?.forEach(a => {
            if (a.id !== mainArea.id && a.type === mainArea.type && getAreaDisplayTitle(card, a) === matchTitle) {
                a.targetNodeId = mainArea.targetNodeId;
                a.targetWidget = mainArea.targetWidget;
                a.targetNodeIds = Array.isArray(mainArea.targetNodeIds) ? [...mainArea.targetNodeIds] : [];
                a.targetWidgets = Array.isArray(mainArea.targetWidgets) ? [...mainArea.targetWidgets] : [];
                a.dataType = mainArea.dataType;
                a.autoHeight = mainArea.autoHeight;
                a.ratio = mainArea.ratio;
                a.width = mainArea.width;
                a.height = mainArea.height;
                a.matchMedia = mainArea.matchMedia;
                a.fillMode = mainArea.fillMode;
                updatedIds.push(a.id);
            }
        });
    });

    if (updatedIds.length > 0) {
        updatedIds.forEach(id => {
            if (window._clabSurgicallyUpdateArea) window._clabSurgicallyUpdateArea(id);
        });
        if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
    }
}

// =========================================================================
// 核心逻辑 2：删除相同模块 (物理摘除，自动重排序号)
// =========================================================================
export function execDeleteSameModules(mainArea, mainCard) {
    const matchTitle = getAreaDisplayTitle(mainCard, mainArea);
    const typeName = mainArea.type === 'edit' ? '输入' : '输出';
    if (!confirm(`⚠️ 危险操作：\n确定要删除所有任务中，标识为 [${matchTitle}] 的${typeName}模块吗？`)) return;

    let deletedIds = [];
    state.cards.forEach(card => {
        if (card.areas) {
            const toDelete = card.areas.filter(a => a.type === mainArea.type && getAreaDisplayTitle(card, a) === matchTitle);
            toDelete.forEach(a => deletedIds.push(a.id));
            card.areas = card.areas.filter(a => !(a.type === mainArea.type && getAreaDisplayTitle(card, a) === matchTitle));
        }
    });
    
    state.selectedAreaIds = [];
    
    if (deletedIds.length > 0) {
        deletedIds.forEach(id => {
            const el = document.querySelector(`.clab-area[data-area-id="${id}"]`);
            if (el) el.remove();
        });
        
        // 【核心修复】：显式调用模块 UI 选择态刷新，彻底防闪屏
        updateSelectionUI();
        
        // 自动纠正被删后可能乱掉的序号
        if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
        
        if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
    }
}

// =========================================================================
// 核心逻辑 3：选择相同模块 (仅改变 CSS 选择态，拒绝重绘)
// =========================================================================
export function execSelectSameModules(selectedAreas) {
    const matchCriteria = selectedAreas.map(sa => ({
        type: sa.area.type,
        title: getAreaDisplayTitle(sa.card, sa.area)
    }));
    
    const newSelection = [];
    state.cards.forEach(card => {
        card.areas?.forEach(a => {
            const isMatch = matchCriteria.some(criteria => 
                a.type === criteria.type && getAreaDisplayTitle(card, a) === criteria.title
            );
            if (isMatch) newSelection.push(a.id);
        });
    });
    
    state.selectedAreaIds = Array.from(new Set(newSelection)); 
    
    // 【核心修复】：直接调用原生的选择 UI 刷新，取消外部 window 对象的判定依赖，彻底消灭重绘
    updateSelectionUI();
}

// =========================================================================
// 核心逻辑 4：批量向后移动 (DOM 物理位移，支持无感创建卡片)
// =========================================================================
export function execMoveBackward(selectedAreaIds) {
    for (let i = state.cards.length - 1; i >= 0; i--) {
        const card = state.cards[i];
        if (!card.areas) continue;
        
        const areasToMove = card.areas.map((a, idx) => ({a, idx})).filter(item => selectedAreaIds.includes(item.a.id));
        if (!areasToMove.length) continue;

        card.areas = card.areas.filter(a => !selectedAreaIds.includes(a.id));

        let targetCardIndex = i + 1;
        let targetCard;

        // 【核心升级】：向后溢出时，触发外科手术级动态创建卡片，彻底干掉 needsFullRender 全局重绘！
        if (targetCardIndex >= state.cards.length) {
            const newCard = { id: 'card_' + Date.now() + '_' + Math.floor(Math.random()*1000), title: '', areas: [] };
            state.cards.push(newCard);
            targetCard = newCard;

            // 进行物理级 DOM 插入
            const wrapper = document.querySelector('.clab-cards-wrapper');
            if (wrapper) {
                const temp = document.createElement('div');
                temp.innerHTML = generateSingleCardHTML(newCard, state.cards.length - 1);
                const newEl = temp.firstElementChild;
                const addBtn = wrapper.querySelector('.clab-add-card-inline');
                
                if (addBtn) wrapper.insertBefore(newEl, addBtn);
                else wrapper.appendChild(newEl);
                
                attachCardEvents(wrapper);
                if (window._clabUpdateCardsLayout) window._clabUpdateCardsLayout();
            }
        } else {
            targetCard = state.cards[targetCardIndex];
        }
        
        if (!targetCard.areas) targetCard.areas = [];

        areasToMove.forEach(item => {
            const targetIdx = Math.min(targetCard.areas.length, item.idx);
            targetCard.areas.splice(targetIdx, 0, item.a);
        });
    }
    
    // 利用 appendChild 的特性，将现存 DOM 直接拽入新顺序，物理级防闪烁
    state.cards.forEach(card => {
        const list = document.querySelector(`.clab-card[data-card-id="${card.id}"] .clab-area-list`);
        if (list && card.areas) {
            card.areas.forEach(a => {
                const el = document.querySelector(`.clab-area[data-area-id="${a.id}"]`);
                if (el) {
                    list.appendChild(el);
                    // 顺便把位移过后的模块的旧户口本换成新卡片
                    if (window._clabUpdateAreaDOMIdentity) window._clabUpdateAreaDOMIdentity(a.id, card.id);
                }
            });
        }
    });
    
    if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
    if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
}

// =========================================================================
// 核心逻辑 5：批量向前移动 (DOM 物理位移)
// =========================================================================
export function execMoveForward(selectedAreaIds) {
    for (let i = 0; i < state.cards.length; i++) {
        const card = state.cards[i];
        if (!card.areas) continue;
        
        const areasToMove = card.areas.map((a, idx) => ({a, idx})).filter(item => selectedAreaIds.includes(item.a.id));
        if (!areasToMove.length) continue;

        let targetCardIndex = i - 1;
        if (targetCardIndex < 0) {
            targetCardIndex = 0; 
            if (i === 0) continue; 
        }

        card.areas = card.areas.filter(a => !selectedAreaIds.includes(a.id));

        const targetCard = state.cards[targetCardIndex];
        if (!targetCard.areas) targetCard.areas = [];

        areasToMove.forEach(item => {
            const targetIdx = Math.min(targetCard.areas.length, item.idx);
            targetCard.areas.splice(targetIdx, 0, item.a);
        });
    }
    
    // 利用 appendChild 的特性，将现存 DOM 直接拽入新顺序，物理级防闪烁
    state.cards.forEach(card => {
        const list = document.querySelector(`.clab-card[data-card-id="${card.id}"] .clab-area-list`);
        if (list && card.areas) {
            card.areas.forEach(a => {
                const el = document.querySelector(`.clab-area[data-area-id="${a.id}"]`);
                if (el) {
                    list.appendChild(el);
                    if (window._clabUpdateAreaDOMIdentity) window._clabUpdateAreaDOMIdentity(a.id, card.id);
                }
            });
        }
    });
    
    if (window._clabUpdateAllDefaultTitles) window._clabUpdateAllDefaultTitles();
    if (window._clabJustSave) window._clabJustSave(); else saveAndRender();
}

// =========================================================================
// 供 Toolbar 动态挂载使用
// =========================================================================
export function attachBatchSyncEvents(tb, selectedAreas) {
    const batchBtn = tb.querySelector('#tb-batch-sync-btn');
    const batchDropdown = tb.querySelector('#tb-batch-sync-dropdown');
    
    if (!batchBtn || !batchDropdown) return;

    batchBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = batchDropdown.style.display === 'block';
        document.querySelectorAll('.clab-custom-select.open').forEach(other => other.classList.remove('open'));
        document.querySelectorAll('.clab-custom-select-dropdown').forEach(d => {
            if (d !== batchDropdown && d.closest('#clab-module-toolbar')) d.style.display = 'none';
        });
        batchDropdown.style.display = isVisible ? 'none' : 'block';
    };

    tb.querySelector('#clab-batch-sync-params').onclick = (e) => {
        e.stopPropagation(); batchDropdown.style.display = 'none';
        if (selectedAreas.length) execSyncParams(selectedAreas[0].area, selectedAreas[0].card);
    };

    tb.querySelector('#clab-batch-delete-modules').onclick = (e) => {
        e.stopPropagation(); batchDropdown.style.display = 'none';
        if (selectedAreas.length) execDeleteSameModules(selectedAreas[0].area, selectedAreas[0].card);
    };

    tb.querySelector('#clab-batch-select-same').onclick = (e) => {
        e.stopPropagation(); batchDropdown.style.display = 'none';
        if (selectedAreas.length) execSelectSameModules(selectedAreas);
    };

    tb.querySelector('#clab-batch-move-backward').onclick = (e) => {
        e.stopPropagation(); batchDropdown.style.display = 'none';
        if (state.selectedAreaIds.length) execMoveBackward(state.selectedAreaIds);
    };

    tb.querySelector('#clab-batch-move-forward').onclick = (e) => {
        e.stopPropagation(); batchDropdown.style.display = 'none';
        if (state.selectedAreaIds.length) execMoveForward(state.selectedAreaIds);
    };
}