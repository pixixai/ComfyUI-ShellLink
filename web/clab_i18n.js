/**
 * CLab 面板文案：从 Comfy 合并接口 /i18n 读取各语言 main.json 中的 clabUi。
 * 开发与维护以简体中文 locales/zh 为基准（先写 zh 再同步其它语言）；运行时缺键时优先回退 zh，再 en。
 */
import { app } from "../../scripts/app.js";

let _bundle = null;
let _loadPromise = null;

const I18N_PATHS = ["/i18n", "./i18n"];

/** 与 Comfy 设置、`/i18n` 语言键对齐：en / zh / zh-TW / ja / ko / ru / fr / es / ar */
function normalizeLocale(raw) {
    if (!raw || typeof raw !== "string") return "en";
    const c = raw.trim().toLowerCase().replace(/_/g, "-");
    if (c === "zh" || c === "zh-cn" || c === "zh-hans" || c.startsWith("zh-cn")) return "zh";
    if (c === "zh-tw" || c === "zh-hant" || c.startsWith("zh-tw") || c === "zh-hk" || c === "zh-mo") return "zh-TW";
    if (c === "ja" || c.startsWith("ja-")) return "ja";
    if (c === "ko" || c.startsWith("ko-")) return "ko";
    if (c === "ru" || c.startsWith("ru-")) return "ru";
    if (c === "fr" || c.startsWith("fr-")) return "fr";
    if (c === "es" || c.startsWith("es-")) return "es";
    if (c === "ar" || c.startsWith("ar-")) return "ar";
    if (c === "en" || c.startsWith("en-")) return "en";
    return "en";
}

function readComfyLocaleSetting() {
    try {
        const get = app?.extensionManager?.setting?.get?.bind(app.extensionManager.setting);
        if (!get) return null;
        for (const id of ["Comfy.Locale", "Comfy.Language", "Locale"]) {
            const v = get(id);
            if (v != null && String(v).trim() !== "") return String(v).trim();
        }
    } catch (e) {}
    return null;
}

export function getRawLocale() {
    if (window.__CLAB_FORCE_LOCALE__) return String(window.__CLAB_FORCE_LOCALE__);
    return (
        readComfyLocaleSetting() ||
        (document.documentElement.getAttribute("lang") || "").trim() ||
        navigator.language ||
        "en"
    );
}

let _lastRaw = null;
let _locale = "en";

export function getClabLocale() {
    const raw = getRawLocale();
    if (raw !== _lastRaw) {
        _lastRaw = raw;
        _locale = normalizeLocale(raw);
    }
    return _locale;
}

/** 与 /i18n 返回对象中的语言键对齐（en、zh、zh-TW 等） */
function pickLangEntry(bundle) {
    if (!bundle || typeof bundle !== "object") return null;
    const raw = getRawLocale();
    const lower = raw.toLowerCase().replace(/_/g, "-");
    if (raw && bundle[raw]) return bundle[raw];
    for (const k of Object.keys(bundle)) {
        if (k.toLowerCase() === lower) return bundle[k];
    }
    if (lower.startsWith("zh")) {
        const trad =
            lower.includes("tw") ||
            lower.includes("hant") ||
            lower === "zh-hk" ||
            lower === "zh-mo";
        const order = trad
            ? ["zh-TW", "zh-Hant", "zh", "zh-CN", "zh-Hans"]
            : ["zh", "zh-CN", "zh-Hans", "zh-TW", "zh-Hant"];
        for (const k of order) {
            if (bundle[k]) return bundle[k];
        }
    }
    if (bundle.en) return bundle.en;
    const first = Object.keys(bundle).find((k) => k !== "nodeDefs" && k !== "settings" && k !== "commands");
    return first ? bundle[first] : null;
}

async function fetchI18nOnce() {
    let lastErr = null;
    for (const path of I18N_PATHS) {
        try {
            const res = await fetch(path, { credentials: "same-origin" });
            if (res.ok) return await res.json();
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error("CLab: /i18n unavailable");
}

/**
 * 拉取 Comfy 合并后的全语言翻译（含本节点 main.json 的 clabUi）。
 * 建议在扩展 setup 最早阶段 await，避免首屏显示 key。
 */
export async function loadClabI18nBundle() {
    if (_bundle) return _bundle;
    if (_loadPromise) return _loadPromise;
    _loadPromise = fetchI18nOnce()
        .then((data) => {
            _bundle = data && typeof data === "object" ? data : {};
            return _bundle;
        })
        .catch((e) => {
            console.warn("[CLab] Failed to load /i18n; UI strings may show keys until reload.", e);
            _bundle = {};
            return _bundle;
        });
    return _loadPromise;
}

export function getClabI18nBundle() {
    return _bundle;
}

/** 开发时改 locales 后需重启 Comfy（服务端 @lru_cache）；前端可手动清缓存再拉取 */
export function clearClabI18nCache() {
    _bundle = null;
    _loadPromise = null;
}

function dig(obj, path) {
    return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

/** @param {string} key dot path under clabUi，如 toolbar.addCard */
export function clabT(key) {
    const entry = _bundle ? pickLangEntry(_bundle) : null;
    let s = dig(entry?.clabUi, key);
    const loc = getClabLocale();
    if (typeof s !== "string" && loc === "zh-TW") {
        s = dig(_bundle?.["zh-TW"]?.clabUi, key) || dig(_bundle?.zh?.clabUi, key);
    }
    if (typeof s !== "string" && loc === "zh") {
        s = dig(_bundle?.zh?.clabUi, key);
    }
    if (typeof s !== "string") s = dig(_bundle?.zh?.clabUi, key);
    if (typeof s !== "string") s = dig(_bundle?.en?.clabUi, key);
    if (typeof s !== "string") {
        for (const code of Object.keys(_bundle || {})) {
            const t = dig(_bundle[code]?.clabUi, key);
            if (typeof t === "string") {
                s = t;
                break;
            }
        }
    }
    return typeof s === "string" ? s : key;
}

export function clabTf(key, vars) {
    let s = clabT(key);
    if (vars && typeof vars === "object") {
        Object.entries(vars).forEach(([k, v]) => {
            s = s.split(`{${k}}`).join(String(v));
        });
    }
    return s;
}

/** 内部仍存中文常量（兼容旧工作流）；仅用于界面展示 */
const FILL_STORED_TO_KEY = { 显示全部: "fillMode.fit", 填充: "fillMode.cover", 拉伸: "fillMode.stretch" };

export function clabFillModeLabel(stored) {
    const k = FILL_STORED_TO_KEY[stored];
    return k ? clabT(k) : stored;
}

export function clabRatioLabel(stored) {
    return stored === "自定义比例" ? clabT("ratio.custom") : stored;
}

/** 分组树里 「未命名组」等系统占位名随语言切换；用户自定义组名保持原文 */
export function clabTreeTitle(name) {
    if (name === "未命名组") return clabT("tree.unnamedGroup");
    return name;
}

export function applyClabPanelStaticI18n(panel) {
    if (!panel) return;

    const setBtn = (sel, textKey, titleKey) => {
        const el = panel.querySelector(sel);
        if (!el) return;
        if (textKey) el.textContent = clabT(textKey);
        if (titleKey) el.title = clabT(titleKey);
    };

    setBtn("#clab-global-add-card", "toolbar.addCard", "toolbar.addCardTitle");
    setBtn("#clab-global-add-module", "toolbar.addModule", "toolbar.addModuleTitle");

    const runBtn = panel.querySelector("#clab-btn-run");
    if (runBtn) {
        runBtn.textContent = clabT("toolbar.run");
        runBtn.title = clabT("toolbar.runTitle");
    }
    const runToggle = panel.querySelector("#clab-run-dropdown-toggle");
    if (runToggle) runToggle.title = clabT("toolbar.runMenuTitle");

    const runAll = panel.querySelector("#clab-btn-run-all");
    if (runAll) {
        const svg = runAll.querySelector("svg");
        runAll.innerHTML = "";
        if (svg) runAll.appendChild(svg);
        const span = document.createElement("span");
        span.textContent = clabT("toolbar.runAll");
        runAll.appendChild(span);
    }

    const runWrapper = panel.querySelector("#clab-run-btn-wrapper");
    const batchWrap = runWrapper?.nextElementSibling;
    if (batchWrap?.querySelector("#clab-run-batch-count")) {
        batchWrap.title = clabT("toolbar.batchCountTitle");
    }

    const cfgInner = panel.querySelector("#clab-config-btn-wrapper #clab-btn-config");
    const cfgLegacy = panel.querySelector("#clab-btn-config");
    const cfgBtn = cfgInner || cfgLegacy;
    if (cfgBtn) {
        cfgBtn.textContent = clabT("toolbar.createAnchor");
        cfgBtn.title = cfgInner ? clabT("config.btnTitle") : clabT("toolbar.createAnchorTitle");
    }
    const maintTitle = panel.querySelector("#clab-config-dropdown .clab-custom-select-group-title");
    if (maintTitle) maintTitle.textContent = clabT("config.maintTitle");
    const cleanDead = panel.querySelector("#clab-maint-clean-dead");
    if (cleanDead) cleanDead.textContent = clabT("config.cleanDead");
    const resync = panel.querySelector("#clab-maint-resync");
    if (resync) resync.textContent = clabT("config.resync");

    const wReset = panel.querySelector("#clab-card-width-reset");
    if (wReset) wReset.setAttribute("title", clabT("toolbar.widthResetTitle"));
    const wInput = panel.querySelector("#clab-card-width-input");
    if (wInput) wInput.setAttribute("title", clabT("toolbar.widthInputTitle"));
}

let _watchTimer = null;

export function initClabLocaleWatch(onLocaleChange) {
    let prev = getClabLocale();
    if (_watchTimer) clearInterval(_watchTimer);
    _watchTimer = setInterval(() => {
        const cur = getClabLocale();
        if (cur !== prev) {
            prev = cur;
            onLocaleChange?.(cur);
        }
    }, 600);
}

export function refreshClabMenuButtonTitle() {
    const raw = window._clabShortcutRaw ? String(window._clabShortcutRaw).toUpperCase() : "C";
    const title = clabTf("menu.openTitle", { key: raw });
    const brand = clabT("menu.brand");
    document.querySelectorAll(".comfy-menu button .mdi-tune").forEach((icon) => {
        const btn = icon.closest("button");
        if (!btn) return;
        btn.title = title;
        const span = btn.querySelector("span");
        if (span) span.textContent = brand;
    });
}
