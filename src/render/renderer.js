/**
 * @file        renderer.js
 * @module      render（渲染層，非純邏輯）
 * @summary     將世界狀態畫到 canvas：鏡頭捲動 + 地底/網格/礦山/背景泥土/前景方塊/核心/玩家/HUD
 * @exports     Renderer
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-design-plan.md「建築維度」「遊戲內 UI 設計」
 * @version     v0.0.13.0
 *
 * 渲染層只「讀」world 狀態畫圖，不寫任何遊戲規則（鐵則 9）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { BLOCKS } from '../../config/blocks.js';
import { SPRITE_SHEETS, getFrameRect } from '../../config/sprites.js';
import { coreAttackAnchors } from '../game/combatRuntime.js';
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

    if (this.cfg.render.drawCanvasHud !== false) this._drawHud(world); // 螢幕座標 HUD（不受鏡頭位移）
    if (this.cfg.render.drawCanvasHud !== false) this._drawDesktopHotbar(world);
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
    const planTag = world.buildDestroyMode ? '【🔨 拆除模式】' : world.buildPlanMode ? '【📐 規劃模式】' : '';
    const modeText = world.buildDestroyMode && world.selectedBlock
      ? `${planTag} 拆除：${BLOCKS[world.selectedBlock]?.zh ?? world.selectedBlock}　拖拽選區拆除 / V 切回建造 / B 退出`
      : world.buildPlanMode && world.selectedBlock
      ? `${planTag} 建造：${BLOCKS[world.selectedBlock]?.zh ?? world.selectedBlock}（剩 ${BLOCKS[world.selectedBlock]?.infinite ? '∞' : (world.storage[world.selectedBlock] ?? 0)}）　拖拽放置 / V 拆除模式 / B 退出`
      : world.selectedBlock
      ? `建造：${BLOCKS[world.selectedBlock]?.zh ?? world.selectedBlock}（剩 ${BLOCKS[world.selectedBlock]?.infinite ? '∞' : (world.storage[world.selectedBlock] ?? 0)}）　左鍵放置 / 右鍵拆除 / 再按取消`
      : `挖礦模式（左鍵長按挖最近）　按 1~8 選材料建造${world.buildPlanMode ? '　' + planTag : ''}`;
    const modeLine = world.selectedBlock
      ? { text: modeText, iconKey: world.selectedBlock }
      : modeText;
    const leftLines = [
      coreLine,
      coreLine2,
      `背包 ${inventoryWeight(inv)}/${world.player.capacity}　${fmtItems(inv)}`,
      `塔內 ${fmtItems(world.storage)}`,
      blockLine,
    ].filter(Boolean);
    const rightLines = [
      phaseLine,
      modeLine,
      fatigueLine,
      enemyLine,
    ].filter(Boolean);
    if (world.mining?.dropFull) rightLines.push('⚠ 地面已滿');
    else if (world.mining?.full) rightLines.push('⚠ 背包已滿');
    else if (world.repair?.active) rightLines.push('修復中');
    else if (world.repair?.reason === 'not_on_foundation') rightLines.push('需站在核心或連通地基上');
    else if (world.repair?.reason === 'no_fatigue') rightLines.push('疲勞不足');

    const lineH = 14;
    const padY = 8;
    const rows = Math.max(leftLines.length, rightLines.length);
    const panelH = padY * 2 + rows * lineH;
    const hotbarReserve = 70;
    const panelTop = vh - panelH - hotbarReserve;
    const halfW = Math.floor((vw - 16) / 2);
    ctx.save();
    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, panelTop, vw - 16, panelH);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(8 + halfW, panelTop + 4, 1, panelH - 8);
    ctx.fillStyle = '#eee';
    leftLines.forEach((ln, i) => ctx.fillText(ln, 14, panelTop + padY + i * lineH));
    rightLines.forEach((ln, i) => this._drawHudLine(ln, 8 + halfW + 8, panelTop + padY + i * lineH));
    ctx.restore();
  }

  _drawHudLine(line, x, y) {
    if (typeof line === 'string') {
      this.ctx.fillText(line, x, y);
      return;
    }

    const iconDrawn = line.iconKey ? this._drawBlockIcon(line.iconKey, x, y - 1, 16) : false;
    this.ctx.fillText(line.text ?? '', iconDrawn ? x + 20 : x, y);
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
    const panelW = 210;
    const panelH = padY * 2 + lines.length * lineH;
    const px = vw - panelW - 8;
    const py = 8;
    ctx.save();
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
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
