/**
 * @file        imageLoader.js
 * @module      render（渲染層，非純邏輯）
 * @summary     非同步載入多張圖片，回傳 Promise<Map<key, HTMLImageElement>>；載入失敗只警告不中斷遊戲
 * @exports     loadImages
 * @depends     （無）
 * @sourceOfTruth config/sprites.js
 * @version     v0.0.14.0
 */

/**
 * @param {Record<string, string>} manifest  { key: srcPath }
 * @returns {Promise<Map<string, HTMLImageElement>>}
 */
export function loadImages(manifest) {
  const entries = Object.entries(manifest);
  return Promise.all(
    entries.map(([key, src]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => resolve([key, img]);
        img.onerror = () => {
          console.warn(`[imageLoader] 載入失敗: ${src}`);
          resolve([key, null]);
        };
        img.src = src;
      })
    )
  ).then((pairs) => {
    const map = new Map();
    for (const [k, img] of pairs) {
      if (img) map.set(k, img);
    }
    return map;
  });
}
