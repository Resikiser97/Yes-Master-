/**
 * @file        renderer.js
 * @module      render（渲染層，非純邏輯）
 * @summary     將世界狀態畫到 canvas：鏡頭捲動 + 地底/網格/礦山/背景泥土/前景方塊/核心/玩家/HUD
 * @exports     Renderer
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-design-plan.md「建築維度」「遊戲內 UI 設計」
 * @version     v0.0.6.0
 *
 * 渲染層只「讀」world 狀態畫圖，不寫任何遊戲規則（鐵則 9）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { BLOCKS } from '../../config/blocks.js';
import { inventoryWeight } from '../logic/inventory.js';
import { durabilityToBreak } from '../logic/mining.js';

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
    this._drawEnemies(world);
    this._drawPlayer(world);
    this._drawDrops(world);          // 掉落物（世界座標）
    this._drawBuildPreview(world);   // 放置預覽（世界座標）
    this._drawMiningProgress(world); // 挖礦進度血條（世界座標，只顯示已被敲過的格）

    ctx.restore();

    this._drawHud(world); // 螢幕座標 HUD（不受鏡頭位移）
    if (world.phase === 'gameover') this._drawGameOverOverlay(world);
    if (world.phase === 'cardOffer') this._drawCardOffer(world);
    if (world.firstGame && world.tutorialTimer > 0) this._drawTutorialHint(world);
  }

  _drawMiningProgress(world) {
    const m = world.mining;
    if (!m?.targetKey || m.damage <= 0) return; // 未開始挖或剛重置 → 不顯示
    // targetKey 格式："{mineId},{col},{row},{blockKey}"
    const parts = m.targetKey.split(',');
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
    const pct = Math.min(1, m.damage / maxDur);
    const barW = t - 4;
    const barH = 3;
    const bx = wx * t + 2;
    const by = wy * t - 5;
    // 背景（灰）
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(bx, by, barW, barH);
    // 前景（白→橙，依耐久比例）
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
      // 白色輪廓讓掉落物易於辨識
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(d.x * t + inset + 0.5, d.y * t + inset + Math.round(t * 0.3) + 0.5, sz - 1, sz - 1);
    }
  }

  _drawBuildPreview(world) {
    const pv = world.buildPreview;
    if (!pv) return;
    const t = this.t;
    this.ctx.fillStyle = pv.valid ? 'rgba(63,174,90,0.35)' : 'rgba(192,57,43,0.35)';
    this.ctx.fillRect(pv.x * t, pv.y * t, t, t);
    this.ctx.strokeStyle = pv.valid ? '#3fae5a' : '#c0392b';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(pv.x * t + 1, pv.y * t + 1, t - 2, t - 2);
  }

  _drawHud(world) {
    const ctx = this.ctx;
    const { width: vw, height: vh } = this.viewport;
    const inv = world.player.inventory;
    const cs = world.coreStats;
    const coreLine = cs
      ? `核心 HP ${fmt1(world.coreHp ?? cs.hpMax)}/${fmt1(cs.hpMax)}　ATK ${fmt2(cs.attack)}　攻速 ${fmt2(cs.attackSpeed)}/s　DEF ${fmt2(cs.defense)}`
      : '核心數值計算中';
    const coreLine2 = cs
      ? `範圍 ${fmt1(cs.range)}　魔法 ${fmt2(cs.magicPct)}%　連鎖 ${fmt2(cs.chain)}`
      : '';
    const fatigueLine = `疲勞 ${fmt1(world.player.fatigue ?? 0)}/${fmt1(this.cfg.player.fatigueMax)}　修復 ${fmt2(this.cfg.player.repair / 60)}/s`;
    const blockLine = `已放置 ${fmtItems(world.blockCounts ?? {})}`;
    const hitTotal = world.combat?.lastHits?.reduce((sum, hit) => sum + hit.damage, 0) ?? 0;
    const enemyLine = `敵人 ${world.enemies?.length ?? 0}　最近命中 ${fmt2(hitTotal)}`;
    const phaseLine = this._phaseLine(world);
    const mode = world.selectedBlock
      ? `建造：${BLOCKS[world.selectedBlock]?.zh ?? world.selectedBlock}（剩 ${world.storage[world.selectedBlock] ?? 0}）　左鍵放置 / 右鍵拆除 / 再按取消`
      : '挖礦模式（左鍵長按挖最近）　按 1~7 選材料建造';
    const lines = [
      phaseLine,
      mode,
      coreLine,
      coreLine2,
      fatigueLine,
      blockLine,
      enemyLine,
      `背包 ${inventoryWeight(inv)}/${world.player.capacity}　${fmtItems(inv)}`,
      `塔內 ${fmtItems(world.storage)}`,
    ].filter(Boolean);
    if (world.mining?.full) lines.push('⚠ 背包已滿，靠近核心可自動卸貨');
    if (world.repair?.active) lines.push('修復中');
    else if (world.repair?.reason === 'not_on_foundation') lines.push('修復需要站在核心或連通泥土地基上');
    else if (world.repair?.reason === 'no_fatigue') lines.push('疲勞不足，無法修復');
    if (this.cfg.debug?.enabled && this.cfg.debug?.hotkeys) lines.push('DEBUG H扣血 J回血 K補建材 L敵人 P敵群 C抽卡');

    const lineH = 16;
    const padY = 6;
    const panelH = padY * 2 + lines.length * lineH;
    const panelTop = vh - panelH - 8;
    ctx.save();
    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, panelTop, vw - 16, panelH);
    ctx.fillStyle = '#eee';
    lines.forEach((ln, i) => ctx.fillText(ln, 14, panelTop + padY + i * lineH));
    ctx.restore();
  }

  _phaseLine(world) {
    // stage 是「已清關數」（0-based），顯示用加 1 = 當前/下一波關卡號
    const waveNum = (world.stage ?? 0) + 1;
    if (world.phase === 'prep') {
      return `第 ${waveNum} 關　準備中（${fmt1(world.phaseTimer)} s）　N 鍵開始夜晚　Q 鍵重試`;
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
    const x = (vw - w) / 2, y = 54;
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
}
