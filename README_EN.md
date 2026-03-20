# ComfyUI-CreativeLab (CLab)

**[简体中文 README](README.md)**

CLab (Creative Lab) is an immersive, card-based task panel for ComfyUI. With a fully decoupled architecture, it lets you manage, clone, and batch multiple tasks and parameter sets like a pro NLE—without rewiring your graph.

https://github.com/user-attachments/assets/535a99a4-1c8a-4c2e-94d2-b4aabb8171ce

---

### 💡 How do I open the panel?

- **Hotkey:** Press **`C`** on the keyboard (customizable in Settings).
- **UI:** Click the **CLab** icon in the top menu bar on the right.

    ![Menu toolbar](images/meun_tool.png)

---

### 🏷️ Task cards

https://github.com/user-attachments/assets/95d58bab-34d8-4d13-a61b-6de866037679

1. **New task**
    - **Default:** With nothing selected, appends a new task card at the end of the list.
    - **When something is selected:** Inserts a new card right after the selected card or module and moves focus.
2. **List interactions**
    - **Select:** Click a card; hold **Ctrl** for multi-select.
    - **2D range select (Shift):** Extend selection across cards—not only within one card. Example: select module 2 on card 1, hold **Shift**, click module 4 on card 4; modules 2–4 on cards 1–4 are selected, with input/output types kept separate to avoid mistakes.
    - **Delete:** Hover a card and click **✖** in the corner (batch delete when multiple cards are selected).
    - **Reorder:** Drag cards; a center-line rule decides insert-before vs insert-after. Multi-selected cards move together.
      - **Alt + drag clone:** While dragging any card, hold **Alt** for physical clone mode (pointer shows **+**). On drop, a **deep copy** is created (bindings and full output history preserved); the original stays. Focus moves to the new card.

3. **Titles & progress**
    - **Auto numbering:** Each card title defaults to `#1`, `#2`, …; click to customize.
    - **Auto renumbering:** Default `#` / `##` slots stay consistent after create/delete/reorder—no manual upkeep.
    - **Progress bar & error halt:** The thin line under the title is the progress bar. When you run, it jumps to ~5% blue while queued. On graph/runtime errors it turns **red (pulsing)**, a toast appears, and **remaining queued tasks are cancelled** to avoid error spam.

4. **Toolbar (card level)**
    - **Clone:** Mirrors the selected card(s)—modules, toolbar state, values, and **output history**. Batch clone supported.
    - **Format painter:** Copies layout & bindings from the source card (**strips** old preview media/history).
        - **Paint on empty space:** Creates a **new** card with **all parameter values** carried over.
        - **Paint on an existing card:** Overwrites layout/bindings but **keeps** the target’s existing values (e.g. prompts). If new slots appear, they get the painter’s defaults. _Feature still evolving._

---

### 🧩 Modules

https://github.com/user-attachments/assets/f662718d-4038-4678-b940-f737c8bb4d5b

1. **New module**
    - **Card selected:** Appends a blank module at the end of that card. Multiple cards → batch insert on each.
    - **Module(s) selected:** Inserts **below every selected module** (reverse-order algorithm so indices stay correct across many modules/cards).

2. **Module interactions**
    - **Select:** Click anywhere on the module (including inputs); Ctrl / Shift 2D range as above.
    - **Delete:** **✖** on hover (batch with multi-select).
    - **Parallel drag:** With modules selected on different cards, dragging one **within its card** moves others by the **same index delta** on their cards.
    - **Cross-card merge:** Drag selected modules onto another card—they **gather** at the drop index on the target card.
    - **Alt + drag:** Same as above but **clone**—deep copy including history; originals unchanged; focus moves to clones.

3. **Toolbar (module level)**
    - **Type:** Toggle **Input** / **Output**.
    - **Input-only:**
        - **Link node:** Tree dropdown; multiple nodes supported.
        - **Multi-node / multi-widget binding:** Both dropdowns support **multi-select**; one input can drive many widgets. Title may show `widget[nodeId1][nodeId2]`.
        - **Picker (crosshair) — click mode:**
            - **Left-click node:** **Replace** linked node; clears previous widget bindings.
            - **Right-click node:** **Append** another linked node (native context menu suppressed while picking).
        - **Primitive passthrough:** Picking a `Primitive` follows links to the **real** target node/widget.
        - **Bind widget:** Renders text / checkbox / combo from widget types.
            - **Value preservation:** Re-binding or picking a node **does not overwrite** text you already typed when it’s a manual field.
        - **Media upload zones:** If the bound widget is image/video/audio with `upload: true`, the module becomes a drop zone—**drag local files** to upload and bind.
        - **Auto-growing text:** Text areas expand with content.
    - **Output-only:**
        - **Link / pick node:** Single output node to capture previews.
        - **Aspect presets:** 16:9, 1:1, etc.
        - **W / H:** Custom ratio after Enter.
        - **Fit mode:** Contain / cover / stretch in the preview frame.
        - **Match media aspect:** Overrides ratio with actual media dimensions after run.
        - **Manage generations:** Grid view for history.
    - **Shared:**
        - **Reset:** Clear bindings and module settings.
        - **Sync parameters:** Push bindings to **same-title** modules on other cards.
        - **Clone / format painter:** Same semantics as card level.

4. **Content**
    - **Input:** Title defaults to `##1`, `##2`, …; values go to bound widgets.
    - **Output:** **`←` / `→`** to step through history when the module is focused.

5. **Context menu**
    - **Content (output):** Download / download all history; remove one record; clear all records; clean dead (404) / resync.
    - **Module:** Select same title; delete same (destructive); batch move backward/forward across cards.

### 📥 Import

https://github.com/user-attachments/assets/12f6ba64-4524-4fd9-959b-0c2c0995b16e

- **Clipboard JSON**
    - **New task:** Append as new card(s).
    - **Append modules:** Smart append; creates cards if needed.
    - **Append to selection:** 1:1 map onto currently selected cards.
- **Local JSON file:** Same three modes.

### 📤 Export

https://github.com/user-attachments/assets/210a6e66-6e42-46a1-a41a-4ff33db10b9e

- **ZIP**
    - **Download all / selected:** Current visible outputs only.
    - **…(full history):** Every item in history for included modules.
- **Organize files**
    - **Move / copy to subfolder:** Physically move or copy into the workflow archive folder with renaming; URLs refreshed to avoid broken previews.
    - **…(full history):** Same for every history entry.
- **Export JSON:** Use copy/download toggles in the export menu—input only, output only, all modules; optional full history variants.

### ▶️ Run

https://github.com/user-attachments/assets/293f831d-b290-43e9-8515-6b9aa75a7b85

- **Run:** Context-aware queueing.
    - **Card selected:** Inject inputs and run **all** preview nodes on that card.
    - **Input module selected:** Same as selecting the parent card.
    - **Output module selected (pruned run):** Only the subgraph needed for **that** output—saves VRAM.
- **Run all:** Queue **every** card in order.
- **Run count (interleaved batch):** The number next to Run repeats the whole selection in an **A B A B** pattern (not AAA BBB)—handy for A/B sweeps.

### ⚓ Config node & maintenance

https://github.com/user-attachments/assets/baa0e006-7050-4007-af0b-3051621e649b

- **Create config anchor:** Spawns `CLab_SystemConfig` on the graph; panel state is stored as JSON and saved with **Ctrl+S**.
- **Clean dead records (maintenance menu):** Front-end HEAD probes; drops 404 URLs from history.
- **Resync records:** Cache-bust (`t=` on URLs) to pull freshly edited files from disk.
- **Global 404 handling:** Failed media loads show an in-place “missing media” state instead of a broken icon.

### 🎛️ Media widgets

https://github.com/user-attachments/assets/896f42b5-838b-4f9d-a1cb-6c8999cfb38f

- **Video:** Custom player—wheel scrub (timecode shows `MM:SS:FF`), click-to-seek bar, volume slider (expand from speaker; reverses visually as documented upstream), play/pause, speed, fullscreen / PiP. No-audio streams gray out mute.
- **Audio:** Gradient UI, progress, volume, speed capsule.
- **Generic files:** Fallback card with download link when no preview exists.
- **History grid:** Lightweight video thumbs (`#t=0.1`); Ctrl/Shift multi-select; **✖** removes selected entries in batch.

### 📁 Asset catalog

- **Save path (intercept):** Outputs can be copied/renamed under `output/CLab` (or your **Archive folder** in Settings).
- **Restore:** Load workflow → read config JSON → panel state rebuilds → media fetched from persisted paths.

### 👁️ View

- **Math-based layout:** Card width/scroll layout without waiting on layout thrash.
- **Width slider:** Bottom-left (numeric input supported).
- **Reset width:** Icon left of the slider restores default card width.

## ⚙️ Settings

Open ComfyUI **Settings** → **`Creative Lab`**:

![Settings](images/setting.png)

### 1. General

- **Restore all defaults**
- **Shortcut** to toggle the panel
- **Backdrop blur** & **panel background opacity**

### 2. Performance & media

- **Max history** per output module
- **Autoplay video** / **Video muted by default**
- **High-performance thumbnails** (first-frame only in grid)

### 3. Files & data flow

- **Archive folder** name (default `CLab`)
- **Keep temp files** after intercept
- **Filename prefix** for intercept saves (default `pix`)

### 4. Automation

- **Halt queue on error** vs skip failed tasks and continue

### 5. Card appearance (selection)

- Glow, fill opacity, border width, accent color

### 6. Module appearance (selection)

- Same knobs for module selection highlight

---

### 🌐 Internationalization

Panel UI strings (not Comfy’s built-in node defs) live under `locales/*/main.json` → **`clabUi`**, loaded via **`GET /i18n`**. After editing locale files, **restart ComfyUI** so the server cache refreshes.

**Maintainer workflow:** keys and copy are authored in **`locales/zh` first** (Simplified Chinese as the source of truth), then mirrored to `en` and other locales; `clabT` falls back **zh → en** when a translation is missing.

- **[Internationalization guide](web/docs/国际化指南.md)** (Chinese; covers `clabT`, refresh hooks, and namespace tables)

---

## 📖 Changelog & docs

> Most linked docs are **Chinese**; PRs welcome for translations.

- [Changelog](web/docs/更新日志.md)
- [Developer guide](web/docs/开发指南.md)
- [Feature map (dev)](web/docs/开发者功能映射手册.md)
- [Multi-select & advanced drag](web/docs/多选护盾与高级拖拽.md)
- [Run count & batching](web/docs/运行次数与批处理机制.md)
- [Assets & state sync](web/docs/资产管理与状态同步原理.md)
- [Refactor notes](web/docs/局部微创更新重构记录.md)

## 🤙 Contact

Please open an **Issue** for bugs or ideas.

- Bilibili: [噼哩画啦](https://space.bilibili.com/1370099549)
- Email: pixixai@gmail.com · pixixai@qq.com
