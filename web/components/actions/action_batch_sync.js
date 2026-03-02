/**
 * 文件名: action_batch_sync.js
 * 路径: web/components/actions/action_batch_sync.js
 * 职责: 负责任务卡片之间的模块同步、匹配、删除及批量位移逻辑
 */
import { state, saveAndRender } from "../ui_state.js";

// 获取模块比对的标题（如果未命名则根据类型计算默认的 ##1, ##2）
function getAreaDisplayTitle(card, area) {
    if (area.title) return area.title;
    const sameTypeAreas = card.areas.filter(a => a.type === area.type);
    const idx = sameTypeAreas.findIndex(a => a.id === area.id) + 1;
    return `##${idx}`;
}

export function attachBatchSyncEvents(tb, selectedAreas) {
    const batchBtn = tb.querySelector('#tb-batch-sync-btn');
    const batchDropdown = tb.querySelector('#tb-batch-sync-dropdown');
    
    if (!batchBtn || !batchDropdown) return;

    batchBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = batchDropdown.style.display === 'block';
        document.querySelectorAll('.sl-custom-select.open').forEach(other => other.classList.remove('open'));
        document.querySelectorAll('.sl-custom-select-dropdown').forEach(d => {
            if (d !== batchDropdown && d.closest('#sl-module-toolbar')) d.style.display = 'none';
        });
        batchDropdown.style.display = isVisible ? 'none' : 'block';
    };

    // 1. 同步参数
    tb.querySelector('#sl-batch-sync-params').onclick = (e) => {
        e.stopPropagation();
        batchDropdown.style.display = 'none';
        if (!selectedAreas.length) return;
        
        const mainArea = selectedAreas[0].area;
        const mainCard = selectedAreas[0].card;
        const matchTitle = getAreaDisplayTitle(mainCard, mainArea);
        
        if (!mainArea.title && !confirm(`当前选中模块未命名 (默认标记为 ${matchTitle})。确定要将参数同步给其它任务中对应位置的模块吗？`)) {
            return;
        }

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
                }
            });
        });
        saveAndRender();
    };

    // 2. 删除相同模块
    tb.querySelector('#sl-batch-delete-modules').onclick = (e) => {
        e.stopPropagation();
        batchDropdown.style.display = 'none';
        if (!selectedAreas.length) return;
        
        const mainArea = selectedAreas[0].area;
        const mainCard = selectedAreas[0].card;
        const matchTitle = getAreaDisplayTitle(mainCard, mainArea);
        const typeName = mainArea.type === 'edit' ? '输入' : '输出';
        
        if (!confirm(`⚠️ 危险操作：\n确定要删除所有任务中，标识为 [${matchTitle}] 的${typeName}模块吗？`)) return;

        state.cards.forEach(card => {
            if (card.areas) {
                card.areas = card.areas.filter(a => !(a.type === mainArea.type && getAreaDisplayTitle(card, a) === matchTitle));
            }
        });
        state.selectedAreaIds = [];
        saveAndRender();
    };

    // 3. 选择相同模块 (支持多选特征匹配)
    tb.querySelector('#sl-batch-select-same').onclick = (e) => {
        e.stopPropagation();
        batchDropdown.style.display = 'none';
        if (!selectedAreas.length) return;
        
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
        saveAndRender();
    };

    // 4. 批量向后移动 (索引 +1)
    tb.querySelector('#sl-batch-move-backward').onclick = (e) => {
        e.stopPropagation();
        batchDropdown.style.display = 'none';
        if (!state.selectedAreaIds.length) return;

        for (let i = state.cards.length - 1; i >= 0; i--) {
            const card = state.cards[i];
            if (!card.areas) continue;
            
            const areasToMove = card.areas.map((a, idx) => ({a, idx})).filter(item => state.selectedAreaIds.includes(item.a.id));
            if (!areasToMove.length) continue;

            card.areas = card.areas.filter(a => !state.selectedAreaIds.includes(a.id));

            let targetCardIndex = i + 1;
            if (targetCardIndex >= state.cards.length) {
                state.cards.push({ id: 'card_' + Date.now() + Math.random(), title: '', areas: [] });
            }
            
            const targetCard = state.cards[targetCardIndex];
            if (!targetCard.areas) targetCard.areas = [];

            areasToMove.forEach(item => {
                const targetIdx = Math.min(targetCard.areas.length, item.idx);
                targetCard.areas.splice(targetIdx, 0, item.a);
            });
        }
        saveAndRender();
    };

    // 5. 批量向前移动 (索引 -1)
    tb.querySelector('#sl-batch-move-forward').onclick = (e) => {
        e.stopPropagation();
        batchDropdown.style.display = 'none';
        if (!state.selectedAreaIds.length) return;

        for (let i = 0; i < state.cards.length; i++) {
            const card = state.cards[i];
            if (!card.areas) continue;
            
            const areasToMove = card.areas.map((a, idx) => ({a, idx})).filter(item => state.selectedAreaIds.includes(item.a.id));
            if (!areasToMove.length) continue;

            let targetCardIndex = i - 1;
            if (targetCardIndex < 0) {
                targetCardIndex = 0; 
                if (i === 0) continue; 
            }

            card.areas = card.areas.filter(a => !state.selectedAreaIds.includes(a.id));

            const targetCard = state.cards[targetCardIndex];
            if (!targetCard.areas) targetCard.areas = [];

            areasToMove.forEach(item => {
                const targetIdx = Math.min(targetCard.areas.length, item.idx);
                targetCard.areas.splice(targetIdx, 0, item.a);
            });
        }
        saveAndRender();
    };
}