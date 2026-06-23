/**
 * @file        renderer.js
 * @module      render（渲染層，非純邏輯）
 * @summary     將世界狀態畫到 canvas：鏡頭捲動 + 地底/網格/礦山/背景泥土/前景方塊/核心/玩家
 * @exports     Renderer
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-design-plan.md「建築維度」「遊戲內 UI 設計」
 * @version     v0.0.3.0
 *
 * 渲染層只「讀」world 狀態畫圖，不寫任何遊戲規則（鐵則 9）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { BLOCKS } from '../../config/blocks.js';
import { inventoryWeight } from '../logic/inventory.js';

const fmtItems = (obj) => {
  const parts = Object.entries(obj)
    .filter(([, q]) => q > 0)
    .map(([k, q]) => `${BLOCKS[k]?.zh ?? k}x${q}`);
  return parts.length ? parts.join(' ') : '（空）';
};

const PALETTE = {
  sky: '#10151f',
  ground: '#3a2c1c',
  grid: 'rgba(255,255,255,0.05)',
  dirt: '#6b4a2b',
  core: '#c0392b',
  coreEdge: '#7d241a',
  player: '#3fae5a',
  mine: 'rgba(90,120,150,0.35)',
  mineEdge: '#5a7896',
  block: {
    sand: '#d9c27a', stone: '#8a8a8a', iron: '#b6b6c6', gold: '#e6c64d',
    glass: '#7fd0e0', diamond: '#bdf2ff', ladder: '#8b5a2b', dirt: '#6b4a2b',
  },
};

const parseKey = (k) => k.split(',').map(Number);

export class Renderer {
  constructor(canvas, cfg = GAME_CONFIG) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.t = cfg.render.tilePx;
    this.viewport = cfg.map.viewportPx;
    if (canvas) {
      canvas.width = this.viewport.width;
      canvas.height = this.viewport.height;
      canvas.style.width = `${this.viewport.width}px`;
      canvas.style.height = `${this.viewport.height}px`;
      canvas.style.imageRendering = 'pixelated';
    }
    this.ctx = canvas?.getContext?.('2d') ?? null;
  }

  render(world) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.canvas.dataset.playerX = world.player.x.toFixed(3);
    this.canvas.dataset.playerY = world.player.y.toFixed(3);
    this.canvas.dataset.updateTick = String(world.clock.updateTick);
    const t = this.t;
    const { width: vw, height: vh } = this.viewport;
    // 平移：snapToPixel 時整數對齊（pixelated 邊緣不抖），否則用平滑浮點值
    const snap = this.cfg.camera?.snapToPixel ?? true;
    const camX = snap ? Math.round(world.camera.x) : world.camera.x;
    const camY = snap ? Math.round(world.camera.y) : world.camera.y;

    ctx.clearRect(0, 0, vw, vh);
    ctx.fillStyle = PALETTE.sky;
    ctx.fillRect(0, 0, vw, vh); // 天空畫在螢幕座標 → 背景固定，不跟著捲

    ctx.save();
    ctx.translate(-camX, -camY);

    // 可見格範圍（culling）
    const x0 = Math.floor(camX / t), x1 = Math.ceil((camX + vw) / t);
    const y0 = Math.floor(camY / t), y1 = Math.ceil((camY + vh) / t);

    this._drawGround(world, x0, x1, y0, y1);
    if (this.cfg.render.showGrid) this._drawGrid(x0, x1, y0, y1);
    this._drawMines(world);
    this._drawDirt(world);
    this._drawFore(world);
    this._drawCore(world);
    this._drawPlayer(world);

    ctx.restore();

    this._drawHud(world); // 螢幕座標 HUD（不受鏡頭位移）
  }

  _drawHud(world) {
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    const inv = world.player.inventory;
    const lines = [
      `背包 ${inventoryWeight(inv)}/${world.player.capacity}　${fmtItems(inv)}`,
      `塔內 ${fmtItems(world.storage)}`,
    ];
    if (world.mining?.full) lines.push('⚠ 背包已滿，靠近核心可自動卸貨');

    const panelH = 8 + lines.length * 16;
    ctx.save();
    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, vh - panelH - 8, vw - 16, panelH);
    ctx.fillStyle = '#eee';
    lines.forEach((ln, i) => ctx.fillText(ln, 14, vh - panelH - 2 + i * 16));
    ctx.restore();
  }

  _cell(x, y, color, inset = 0) {
    const t = this.t;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x * t + inset, y * t + inset, t - inset * 2, t - inset * 2);
  }

  _drawGround(world, x0, x1, y0, y1) {
    const t = this.t;
    const gy = Math.max(world.groundY, y0);
    if (gy <= y1) {
      this.ctx.fillStyle = PALETTE.ground;
      this.ctx.fillRect(x0 * t, gy * t, (x1 - x0) * t, (y1 - gy) * t);
    }
  }

  _drawGrid(x0, x1, y0, y1) {
    const t = this.ctx, s = this.t;
    t.strokeStyle = PALETTE.grid;
    t.lineWidth = 1;
    t.beginPath();
    for (let x = x0; x <= x1; x++) { t.moveTo(x * s, y0 * s); t.lineTo(x * s, y1 * s); }
    for (let y = y0; y <= y1; y++) { t.moveTo(x0 * s, y * s); t.lineTo(x1 * s, y * s); }
    t.stroke();
  }

  _drawMines(world) {
    for (const m of Object.values(world.mines)) {
      const t = this.t;
      const [c0] = m.cols, [r0] = m.rows;
      const x = m.cols[0] * t, y = m.rows[0] * t;
      const w = (m.cols[1] - m.cols[0] + 1) * t, h = (m.rows[1] - m.rows[0] + 1) * t;
      // 礦山可見方塊
      const cols = m.mine.columns;
      for (let ci = 0; ci < cols.length; ci++) {
        for (let ri = 0; ri < cols[ci].length; ri++) {
          const bk = cols[ci][ri];
          if (bk) this._cell(c0 + ci, r0 + ri, PALETTE.block[bk] ?? '#999');
        }
      }
      // 礦山範圍邊框（辨識用）
      this.ctx.strokeStyle = PALETTE.mineEdge;
      this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  _drawDirt(world) {
    for (const k of world.dirt) {
      const [x, y] = parseKey(k);
      this._cell(x, y, PALETTE.dirt);
    }
  }

  _drawFore(world) {
    for (const [k, blockKey] of world.fore) {
      const [x, y] = parseKey(k);
      const color = PALETTE.block[blockKey] ?? '#999';
      this._cell(x, y, color, 1); // 略內縮，視覺上蓋在背景泥土前方
    }
  }

  _drawCore(world) {
    const t = this.t;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of world.core) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const x = minX * t, y = minY * t, w = (maxX - minX + 1) * t, h = (maxY - minY + 1) * t;
    this.ctx.fillStyle = PALETTE.core;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeStyle = PALETTE.coreEdge;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  _drawPlayer(world) {
    const t = this.t;
    // 插值後的繪製位置（#1）：移動 smooth，不 judder
    const x = world.player.renderX ?? world.player.x;
    const y = world.player.renderY ?? world.player.y;
    this.ctx.fillStyle = PALETTE.player;
    this.ctx.beginPath();
    this.ctx.arc(x * t + t / 2, y * t + t / 2, t * 0.4, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
