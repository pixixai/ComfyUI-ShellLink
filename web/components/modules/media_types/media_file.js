/**
 * 文件名: media_file.js
 * 职责: 普通文件下载占位符渲染
 */

export function renderFile(area, url) {
    let filename = "未知文件";
    try { 
        filename = new URL(url, window.location.origin).searchParams.get('filename') || filename; 
    } catch(e) {}
    
    return `
        <div class="clab-file-display" style="${area.matchMedia ? '' : 'aspect-ratio: 16/9;'}">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
            <div style="font-size: 12px; font-weight: bold; color: #eee; word-break: break-all;">${filename}</div>
            <a href="${url}" download="${filename}" style="margin-top:10px; color:#2196F3; font-size:11px; text-decoration:none;">点击下载</a>
        </div>
    `;
}