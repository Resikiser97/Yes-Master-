/**
 * @file        renderer.js
 * @module      render（渲染層，非純邏輯）
 * @summary     將世界狀態畫到 canvas：鏡頭捲動 + 地底/網格/礦山/背景泥土/前景方塊/核心/玩家/HUD
 * @exports     Renderer
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-design-plan.md「建築維度」「遊戲內 UI 設計」
 * @version     v0.0.14.13
 *
 * 渲染層只「讀」world 狀態畫圖，不寫任何遊戲規則（鐵則 9）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { BLOCKS } from '../../config/blocks.js';
import { ENEMIES } from '../../config/enemies.js';
import { WAVES } from '../../config/waves.js';
import { SPRITE_SHEETS, getFrameRect } from '../../config/sprites.js';
import { coreAttackAnchors } from '../game/combatRuntime.js';
import { inventoryWeight } from '../logic/inventory.js';
import { durabilityToBreak } from '../logic/mining.js';

const INTENT_EMOJI = { mine: '⛏️', build: '🧱', destroy: '🦵', repair: '🔧', warn: '⚠️' };

const WHEEL_ITEMS = [
  { intent: 'mine',    emoji: '⛏️', angle: Math.PI },        // 左
  { intent: 'repair',  emoji: '🔧', angle: -Math.PI / 2 },   // 上
  { intent: 'build',   emoji: '🧱', angle: 0 },              // 右
  { intent: 'destroy', emoji: '🦵', angle: Math.PI / 2 },    // 下
];

function _wheelHoveredIntent(dx, dy, dist) {
  if (dist < 20) return 'warn';
  const a = Math.atan2(dy, dx);
  if (a > -Math.PI / 4 && a <= Math.PI / 4)          return 'build';   // 右
  if (a > Math.PI / 4  && a <= 3 * Math.PI / 4)      return 'destroy'; // 下
  if (a > 3 * Math.PI / 4 || a <= -3 * Math.PI / 4) return 'mine';    // 左
  return 'repair'; // 上
}

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
  enemy: '#d13f3f',
  enemyEdge: '#6d1f1f',
  enemyHp: '#f05a5a',
  enemyHpBack: 'rgba(0,0,0,0.65)',
  mine: 'rgba(90,120,150,0.35)',
  mineEdge: '#5a7896',
  block: {
    sand: '#d9c27a', stone: '#8a8a8a', iron: '#b6b6c6', gold: '#e6c64d',
    glass: '#7fd0e0', diamond: '#bdf2ff', ladder: '#8b5a2b', dirt: '#6b4a2b',
  },
};

const parseKey = (k) => k.split(',').map(Number);
const fmt1 = (n) => Number(n ?? 0).toFixed(1).replace(/\.0$/, '');
const fmt2 = (n) => Number(n ?? 0).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');

function cardEffectText(effect = {}) {
  if (effect.hint) return effect.hint;
  if (effect.kind === 'coreStat') {
    const heal = effect.heal != null ? `，回復 ${fmt2(effect.heal)}` : '';
    return `核心 ${effect.stat} +${fmt2(effect.add)}${heal}`;
  }
  if (effect.kind === 'playerStat') return `玩家 ${effect.stat} +${fmt2(effect.add)}`;
  if (effect.kind === 'resource') return `獲得 ${fmtItems(effect.grant ?? {})}`;
  if (effect.kind === 'modifier') {
    return (effect.mods ?? []).map((m) => `${m.stat} ${m.pct != null ? `${m.pct}%` : fmt2(m.add)}`).join(' / ');
  }
  return '效果待確認';
}

function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
  const chars = String(text ?? '').split('');
  let line = '';
  let lineCount = 0;

  for (const ch of chars) {
    const test = line + ch;
    if (line && ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, y + lineCount * lineH);
      line = ch;
      lineCount += 1;
      if (lineCount >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lineCount < maxLines) ctx.fillText(line, x, y + lineCount * lineH);
}

function drawPanel(ctx, x, y, w, h, opts = {}) {
  ctx.fillStyle = opts.bg ?? 'rgba(0,0,0,0.75)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = opts.border ?? '#666';
  ctx.lineWidth = opts.borderWidth ?? 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawBar(ctx, x, y, w, h, pct, color, opts = {}) {
  const safePct = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * safePct), h);
  if (opts.text) {
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFF';
    ctx.fillText(opts.text, x + w / 2, y + h / 2);
  }
}

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
    // Sprite 圖示（由 main.js 非同步載入後注入）
    this._sprites = null;
    // 範圍圈 lazy cache（key = `${range}:${tilePx}`）
    this._rangeCacheKey = '';
    this._rangeCanvas = null;
  }

  /** 注入已載入的 sprites Map（main.js 在圖片 onload 後呼叫） */
  setSprites(imgs) {
    this._sprites = imgs;
  }

  /** 視窗縮放後由外部呼叫：cfg.render.tilePx 和 cfg.map.viewportPx 已由 applyTilePx 更新。 */
  resize(cfg) {
    this.cfg = cfg;
    this.t = cfg.render.tilePx;
    this.viewport = cfg.map.viewportPx;
    if (this.canvas) {
      this.canvas.width  = this.viewport.width;
      this.canvas.height = this.viewport.height;
      this.canvas.style.width  = `${this.viewport.width}px`;
      this.canvas.style.height = `${this.viewport.height}px`;
    }
    this.ctx = this.canvas?.getContext?.('2d') ?? null;
    this._rangeCacheKey = ''; // 縮放後強制重建範圍圈 cache
    this._rangeCanvas = null;
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
    this._drawRangeCircle(world);    // 攻擊範圍圈（泥土之上、前景方塊之下）
    this._drawFore(world);
    this._drawCore(world);
    this._drawEnemies(world);
    this._drawVFX(world);            // 電擊 VFX（敵人之上，讀取攻擊時固定生成的路徑）
    this._drawPlayer(world);
    this._drawDrops(world);          // 掉落物（世界座標）
    this._drawBuildPreview(world);   // 放置預覽（世界座標）
    this._drawMiningProgress(world); // 挖礦進度血條（世界座標，只顯示已被敲過的格）

    ctx.restore();

    if (this.cfg.render.drawCanvasHud !== false) {
      this._drawPlayerPanel(world);
      this._drawPartyBar(world);
      this._drawWaveTimer(world);
      this._drawBackpack(world);
      this._drawCoreStatsPanel(world);
      this._drawCoreHpBar(world);
      this._drawEnemyInfo(world);
      this._drawXpGoldBar(world);
      this._drawDesktopHotbar(world);
      this._drawHotbarTooltip(world);
      this._drawModeHint(world);
      this._drawVersionLabel();
      this._drawExitButton();
    }
    this._drawIntentWheel(world);
    if (world.phase === 'gameover') this._drawGameOverOverlay(world);
    if (world.phase === 'cardOffer') this._drawCardOffer(world);
    if (world.firstGame && world.tutorialTimer > 0) this._drawTutorialHint(world);
    if (world.debugPaused) this._drawPausedOverlay();
    if (world.showDebug) this._drawDebugOverlay(world);
  }

  _drawMiningProgress(world) {
    const prog = world.mineProgress;
    const m = world.mining;
    const activeKey = m?.targetKey;

    // 繪製所有已存進度的礦格（非活動中的）
    if (prog) {
      for (const [tk, savedDmg] of Object.entries(prog)) {
        if (tk === activeKey || savedDmg <= 0) continue;
        this._drawMineBar(world, tk, savedDmg);
      }
    }

    // 繪製活動中的礦格（即時進度，可能比 saved 更新）
    if (activeKey && m.damage > 0) {
      this._drawMineBar(world, activeKey, m.damage);
    }
  }

  _drawMineBar(world, targetKey, damage) {
    const parts = targetKey.split(',');
    if (parts.length < 4) return;
    const [mineId, colStr, rowStr, blockKey] = parts;
    const mine = world.mines?.[mineId];
    if (!mine) return;
    const col = Number(colStr);
    const row = Number(rowStr);
    const wx = mine.cols[0] + col;
    const wy = mine.rows[0] + row;
    const t = this.t;
    const maxDur = durabilityToBreak(blockKey);
    if (maxDur <= 0) return;
    const pct = Math.min(1, damage / maxDur);
    const barW = t - 4;
    const barH = 3;
    const bx = wx * t + 2;
    const by = wy * t - 5;
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(bx, by, barW, barH);
    const r = Math.round(255 * pct);
    const g = Math.round(180 * (1 - pct));
    this.ctx.fillStyle = `rgb(${r},${g},40)`;
    this.ctx.fillRect(bx, by, Math.round(barW * pct), barH);
  }

  _drawDrops(world) {
    const drops = world.drops;
    if (!drops?.length) return;
    const ctx = this.ctx;
    const t = this.t;
    const inset = Math.round(t * 0.2);
    const sz = t - inset * 2;
    for (const d of drops) {
      const color = PALETTE.block[d.blockKey] ?? '#888';
      ctx.fillStyle = color;
      ctx.fillRect(d.x * t + inset, d.y * t + inset + Math.round(t * 0.3), sz, sz);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(d.x * t + inset + 0.5, d.y * t + inset + Math.round(t * 0.3) + 0.5, sz - 1, sz - 1);
      if ((d.qty ?? 1) > 1) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, Math.round(t * 0.45))}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(d.qty), d.x * t + t - 1, d.y * t + t);
      }
    }
  }

  _drawBuildPreview(world) {
    const pv = world.buildPreview;
    if (!pv) return;
    const t = this.t;

    // Build Plan / Destroy Mode 拖拽矩形預覽
    const drag = world.buildPlanDrag;
    if (drag) {
      const x1 = Math.min(drag.startX, drag.endX);
      const y1 = Math.min(drag.startY, drag.endY);
      const x2 = Math.max(drag.startX, drag.endX);
      const y2 = Math.max(drag.startY, drag.endY);
      const isDestroy = world.buildDestroyMode;
      const preview = world.buildPlanDragPreview;
      const notEnough = !isDestroy && preview && !preview.enough;
      const fillColor = isDestroy ? 'rgba(192,57,43,0.2)' : notEnough ? 'rgba(192,57,43,0.2)' : 'rgba(63,174,90,0.2)';
      const strokeColor = isDestroy ? '#c0392b' : notEnough ? '#c0392b' : '#3fae5a';
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(x1 * t, y1 * t, (x2 - x1 + 1) * t, (y2 - y1 + 1) * t);
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(x1 * t + 1, y1 * t + 1, (x2 - x1 + 1) * t - 2, (y2 - y1 + 1) * t - 2);
      this.ctx.setLineDash([]);
      // 資源需求提示（世界座標，畫在矩形中央）
      if (!isDestroy && preview) {
        const cx = (x1 + x2 + 1) * t / 2;
        const cy = (y1 + y2 + 1) * t / 2;
        this.ctx.font = 'bold 12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = notEnough ? '#ff4444' : '#ffffff';
        this.ctx.fillText(`${preview.needed}/${preview.available}`, cx, cy);
      }
      return;
    }

    this.ctx.fillStyle = pv.valid ? 'rgba(63,174,90,0.35)' : 'rgba(192,57,43,0.35)';
    this.ctx.fillRect(pv.x * t, pv.y * t, t, t);
    this.ctx.strokeStyle = pv.valid ? '#3fae5a' : '#c0392b';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(pv.x * t + 1, pv.y * t + 1, t - 2, t - 2);
  }

  _hotbarMetrics() {
    const hotbar = this.cfg.hotbar ?? [];
    const slotSize = 40;
    const gap = 4;
    const totalW = hotbar.length * slotSize + Math.max(0, hotbar.length - 1) * gap;
    const barH = slotSize + 18;
    const { width: vw, height: vh } = this.viewport;
    return {
      hotbar,
      slotSize,
      gap,
      totalW,
      barH,
      startX: Math.round((vw - totalW) / 2),
      barY: vh - barH - 4,
    };
  }

  _drawPlayerPanel(world) {
    const ctx = this.ctx;
    const x = 8, y = 8, w = 240;
    const expanded = world.uiState?.playerExpanded ?? false;
    const h = expanded ? 186 : 90;
    const avatarCx = x + 37;
    const avatarCy = y + 37;
    const avatarStroke = expanded ? '#5ba4f5' : '#555';
    const startX = x + 80;
    const startY = y + 14;
    const lineH = 18;
    const fatigue = Number(world.player?.fatigue ?? 0);
    const fatigueMax = Number(this.cfg.player?.fatigueMax ?? 120);
    const fatiguePct = fatigueMax > 0 ? fatigue / fatigueMax : 0;

    world.uiHitRects ??= [];
    world.uiHitRects = world.uiHitRects.filter((r) => r.id !== 'playerPanel');
    world.uiHitRects.push({ id: 'playerPanel', x, y, w, h });

    ctx.save();
    drawPanel(ctx, x, y, w, h, { bg: 'rgba(0,0,0,0.68)', border: '#333' });

    ctx.fillStyle = 'rgba(60,60,60,0.5)';
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = avatarStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#E0D6B8';
    ctx.fillText('👺', avatarCx, avatarCy + 1);

    ctx.fillStyle = 'rgba(26,31,43,1)';
    ctx.beginPath();
    ctx.arc(avatarCx - 20, avatarCy - 20, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = avatarStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '10px sans-serif';
    ctx.fillStyle = expanded ? '#5ba4f5' : '#888';
    ctx.fillText('⚙', avatarCx - 20, avatarCy - 20 + 0.5);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#5ba4f5';
    ctx.fillText('挖掘能力', startX, startY);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(String(this.cfg.player?.mining ?? 0), startX + 62, startY - 1);

    const barX = startX;
    const barY = startY + lineH + 15;
    const barW = 142;
    const barH = 12;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#4CAF50';
    ctx.fillText('疲勞值', startX, startY + lineH);
    ctx.fillStyle = '#1e2330';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(barX, barY, Math.round(barW * Math.max(0, Math.min(1, fatiguePct))), barH);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(barX + 42, barY + 1, 58, barH - 2);
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f3f7f0';
    ctx.fillText(`${Math.round(fatigue)}/${Math.round(fatigueMax)}`, barX + barW / 2, barY + barH / 2 + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#556';
    ctx.fillText(`每分鐘回復 ${this.cfg.player?.fatigue ?? 0}`, barX, barY + 15);

    const dividerY = startY + lineH * 2 + 24;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x + 10, dividerY);
    ctx.lineTo(x + w - 10, dividerY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'center';
    ctx.fillText(expanded ? '▲ 點擊頭像收合' : '▼ 點擊頭像展開', x + w / 2, dividerY + 4);

    if (expanded) {
      const spiritPct = ((this.cfg.player?.spirit ?? 0) / 100 * 10
        + (this.cfg.mode === 'single' ? (this.cfg.player?.spiritSinglePlayerBonusPct ?? 0) : 0)).toFixed(0);
      const repairPerSec = Math.floor(((this.cfg.player?.repair ?? 0) / 60) * 100) / 100;
      const rows = [
        ['靈動能力', `核心加成 ${spiritPct}%`, '#FFD700'],
        ['背負能力', String(this.cfg.player?.carry ?? world.player?.capacity ?? 0), '#FF9800'],
        ['修復能力', `${repairPerSec.toFixed(2)}/s`, '#E91E63'],
        ['移動速度', String(this.cfg.player?.moveSpeed ?? world.player?.moveSpeed ?? 0), '#F44336'],
      ];
      ctx.textAlign = 'left';
      ctx.font = '11px sans-serif';
      rows.forEach(([label, value, color], i) => {
        const rowY = dividerY + 22 + i * 18;
        ctx.fillStyle = color;
        ctx.fillText(label, startX, rowY);
        ctx.fillText(value, startX + 62, rowY);
      });
    }
    ctx.restore();
  }

  _drawPartyBar(world) {
    const players = world.players;
    if (!players || players.size <= 1) return;
    const localId = world.localPlayerId;
    const others = [...players.values()].filter(p => p.id !== localId);
    if (others.length === 0) return;

    const ctx = this.ctx;
    const { width: vw } = this.viewport;
    const cardW = 160, cardH = 50, gap = 8;
    const totalW = others.length * cardW + (others.length - 1) * gap;
    let cardX = Math.round((vw - totalW) / 2);
    const cardY = 8;
    const fatigueMax = Number(this.cfg.player?.fatigueMax ?? 120);
    ctx.save();
    for (const p of others) {
      const fatigue = Number(p.fatigue ?? 0);
      const fatiguePct = fatigueMax > 0 ? fatigue / fatigueMax : 0;
      const offline = p.online === false;

      drawPanel(ctx, cardX, cardY, cardW, cardH, { bg: 'rgba(0,0,0,0.68)', border: offline ? '#555' : '#333' });

      // intent emoji（卡片頂部上方，30 秒內有效）
      const intentEmoji = INTENT_EMOJI[p.intent];
      if (intentEmoji && (Date.now() - (p.intentAt ?? 0)) < 30_000) {
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(intentEmoji, cardX + cardW / 2, cardY - 2);
      }

      // avatar circle
      const avatarCx = cardX + 20;
      const avatarCy = cardY + cardH / 2;
      ctx.fillStyle = offline ? 'rgba(40,40,40,0.5)' : 'rgba(60,60,60,0.5)';
      ctx.beginPath();
      ctx.arc(avatarCx, avatarCy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = offline ? '#444' : '#555';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = offline ? 0.4 : 1;
      ctx.fillText('👺', avatarCx, avatarCy + 1);
      ctx.globalAlpha = 1;

      // right side
      const rx = cardX + 44;
      const nameY = cardY + 10;
      const barY = cardY + 27;
      const barW = cardW - 44 - 8;

      // player id label (truncated)
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = offline ? '#555' : '#AAA';
      const label = String(p.id).slice(0, 12);
      ctx.fillText(label, rx, nameY);

      // fatigue bar
      ctx.fillStyle = '#1e2330';
      ctx.fillRect(rx, barY, barW, 10);
      ctx.fillStyle = offline ? '#555' : '#4CAF50';
      ctx.fillRect(rx, barY, Math.round(barW * Math.max(0, Math.min(1, fatiguePct))), 10);
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f3f7f0';
      ctx.fillText(`${Math.round(fatigue)}/${Math.round(fatigueMax)}`, rx + barW / 2, barY + 5.5);

      cardX += cardW + gap;
    }
    ctx.restore();
  }

  _drawIntentWheel(world) {
    const ws = world.intentWheel;
    if (!ws) return;
    const { cx, cy, mx, my } = ws;
    const dx = mx - cx, dy = my - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hovered = _wheelHoveredIntent(dx, dy, dist);
    const R = 62;
    const ctx = this.ctx;
    ctx.save();
    // background disc
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    ctx.arc(cx, cy, R + 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // directional items
    for (const item of WHEEL_ITEMS) {
      const ex = cx + Math.cos(item.angle) * R;
      const ey = cy + Math.sin(item.angle) * R;
      if (hovered === item.intent) {
        ctx.fillStyle = 'rgba(255,230,80,0.28)';
        ctx.beginPath();
        ctx.arc(ex, ey, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, ex, ey);
    }
    // center item ⚠️
    if (hovered === 'warn') {
      ctx.fillStyle = 'rgba(255,80,80,0.28)';
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠️', cx, cy);
    ctx.restore();
  }

  _drawWaveTimer(world) {
    const ctx = this.ctx;
    const { width: vw } = this.viewport;
    const w = 200, h = 80;
    const x = vw - w - 56, y = 8;
    const stage = world.stage ?? 0;
    const set = Math.floor(stage / 10) + 1;
    const num = (stage % 10) + 1;
    const stageInSet = stage % 10;
    const phase = world.phase ?? 'prep';
    const phaseLabel = phase === 'prep' ? '準備中' : phase === 'day' ? '白天' : phase === 'night' ? '夜晚' : phase === 'overtime' ? '加時賽' : phase;
    const t = Math.max(0, world.phaseTimer ?? 0);
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    const timerColor = phase === 'day'
      ? '#FFD700'
      : phase === 'night'
        ? '#FF6B6B'
        : phase === 'overtime'
          ? (Date.now() % 1000 < 500 ? '#FF0000' : '#7A0000')
          : '#FFF';

    ctx.save();
    drawPanel(ctx, x, y, w, h, { bg: 'rgba(0,0,0,0.7)', border: '#666' });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`關卡 ${set}-${num}`, x + 8, y + 7);

    const dotY = y + 31;
    const dotStartX = x + 11;
    for (let i = 0; i < 10; i++) {
      const dx = dotStartX + i * 16 + (i === 9 ? 7 : 0);
      if (i === 9) {
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx - 8.5, dotY - 7);
        ctx.lineTo(dx - 8.5, dotY + 7);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(dx, dotY, 5, 0, Math.PI * 2);
      ctx.fillStyle = i < stageInSet ? '#4CAF50' : i === 9 ? '#FF9800' : '#555';
      ctx.fill();
      if (i === stageInSet) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = timerColor;
    ctx.fillText(`[${mm}:${ss}]`, x + w / 2, y + 42);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#AAA';
    ctx.fillText(phaseLabel, x + w / 2, y + 62);
    ctx.restore();
  }

  _drawBackpack(world) {
    const ctx = this.ctx;
    const { height: vh } = this.viewport;
    const w = 128, h = 160;
    const x = 6, y = vh - h - 6;
    const inv = world.player?.inventory ?? {};
    const currentWeight = inventoryWeight(inv);
    const maxWeight = world.player?.capacity ?? this.cfg.player?.carry ?? 0;
    const isFull = maxWeight > 0 && currentWeight >= maxWeight;
    const border = isFull && Date.now() % 600 < 300 ? '#FF0000' : '#CD7F32';

    ctx.save();
    drawPanel(ctx, x, y, w, h, { bg: 'rgba(0,0,0,0.7)', border, borderWidth: 2 });
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#CD7F32';
    ctx.fillText(`背包承重：${fmt1(currentWeight)}/${fmt1(maxWeight)}`, x + 6, y + 6);

    const hotbar = this.cfg.hotbar ?? [];
    const orderedKeys = Object.keys(inv)
      .filter((key) => (inv[key] ?? 0) > 0)
      .sort((a, b) => {
        const ai = hotbar.indexOf(a);
        const bi = hotbar.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
      })
      .slice(0, 6);

    // cellW=48, gap=3 → 2 cols = 99px; (128-99)/2 = 14 → symmetric left/right padding
    const cellW = 48, cellH = 40, gap = 3;
    const gridX = x + 14, gridY = y + 24;
    for (let i = 0; i < 6; i++) {
      const cx = gridX + (i % 2) * (cellW + gap);
      const cy = gridY + Math.floor(i / 2) * (cellH + gap);
      const blockKey = orderedKeys[i];
      ctx.fillStyle = 'rgba(60,40,20,0.5)';
      ctx.fillRect(cx, cy, cellW, cellH);
      ctx.strokeStyle = '#8B6914';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1);
      if (!blockKey) continue;

      const iconSize = 26;
      const iconX = cx + Math.round((cellW - iconSize) / 2);
      const iconY = cy + 6;
      if (!this._drawBlockIcon(blockKey, iconX, iconY, iconSize)) {
        ctx.fillStyle = PALETTE.block[blockKey] ?? '#888';
        ctx.fillRect(iconX + 2, iconY + 2, iconSize - 4, iconSize - 4);
      }
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.fillStyle = '#FFF';
      ctx.fillText(`${inv[blockKey] ?? 0}`, cx + cellW - 4, cy + cellH - 3);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  _drawCoreStatsPanel(world) {
    const ctx = this.ctx;
    const { startX, barY } = this._hotbarMetrics();
    const expanded = world.uiState?.coreExpanded ?? false;

    world.uiHitRects ??= [];
    world.uiHitRects = world.uiHitRects.filter((r) => r.id !== 'corePanel');

    const cs = world.coreStats ?? {};

    if (!expanded) {
      // Collapsed: single row — attack + speed + expand hint
      // y positions panel bottom at barY-28, just above _drawCoreHpBar label (≈barY-27)
      const x = startX, y = barY - 56, w = 280, h = 28;
      world.uiHitRects.push({ id: 'corePanel', x, y, w, h });
      ctx.save();
      drawPanel(ctx, x, y, w, h, { bg: 'rgba(0,0,0,0.65)', border: '#555' });
      ctx.textBaseline = 'middle';
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#CCC';
      ctx.textAlign = 'left';
      ctx.fillText(`攻擊力：${fmt2(cs.attack)}`, x + 8, y + h / 2);
      ctx.fillText(`攻速(每秒)：${fmt2(cs.attackSpeed)}`, x + 128, y + h / 2);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'right';
      ctx.fillText('▼ 點擊展開', x + w - 8, y + h / 2);
      ctx.restore();
      return;
    }

    // Expanded: three rows of stats
    // bottom at barY-28, same clearance as collapsed
    const x = startX, y = barY - 108, w = 280, h = 80;
    world.uiHitRects.push({ id: 'corePanel', x, y, w, h });
    const defense = Number(cs.defense ?? 0);
    const defenseK = Number(this.cfg.core?.defenseK ?? 100);
    const reductionPct = defenseK + defense > 0 ? (defense / (defenseK + defense)) * 100 : 0;

    ctx.save();
    drawPanel(ctx, x, y, w, h, { border: '#999' });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Row 1: attack + speed + collapse hint
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.fillText(`攻擊力：${fmt2(cs.attack)}`, x + 8, y + 10);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#CCC';
    ctx.fillText(`攻速(每秒)：${fmt2(cs.attackSpeed)}`, x + 118, y + 10);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'right';
    ctx.fillText('▲ 收起', x + w - 8, y + 12);

    // Row 2: range + defense
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#CCC';
    ctx.fillText(`攻擊範圍：${fmt1(cs.range)}`, x + 8, y + 30);
    ctx.fillText(`防禦力：${fmt2(defense)}（抵擋${reductionPct.toFixed(0)}%）`, x + 118, y + 30);

    // Row 3: magic amp + magic atk + chain
    ctx.fillText(`靈力增幅：${fmt2(cs.magicPct)}%`, x + 8, y + 50);
    ctx.fillText(`魔法攻擊：${fmt2(cs.magicAtk)}`, x + 118, y + 50);
    ctx.fillText(`連鎖：${fmt2(cs.chain)}`, x + 210, y + 50);

    ctx.restore();
  }

  _drawCoreHpBar(world) {
    const ctx = this.ctx;
    const { startX, totalW, barY } = this._hotbarMetrics();
    const cs = world.coreStats ?? {};
    const hpCur = world.coreHp ?? cs.hpMax ?? 0;
    const hpMax = cs.hpMax ?? 0;
    if (hpMax <= 0) return;

    const barH = 12;
    const y = barY - 16;
    const pct = Math.max(0, Math.min(1, hpCur / hpMax));

    ctx.save();
    // Label
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#F44336';
    ctx.fillText('核心血量', startX + totalW / 2, y - 1);

    // Bar background
    ctx.fillStyle = '#1e2330';
    ctx.fillRect(startX, y, totalW, barH);
    // Bar fill
    ctx.fillStyle = pct > 0.3 ? '#388E3C' : '#F44336';
    ctx.fillRect(startX, y, Math.round(totalW * pct), barH);

    // Center text
    ctx.font = 'bold 9px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFF';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    ctx.fillText(`${Math.round(hpCur)} / ${Math.round(hpMax)}`, startX + totalW / 2, y + barH / 2);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _drawEnemyInfo(world) {
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    const w = 260, h = 80;
    const x = vw - w - 8, y = vh - 152;
    const currentStage = (world.stage ?? 0) + 1;
    const nextStage = currentStage + 1;
    const counts = {};
    for (const enemy of world.enemies ?? []) {
      if (!enemy?.key) continue;
      counts[enemy.key] = (counts[enemy.key] ?? 0) + 1;
    }
    const currentText = this._formatEnemyCounts(counts, '— 無敵人');
    const nextText = WAVES[nextStage]
      ? this._formatEnemyCounts(WAVES[nextStage], '— 無敵人')
      : '— 最終波已過';

    ctx.save();
    drawPanel(ctx, x, y, w, h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#F44336';
    ctx.fillText('進攻人數', x + 8, y + 7);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.fillText(`當前波 ${this._stageLabel(currentStage)} ${currentText}`, x + 8, y + 28, w - 16);
    ctx.fillStyle = '#AAA';
    ctx.fillText(`下一波 ${this._stageLabel(nextStage)} ${nextText}`, x + 8, y + 48, w - 16);
    ctx.restore();
  }

  _drawXpGoldBar(world) {
    if (!(world.uiState?.coreExpanded ?? false)) return;
    const ctx = this.ctx;
    const { startX, barY } = this._hotbarMetrics();
    const y = barY - 24;
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`累計經驗：${world.totalXP ?? 0}XP，累計卡片：${world.totalCards ?? 0}張，累計金幣：${world.totalGold ?? 0}`, startX, y);
    ctx.restore();
  }

  _drawVersionLabel() {
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    const exitW = 58;
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#666666';
    ctx.fillText('@Goblin Nest', vw - exitW - 20, vh - 48);
    ctx.fillText(String(GAME_CONFIG.version).toUpperCase(), vw - exitW - 20, vh - 34);
    ctx.restore();
  }

  _drawExitButton() {
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    const w = 58, h = 24;
    const x = vw - w - 8, y = vh - h - 32;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#F44336';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F44336';
    ctx.fillText('EXIT', x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  _drawModeHint(world) {
    const ctx = this.ctx;
    const { width: vw } = this.viewport;
    const planTag = world.buildDestroyMode ? '【🔨 拆除模式】' : world.buildPlanMode ? '【📐 規劃模式】' : '';
    const modeText = world.buildDestroyMode && world.selectedBlock
      ? `${planTag} 拆除：${BLOCKS[world.selectedBlock]?.zh ?? world.selectedBlock}　拖拽選區拆除 / V 切回建造 / B 退出`
      : world.buildPlanMode && world.selectedBlock
      ? `${planTag} 建造：${BLOCKS[world.selectedBlock]?.zh ?? world.selectedBlock}（剩 ${BLOCKS[world.selectedBlock]?.infinite ? '∞' : (world.storage[world.selectedBlock] ?? 0)}）　拖拽放置 / V 拆除模式 / B 退出`
      : world.selectedBlock
      ? `建造：${BLOCKS[world.selectedBlock]?.zh ?? world.selectedBlock}（剩 ${BLOCKS[world.selectedBlock]?.infinite ? '∞' : (world.storage[world.selectedBlock] ?? 0)}）　左鍵放置 / 右鍵拆除 / 再按取消`
      : `挖礦模式（左鍵長按挖最近）　按 1~8 選材料建造${world.buildPlanMode ? '　' + planTag : ''}`;
    const status = world.mining?.dropFull
      ? '　⚠ 地面已滿'
      : world.mining?.full
        ? '　⚠ 背包已滿'
        : world.repair?.active
          ? '　修復中'
          : world.repair?.reason === 'not_on_foundation'
            ? '　需站在核心或連通地基上'
            : world.repair?.reason === 'no_fatigue'
              ? '　疲勞不足'
              : '';
    const text = `${modeText}${status}`;
    const panelW = Math.min(vw - 32, 620);
    const panelH = 28;
    const x = Math.round((vw - panelW) / 2);
    const y = world.uiState?.playerExpanded ? 202 : 96;

    ctx.save();
    drawPanel(ctx, x, y, panelW, panelH, { bg: 'rgba(0,0,0,0.62)', border: 'rgba(255,180,0,0.25)' });
    let textX = x + 12;
    const textMaxW = panelW - 24 - (world.selectedBlock ? 22 : 0);
    if (world.selectedBlock && this._drawBlockIcon(world.selectedBlock, x + 10, y + 6, 16)) {
      textX += 22;
    }
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#EEE';
    ctx.fillText(text, textX, y + panelH / 2, textMaxW);
    ctx.restore();
  }

  _formatEnemyCounts(counts, emptyText) {
    const parts = Object.entries(counts ?? {})
      .filter(([, count]) => count > 0)
      .map(([key, count]) => {
        const def = ENEMIES[key];
        const hp = def?.hp != null ? ` [血量${fmt1(def.hp)}]` : '';
        return `${def?.zh ?? key}x${count}${hp}`;
      });
    return parts.length ? parts.join(' ') : emptyText;
  }

  _stageLabel(stage) {
    const s = Math.max(1, Number(stage) || 1);
    return `${Math.floor((s - 1) / 10) + 1}-${((s - 1) % 10) + 1}`;
  }

  _drawDesktopHotbar(world) {
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    const hotbar = this.cfg.hotbar ?? [];
    if (!hotbar.length) return;

    const slotSize = 40;
    const iconSize = 28;
    const gap = 4;
    const totalW = hotbar.length * slotSize + (hotbar.length - 1) * gap;
    const barH = slotSize + 18;
    const startX = Math.round((vw - totalW) / 2);
    const barY = vh - barH - 4;

    ctx.save();

    // 背景條
    ctx.fillStyle = 'rgba(10,16,24,0.72)';
    ctx.fillRect(startX - 6, barY - 4, totalW + 12, barH + 8);
    ctx.strokeStyle = 'rgba(255,180,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX - 6 + 0.5, barY - 4 + 0.5, totalW + 11, barH + 7);

    const labels = ['1','2','3','4','5','6','7','8','9','0'];

    const isBackpackSlot = (i) => i === hotbar.length - 1;

    for (let i = 0; i < hotbar.length; i++) {
      const blockKey = hotbar[i];
      const sx = startX + i * (slotSize + gap);
      const sy = barY;
      const selected = blockKey != null && world.selectedBlock === blockKey;

      // 槽位背景
      ctx.fillStyle = selected ? 'rgba(212,160,23,0.3)' : 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx, sy, slotSize, slotSize);
      ctx.strokeStyle = selected ? '#D4A017' : 'rgba(255,180,0,0.3)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, slotSize - 1, slotSize - 1);

      const iconX = sx + Math.round((slotSize - iconSize) / 2);
      const iconY = sy + Math.round((slotSize - iconSize) / 2);

      if (isBackpackSlot(i)) {
        // ⚙️ 背包按鈕
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(240,176,32,0.8)';
        ctx.fillText('⚙️', sx + slotSize / 2, sy + slotSize / 2);
      } else if (blockKey) {
        // 方塊 sprite 圖示
        if (!this._drawBlockIcon(blockKey, iconX, iconY, iconSize)) {
          ctx.fillStyle = PALETTE.block[blockKey] ?? '#888';
          ctx.fillRect(iconX + 2, iconY + 2, iconSize - 4, iconSize - 4);
        }
      }

      // 快捷鍵數字（左上角）
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = selected ? '#D4A017' : 'rgba(240,176,32,0.6)';
      ctx.fillText(labels[i] ?? '', sx + 3, sy + 2);

      // 數量（槽位下方，背包格和空格不顯示）
      if (blockKey) {
        const isInfinite = BLOCKS[blockKey]?.infinite;
        const qty = world.storage?.[blockKey] ?? 0;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isInfinite || qty > 0 ? '#ddd' : 'rgba(255,255,255,0.3)';
        ctx.fillText(isInfinite ? '∞' : `${qty}`, sx + slotSize / 2, sy + slotSize + 2);
      }
    }

    ctx.restore();
  }

  _drawHotbarTooltip(world) {
    const tt = world.hotbarTooltip;
    if (!tt?.blockKey || tt.timer <= 0) return;

    const blockKey = tt.blockKey;
    const def = BLOCKS[blockKey];
    if (!def) return;

    const alpha = Math.min(1, tt.timer / 0.15); // 最後 0.15s 淡出
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    const hotbar = this.cfg.hotbar ?? [];

    // 找到對應槽位的 x 中心
    const slotSize = 40;
    const gap = 4;
    const totalW = hotbar.length * slotSize + (hotbar.length - 1) * gap;
    const startX = Math.round((vw - totalW) / 2);
    const barY = vh - (slotSize + 18) - 4;
    const slotIdx = hotbar.indexOf(blockKey);
    const cx = slotIdx >= 0
      ? startX + slotIdx * (slotSize + gap) + slotSize / 2
      : vw / 2;

    // 方塊名稱
    const STAT_ZH = {
      hp: '核心血量上限', range: '攻擊射程', defense: '防禦',
      attack: '攻擊', attackSpeed: '攻速', magicPct: '穿透', chain: '連鎖',
    };
    const bonus = def.bonus ?? {};
    const bonusLines = Object.entries(bonus)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => {
        const label = STAT_ZH[k] ?? k;
        const val = k === 'magicPct' ? `${v}%` : `${v > 0 ? '+' : ''}${v}`;
        return `${label} ${val}`;
      });

    const lines = [def.zh ?? blockKey, ...bonusLines];
    if (def.infinite) lines.push('無限數量');

    const padding = 10;
    const lineH = 18;
    ctx.font = 'bold 13px sans-serif';
    const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const panelW = maxLineW + padding * 2;
    const panelH = lines.length * lineH + padding * 1.5;

    const px = Math.round(cx - panelW / 2);
    const py = Math.round(barY - panelH - 8);

    ctx.save();
    ctx.globalAlpha = alpha;

    // 背景
    ctx.fillStyle = 'rgba(8,14,22,0.88)';
    ctx.beginPath();
    ctx.roundRect?.(px, py, panelW, panelH, 6) ?? ctx.fillRect(px, py, panelW, panelH);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,180,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect?.(px + 0.5, py + 0.5, panelW - 1, panelH - 1, 6) ?? ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);
    ctx.stroke();

    // 方塊名稱（白色粗體）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(lines[0], cx, py + padding * 0.75);

    // 加成行（金色）
    ctx.fillStyle = '#e6c64d';
    ctx.font = '12px sans-serif';
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, py + padding * 0.75 + lineH * i);
    }

    ctx.restore();
  }

  _drawBlockIcon(blockKey, x, y, size) {
    const img = this._sprites?.get('blocksNoFrame');
    if (!img?.complete || !img.naturalWidth || !img.naturalHeight) return false;

    const frame = getFrameRect(img, SPRITE_SHEETS.blocksNoFrame, blockKey);
    if (!frame.sw || !frame.sh) return false;

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, frame.sx, frame.sy, frame.sw, frame.sh, x, y, size, size);
    return true;
  }

  _phaseLine(world) {
    // stage 是「已清關數」（0-based），顯示用加 1 = 當前/下一波關卡號
    const waveNum = (world.stage ?? 0) + 1;
    if (world.phase === 'prep') {
      return `第 ${waveNum} 關　準備中（${fmt1(world.phaseTimer)} s）　N 鍵跳白天　Q 鍵重試`;
    }
    if (world.phase === 'day') {
      return `第 ${waveNum} 關　白天（${fmt1(world.phaseTimer)} s）　N 鍵開始夜晚　Q 鍵重試`;
    }
    if (world.phase === 'night') {
      return `第 ${waveNum} 關　夜晚 ${fmt1(world.nightElapsed)} s　敵人剩 ${world.enemies?.length ?? 0} 隻`;
    }
    if (world.phase === 'overtime') {
      const elapsed = this.cfg.phases.overtimeSeconds - (world.phaseTimer ?? 0);
      return `第 ${waveNum} 關　加時 ${fmt1(elapsed)} s　攻擊 x${fmt1(world.combat?.overtimeMultiplier ?? 1)} 倍　敵人剩 ${world.enemies?.length ?? 0} 隻`;
    }
    if (world.phase === 'gameover') {
      return `GAME OVER　第 ${waveNum} 關　按 Q 重試`;
    }
    if (world.phase === 'cardOffer') {
      return `第 ${waveNum} 關清關！　選擇一張卡片繼續`;
    }
    return `第 ${waveNum} 關　${world.phase ?? '未知階段'}`;
  }

  _drawTutorialHint(world) {
    const HINTS = {
      prep:  '按 WASD 移動　長按滑鼠左鍵挖礦　按 N 開始夜晚',
      night: '守護核心！怪物會攻擊核心　HP 歸零即失敗',
    };
    const text = HINTS[world.phase];
    if (!text) return;
    const ctx = this.ctx;
    const { width: vw } = this.viewport;
    const alpha = Math.min(1, world.tutorialTimer); // 最後 1 秒淡出
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const pad = 14, fh = 20;
    const w = vw * 0.7, h = fh + pad * 2;
    const x = (vw - w) / 2, y = world.uiState?.playerExpanded ? 236 : 132;
    ctx.beginPath();
    ctx.roundRect?.(x, y, w, h, 6) ?? ctx.fillRect(x, y, w, h);
    ctx.fill();
    ctx.fillStyle = '#f0e88a';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, vw / 2, y + h / 2);
    ctx.restore();
  }

  _drawPausedOverlay() {
    const ctx = this.ctx;
    const { width: vw } = this.viewport;
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,24,0.82)';
    ctx.strokeStyle = 'rgba(255,180,0,0.55)';
    ctx.lineWidth = 1;
    const w = 170, h = 30;
    const x = Math.round((vw - w) / 2), y = 10;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#f0b020';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DEBUG PAUSED  T 恢復', vw / 2, y + h / 2);
    ctx.restore();
  }

  _drawDebugOverlay(world) {
    const ctx = this.ctx;
    const { width: vw } = this.viewport;
    const cs = world.coreStats;
    const mPwr   = this.cfg.player?.mining ?? 0;
    const mRate  = this.cfg.player?.mineClicksPerSec?.hold ?? 5;
    const mDps   = mPwr * mRate;
    const tk     = world.mining?.targetKey;
    const bKey   = tk ? tk.split(',')[3] : null;
    const need   = bKey ? durabilityToBreak(bKey) : 0;
    const saved  = tk ? (world.mineProgress?.[tk] ?? 0) : 0;
    const active = world.mining?.damage ?? 0;
    const mineStr = tk
      ? `${fmt1(active)}/${need}  (記憶 ${fmt1(saved)})`
      : `- (記憶格: ${Object.keys(world.mineProgress ?? {}).length})`;
    const lines = [
      'DEBUG  ` 鍵關閉',
      '─────────────────',
      'H 扣血　J 回血',
      'K 補建材　L 生 1 敵',
      'P 生 5 敵　C 抽卡',
      'T 暫停/恢復',
      'N 夜晚　Q 重試',
      'X 重置存檔',
      '─────────────────',
      `tick: ${world.clock?.updateTick ?? 0}`,
      `phase: ${world.phase ?? '-'}`,
      `paused: ${world.debugPaused ? 'YES' : '-'}`,
      `stage: ${(world.stage ?? 0) + 1}  test: ${world.testMode ? '✓' : '-'}`,
      `drops: ${world.drops?.length ?? 0}  enemies: ${world.enemies?.length ?? 0}`,
      `coreHp: ${fmt1(world.coreHp ?? cs?.hpMax ?? 0)}/${fmt1(cs?.hpMax ?? 0)}`,
      `挖礦: ${mPwr}pwr × ${mRate}/s = ${mDps}dps`,
      `礦格: ${mineStr}`,
    ];
    const lineH = 16, padX = 12, padY = 8;
    ctx.save();
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    const maxTextW = Math.max(...lines.map(ln => ctx.measureText(ln).width));
    const panelW = Math.ceil(maxTextW) + padX * 2;
    const panelH = padY * 2 + lines.length * lineH;
    let rightMargin = 8;
    if (this.cfg.render.drawCanvasHud === false) {
      const rp = document.getElementById('touch-right-panel');
      if (rp) {
        const scale = this.canvas.width / (this.canvas.clientWidth || 1);
        rightMargin = Math.ceil(rp.offsetWidth * scale) + 52;
      }
    }
    const px = vw - panelW - rightMargin;
    const py = 8;
    ctx.fillStyle = 'rgba(10,16,24,0.82)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = 'rgba(255,180,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);
    ctx.fillStyle = '#f0b020';
    lines.forEach((ln, i) => ctx.fillText(ln, px + padX, py + padY + i * lineH));
    ctx.restore();
  }

  _drawGameOverOverlay(world) {
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('GAME OVER', vw / 2, vh / 2 - 18);
    ctx.font = '18px sans-serif';
    ctx.fillText(`第 ${(world.stage ?? 0) + 1} 關　按 Q 重試`, vw / 2, vh / 2 + 28);
    ctx.restore();
  }

  _drawCardOffer(world) {
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    const cards = world.pendingCardOffer ?? [];
    const cardW = 160;
    const cardH = 220;
    const gap = 20;
    const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * gap;
    const startX = Math.round((vw - totalW) / 2);
    const y = Math.round(vh / 2 - cardH / 2 + 25);
    world.cardOfferRects = cards.map((_, i) => ({
      x: startX + i * (cardW + gap),
      y,
      w: cardW,
      h: cardH,
    }));

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('選擇一張卡片', vw / 2, vh / 2 - 130);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText('（點擊卡片繼續）', vw / 2, vh / 2 - 100);

    for (let i = 0; i < cards.length; i++) {
      this._drawCardPanel(cards[i], world.cardOfferRects[i], i === world.cardHoverIndex);
    }
    ctx.restore();
  }

  _drawCardPanel(card, rect, hovered = false) {
    const ctx = this.ctx;
    const tierLabelMap = { strong: '稀有', standard: '普通', weak: '基礎' };
    const tierColorMap = { strong: '#e6c64d', standard: '#7fd0e0', weak: '#8a8a8a' };
    const tierLabel = tierLabelMap[card.tier] ?? card.tier ?? 'tier?';
    const borderColor = tierColorMap[card.tier] ?? tierColorMap.standard;
    ctx.save();
    ctx.fillStyle = hovered ? '#252f3e' : '#1e2630';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = hovered ? 4 : 2;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (hovered) {
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 12;
    }
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 16px sans-serif';
    wrapText(ctx, card.zh ?? card.key ?? '未知卡片', rect.x + 14, rect.y + 16, rect.w - 28, 22, 2);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = borderColor;
    ctx.fillText(`${card.type ?? 'unknown'}・${tierLabel}`, rect.x + 14, rect.y + 66);

    ctx.fillStyle = '#d4dce8';
    ctx.font = '14px sans-serif';
    wrapText(ctx, cardEffectText(card.effect), rect.x + 14, rect.y + 96, rect.w - 28, 20, 5);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + 14, rect.y + rect.h - 40);
    ctx.lineTo(rect.x + rect.w - 14, rect.y + rect.h - 40);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(`價值 ${card.value ?? '-'}`, rect.x + 14, rect.y + rect.h - 28);
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
      const displayRows = m.mine.displayRows ?? cols[0]?.length ?? 3;
      for (let ci = 0; ci < cols.length; ci++) {
        for (let ri = 0; ri < displayRows; ri++) {
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
    const players = [...(world.players?.values?.() ?? [world.player])];
    for (const player of players) {
      if (!player || player.online === false) continue;
      // 插值後的繪製位置（#1）：移動 smooth，不 judder
      const x = player.renderX ?? player.x;
      const y = player.renderY ?? player.y;
      const isLocal = player.id === world.localPlayerId;
      this.ctx.fillStyle = isLocal ? PALETTE.player : '#4aa3df';
      this.ctx.beginPath();
      this.ctx.arc(x * t + t / 2, y * t + t / 2, t * 0.4, 0, Math.PI * 2);
      this.ctx.fill();
      if (!isLocal) {
        this.ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }
      // 意圖 Emoji 浮在角色頭上（30 秒有效）
      const emoji = INTENT_EMOJI[player.intent];
      if (emoji && (Date.now() - (player.intentAt ?? 0)) < 30_000) {
        this.ctx.font = `${Math.round(t * 0.7)}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(emoji, x * t + t / 2, y * t - t * 0.15);
      }
    }
  }

  _drawEnemies(world) {
    const t = this.t;
    for (const enemy of world.enemies ?? []) {
      const x = enemy.x * t + t / 2;
      const y = enemy.y * t + t / 2;
      this.ctx.fillStyle = PALETTE.enemy;
      this.ctx.beginPath();
      this.ctx.arc(x, y, t * 0.38, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = PALETTE.enemyEdge;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      const barW = t * 1.1;
      const barH = 3;
      const pct = Math.max(0, Math.min(1, enemy.hp / enemy.hpMax));
      this.ctx.fillStyle = PALETTE.enemyHpBack;
      this.ctx.fillRect(x - barW / 2, y - t * 0.75, barW, barH);
      this.ctx.fillStyle = PALETTE.enemyHp;
      this.ctx.fillRect(x - barW / 2, y - t * 0.75, barW * pct, barH);
    }
  }

  // ── 攻擊範圍圈（正式攻擊 anchors 的範圍聯集，lazy cache）───────────────

  _drawRangeCircle(world) {
    if (!world.coreStats?.range) return;
    const t     = this.t;
    const range = world.coreStats.range;
    const anchors = coreAttackAnchors(world);
    if (!anchors.length) return;
    const anchorKey = anchors.map((a) => `${a.x},${a.y}`).join('|');
    const key = `${range}:${t}:${anchorKey}`;

    if (this._rangeCacheKey !== key) {
      this._rangeCacheKey = key;
      const ppt     = this.cfg.map.pxPerTile;
      const rangePx = (range / ppt) * t;
      const glowW   = 10;   // 外光暈寬（px，兩側各半）
      const sharpW  = 2.5;  // 主線寬（px）
      const glowPad = 20;   // shadow blit 留白
      const pad     = Math.ceil(glowW / 2) + glowPad;
      const centers = anchors.map((a) => ({ x: a.x * t + t / 2, y: a.y * t + t / 2 }));
      const minX = Math.min(...centers.map((p) => p.x)) - rangePx - pad;
      const minY = Math.min(...centers.map((p) => p.y)) - rangePx - pad;
      const maxX = Math.max(...centers.map((p) => p.x)) + rangePx + pad;
      const maxY = Math.max(...centers.map((p) => p.y)) + rangePx + pad;
      const width  = Math.ceil(maxX - minX);
      const height = Math.ceil(maxY - minY);

      // 建一個 union ring offscreen canvas，以 ringWidth 為參數
      const makeRing = (rW, color) => {
        const oc   = new OffscreenCanvas(width, height);
        const octx = oc.getContext('2d');
        octx.translate(-minX, -minY);
        // 外輪廓 union fill
        octx.fillStyle = '#fff';
        for (const c of centers) {
          octx.beginPath();
          octx.arc(c.x, c.y, rangePx + rW / 2, 0, Math.PI * 2);
          octx.fill();
        }
        // punch 內部
        octx.globalCompositeOperation = 'destination-out';
        octx.fillStyle = '#fff';
        for (const c of centers) {
          octx.beginPath();
          octx.arc(c.x, c.y, Math.max(0, rangePx - rW / 2), 0, Math.PI * 2);
          octx.fill();
        }
        // 上色：reset transform 才能讓 fillRect 覆蓋整個 offscreen canvas
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.globalCompositeOperation = 'source-in';
        octx.fillStyle = color;
        octx.fillRect(0, 0, width, height);
        return oc;
      };

      try {
        const glowRing  = makeRing(glowW,  'rgba(0, 200, 255, 0.30)'); // 外光暈：寬、淡
        const sharpRing = makeRing(sharpW, 'rgba(80, 230, 255, 0.95)'); // 主線：窄、亮
        this._rangeCanvas = { glowRing, sharpRing, x: minX, y: minY };
      } catch (_) {
        this._rangeCanvas = null;
      }
    }

    if (this._rangeCanvas) {
      const { glowRing, sharpRing, x, y } = this._rangeCanvas;
      const ctx = this.ctx;
      ctx.save();
      // 外光暈：先畫，加強 shadow blur 讓它暈染
      ctx.shadowBlur  = 18;
      ctx.shadowColor = 'rgba(0, 200, 255, 0.75)';
      ctx.drawImage(glowRing, x, y);
      // 主線：覆蓋在上，輕微 shadow 保持發亮感
      ctx.shadowBlur  = 8;
      ctx.shadowColor = 'rgba(120, 240, 255, 0.9)';
      ctx.drawImage(sharpRing, x, y);
      ctx.restore();
    } else {
      // Fallback：個別弧線描邊（不做 union，但至少無填色）
      const rangePx = (range / this.cfg.map.pxPerTile) * t;
      this.ctx.save();
      this.ctx.shadowBlur  = 14;
      this.ctx.shadowColor = 'rgba(0, 210, 255, 0.7)';
      this.ctx.strokeStyle = 'rgba(80, 230, 255, 0.9)';
      this.ctx.lineWidth   = 2;
      for (const a of anchors) {
        this.ctx.beginPath();
        this.ctx.arc(a.x * t + t / 2, a.y * t + t / 2, rangePx, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
  }

  // ── 電擊 VFX（攻擊時固定生成 zigzag points，這裡只負責繪製）──────────────

  _drawVFX(world) {
    const vfx = world.vfx;
    if (!vfx?.timer || vfx.timer <= 0 || !vfx.bolts?.length) return;

    const alpha = Math.min(1, vfx.timer / 0.2); // 最後 0.2 s 淡出
    const ctx   = this.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (const bolt of vfx.bolts) this._drawLightningBolt(ctx, bolt);

    ctx.restore();
  }

  _drawLightningBolt(ctx, bolt) {
    const pts = bolt.points ?? [];
    if (pts.length < 2) return;
    const isPrimary = bolt.chainIdx === 0;

    // 外層光暈
    ctx.shadowBlur  = isPrimary ? 18 : 10;
    ctx.shadowColor = isPrimary ? '#00eeff' : '#88ccdd';
    ctx.strokeStyle = isPrimary ? '#40e0ff' : '#55aacc';
    ctx.lineWidth   = isPrimary ? 2.5 : 1.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    // 內層白色亮核
    ctx.shadowBlur  = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = isPrimary ? 1.2 : 0.7;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineCap    = 'butt';
    ctx.lineJoin   = 'miter';
  }
}
