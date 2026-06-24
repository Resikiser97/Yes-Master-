/**
 * recrop_sprites.mjs — Spritesheet 重新裁剪 + 去背 + 置中
 *
 * 問題：Codex 上次裁剪沒去背，且各幀沒置中。
 * 做法：
 *   1. 邊界 flood-fill 找背景（從四角連通的近白/灰像素）→ 設透明
 *   2. 找每幀實際 content bounding box（有 alpha 的像素）
 *   3. 在正方形畫布上置中輸出（加 10% padding）
 *   4. 所有幀統一用同一個 output size（同一 sheet 最大 content + padding）
 *
 * 執行：node tools/recrop_sprites.mjs
 */

import { Jimp } from 'jimp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── 設定表 ────────────────────────────────────────────────────────────────────

const SHEETS = [
  {
    src:  'assets/spritesheet_enemies_shield-muscle-leader_3row4col.png',
    rows: 3, cols: 4,
    names: [
      ['shield_walk_f0','shield_walk_f1','shield_walk_f2','shield_walk_f3'],
      ['muscle_walk_f0','muscle_walk_f1','muscle_walk_f2','muscle_walk_f3'],
      ['leader_walk_f0','leader_walk_f1','leader_walk_f2','leader_walk_f3'],
    ],
    out: 'assets/enemies',
  },
  {
    src:  'assets/spritesheet_goblin_3row4col_walk-walk-mine.png',
    rows: 3, cols: 4,
    names: [
      ['goblin_walk_right_f0','goblin_walk_right_f1','goblin_walk_right_f2','goblin_walk_right_f3'],
      ['goblin_walk_left_f0', 'goblin_walk_left_f1', 'goblin_walk_left_f2', 'goblin_walk_left_f3'],
      ['goblin_mine_f0',      'goblin_mine_f1',      'goblin_mine_f2',      'goblin_mine_f3'],
    ],
    out: 'assets/characters/goblin',
  },
  {
    src:  'assets/spritesheet_core_orb_3row4col_normal-hit-lowhp.png',
    rows: 3, cols: 4,
    names: [
      ['core_normal_f0','core_normal_f1','core_normal_f2','core_normal_f3'],
      ['core_hit_f0',   'core_hit_f1',   'core_hit_f2',   'core_hit_f3'],
      ['core_lowhp_f0', 'core_lowhp_f1', 'core_lowhp_f2', 'core_lowhp_f3'],
    ],
    out: 'assets/core',
  },
  {
    src:  'assets/spritesheet_enemy_civilian_2x2_walk.png',
    rows: 2, cols: 2,
    names: [
      ['civilian_walk_f0','civilian_walk_f1'],
      ['civilian_walk_f2','civilian_walk_f3'],
    ],
    out: 'assets/enemies',
  },
  {
    src:  'assets/spritesheet_ui_icons_12pack_4x3grid.png',
    rows: 3, cols: 4,
    names: [
      ['icon_gold-coin',    'icon_silver-coin',   'icon_diamond-gem',  'icon_ticket'],
      ['icon_settings-gear','icon_trophy',         'icon_handshake',    'icon_backpack'],
      ['icon_slot-empty',   'icon_slot-selected',  'icon_crown',        'icon_red-dot'],
    ],
    out: 'assets/ui',
  },
];

// 去背容差（0~255）
const BG_TOLERANCE = 40;
// 內距比例（相對 content 最長邊）
const PADDING_RATIO = 0.10;
const MIN_SIZE = 64;

// ── 去背：邊界 flood-fill ─────────────────────────────────────────────────────

function removeBackground(img) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  // 取四角像素的 RGB 均值作為背景色樣本
  const corners = [[0,0],[0,w-1],[h-1,0],[h-1,w-1]].map(([r,c]) => {
    const idx = (r * w + c) * 4;
    return [img.bitmap.data[idx], img.bitmap.data[idx+1], img.bitmap.data[idx+2]];
  });
  const bgR = corners.reduce((s,p)=>s+p[0],0)/4;
  const bgG = corners.reduce((s,p)=>s+p[1],0)/4;
  const bgB = corners.reduce((s,p)=>s+p[2],0)/4;

  const visited = new Uint8Array(w * h);

  function isBg(r, c) {
    const i = r * w + c;
    if (visited[i]) return false;
    const idx = i * 4;
    const dr = img.bitmap.data[idx]   - bgR;
    const dg = img.bitmap.data[idx+1] - bgG;
    const db = img.bitmap.data[idx+2] - bgB;
    return Math.sqrt(dr*dr + dg*dg + db*db) <= BG_TOLERANCE;
  }

  // BFS
  const queue = [];
  const enqueue = (r, c) => {
    if (r < 0 || r >= h || c < 0 || c >= w) return;
    if (isBg(r, c)) { visited[r*w+c] = 1; queue.push(r, c); }
  };

  // 種子：四邊
  for (let c = 0; c < w; c++) { enqueue(0, c); enqueue(h-1, c); }
  for (let r = 0; r < h; r++) { enqueue(r, 0); enqueue(r, w-1); }

  let qi = 0;
  while (qi < queue.length) {
    const r = queue[qi++];
    const c = queue[qi++];
    enqueue(r-1, c); enqueue(r+1, c); enqueue(r, c-1); enqueue(r, c+1);
  }

  // 把背景設透明
  const result = img.clone();
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (visited[r*w+c]) {
        const idx = (r*w+c)*4;
        result.bitmap.data[idx+3] = 0;
      }
    }
  }
  return result;
}

// ── 找 content bounding box ───────────────────────────────────────────────────

function contentBBox(img) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  let minR=h, maxR=-1, minC=w, maxC=-1;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const a = img.bitmap.data[(r*w+c)*4+3];
      if (a > 10) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return null; // 完全透明
  return { minR, maxR, minC, maxC, w: maxC-minC+1, h: maxR-minR+1 };
}

// ── 置中到正方形 ──────────────────────────────────────────────────────────────

async function centerOnCanvas(img, outSize) {
  const bbox = contentBBox(img);
  if (!bbox) {
    return new Jimp({ width: outSize, height: outSize, color: 0x00000000 });
  }
  const content = img.clone().crop({ x: bbox.minC, y: bbox.minR, w: bbox.w, h: bbox.h });

  // 若 content 比 canvas 大，縮小但保持比例
  let cw = bbox.w, ch = bbox.h;
  const maxContent = outSize - Math.max(4, Math.round(outSize * PADDING_RATIO * 2));
  if (cw > maxContent || ch > maxContent) {
    const scale = maxContent / Math.max(cw, ch);
    cw = Math.max(1, Math.round(cw * scale));
    ch = Math.max(1, Math.round(ch * scale));
    content.resize({ w: cw, h: ch });
  }

  const canvas = new Jimp({ width: outSize, height: outSize, color: 0x00000000 });
  const px = Math.round((outSize - cw) / 2);
  const py = Math.round((outSize - ch) / 2);
  canvas.composite(content, px, py);
  return canvas;
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function processSheet(sheet) {
  const srcPath = path.join(ROOT, sheet.src);
  const outDir  = path.join(ROOT, sheet.out);

  try {
    await fs.access(srcPath);
  } catch {
    console.log(`  [SKIP] 找不到來源：${sheet.src}`);
    return;
  }

  await fs.mkdir(outDir, { recursive: true });
  const img = await Jimp.read(srcPath);
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const fw = Math.floor(W / sheet.cols);
  const fh = Math.floor(H / sheet.rows);
  console.log(`  來源：${sheet.src}  (${W}×${H})  幀尺寸：${fw}×${fh}`);

  // Pass 1：去背所有幀，找最大 content 尺寸
  const frames = [];
  let maxContent = MIN_SIZE;

  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const frame = img.clone().crop({ x: c*fw, y: r*fh, w: fw, h: fh });
      const clean = removeBackground(frame);
      const bbox  = contentBBox(clean);
      if (bbox) maxContent = Math.max(maxContent, bbox.w, bbox.h);
      frames.push({ r, c, clean });
    }
  }

  const pad     = Math.max(4, Math.round(maxContent * PADDING_RATIO));
  let outSize   = maxContent + pad * 2;
  outSize       = Math.ceil(outSize / 8) * 8; // 對齊 8px
  outSize       = Math.max(outSize, MIN_SIZE);
  console.log(`  最大 content：${maxContent}px  輸出尺寸：${outSize}×${outSize}`);

  // Pass 2：置中輸出
  for (const { r, c, clean } of frames) {
    const name    = sheet.names[r][c];
    const outPath = path.join(outDir, `${name}.png`);
    const out     = await centerOnCanvas(clean, outSize);
    await out.write(outPath);
    console.log(`    ✅ ${path.relative(ROOT, outPath)}`);
  }
}

async function main() {
  console.log(`專案根目錄：${ROOT}\n`);
  for (const sheet of SHEETS) {
    console.log(`=== ${sheet.src} ===`);
    await processSheet(sheet);
    console.log();
  }
  console.log('全部完成。');
}

main().catch(console.error);
