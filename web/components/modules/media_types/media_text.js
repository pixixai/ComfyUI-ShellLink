import { state } from "../../ui_state.js";
import { ensureTextAreaState } from "./media_utils.js";

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
}

function sanitizeHref(url) {
    try {
        const resolved = new URL(url, window.location.origin);
        if (["http:", "https:", "mailto:"].includes(resolved.protocol)) {
            return resolved.href;
        }
    } catch (_) {}
    return "";
}

function highlightCodeHtml(source) {
    const tokens = [];
    let html = escapeHtml(source);

    const stash = (regex, className) => {
        html = html.replace(regex, (match) => {
            tokens.push(`<span class="${className}">${match}</span>`);
            return `__CLAB_TOKEN_${tokens.length - 1}__`;
        });
    };

    stash(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, "clab-text-token-string");
    stash(/(#.*$|\/\/.*$)/gm, "clab-text-token-comment");

    html = html
        .replace(/\b(true|false|null|undefined)\b/g, '<span class="clab-text-token-boolean">$1</span>')
        .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="clab-text-token-number">$1</span>')
        .replace(/\b(function|return|const|let|var|if|else|for|while|class|import|export|from|async|await|try|catch|def|lambda)\b/g, '<span class="clab-text-token-keyword">$1</span>');

    html = html.replace(/__CLAB_TOKEN_(\d+)__/g, (_match, index) => tokens[Number(index)] || "");
    return html;
}

function renderInlineMarkup(text, syntaxHighlight = false) {
    const codeTokens = [];
    let html = escapeHtml(text).replace(/`([^`]+)`/g, (_match, code) => {
        const inner = syntaxHighlight ? highlightCodeHtml(code) : escapeHtml(code);
        codeTokens.push(`<code class="clab-text-inline-code">${inner}</code>`);
        return `__CLAB_INLINE_CODE_${codeTokens.length - 1}__`;
    });

    html = html
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
            const safeHref = sanitizeHref(href);
            const safeLabel = escapeHtml(label);
            if (!safeHref) return safeLabel;
            return `<a class="clab-text-link" href="${escapeAttr(safeHref)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
        })
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/~~([^~]+)~~/g, "<del>$1</del>");

    html = html.replace(/__CLAB_INLINE_CODE_(\d+)__/g, (_match, index) => codeTokens[Number(index)] || "");
    return html;
}

function renderInlineWithBreaks(text, syntaxHighlight = false) {
    return String(text ?? "")
        .split("\n")
        .map((line) => renderInlineMarkup(line, syntaxHighlight))
        .join("<br>");
}

function renderMarkdownHtml(source, syntaxHighlight = false) {
    const blockTokens = [];
    let text = String(source ?? "").replace(/\r\n/g, "\n");

    text = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_match, language, code) => {
        const codeHtml = syntaxHighlight ? highlightCodeHtml(code) : escapeHtml(code);
        const langLabel = String(language || "").trim();
        const langHtml = langLabel ? `<div class="clab-text-code-lang">${escapeHtml(langLabel)}</div>` : "";
        blockTokens.push(`
            <div class="clab-text-code-block">
                ${langHtml}
                <pre class="clab-text-code-pre"><code>${codeHtml}</code></pre>
            </div>
        `);
        return `\n__CLAB_BLOCK_${blockTokens.length - 1}__\n`;
    });

    const blocks = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const htmlBlocks = blocks.map((block) => {
        const blockTokenMatch = block.match(/^__CLAB_BLOCK_(\d+)__$/);
        if (blockTokenMatch) return blockTokens[Number(blockTokenMatch[1])] || "";

        if (/^#{1,6}\s/.test(block)) {
            const level = Math.min(6, block.match(/^#+/)[0].length);
            return `<h${level} class="clab-text-heading h${level}">${renderInlineMarkup(block.replace(/^#{1,6}\s+/, ""), syntaxHighlight)}</h${level}>`;
        }

        if (block.startsWith(">")) {
            const quote = block
                .split("\n")
                .map((line) => line.replace(/^>\s?/, ""))
                .join("\n");
            return `<blockquote class="clab-text-quote">${renderInlineWithBreaks(quote, syntaxHighlight)}</blockquote>`;
        }

        const listLines = block.split("\n");
        if (listLines.every((line) => /^[-*+]\s+/.test(line))) {
            const items = listLines
                .map((line) => `<li>${renderInlineMarkup(line.replace(/^[-*+]\s+/, ""), syntaxHighlight)}</li>`)
                .join("");
            return `<ul class="clab-text-list">${items}</ul>`;
        }

        if (listLines.every((line) => /^\d+\.\s+/.test(line))) {
            const items = listLines
                .map((line) => `<li>${renderInlineMarkup(line.replace(/^\d+\.\s+/, ""), syntaxHighlight)}</li>`)
                .join("");
            return `<ol class="clab-text-list">${items}</ol>`;
        }

        return `<p class="clab-text-paragraph">${renderInlineWithBreaks(block, syntaxHighlight)}</p>`;
    });

    return htmlBlocks.join("");
}

function renderPlainTextHtml(text, syntaxHighlight = false) {
    const body = syntaxHighlight ? highlightCodeHtml(text) : escapeHtml(text);
    return `<pre class="clab-text-plain"><code>${body}</code></pre>`;
}

function getRenderedTextHtml(area) {
    ensureTextAreaState(area);
    if (area.textLoadState === "missing") {
        return `<div class="clab-text-state clab-text-state-missing">媒体丢失</div>`;
    }
    if ((area.textLoadState === "loading" || area.textLoadState === "idle") && area.resultUrl && !area.textContent) {
        return `<div class="clab-text-state">正在读取文字...</div>`;
    }
    const source = area.textContent || "";
    if (area.textPreviewMarkdown) {
        return renderMarkdownHtml(source, area.textSyntaxHighlight);
    }
    return renderPlainTextHtml(source, area.textSyntaxHighlight);
}

function findArea(areaId) {
    for (const card of state.cards) {
        const area = card?.areas?.find((item) => item.id === areaId);
        if (area) return area;
    }
    return null;
}

function requestAreaRefresh(areaId) {
    if (window._clabSurgicallyUpdateArea) {
        window._clabSurgicallyUpdateArea(areaId);
        if (window._clabJustSave) window._clabJustSave();
        return;
    }
    if (window.CLab && typeof window.CLab.saveState === "function") {
        window.CLab.saveState(state);
    }
}

async function copyAreaText(areaId, button) {
    const area = findArea(areaId);
    if (!area) return;

    ensureTextAreaState(area);
    const text = String(area.textContent || "");
    if (!text) return;

    const originalLabel = button?.textContent || "复制";
    const markCopied = () => {
        if (!button) return;
        button.textContent = "已复制";
        button.disabled = true;
        setTimeout(() => {
            button.textContent = originalLabel;
            button.disabled = false;
        }, 1200);
    };

    try {
        await navigator.clipboard.writeText(text);
        markCopied();
    } catch (_) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        markCopied();
    }
}

function updateTextPreviewLayout(shell) {
    if (!shell) return;

    const viewport = shell.querySelector(".clab-text-body-scroll");
    const content = shell.querySelector(".clab-text-body-content");
    if (!viewport || !content) return;

    const shellWidth = Math.max(160, Math.floor(shell.clientWidth || 0));
    if (!shellWidth) return;

    const maxHeight = shellWidth;
    viewport.style.maxHeight = `${maxHeight}px`;
    viewport.style.height = "auto";
    viewport.style.overflowY = "hidden";

    requestAnimationFrame(() => {
        const totalHeight = Math.ceil(content.scrollHeight || 0);
        if (!totalHeight || totalHeight <= maxHeight) {
            viewport.style.height = `${Math.max(totalHeight, 32)}px`;
            viewport.style.overflowY = "hidden";
        } else {
            viewport.style.height = `${maxHeight}px`;
            viewport.style.overflowY = "auto";
        }
    });
}

function bindTextShell(shell) {
    if (!shell || shell.dataset.clabTextBound === "1") return;
    shell.dataset.clabTextBound = "1";

    const areaId = shell.dataset.area;
    const textBody = shell.querySelector(".clab-text-body-scroll");
 
    if (textBody) {
        textBody.setAttribute("draggable", "false");
        textBody.addEventListener("dragstart", (event) => {
            event.preventDefault();
        });
        textBody.addEventListener("mousedown", (event) => {
            event.stopPropagation();
        });
        textBody.addEventListener("click", (event) => {
            event.stopPropagation();
        });
    }

    shell.querySelectorAll(".clab-text-option input[type='checkbox']").forEach((input) => {
        input.addEventListener("change", (event) => {
            const area = findArea(areaId);
            if (!area) return;

            ensureTextAreaState(area);
            if (event.target.dataset.option === "syntax") {
                area.textSyntaxHighlight = !!event.target.checked;
            }
            if (event.target.dataset.option === "markdown") {
                area.textPreviewMarkdown = !!event.target.checked;
            }
            requestAreaRefresh(areaId);
        });
    });

    const copyBtn = shell.querySelector(".clab-text-copy-btn");
    if (copyBtn) {
        copyBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void copyAreaText(areaId, copyBtn);
        });
    }

    updateTextPreviewLayout(shell);

    if (!window._clabTextPreviewResizeObserver) {
        window._clabTextPreviewResizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => updateTextPreviewLayout(entry.target));
        });
    }
    window._clabTextPreviewResizeObserver.observe(shell);
}

export function renderText(area) {
    ensureTextAreaState(area);

    return `
        <div class="clab-text-preview-shell" data-area="${area.id}">
            <div class="clab-text-body-scroll">
                <div class="clab-text-body-content">${getRenderedTextHtml(area)}</div>
            </div>
            <div class="clab-text-toolbar">
                <label class="clab-text-option">
                    <input type="checkbox" data-option="syntax" ${area.textSyntaxHighlight ? "checked" : ""}>
                    <span>语法高亮</span>
                </label>
                <label class="clab-text-option">
                    <input type="checkbox" data-option="markdown" ${area.textPreviewMarkdown ? "checked" : ""}>
                    <span>预览Markdown</span>
                </label>
                <button type="button" class="clab-text-copy-btn">复制</button>
            </div>
        </div>
    `;
}

export function attachTextEvents(container) {
    container.querySelectorAll(".clab-text-preview-shell").forEach((shell) => {
        bindTextShell(shell);
        updateTextPreviewLayout(shell);
    });
}
