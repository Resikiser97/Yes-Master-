/**
 * @file        sprites.js
 * @module      config
 * @summary     Spritesheet 定義與切幀工具函式；方塊 hotbar 使用已去背並重新置中的 sheet
 * @exports     SPRITE_SHEETS, getFrameRect
 * @depends     （無）
 * @sourceOfTruth assets/icon-status.md
 * @version     v0.0.17.0
 *
 * 切幀方式：等寬等高格，index 從左上角開始，逐列橫向掃描。
 * 使用 drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) 繪製單幀。
 */

export const SPRITE_SHEETS = {
  /** 方塊圖示（真透明、正方格重打包，hotbar/HUD 圖示主要來源） */
  blocksNoFrame: {
    src: 'assets/spritesheet_blocks_9tiles_hotbar.png',
    cols: 9,
    rows: 1,
    // 順序對應 config/gameConfig.js hotbar 順序（前 7 個）+ ladder + hollow
    keys: ['sand', 'dirt', 'stone', 'iron', 'gold', 'glass', 'diamond', 'ladder', 'hollow'],
  },
  /** 方塊圖示（帶木質槽框版，備用） */
  blocksSlotFrame: {
    src: 'assets/spritesheet_blocks_9tiles_slotframe.png',
    cols: 9,
    rows: 1,
    keys: ['sand', 'dirt', 'stone', 'iron', 'gold', 'glass', 'diamond', 'ladder', 'hollow'],
  },
};

/**
 * 取 spritesheet 中某個 key 或 index 的來源矩形 { sx, sy, sw, sh }。
 * 需在圖片 onload 後呼叫，才能讀到 naturalWidth/naturalHeight。
 *
 * @param {HTMLImageElement} img
 * @param {{ cols: number, rows: number, keys: string[] }} sheet
 * @param {string | number} keyOrIndex
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function getFrameRect(img, sheet, keyOrIndex) {
  const idx = typeof keyOrIndex === 'number'
    ? keyOrIndex
    : sheet.keys.indexOf(keyOrIndex);
  if (idx < 0) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const fw = img.naturalWidth  / sheet.cols;
  const fh = img.naturalHeight / sheet.rows;
  const col = idx % sheet.cols;
  const row = Math.floor(idx / sheet.cols);
  return { sx: col * fw, sy: row * fh, sw: fw, sh: fh };
}
