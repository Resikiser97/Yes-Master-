/**
 * @file        controls.js
 * @module      input（輸入層，非純邏輯）
 * @summary     把玩家操作（WASD 移動、滑鼠長按挖礦、數字選材料、左鍵放置、右鍵拆除、修復/debug）轉成資料
 * @exports     Controls
 * @depends     （無；僅綁瀏覽器事件，不 import 其他模組）
 * @sourceOfTruth Docs/game-design-plan.md「操作輸入方式」
 * @version     v0.0.15.0
 *
 * 輸入層只把操作「轉成資料」丟給上層，不在此做規則判定（鐵則 9）。
 * 模式：未選材料 = 挖礦模式（左鍵長按挖最近）；按快捷列數字選材料 = 建造模式（左鍵放置）。
 * 再按同一數字 / Esc = 退出建造模式；右鍵 = 拆除（任何模式皆可）。
 */

export class Controls {
  constructor(target, options = {}) {
    this.target = target;
    this.hotbarSlots = options.hotbarSlots ?? 7;
    this.handlers = {};
    this.keys = new Set();
    this.bound = false;
    this.mining = false;           // 滑鼠長按 = 挖礦中
    this.selectedSlot = null;      // 已選快捷列索引（null = 挖礦模式）
    this.mouse = { x: 0, y: 0 };   // 滑鼠在 canvas 上的座標（px）
    this.pendingPlace = false;     // 本幀待處理的放置（左鍵點擊，一次性）
    this.pendingRemove = false;    // 本幀待處理的拆除（右鍵點擊，一次性）
    this.repairing = false;        // R 長按修復
    this.pendingDebug = [];        // 本幀待處理 debug action
    this.buildPlanMode = false;    // 由 main.js 同步
    this.buildDestroyMode = false; // 由 main.js 同步
    this.pendingBuildPlanToggle = false; // B 鍵觸發
    this.pendingDestroyToggle = false;  // V 鍵觸發
    this.dragStart = null;         // build plan 拖拽起點 { px, py }（canvas 像素）
    this.dragging = false;         // 正在拖拽中
    this.pendingDragRect = null;   // 拖拽完成：{ x1, y1, x2, y2 }（tile 座標，由 main 消費）
    this.viewport = { width: 0, height: 0 }; // 由 main.js 每幀同步
    this.cardOfferMode = false;    // 由 main.js 同步 world.phase === 'cardOffer'
    this.cardOfferRects = null;    // 由 main.js 每幀同步 renderer 寫入的卡片座標
    this.pendingCardChoice = null; // null | 0 | 1 | 2（玩家點選的卡片索引）
    this.uiHitRects = [];          // Canvas HUD 命中區，由 renderer/main 每幀同步
    this.pendingUiClick = null;    // 本幀待處理 UI 點擊 id
    this._altHeld = false;             // Alt 鍵目前是否按住
    this.intentWheelActive = false;    // Alt+左鍵按下後輪盤開啟中
    this._altCenter = null;            // { x, y } 左鍵按下瞬間的滑鼠位置（輪盤圓心）
    this._wheelEverOut = false;        // 輪盤開啟後是否曾離開死區（>=30px）
    this.pendingManualIntent = undefined; // 滑鼠放開後選定的意圖（undefined=未觸發）
    this._onKeyDown = (e) => this._handleKey(e, true);
    this._onKeyUp = (e) => this._handleKey(e, false);
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onPointerMove = (e) => this._syncPointer(e);
    this._onContextMenu = (e) => e.preventDefault(); // 右鍵不彈系統選單
  }

  on(event, fn) { this.handlers[event] = fn; }

  // 挖礦只在「非建造模式」生效
  isMining() { return this.mining && this.selectedSlot == null; }
  getSelectedSlot() { return this.selectedSlot; }
  setSelectedSlot(i) { this.selectedSlot = i; if (i != null) this.mining = false; }
  consumePlace() { const v = this.pendingPlace; this.pendingPlace = false; return v; }
  consumeRemove() { const v = this.pendingRemove; this.pendingRemove = false; return v; }
  isRepairing() { return this.repairing; }
  consumeDebugActions() { const v = this.pendingDebug; this.pendingDebug = []; return v; }
  consumeCardChoice() { const v = this.pendingCardChoice; this.pendingCardChoice = null; return v; }
  consumeUiClick() { const v = this.pendingUiClick; this.pendingUiClick = null; return v; }
  consumeBuildPlanToggle() { const v = this.pendingBuildPlanToggle; this.pendingBuildPlanToggle = false; return v; }
  consumeDestroyToggle() { const v = this.pendingDestroyToggle; this.pendingDestroyToggle = false; return v; }
  consumeDragRect() { const v = this.pendingDragRect; this.pendingDragRect = null; return v; }
  consumeManualIntent() { const v = this.pendingManualIntent; this.pendingManualIntent = undefined; return v; }
  getIntentWheelState() {
    if (!this.intentWheelActive || !this._altCenter) return null;
    return { cx: this._altCenter.x, cy: this._altCenter.y, mx: this.mouse.x, my: this.mouse.y };
  }

  attach() {
    if (this.bound || typeof window === 'undefined') return;
    this.target?.setAttribute?.('tabindex', '0');
    this.target?.focus?.({ preventScroll: true });
    this.target?.addEventListener?.('pointerdown', this._onPointerDown);
    this.target?.addEventListener?.('pointermove', this._onPointerMove);
    this.target?.addEventListener?.('contextmenu', this._onContextMenu);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.bound = true;
  }

  detach() {
    if (!this.bound || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('pointerup', this._onPointerUp);
    this.target?.removeEventListener?.('pointerdown', this._onPointerDown);
    this.target?.removeEventListener?.('pointermove', this._onPointerMove);
    this.target?.removeEventListener?.('contextmenu', this._onContextMenu);
    this.keys.clear();
    this.mining = false;
    this.repairing = false;
    this.bound = false;
  }

  getMoveVector() {
    const left = this.keys.has('left');
    const right = this.keys.has('right');
    const up = this.keys.has('up');
    const down = this.keys.has('down');
    return {
      x: (right ? 1 : 0) - (left ? 1 : 0),
      y: (down ? 1 : 0) - (up ? 1 : 0),
    };
  }

  _handlePointerDown(e) {
    this.target?.focus?.({ preventScroll: true });
    this._syncPointer(e);
    e.preventDefault?.();
    // Alt + 左鍵 → 開啟意圖輪盤，攔截後續所有操作
    if (e.button === 0 && this._altHeld) {
      this.intentWheelActive = true;
      this._altCenter = { x: this.mouse.x, y: this.mouse.y };
      this._wheelEverOut = false;
      return;
    }
    const uiHit = this._hitTestUi(this.mouse.x, this.mouse.y);
    if (uiHit) {
      if (e.button === 0) this.pendingUiClick = uiHit.id;
      return;
    }
    // 快捷列點擊
    if (e.button === 0) {
      const hit = this._hitTestHotbar(this.mouse.x, this.mouse.y);
      if (hit != null) {
        this.setSelectedSlot(this.selectedSlot === hit ? null : hit);
        return;
      }
    }
    // 卡片選擇模式：左鍵偵測點了哪張卡，右鍵忽略
    if (e.button === 0 && this.cardOfferMode) {
      const mx = this.mouse.x, my = this.mouse.y;
      for (let i = 0; i < (this.cardOfferRects?.length ?? 0); i++) {
        const r = this.cardOfferRects[i];
        if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) {
          this.pendingCardChoice = i;
          break;
        }
      }
      return;
    }
    if (e.button === 2) { this.pendingRemove = true; return; } // 右鍵拆除
    // Build Plan / Destroy Mode：左鍵拖拽起點
    if (e.button === 0 && (this.buildPlanMode || this.buildDestroyMode) && this.selectedSlot != null) {
      this.dragStart = { px: this.mouse.x, py: this.mouse.y };
      this.dragging = true;
      return;
    }
    if (this.selectedSlot != null) this.pendingPlace = true;    // 建造模式：放置
    else this.mining = true;                                    // 挖礦模式：長按
  }

  _handlePointerUp(e) {
    // 輪盤開啟中：滑鼠放開 → 計算意圖並送出（Alt 不需要鬆開）
    if (this.intentWheelActive) {
      this._syncPointer(e);
      this.intentWheelActive = false;
      this.pendingManualIntent = this._computeWheelIntent();
      this._altCenter = null;
      this._wheelEverOut = false;
      return;
    }
    this.mining = false;
    if (this.dragging && this.dragStart) {
      this._syncPointer(e);
      this.pendingDragRect = {
        startPx: this.dragStart.px, startPy: this.dragStart.py,
        endPx: this.mouse.x, endPy: this.mouse.y,
      };
      this.dragStart = null;
      this.dragging = false;
    }
  }

  _hitTestHotbar(mx, my) {
    const vw = this.viewport.width, vh = this.viewport.height;
    if (!vw) return null;
    const slotSize = 40, gap = 4, slots = this.hotbarSlots;
    const totalW = slots * slotSize + (slots - 1) * gap;
    const barH = slotSize + 18;
    const startX = Math.round((vw - totalW) / 2);
    const barY = vh - barH - 4;
    if (my < barY || my > barY + slotSize) return null;
    if (mx < startX || mx > startX + totalW) return null;
    const rel = mx - startX;
    const unit = slotSize + gap;
    const i = Math.floor(rel / unit);
    if (i >= slots) return null;
    if (rel - i * unit > slotSize) return null; // in the gap
    return i;
  }

  _hitTestUi(mx, my) {
    for (const r of this.uiHitRects ?? []) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return r;
    }
    return null;
  }

  _syncPointer(e) {
    this.mouse.x = e.offsetX ?? this.mouse.x;
    this.mouse.y = e.offsetY ?? this.mouse.y;
    // 輪盤開啟中：追蹤是否曾離開死區
    if (this.intentWheelActive && this._altCenter) {
      const dx = this.mouse.x - this._altCenter.x;
      const dy = this.mouse.y - this._altCenter.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 30) this._wheelEverOut = true;
    }
  }

  _handleKey(event, isDown) {
    // 建造快捷鍵 / 退出（只在 keydown 處理）
    if (event.code === 'AltLeft' || event.code === 'AltRight') {
      event.preventDefault();
      this._altHeld = isDown;
      // Alt 放開時若輪盤還開著 → 取消，不送出任何意圖
      if (!isDown && this.intentWheelActive) {
        this.intentWheelActive = false;
        this._altCenter = null;
        this._wheelEverOut = false;
      }
      return;
    }
    if (isDown) {
      if (event.code === 'Escape') { this.setSelectedSlot(null); event.preventDefault(); return; }
      const debugAction = keyToDebugAction(event);
      if (debugAction) {
        if (!event.repeat) this.pendingDebug.push(debugAction);
        event.preventDefault();
        return;
      }
      if (event.code === 'KeyB' && !event.repeat) {
        this.pendingBuildPlanToggle = true;
        event.preventDefault();
        return;
      }
      if (event.code === 'KeyV' && !event.repeat) {
        this.pendingDestroyToggle = true;
        event.preventDefault();
        return;
      }
      const slot = keyToSlot(event);
      if (slot != null && slot < this.hotbarSlots) {
        if (event.repeat) { event.preventDefault(); return; }
        this.setSelectedSlot(this.selectedSlot === slot ? null : slot); // 再按同鍵 = 取消
        event.preventDefault();
        return;
      }
    }
    if (event.code === 'KeyR') {
      this.repairing = isDown;
      event.preventDefault();
      return;
    }
    // 移動
    const dir = keyToDirection(event);
    if (!dir) return;
    event.preventDefault();
    if (isDown) this.keys.add(dir);
    else this.keys.delete(dir);
    this.handlers.move?.(this.getMoveVector());
  }

  _computeWheelIntent() {
    if (!this._altCenter) return null;
    const dx = this.mouse.x - this._altCenter.x;
    const dy = this.mouse.y - this._altCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 20) return 'errand';
    const a = Math.atan2(dy, dx);
    if (a > -Math.PI / 4 && a <= Math.PI / 4)          return 'build';   // 右
    if (a > Math.PI / 4  && a <= 3 * Math.PI / 4)      return 'repair';  // 下
    if (a > 3 * Math.PI / 4 || a <= -3 * Math.PI / 4) return 'mine';    // 左
    return 'warn'; // 上
  }
}

function keyToDebugAction(event) {
  switch (event.code) {
    case 'KeyH': return 'damageCore';
    case 'KeyJ': return 'healCore';
    case 'KeyK': return 'grantResources';
    case 'KeyL': return 'spawnEnemy';
    case 'KeyP': return 'spawnEnemyPack';
    case 'KeyC': return 'showCardOffer'; // 直接打開抽卡面板
    case 'KeyT': return 'togglePause';   // debug 暫停 / 恢復 gameplay update
    case 'KeyN': return 'startNight';    // 立即開始夜晚（prep 中有效）
    case 'KeyQ': return 'restartStage';  // 清除敵人並重設為 prep 狀態
    default: break;
  }

  switch ((event.key ?? '').toLowerCase()) {
    case 'h': return 'damageCore';
    case 'j': return 'healCore';
    case 'k': return 'grantResources';
    case 'l': return 'spawnEnemy';
    case 'p': return 'spawnEnemyPack';
    case 'c': return 'showCardOffer';
    case 't': return 'togglePause';
    case 'n': return 'startNight';
    case 'q': return 'restartStage';
    default: return null;
  }
}

// 數字鍵 → 快捷列索引：Digit1~9 → 0~8、Digit0 → 9；實際可選上限由 hotbarSlots 擋。
function keyToSlot(event) {
  const m = /^Digit([0-9])$/.exec(event.code ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n === 0 ? 9 : n - 1;
}

function keyToDirection(event) {
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp':
      return 'up';
    case 'KeyA':
    case 'ArrowLeft':
      return 'left';
    case 'KeyS':
    case 'ArrowDown':
      return 'down';
    case 'KeyD':
    case 'ArrowRight':
      return 'right';
    default:
      break;
  }

  switch ((event.key ?? '').toLowerCase()) {
    case 'w':
    case 'arrowup':
      return 'up';
    case 'a':
    case 'arrowleft':
      return 'left';
    case 's':
    case 'arrowdown':
      return 'down';
    case 'd':
    case 'arrowright':
      return 'right';
    default:
      return null;
  }
}
