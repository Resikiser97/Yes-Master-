/**
 * @file        touchControls.js
 * @module      input（輸入層，非純邏輯）
 * @summary     手機觸控輸入：8方向D-pad、動作按鍵（挖礦/修復/放置/拆除）、快捷列；介面與 Controls 完全相容
 * @exports     TouchControls
 * @depends     src/game/actions.js（applyDebugAction）、src/storage/saveLocal.js（clearSave）
 * @version     v0.0.8.0
 *
 * 鐵則 9：只把操作「轉成資料」丟給上層，不在此做規則判定。
 * 介面與 Controls 完全相容，main.js 的 game loop 不需判斷輸入類型。
 */

import { applyDebugAction } from '../game/actions.js';
import { clearSave } from '../storage/saveLocal.js';

const BTN_BASE = [
  'background:rgba(0,0,0,0.6)',
  'border:1px solid rgba(255,180,0,0.4)',
  'color:#f0b020',
  'cursor:pointer',
  'touch-action:none',
  'user-select:none',
  'font-family:sans-serif',
].join(';');

export class TouchControls {
  constructor(canvas, cfg) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.hotbarSlots = cfg.hotbar?.length ?? 7;

    // 移動狀態
    this._dpad = { up: false, down: false, left: false, right: false };
    // 長按狀態
    this._mining = false;
    this._repairing = false;
    // 快捷列
    this.selectedSlot = null;
    // 滑鼠座標（由 main.js 每幀同步玩家位置，供 build preview 用）
    this.mouse = { x: 0, y: 0 };
    // 一次性事件
    this.pendingPlace = false;
    this.pendingRemove = false;
    this.pendingDebug = [];
    this.pendingCardChoice = null;
    // 由 main.js 寫入
    this.cardOfferMode = false;
    this.cardOfferRects = null;

    // DOM 參考
    this._overlay = null;
    this._hotbarEls = [];
    this._debugPanel = null;

    // 綁定的 canvas 事件
    this._onCanvasTouch = (e) => this._handleCanvasTouch(e);
  }

  // ── 與 Controls 相同的 public 介面 ──────────────────────────────────────

  getMoveVector() {
    return {
      x: (this._dpad.right ? 1 : 0) - (this._dpad.left ? 1 : 0),
      y: (this._dpad.down  ? 1 : 0) - (this._dpad.up   ? 1 : 0),
    };
  }

  isMining()       { return this._mining && this.selectedSlot == null; }
  isRepairing()    { return this._repairing; }
  getSelectedSlot(){ return this.selectedSlot; }
  setSelectedSlot(i) {
    this.selectedSlot = i;
    if (i != null) this._mining = false;
    this._refreshHotbar();
  }
  consumePlace()   { const v = this.pendingPlace;       this.pendingPlace = false;       return v; }
  consumeRemove()  { const v = this.pendingRemove;      this.pendingRemove = false;      return v; }
  consumeDebugActions() { const v = this.pendingDebug; this.pendingDebug = []; return v; }
  consumeCardChoice()   { const v = this.pendingCardChoice; this.pendingCardChoice = null; return v; }

  // ── attach / detach ──────────────────────────────────────────────────────

  attach() {
    if (typeof document === 'undefined') return;

    this._overlay = document.createElement('div');
    this._overlay.id = 'touch-overlay';
    this._overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:200;';

    this._buildDpad();
    this._buildActions();
    this._buildHotbar();
    this._buildDebugPanel();

    document.body.appendChild(this._overlay);

    // canvas touchstart → 卡片選擇偵測
    this.canvas?.addEventListener('touchstart', this._onCanvasTouch, { passive: false });
  }

  detach() {
    this._overlay?.remove();
    this._overlay = null;
    this._hotbarEls = [];
    if (this._debugPanel) {
      this._debugPanel.remove();
      this._debugPanel = null;
    }
    this.canvas?.removeEventListener('touchstart', this._onCanvasTouch);
    this._mining = false;
    this._repairing = false;
    this._dpad = { up: false, down: false, left: false, right: false };
  }

  // ── D-pad ────────────────────────────────────────────────────────────────

  _buildDpad() {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:absolute',
      'bottom:8px',
      'left:8px',
      'pointer-events:all',
      'display:grid',
      'grid-template-columns:repeat(3,48px)',
      'grid-template-rows:repeat(3,48px)',
      'gap:2px',
    ].join(';') + ';';

    // [id, label, row(1-based), col(1-based)]
    const cells = [
      ['up-left','↖',1,1], ['up','↑',1,2], ['up-right','↗',1,3],
      ['left','←',2,1],   [null,'',2,2],   ['right','→',2,3],
      ['down-left','↙',3,1],['down','↓',3,2],['down-right','↘',3,3],
    ];

    for (const [id, label, row, col] of cells) {
      const btn = document.createElement('button');
      btn.style.cssText = `grid-row:${row};grid-column:${col};width:48px;height:48px;font-size:18px;${BTN_BASE};`;
      if (!id) {
        btn.disabled = true;
        btn.style.background = 'transparent';
        btn.style.border = 'none';
      } else {
        btn.textContent = label;
        const keys = this._dirToKeys(id);
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.forEach(k => { this._dpad[k] = true; }); });
        btn.addEventListener('pointerup',     () => keys.forEach(k => { this._dpad[k] = false; }));
        btn.addEventListener('pointercancel', () => keys.forEach(k => { this._dpad[k] = false; }));
        btn.addEventListener('pointerleave',  () => keys.forEach(k => { this._dpad[k] = false; }));
      }
      wrap.appendChild(btn);
    }
    this._overlay.appendChild(wrap);
  }

  _dirToKeys(id) {
    switch (id) {
      case 'up':         return ['up'];
      case 'down':       return ['down'];
      case 'left':       return ['left'];
      case 'right':      return ['right'];
      case 'up-left':    return ['up', 'left'];
      case 'up-right':   return ['up', 'right'];
      case 'down-left':  return ['down', 'left'];
      case 'down-right': return ['down', 'right'];
      default:           return [];
    }
  }

  // ── 動作按鍵（挖礦 / 修復 / 放置 / 拆除）────────────────────────────────

  _buildActions() {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:absolute',
      'bottom:8px',
      'right:8px',
      'pointer-events:all',
      'display:grid',
      'grid-template-columns:repeat(2,68px)',
      'grid-template-rows:repeat(2,48px)',
      'gap:4px',
    ].join(';') + ';';

    const mkBtn = (label, onDown, onUp) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `width:68px;height:48px;font-size:12px;${BTN_BASE};`;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown?.(); });
      if (onUp) {
        btn.addEventListener('pointerup',     onUp);
        btn.addEventListener('pointercancel', onUp);
      }
      return btn;
    };

    wrap.appendChild(mkBtn('⛏挖礦',
      () => { this._mining = true; },
      () => { this._mining = false; }
    ));
    wrap.appendChild(mkBtn('🔧修復',
      () => { this._repairing = true; },
      () => { this._repairing = false; }
    ));
    wrap.appendChild(mkBtn('📦放置',
      () => { this.pendingPlace = true; }
    ));
    wrap.appendChild(mkBtn('🗑拆除',
      () => { this.pendingRemove = true; }
    ));

    this._overlay.appendChild(wrap);
  }

  // ── 快捷列 ───────────────────────────────────────────────────────────────

  _buildHotbar() {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:absolute',
      'bottom:8px',
      'left:50%',
      'transform:translateX(-50%)',
      'pointer-events:all',
      'display:flex',
      'gap:3px',
    ].join(';') + ';';

    this._hotbarEls = [];
    for (let i = 0; i < this.hotbarSlots; i++) {
      const btn = document.createElement('button');
      btn.textContent = String(i + 1);
      btn.style.cssText = `width:38px;height:38px;font-size:13px;${BTN_BASE};`;
      const idx = i;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.setSelectedSlot(this.selectedSlot === idx ? null : idx);
      });
      this._hotbarEls.push(btn);
      wrap.appendChild(btn);
    }
    this._overlay.appendChild(wrap);
    this._refreshHotbar();
  }

  _refreshHotbar() {
    this._hotbarEls.forEach((btn, i) => {
      const sel = i === this.selectedSlot;
      btn.style.borderColor = sel ? '#D4A017' : 'rgba(255,180,0,0.4)';
      btn.style.background  = sel ? 'rgba(212,160,23,0.25)' : 'rgba(0,0,0,0.6)';
    });
  }

  // ── Debug HTML 面板 ──────────────────────────────────────────────────────

  _buildDebugPanel() {
    if (!this.cfg.debug?.hotkeys) return;

    const panel = document.createElement('div');
    panel.id = 'debug-panel-touch';
    panel.style.cssText = [
      'display:none',
      'position:fixed',
      'top:50px',
      'right:8px',
      'z-index:250',
      'background:rgba(10,16,24,0.92)',
      'border:1px solid rgba(255,180,0,0.4)',
      'color:#f0b020',
      'padding:10px',
      'font-size:12px',
      'min-width:170px',
      'font-family:monospace',
    ].join(';') + ';';

    const mkDbgBtn = (label, handler) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = 'display:block;width:100%;margin:2px 0;padding:5px 6px;' +
        'background:rgba(0,0,0,0.45);border:1px solid rgba(255,180,0,0.3);' +
        'color:#f0b020;font-size:12px;cursor:pointer;text-align:left;font-family:monospace;';
      btn.addEventListener('click', handler);
      return btn;
    };

    const debugActions = [
      ['H — 扣核心血', 'damageCore'],
      ['J — 回核心血', 'healCore'],
      ['K — 補建材',   'grantResources'],
      ['L — 生 1 敵',  'spawnEnemy'],
      ['P — 生 5 敵',  'spawnEnemyPack'],
      ['C — 抽卡',     'showCardOffer'],
      ['N — 夜晚',     'startNight'],
      ['Q — 重試',     'restartStage'],
    ];

    for (const [label, action] of debugActions) {
      panel.appendChild(mkDbgBtn(label, () => {
        const app = window.__YES_MASTER__;
        if (app) applyDebugAction(app.world, action, app.config);
      }));
    }

    // X — 重置存檔（特殊：直接清除後 reload）
    panel.appendChild(mkDbgBtn('X — 重置存檔', () => {
      const app = window.__YES_MASTER__;
      if (!app) return;
      clearSave(app.config.save.storageKey);
      window.location.reload();
    }));

    document.body.appendChild(panel);
    this._debugPanel = panel;
  }

  // ── Canvas touch → 卡片選擇 ──────────────────────────────────────────────

  _handleCanvasTouch(e) {
    if (!this.cardOfferMode || !this.cardOfferRects?.length) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const cx = (touch.clientX - rect.left) * scaleX;
    const cy = (touch.clientY - rect.top)  * scaleY;
    for (let i = 0; i < this.cardOfferRects.length; i++) {
      const r = this.cardOfferRects[i];
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) {
        this.pendingCardChoice = i;
        break;
      }
    }
  }
}
