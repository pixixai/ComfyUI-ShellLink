/**
 * 文件名: media_image.js
 * 职责: 纯图片渲染
 */

export function renderImage(area, objectFit, url, errCall) {
    return `<img id="clab-img-${area.id}" class="clab-preview-img clab-media-target" src="${url}" draggable="false" style="object-fit: ${objectFit}; width: 100%; height: 100%; display: block;" onerror="${errCall}" />`;
}