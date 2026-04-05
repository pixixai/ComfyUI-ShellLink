/**
 * 文件名: clab_settings.js
 * 职责: 注册与管理 CLab 插件在 ComfyUI 原生设置面板中的各项配置
 * 注意: ComfyUI 的设置项渲染逻辑是先进后出 (LIFO)，即在数组中越靠前，显示在 UI 上就越靠下。
 */
import { app } from "../../scripts/app.js";

// --- 全局配置默认值与解析引擎 ---
function parseShortcut(shortcutStr) {
    if (!shortcutStr) return { key: 'c', ctrl: false, shift: false, alt: false, meta: false };
    const parts = shortcutStr.toLowerCase().split('+').map(s => s.trim());
    const parsed = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
    
    parts.forEach(part => {
        if (part === 'ctrl' || part === 'control') parsed.ctrl = true;
        else if (part === 'shift') parsed.shift = true;
        else if (part === 'alt' || part === 'option') parsed.alt = true;
        else if (part === 'meta' || part === 'cmd' || part === 'win' || part === 'windows') parsed.meta = true;
        else parsed.key = part; 
    });
    return parsed;
}

// 内存中缓存全局变量，供各个 JS 模块极速读取
window._clabShortcutRaw = 'C'; 
window._clabShortcutParsed = parseShortcut('C');
window._clabBgBlur = true;
window._clabBgOpacity = 45;
window._clabPanelWidthPercent = 80;
window._clabPanelHeightPercent = 80;
window._clabMaxHistory = 50;
window._clabVideoAutoplay = true;
window._clabVideoMuted = true;
window._clabSyncHistoryParams = true;
window._clabThumbPerfMode = false; // 默认关闭高性能缩略图模式
window._clabArchiveDir = 'CLab'; 
window._clabDeleteTemp = false; 
window._clabFilePrefix = 'pix';
window._clabHaltOnError = true; 

// =========================================================================
// 全新主题专属变量 
// =========================================================================
window._clabThemeCardColor = '4caf50';
window._clabThemeCardBorder = 2;
window._clabThemeCardFill = 8;
window._clabThemeCardGlow = 15;

window._clabThemeModuleColor = '2196f3';
window._clabThemeModuleBorder = 1;
window._clabThemeModuleFill = 5;
window._clabThemeModuleGlow = 10;

// 【核心】：动态主题注入引擎 (支持透明度自动运算)
window._clabApplyTheme = function() {
    const root = document.documentElement;

    let cHex = (window._clabThemeCardColor || '4caf50').replace('#', '');
    if (cHex.length !== 6) cHex = '4caf50';
    let mHex = (window._clabThemeModuleColor || '2196f3').replace('#', '');
    if (mHex.length !== 6) mHex = '2196f3';

    // 辅助运算：将 0~100 的百分比转换为 00~FF 的 16 进制 Alpha 通道
    const toHexAlpha = (percent) => {
        let val = Math.round((percent / 100) * 255);
        if (val < 0) val = 0; if (val > 255) val = 255;
        return val.toString(16).padStart(2, '0').toUpperCase();
    };

    // 1. 卡片主题 (固定发光透明度，动态计算内部填充透明度)
    root.style.setProperty('--clab-theme-card', `#${cHex}`);
    root.style.setProperty('--clab-theme-card-alpha', `#${cHex}4D`); // 30% 阴影
    root.style.setProperty('--clab-theme-card-bg', `#${cHex}${toHexAlpha(window._clabThemeCardFill)}`); 
    root.style.setProperty('--clab-theme-card-hover', `#${cHex}1A`); // 10% 悬停
    
    // 2. 模块主题
    root.style.setProperty('--clab-theme-module', `#${mHex}`);
    root.style.setProperty('--clab-theme-module-alpha', `#${mHex}66`); // 40% 阴影
    root.style.setProperty('--clab-theme-module-bg', `#${mHex}${toHexAlpha(window._clabThemeModuleFill)}`);

    // 3. 描边与发光强度映射
    root.style.setProperty('--clab-theme-card-border', `${window._clabThemeCardBorder}px`);
    root.style.setProperty('--clab-theme-card-glow', `${window._clabThemeCardGlow}px`);
    root.style.setProperty('--clab-theme-module-border', `${window._clabThemeModuleBorder}px`);
    root.style.setProperty('--clab-theme-module-glow', `${window._clabThemeModuleGlow}px`);
};

function normalizePanelPercent(value, fallback = 80) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(40, Math.min(100, Math.round(num)));
}

window._clabApplyPanelLayout = function() {
    const panel = document.getElementById('clab-panel');
    if (!panel) return;

    const widthPercent = normalizePanelPercent(window._clabPanelWidthPercent, 80);
    const heightPercent = normalizePanelPercent(window._clabPanelHeightPercent, 80);

    const leftPercent = Math.max(0, (100 - widthPercent) / 2);
    const topPercent = Math.max(0, (100 - heightPercent) / 2);
    panel.style.inset = '';
    panel.style.top = `${topPercent}vh`;
    panel.style.left = `${leftPercent}vw`;
    panel.style.width = `${widthPercent}vw`;
    panel.style.height = `${heightPercent}vh`;
    panel.style.borderRadius = '12px';
    panel.style.border = '';
};

// LIFO 倒序数组：代码越靠前，UI 界面显示越靠下
const clabSettings = [
    
    // =========================================================================
    // 6. 模块选中态外观 (Module Appearance) - 显示在最底部
    // =========================================================================
    {
        id: "CLab.6-ModuleApp.Glow",
        name: "Neon Glow",
        type: "slider",
        defaultValue: 10,
        attrs: { min: 0, max: 30, step: 1 },
        category: ["Creative Lab", "6-ModuleApp", "Glow"],
        tooltip: "Outer glow blur radius when a module is selected. Set to 0 to disable.",
        onChange: (newVal) => {
            window._clabThemeModuleGlow = newVal;
            if (window._clabApplyTheme) window._clabApplyTheme();
        }
    },
    {
        id: "CLab.6-ModuleApp.Fill",
        name: "Fill Opacity (%)",
        type: "slider",
        defaultValue: 5,
        attrs: { min: 0, max: 100, step: 1 },
        category: ["Creative Lab", "6-ModuleApp", "Fill"],
        tooltip: "Opacity of the highlight background when a module is selected (0 is fully transparent).",
        onChange: (newVal) => {
            window._clabThemeModuleFill = newVal;
            if (window._clabApplyTheme) window._clabApplyTheme();
        }
    },
    {
        id: "CLab.6-ModuleApp.Border",
        name: "Border Width (px)",
        type: "slider",
        defaultValue: 1,
        attrs: { min: 1, max: 4, step: 1 },
        category: ["Creative Lab", "6-ModuleApp", "Border"],
        tooltip: "Border thickness when a module is selected.",
        onChange: (newVal) => {
            window._clabThemeModuleBorder = newVal;
            if (window._clabApplyTheme) window._clabApplyTheme();
        }
    },
    {
        id: "CLab.6-ModuleApp.Color",
        name: "Highlight Color",
        type: "color",
        defaultValue: "2196f3",
        category: ["Creative Lab", "6-ModuleApp", "Color"],
        tooltip: "Primary color when a module (input/output area) is selected. Default: #2196F3 (Light Blue).",
        onChange: (newVal) => {
            window._clabThemeModuleColor = newVal;
            if (window._clabApplyTheme) window._clabApplyTheme();
        }
    },

    // =========================================================================
    // 5. 任务卡片选中态外观 (Card Appearance)
    // =========================================================================
    {
        id: "CLab.5-CardApp.Glow",
        name: "Neon Glow",
        type: "slider",
        defaultValue: 15,
        attrs: { min: 0, max: 50, step: 1 },
        category: ["Creative Lab", "5-CardApp", "Glow"],
        tooltip: "Outer glow radius when a card is selected. Max out for cyberpunk style.",
        onChange: (newVal) => {
            window._clabThemeCardGlow = newVal;
            if (window._clabApplyTheme) window._clabApplyTheme();
        }
    },
    {
        id: "CLab.5-CardApp.Fill",
        name: "Fill Opacity (%)",
        type: "slider",
        defaultValue: 8,
        attrs: { min: 0, max: 100, step: 1 },
        category: ["Creative Lab", "5-CardApp", "Fill"],
        tooltip: "Opacity of the highlight background when a card is selected.",
        onChange: (newVal) => {
            window._clabThemeCardFill = newVal;
            if (window._clabApplyTheme) window._clabApplyTheme();
        }
    },
    {
        id: "CLab.5-CardApp.Border",
        name: "Border Width (px)",
        type: "slider",
        defaultValue: 2,
        attrs: { min: 1, max: 6, step: 1 },
        category: ["Creative Lab", "5-CardApp", "Border"],
        tooltip: "Border thickness when a card is active.",
        onChange: (newVal) => {
            window._clabThemeCardBorder = newVal;
            if (window._clabApplyTheme) window._clabApplyTheme();
        }
    },
    {
        id: "CLab.5-CardApp.Color",
        name: "Highlight Color",
        type: "color",
        defaultValue: "4caf50",
        category: ["Creative Lab", "5-CardApp", "Color"],
        tooltip: "Theme color and progress bar color when a card is selected. Default: #4CAF50 (Green).",
        onChange: (newVal) => {
            window._clabThemeCardColor = newVal;
            if (window._clabApplyTheme) window._clabApplyTheme();
        }
    },

    // =========================================================================
    // 4. 自动化行为 (Automation)
    // =========================================================================
    {
        id: "CLab.4-Automation.HaltOnError",
        name: "Halt Batch on Error",
        type: "boolean",
        defaultValue: true,
        category: ["Creative Lab", "4-Automation", "Halt"],
        tooltip: "When enabled, any error will clear the queue. When disabled, skips the errored task and continues.",
        onChange: (newVal) => { window._clabHaltOnError = newVal; }
    },

    // =========================================================================
    // 3. 文件与数据流转 (File & Data I/O)
    // =========================================================================
    {
        id: "CLab.3-FileIO.Prefix",
        name: "Filename Prefix",
        type: "text",
        defaultValue: "pix",
        category: ["Creative Lab", "3-FileIO", "Prefix"],
        tooltip: "Custom filename prefix when intercepting and saving. Default: pix (e.g., pix_01.png).",
        onChange: (newVal) => {
            window._clabFilePrefix = (newVal || "").replace(/[\\/:"*?<>| ]/g, "").trim() || "pix";
        }
    },
    {
        id: "CLab.3-FileIO.KeepTemp",
        name: "Keep Original Temp Files",
        type: "boolean",
        defaultValue: true,
        category: ["Creative Lab", "3-FileIO", "KeepTemp"],
        tooltip: "When disabled, original temp files will be completely deleted when moving them to the archive folder.",
        onChange: (newVal) => { 
            window._clabDeleteTemp = !newVal; 
        }
    },
    {
        id: "CLab.3-FileIO.ArchiveDir",
        name: "Archive Folder Name",
        type: "text",
        defaultValue: "CLab",
        category: ["Creative Lab", "3-FileIO", "ArchiveDir"],
        tooltip: "Root folder name for auto-intercepted media and organized files. No slashes or illegal characters.",
        onChange: (newVal) => {
            window._clabArchiveDir = (newVal || "").replace(/[\\/:"*?<>|]/g, "").trim() || "CLab";
        }
    },

    // =========================================================================
    // 2. 性能与媒体播放 (Performance & Media)
    // =========================================================================
    {
        id: "CLab.2-PerformanceMedia.SyncHistoryParams",
        name: "Sync Parameters on History Switch",
        type: "boolean",
        defaultValue: true,
        category: ["Creative Lab", "2-PerformanceMedia", "SyncHistoryParams"],
        tooltip: "When enabled, switching output history also restores the input-module parameters captured at generation time.",
        onChange: (newVal) => { window._clabSyncHistoryParams = newVal; }
    },
    {
        id: "CLab.2-PerformanceMedia.ThumbMode",
        name: "Thumb Performance Mode",
        type: "boolean",
        defaultValue: false,
        category: ["Creative Lab", "2-PerformanceMedia", "ThumbMode"],
        tooltip: "When enabled, loads only the first frame of videos in the grid history to save memory. When disabled, loops videos silently.",
        onChange: (newVal) => { window._clabThumbPerfMode = newVal; }
    },
    {
        id: "CLab.2-PerformanceMedia.Muted",
        name: "Video Default Muted",
        type: "boolean",
        defaultValue: true,
        category: ["Creative Lab", "2-PerformanceMedia", "Muted"],
        tooltip: "When enabled, auto-mutes main videos on load. Note: browsers may block autoplay if not muted.",
        onChange: (newVal) => { window._clabVideoMuted = newVal; }
    },
    {
        id: "CLab.2-PerformanceMedia.Autoplay",
        name: "Video Autoplay",
        type: "boolean",
        defaultValue: true,
        category: ["Creative Lab", "2-PerformanceMedia", "Autoplay"],
        tooltip: "When disabled, main videos only show the first frame and play on click (saves GPU decoding).",
        onChange: (newVal) => { window._clabVideoAutoplay = newVal; }
    },
    {
        id: "CLab.2-PerformanceMedia.MaxHistory",
        name: "Max History Records",
        type: "number",
        defaultValue: 50,
        attrs: { showButtons: true, min: 1, max: 1000, step: 1 },
        category: ["Creative Lab", "2-PerformanceMedia", "MaxHistory"],
        tooltip: "Maximum number of history records per output module. Older records are automatically removed to prevent OOM.",
        onChange: (newVal) => { window._clabMaxHistory = newVal || 50; }
    },

    // =========================================================================
    // 1. 常规 (General) - 显示在最顶部 (由于 LIFO 机制，倒序排列)
    // =========================================================================
    {
        id: "CLab.1-General.BgOpacity",
        name: "Panel Opacity (%)",
        type: "slider",
        defaultValue: 45,
        attrs: { min: 0, max: 100, step: 5 },
        category: ["Creative Lab", "1-General", "BgOpacity"],
        tooltip: "Main panel background opacity (0 = fully transparent, 100 = solid color).",
        onChange: (newVal) => {
            window._clabBgOpacity = newVal;
            const panel = document.getElementById('clab-panel');
            if (panel) panel.style.background = `rgba(30, 30, 30, ${newVal / 100})`;
        }
    },
    {
        id: "CLab.1-General.PanelHeightRatio",
        name: "Panel Height Ratio (%)",
        type: "slider",
        defaultValue: 80,
        attrs: { min: 40, max: 100, step: 1 },
        category: ["Creative Lab", "1-General", "PanelHeight"],
        tooltip: "Panel height ratio relative to browser viewport height.",
        onChange: (newVal) => {
            window._clabPanelHeightPercent = normalizePanelPercent(newVal, 80);
            if (window._clabApplyPanelLayout) window._clabApplyPanelLayout();
        }
    },
    {
        id: "CLab.1-General.PanelWidthRatio",
        name: "Panel Width Ratio (%)",
        type: "slider",
        defaultValue: 80,
        attrs: { min: 40, max: 100, step: 1 },
        category: ["Creative Lab", "1-General", "PanelWidth"],
        tooltip: "Panel width ratio relative to browser viewport width.",
        onChange: (newVal) => {
            window._clabPanelWidthPercent = normalizePanelPercent(newVal, 80);
            if (window._clabApplyPanelLayout) window._clabApplyPanelLayout();
        }
    },
    {
        id: "CLab.1-General.BackdropBlur",
        name: "Backdrop Blur",
        type: "boolean",
        defaultValue: true,
        category: ["Creative Lab", "1-General", "BackdropBlur"],
        tooltip: "Enables frosted glass effect behind the panel. May cause lag on low-end GPUs.",
        onChange: (newVal) => {
            window._clabBgBlur = newVal;
            const panel = document.getElementById('clab-panel');
            if (panel) {
                panel.style.backdropFilter = newVal ? 'blur(15px)' : 'none';
                panel.style.webkitBackdropFilter = newVal ? 'blur(15px)' : 'none';
            }
        }
    },
    {
        id: "CLab.1-General.Shortcut",
        name: "Panel Shortcut",
        type: "text",
        defaultValue: "C",
        category: ["Creative Lab", "1-General", "Shortcut"],
        tooltip: "Shortcut to toggle the panel (e.g., C, Shift+C, Ctrl+M, Alt+X). Case insensitive.",
        attrs: { placeholder: "e.g.: Shift+C" },
        onChange: (newVal) => {
            const raw = newVal ? newVal.trim() : 'C';
            window._clabShortcutRaw = raw;
            window._clabShortcutParsed = parseShortcut(raw);
            const tabBtn = document.querySelector('[title*="打开 CLab 主面板"]');
            if (tabBtn) tabBtn.title = `Open CLab Panel (Shortcut: ${raw.toUpperCase()})`;
        }
    }
];

// 【核心恢复按钮引擎】: 使用独立的变量注册，通过 LIFO 机制使其在 UI 层面始终占据“常规”分组的最顶端！
const resetSetting = {
    id: "CLab.1-General.ResetAll",
    name: "Restore All Defaults",
    type: "boolean",
    defaultValue: false,
    category: ["Creative Lab", "1-General", "ResetAll"], 
    tooltip: "⚠️ WARNING: Click to RESET all CLab settings to their factory defaults.",
    onChange: async (newVal) => {
        if (newVal === true) {
            const confirmed = confirm("Are you sure you want to reset all Creative Lab settings to default? This cannot be undone.");

            if (confirmed) {
                for (const setting of clabSettings) {
                    try {
                        if (setting.id && setting.defaultValue !== undefined) {
                            await app.extensionManager.setting.set(setting.id, setting.defaultValue);
                        }
                    } catch (e) {
                        console.error(`[CLab] Failed to reset default settings: ${setting.id}`, e);
                    }
                }
            }
            
            setTimeout(() => {
                app.extensionManager.setting.set("CLab.1-General.ResetAll", false);
            }, 100);
        }
    }
};

app.registerExtension({
    name: "ComfyUI.CLab.Settings",
    settings: [...clabSettings, resetSetting],
    
    setup() {
        setTimeout(() => {
            try {
                const getSet = (id, defaultVal) => {
                    const val = app.extensionManager.setting.get(id);
                    return val !== undefined && val !== null ? val : defaultVal;
                };

                // 读取常规设置
                const shortcut = getSet("CLab.1-General.Shortcut", "C");
                window._clabShortcutRaw = shortcut.trim();
                window._clabShortcutParsed = parseShortcut(window._clabShortcutRaw);

                window._clabBgOpacity = getSet("CLab.1-General.BgOpacity", 45);
                window._clabPanelWidthPercent = normalizePanelPercent(getSet("CLab.1-General.PanelWidthRatio", 80), 80);
                window._clabPanelHeightPercent = normalizePanelPercent(getSet("CLab.1-General.PanelHeightRatio", 80), 80);
                window._clabBgBlur = getSet("CLab.1-General.BackdropBlur", true);
                if (window._clabApplyPanelLayout) window._clabApplyPanelLayout();
                
                // 读取性能与媒体
                window._clabMaxHistory = getSet("CLab.2-PerformanceMedia.MaxHistory", 50);
                window._clabVideoAutoplay = getSet("CLab.2-PerformanceMedia.Autoplay", true);
                window._clabVideoMuted = getSet("CLab.2-PerformanceMedia.Muted", true);
                window._clabThumbPerfMode = getSet("CLab.2-PerformanceMedia.ThumbMode", false);
                window._clabSyncHistoryParams = getSet("CLab.2-PerformanceMedia.SyncHistoryParams", true);
                
                // 读取文件流转
                window._clabArchiveDir = getSet("CLab.3-FileIO.ArchiveDir", "CLab").replace(/[\\/:"*?<>|]/g, "").trim() || "CLab";
                window._clabDeleteTemp = !getSet("CLab.3-FileIO.KeepTemp", true); 
                window._clabFilePrefix = getSet("CLab.3-FileIO.Prefix", "pix").replace(/[\\/:"*?<>| ]/g, "").trim() || "pix";
                
                // 读取自动化行为
                window._clabHaltOnError = getSet("CLab.4-Automation.HaltOnError", true);

                // 读取主题配置
                window._clabThemeCardColor = getSet("CLab.5-CardApp.Color", "4caf50");
                window._clabThemeCardBorder = getSet("CLab.5-CardApp.Border", 2);
                window._clabThemeCardFill = getSet("CLab.5-CardApp.Fill", 8);
                window._clabThemeCardGlow = getSet("CLab.5-CardApp.Glow", 15);

                window._clabThemeModuleColor = getSet("CLab.6-ModuleApp.Color", "2196f3");
                window._clabThemeModuleBorder = getSet("CLab.6-ModuleApp.Border", 1);
                window._clabThemeModuleFill = getSet("CLab.6-ModuleApp.Fill", 5);
                window._clabThemeModuleGlow = getSet("CLab.6-ModuleApp.Glow", 10);

                if (window._clabApplyTheme) window._clabApplyTheme();

            } catch (e) {
                console.warn("[CLab] 读取设置失败，回退到默认值", e);
            }
        }, 500);
    }
});
