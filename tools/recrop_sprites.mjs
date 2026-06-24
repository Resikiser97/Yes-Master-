/**
 * recrop_sprites.mjs — Spritesheet 重新裁剪（union bbox，動畫對齊版）
 *
 * 策略：
 *   同一 row（同一段動畫）的所有幀，先各自找 content bbox，
 *   再取 union bbox，讓每幀用相同的裁切區域 → 動畫播放時角色不會亂跳。
 *   最後所有 row 的最大 union 決定全 sheet 的統一 outSize。
 *
 * 原始 spritesheet 已有透明背景，不需要去背。
 * 備注：若某幀角色超出格子邊界（素材品質問題），union crop 後邊緣仍可能有截斷。
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

const PADDING_RATIO = 0.08;
const MIN_SIZE = 64;

// ── Content bounding box（alpha > 10 的像素範圍）────────────────────────────

function contentBBox(img, fw, fh) {
  let minR = fh, maxR = -1, minC = fw, maxC = -1;
  const data = img.bitmap.data;
  for (let r = 0; r < fh; r++) {
    for (let c = 0; c < fw; c++) {
      const a = data[(r * fw + c) * 4 + 3];
      if (a > 10) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return null;
  return { minR, maxR, minC, maxC, w: maxC - minC + 1, h: maxR - minR + 1 };
}

// ── 把裁切好的 content 置中貼到正方形畫布 ───────────────────────────────────

async function placeOnCanvas(content, cw, ch, outSize) {
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

  try { await fs.access(srcPath); }
  catch { console.log(`  [SKIP] 找不到：${sheet.src}`); return; }

  await fs.mkdir(outDir, { recursive: true });
  const img = await Jimp.read(srcPath);
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const fw = Math.floor(W / sheet.cols);
  const fh = Math.floor(H / sheet.rows);
  console.log(`  來源：${sheet.src}  (${W}×${H})  幀尺寸：${fw}×${fh}`);

  // ── Pass 1：逐 row 計算 union bbox ─────────────────────────────────────────
  // rowUnions[r] = { minR, maxR, minC, maxC } 在 cell 內的座標
  const rowUnions = [];
  const allFrameData = []; // [row][col] = { frame jimp }

  for (let r = 0; r < sheet.rows; r++) {
    let uMinR = fh, uMaxR = -1, uMinC = fw, uMaxC = -1;
    const rowData = [];

    for (let c = 0; c < sheet.cols; c++) {
      const frame = img.clone().crop({ x: c * fw, y: r * fh, w: fw, h: fh });
      const bbox  = contentBBox(frame, fw, fh);
      if (bbox) {
        uMinR = Math.min(uMinR, bbox.minR);
        uMaxR = Math.max(uMaxR, bbox.maxR);
        uMinC = Math.min(uMinC, bbox.minC);
        uMaxC = Math.max(uMaxC, bbox.maxC);
      }
      rowData.push(frame);
    }

    rowUnions.push(uMaxR >= 0
      ? { minR: uMinR, maxR: uMaxR, minC: uMinC, maxC: uMaxC,
          w: uMaxC - uMinC + 1, h: uMaxR - uMinR + 1 }
      : null);
    allFrameData.push(rowData);
  }

  // ── Pass 2：決定全 sheet 統一輸出尺寸（所有 row union 的最大值）──────────
  let maxDim = MIN_SIZE;
  for (const u of rowUnions) {
    if (u) maxDim = Math.max(maxDim, u.w, u.h);
  }
  const pad     = Math.max(4, Math.round(maxDim * PADDING_RATIO));
  let   outSize = maxDim + pad * 2;
  outSize = Math.ceil(outSize / 8) * 8;
  outSize = Math.max(outSize, MIN_SIZE);
  console.log(`  最大 union content：${maxDim}px  輸出尺寸：${outSize}×${outSize}`);

  // ── Pass 3：裁切 union bbox → 置中輸出 ────────────────────────────────────
  for (let r = 0; r < sheet.rows; r++) {
    const u = rowUnions[r];
    for (let c = 0; c < sheet.cols; c++) {
      const name    = sheet.names[r][c];
      const outPath = path.join(outDir, `${name}.png`);
      let   out;

      if (!u) {
        // 空白 row → 輸出全透明
        out = new Jimp({ width: outSize, height: outSize, color: 0x00000000 });
      } else {
        const content = allFrameData[r][c].crop({ x: u.minC, y: u.minR, w: u.w, h: u.h });
        out = await placeOnCanvas(content, u.w, u.h, outSize);
      }

      await out.write(outPath);
      console.log(`    ✅ ${path.relative(ROOT, outPath)}`);
    }
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
