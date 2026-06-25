/**
 * @file        touchControls.js
 * @module      input（輸入層，非純邏輯）
 * @summary     手機觸控輸入：8方向D-pad、動作按鍵（挖礦/修復/放置/拆除）、快捷列；介面與 Controls 完全相容
 * @exports     TouchControls
 * @depends     config/blocks.js、src/logic/inventory.js
 * @version     v0.0.13.0
 *
 * 鐵則 9：只把操作「轉成資料」丟給上層，不在此做規則判定。
 * 介面與 Controls 完全相容，main.js 的 game loop 不需判斷輸入類型。
 */

import { BLOCKS } from '../../config/blocks.js';
import { inventoryWeight } from '../logic/inventory.js';
import { SPRITE_SHEETS, getFrameRect } from '../../config/sprites.js';

const BTN_BASE = [
  'background:rgba(0,0,0,0.6)',
  'border:1px solid rgba(255,180,0,0.4)',
  'color:#f0b020',
  'cursor:pointer',
  'touch-action:none',
  'user-select:none',
  '-webkit-user-select:none',
  '-webkit-touch-callout:none',
  '-webkit-tap-highlight-color:transparent',
  'font-family:sans-serif',
].join(';');

const SIDE_PANEL_BASE = [
  'position:fixed',
  'top:0',
  'height:100vh',
  'background:#30343a',
  'border-color:rgba(255,255,255,0.08)',
  'box-sizing:border-box',
  'pointer-events:none',
  'z-index:190',
].join(';');

const HOTBAR_DISPLAY_SLOTS = 10;

function fmt1(n) {
  return Number.isFinite(n) ? Number(n).toFixed(1) : '0.0';
}

function fmt2(n) {
  return Number.isFinite(n) ? Number(n).toFixed(2) : '0.00';
}

function fmtItemsShort(obj, limit = 4) {
  const entries = Object.entries(obj ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${BLOCKS[k]?.zh ?? k}${v}`);
  if (!entries.length) return '-';
  const shown = entries.slice(0, limit).join(' ');
  return entries.length > limit ? `${shown} +${entries.length - limit}` : shown;
}

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

    // 放置方向偏移（3×3 selector，tile 單位）
    this.placeOffset = { dx: 0, dy: 0 };

    // Sprite 圖示（由 main.js 非同步注入）
    this._sprites = null;
    this._hotbarIconCanvases = [];

    // DOM 參考
    this._overlay = null;
    this._leftPanel = null;
    this._rightPanel = null;
    this._centerPanel = null;
    this._statusPanel = null;
    this._hotbarEls = [];
    this._selectorBtns = [];
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
  consumeBuildPlanToggle() { return false; }
  consumeDestroyToggle()  { return false; }
  consumeUiClick()        { return null; }
  consumeDragRect()       { return null; }
  consumePlace()   { const v = this.pendingPlace;       this.pendingPlace = false;       return v; }
  consumeRemove()  { const v = this.pendingRemove;      this.pendingRemove = false;      return v; }
  consumeDebugActions() { const v = this.pendingDebug; this.pendingDebug = []; return v; }
  consumeCardChoice()   { const v = this.pendingCardChoice; this.pendingCardChoice = null; return v; }

  // ── attach / detach ──────────────────────────────────────────────────────

  attach() {
    if (typeof document === 'undefined') return;

    this._overlay = document.createElement('div');
    this._overlay.id = 'touch-overlay';
    this._overlay.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:200',
    ].join(';') + ';';

    this._buildPanels();
    this._buildStatusPanel();
    this._buildDpad();
    this._buildActions();
    this._buildPlacingSelector();
    this._buildHotbar();
    this._buildDebugPanel();

    document.body.appendChild(this._overlay);

    // canvas touchstart → 卡片選擇偵測
    this.canvas?.addEventListener('touchstart', this._onCanvasTouch, { passive: false });
  }

  detach() {
    this._overlay?.remove();
    this._overlay = null;
    this._leftPanel = null;
    this._rightPanel = null;
    this._centerPanel = null;
    this._statusPanel = null;
    this._hotbarEls = [];
    if (this._debugPanel) {
      this._debugPanel.remove();
      this._debugPanel = null;
    }
    this._selectorBtns = [];
    this.canvas?.removeEventListener('touchstart', this._onCanvasTouch);
    this._mining = false;
    this._repairing = false;
    this._dpad = { up: false, down: false, left: false, right: false };
  }

  updateLayout(layout) {
    if (!layout) return;
    this._layout = layout;
    if (this._leftPanel) {
      this._leftPanel.style.width = `${layout.sideWidth}px`;
    }
    if (this._rightPanel) {
      this._rightPanel.style.width = `${layout.sideWidth}px`;
    }
    if (this._centerPanel) {
      this._centerPanel.style.left = `${layout.sideWidth}px`;
      this._centerPanel.style.width = `${layout.centerWidth}px`;
    }
  }

  mountDebugButton(btn) {
    if (!btn) return;
    btn.style.position = 'relative';
    btn.style.top = 'auto';
    btn.style.right = 'auto';
    btn.style.width = '44px';
    btn.style.height = '44px';
    btn.style.margin = '8px 8px 6px auto';
    btn.style.pointerEvents = 'all';
    btn.style.touchAction = 'none';
    btn.style.userSelect = 'none';
    btn.style.webkitUserSelect = 'none';
    btn.style.webkitTouchCallout = 'none';
    btn.style.webkitTapHighlightColor = 'transparent';
    this._rightPanel?.appendChild(btn);
  }

  updateStatus(world) {
    if (!this._statusPanel || !world) return;
    this._statusPanel.textContent = this._mobileHudText(world);
    this._updateHotbarQuantities(world);
  }

  _updateHotbarQuantities(world) {
    if (!this._hotbarQtyBadges.length) return;
    const hotbar = this.cfg.hotbar ?? [];
    for (let i = 0; i < this._hotbarQtyBadges.length; i++) {
      const blockKey = hotbar[i];
      const badge = this._hotbarQtyBadges[i];
      if (badge) {
        if (blockKey && BLOCKS[blockKey]?.infinite) {
          badge.textContent = '∞';
        } else {
          badge.textContent = String(blockKey ? (world.storage?.[blockKey] ?? 0) : 0);
        }
      }
    }
  }

  _mobileHudText(world) {
    const cs = world.coreStats;
    const inv = world.player.inventory ?? {};
    const hp = fmt1(world.coreHp ?? cs?.hpMax ?? 0);
    const maxHp = fmt1(cs?.hpMax ?? 0);
    const wave = (world.stage ?? 0) + 1;
    const block = world.selectedBlock;
    const blockZh = block ? (BLOCKS[block]?.zh ?? block) : null;
    const mode = blockZh
      ? `建造 ${blockZh} x${world.storage?.[block] ?? 0}`
      : '挖礦模式';

    const lines = [
      `核心 ${hp}/${maxHp}  第${wave}關`,
      this._phaseText(world),
      `ATK ${fmt2(cs?.attack ?? 0)}  SPD ${fmt2(cs?.attackSpeed ?? 0)}  DEF ${fmt2(cs?.defense ?? 0)}`,
      `範圍 ${fmt1(cs?.range ?? 0)}  魔法 ${fmt2(cs?.magicPct ?? 0)}  連鎖 ${fmt2(cs?.chain ?? 0)}`,
      `疲勞 ${fmt1(world.player.fatigue ?? 0)}/${fmt1(this.cfg.player.fatigueMax)}  修 ${fmt2(this.cfg.player.repair / 60)}/s`,
      `敵人 ${world.enemies?.length ?? 0}  ${mode}`,
      `背包 ${inventoryWeight(inv)}/${world.player.capacity}`,
      fmtItemsShort(inv, 3),
      `塔內 ${fmtItemsShort(world.storage, 3)}`,
      `已放 ${fmtItemsShort(world.blockCounts, 3)}`,
    ];

    if (world.mining?.dropFull) lines.push('! 地面已滿');
    else if (world.mining?.full) lines.push('! 背包已滿');
    else if (world.repair?.active) lines.push('修復中');
    else if (world.repair?.reason === 'not_on_foundation') lines.push('需站核心/地基');
    else if (world.repair?.reason === 'no_fatigue') lines.push('疲勞不足');
    return lines.filter(Boolean).join('\n');
  }

  _phaseText(world) {
    const wave = (world.stage ?? 0) + 1;
    if (world.phase === 'prep') return `準備 ${fmt1(world.phaseTimer ?? 0)}s`;
    if (world.phase === 'night') return `夜晚 ${fmt1(world.nightElapsed ?? 0)}s`;
    if (world.phase === 'overtime') {
      const elapsed = this.cfg.phases.overtimeSeconds - (world.phaseTimer ?? 0);
      return `加時 ${fmt1(elapsed)}s x${fmt1(world.combat?.overtimeMultiplier ?? 1)}`;
    }
    if (world.phase === 'gameover') return `GAME OVER 第${wave}關`;
    if (world.phase === 'cardOffer') return `第${wave}關 選卡`;
    return `${world.phase ?? '未知階段'}`;
  }

  _buildPanels() {
    this._leftPanel = document.createElement('div');
    this._leftPanel.id = 'touch-left-panel';
    this._leftPanel.style.cssText = `${SIDE_PANEL_BASE};left:0;border-right:1px solid rgba(255,255,255,0.08);`;

    this._centerPanel = document.createElement('div');
    this._centerPanel.id = 'touch-center-panel';
    this._centerPanel.style.cssText = [
      'position:fixed',
      'top:0',
      'height:100vh',
      'pointer-events:none',
      'z-index:210',
    ].join(';') + ';';

    this._rightPanel = document.createElement('div');
    this._rightPanel.id = 'touch-right-panel';
    this._rightPanel.style.cssText = `${SIDE_PANEL_BASE};right:0;border-left:1px solid rgba(255,255,255,0.08);`;

    this._overlay.appendChild(this._leftPanel);
    this._overlay.appendChild(this._centerPanel);
    this._overlay.appendChild(this._rightPanel);
  }

  _buildStatusPanel() {
    const panel = document.createElement('div');
    panel.id = 'touch-status-panel';
    panel.style.cssText = [
      'position:absolute',
      'top:8px',
      'left:8px',
      'right:8px',
      'bottom:166px',
      'padding:8px',
      'box-sizing:border-box',
      'background:rgba(10,16,24,0.72)',
      'border:1px solid rgba(255,180,0,0.25)',
      'color:#f0b020',
      'font-size:12px',
      'line-height:1.35',
      'font-family:monospace',
      'white-space:pre-line',
      'overflow:auto',
      'pointer-events:all',
      'touch-action:pan-y',
      '-webkit-overflow-scrolling:touch',
    ].join(';') + ';';
    panel.textContent = '核心 --/--\n第 -- 關\n敵人 --';
    this._leftPanel.appendChild(panel);
    this._statusPanel = panel;
  }

  // ── D-pad ────────────────────────────────────────────────────────────────

  _buildDpad() {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:absolute',
      'bottom:8px',
      'left:50%',
      'transform:translateX(-50%)',
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
        const down = (e) => { e.preventDefault(); e.stopPropagation(); keys.forEach(k => { this._dpad[k] = true; }); };
        const up   = () => keys.forEach(k => { this._dpad[k] = false; });
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('pointerleave', up);
        btn.addEventListener('touchstart', down, { passive: false });
        btn.addEventListener('touchend', up);
        btn.addEventListener('touchcancel', up);
      }
      wrap.appendChild(btn);
    }
    this._leftPanel.appendChild(wrap);
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
      'right:50%',
      'transform:translateX(50%)',
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
      const wrappedDown = (e) => { e.preventDefault(); e.stopPropagation(); onDown?.(); };
      btn.addEventListener('pointerdown', wrappedDown);
      btn.addEventListener('touchstart', wrappedDown, { passive: false });
      if (onUp) {
        btn.addEventListener('pointerup',     onUp);
        btn.addEventListener('pointercancel', onUp);
        btn.addEventListener('touchend',      onUp);
        btn.addEventListener('touchcancel',   onUp);
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

    this._rightPanel.appendChild(wrap);
  }

  // ── 放置方向選擇器（3×3）────────────────────────────────────────────────

  _buildPlacingSelector() {
    const CELLS = [
      ['↖',-1,-1],['↑', 0,-1],['↗',+1,-1],
      ['←',-1, 0],['●', 0, 0],['→',+1, 0],
      ['↙',-1,+1],['↓', 0,+1],['↘',+1,+1],
    ];

    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:absolute',
      'bottom:116px',
      'left:50%',
      'transform:translateX(-50%)',
      'pointer-events:all',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:2px',
    ].join(';') + ';';

    const label = document.createElement('div');
    label.textContent = '放置方向';
    label.style.cssText = 'font-size:10px;color:rgba(240,176,32,0.45);letter-spacing:1px;';
    wrap.appendChild(label);

    const grid = document.createElement('div');
    grid.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(3,40px)',
      'grid-template-rows:repeat(3,40px)',
      'gap:3px',
    ].join(';') + ';';

    this._selectorBtns = [];
    for (const [text, dx, dy] of CELLS) {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.dataset.dx = String(dx);
      btn.dataset.dy = String(dy);
      btn.style.cssText = `width:40px;height:40px;font-size:16px;${BTN_BASE};`;
      const selDown = (e) => {
        e.preventDefault(); e.stopPropagation();
        this.placeOffset = { dx, dy };
        this._refreshSelector();
      };
      btn.addEventListener('pointerdown', selDown);
      btn.addEventListener('touchstart', selDown, { passive: false });
      this._selectorBtns.push(btn);
      grid.appendChild(btn);
    }

    wrap.appendChild(grid);
    this._rightPanel.appendChild(wrap);
    this._refreshSelector();
  }

  _refreshSelector() {
    const { dx: cx, dy: cy } = this.placeOffset;
    for (const btn of this._selectorBtns) {
      const sel = parseInt(btn.dataset.dx, 10) === cx && parseInt(btn.dataset.dy, 10) === cy;
      btn.style.background  = sel ? 'rgba(212,160,23,0.3)'   : 'rgba(0,0,0,0.6)';
      btn.style.borderColor = sel ? '#D4A017' : 'rgba(255,180,0,0.4)';
      btn.style.color       = sel ? '#D4A017' : '#f0b020';
    }
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
      'gap:2px',
    ].join(';') + ';';

    this._hotbarEls = [];
    this._hotbarIconCanvases = [];
    this._hotbarQtyBadges = [];
    for (let i = 0; i < HOTBAR_DISPLAY_SLOTS; i++) {
      const btn = document.createElement('button');
      btn.style.cssText = `position:relative;width:36px;height:40px;padding:2px;box-sizing:border-box;${BTN_BASE};`;
      const enabled = i < this.hotbarSlots;
      btn.disabled = !enabled;

      // 圖示 canvas（有 sprite 時顯示方塊圖示；無 sprite 時顯示色塊）
      const icvs = document.createElement('canvas');
      icvs.width  = 30;
      icvs.height = 30;
      icvs.style.cssText = 'display:block;width:30px;height:30px;image-rendering:pixelated;margin:0 auto;';
      btn.appendChild(icvs);
      this._hotbarIconCanvases.push(icvs);

      // 數量角標（右下，顯示塔內資源數量）
      const badge = document.createElement('span');
      badge.textContent = '0';
      badge.style.cssText = [
        'position:absolute',
        'bottom:1px',
        'right:3px',
        'font-size:9px',
        'font-weight:bold',
        'line-height:1',
        'pointer-events:none',
      ].join(';') + ';';
      btn.appendChild(badge);
      this._hotbarQtyBadges.push(badge);

      const idx = i;
      const hotbarDown = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (btn.disabled) return;
        this.setSelectedSlot(this.selectedSlot === idx ? null : idx);
      };
      btn.addEventListener('pointerdown', hotbarDown);
      btn.addEventListener('touchstart', hotbarDown, { passive: false });
      this._hotbarEls.push(btn);
      wrap.appendChild(btn);
    }
    this._centerPanel.appendChild(wrap);
    this._refreshHotbar();
    this._paintHotbarIcons(); // 若 sprites 已提前注入則立即繪製
  }

  /** main.js 在圖片載入後呼叫，注入 sprites 並重繪所有 hotbar icon */
  setSprites(imgs) {
    this._sprites = imgs;
    this._paintHotbarIcons();
  }

  /** 將方塊 sprite 繪製到各 hotbar slot 的 icon canvas */
  _paintHotbarIcons() {
    if (!this._sprites || !this._hotbarIconCanvases.length) return;
    const img = this._sprites.get('blocksNoFrame');
    if (!img?.complete) return;
    const sheet  = SPRITE_SHEETS.blocksNoFrame;
    const hotbar = this.cfg.hotbar ?? [];

    this._hotbarIconCanvases.forEach((icvs, i) => {
      const ctx2 = icvs.getContext('2d');
      ctx2.clearRect(0, 0, icvs.width, icvs.height);
      const blockKey = hotbar[i];
      if (!blockKey) {
        if (i === hotbar.length - 1) {
          // 背包按鈕：⚙️
          ctx2.font = '22px sans-serif';
          ctx2.textAlign = 'center';
          ctx2.textBaseline = 'middle';
          ctx2.fillStyle = 'rgba(240,176,32,0.8)';
          ctx2.fillText('⚙️', icvs.width / 2, icvs.height / 2);
        } else {
          ctx2.fillStyle = 'rgba(255,255,255,0.08)';
          ctx2.fillRect(2, 2, icvs.width - 4, icvs.height - 4);
        }
        return;
      }
      const frame = getFrameRect(img, sheet, blockKey);
      if (!frame.sw) return;
      ctx2.imageSmoothingEnabled = false;
      ctx2.drawImage(img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, icvs.width, icvs.height);
    });
  }

  _refreshHotbar() {
    this._hotbarEls.forEach((btn, i) => {
      const enabled = i < this.hotbarSlots;
      const sel = i === this.selectedSlot;
      btn.disabled = !enabled;
      btn.style.borderColor = sel ? '#D4A017' : (enabled ? 'rgba(255,180,0,0.4)' : 'rgba(255,255,255,0.12)');
      btn.style.background  = sel ? 'rgba(212,160,23,0.25)' : (enabled ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.25)');
      btn.style.color = enabled ? '#f0b020' : 'rgba(255,255,255,0.25)';
    });
  }

  // ── Debug HTML 面板 ──────────────────────────────────────────────────────

  _buildDebugPanel() {
    if (!this.cfg.debug?.hotkeys) return;

    const panel = document.createElement('div');
    panel.id = 'debug-panel-touch';
    panel.style.cssText = [
      'display:none',
      'position:absolute',
      'top:58px',
      'left:8px',
      'right:8px',
      'z-index:280',
      'background:rgba(10,16,24,0.92)',
      'border:1px solid rgba(255,180,0,0.4)',
      'color:#f0b020',
      'padding:10px',
      'font-size:12px',
      'box-sizing:border-box',
      'max-height:calc(100vh - 174px)',
      'overflow:auto',
      'pointer-events:all',
      'touch-action:pan-y',
      '-webkit-overflow-scrolling:touch',
      'font-family:monospace',
    ].join(';') + ';';

    const mkDbgBtn = (label, handler) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = 'display:block;width:100%;margin:2px 0;padding:5px 6px;' +
        'background:rgba(0,0,0,0.45);border:1px solid rgba(255,180,0,0.3);' +
        'color:#f0b020;font-size:12px;cursor:pointer;text-align:left;font-family:monospace;' +
        'pointer-events:all;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;';
      const dbgDown = (e) => { e.preventDefault(); e.stopPropagation(); handler(); };
      btn.addEventListener('pointerdown', dbgDown);
      btn.addEventListener('touchstart', dbgDown, { passive: false });
      return btn;
    };

    const debugActions = [
      ['H — 扣核心血', 'damageCore'],
      ['J — 回核心血', 'healCore'],
      ['K — 補建材',   'grantResources'],
      ['L — 生 1 敵',  'spawnEnemy'],
      ['P — 生 5 敵',  'spawnEnemyPack'],
      ['C — 抽卡',     'showCardOffer'],
      ['T — 暫停/恢復', 'togglePause'],
      ['N — 夜晚',     'startNight'],
      ['Q — 重試',     'restartStage'],
    ];

    for (const [label, action] of debugActions) {
      panel.appendChild(mkDbgBtn(label, () => {
        this.pendingDebug.push(action);
      }));
    }

    // X — 重置存檔（事件資料，由 main.js consume 處理）
    panel.appendChild(mkDbgBtn('X — 重置存檔', () => {
      this.pendingDebug.push('resetSave');
    }));

    this._rightPanel.appendChild(panel);
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
