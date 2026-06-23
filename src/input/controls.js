/**
 * @file        controls.js
 * @module      input（輸入層，非純邏輯）
 * @summary     把玩家操作（WASD 移動、滑鼠長按挖礦、數字選材料、左鍵放置、右鍵拆除、修復/debug）轉成資料
 * @exports     Controls
 * @depends     （無；僅綁瀏覽器事件，不 import 其他模組）
 * @sourceOfTruth Docs/game-design-plan.md「操作輸入方式」
 * @version     v0.0.3.0
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
    this._onKeyDown = (e) => this._handleKey(e, true);
    this._onKeyUp = (e) => this._handleKey(e, false);
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerUp = () => { this.mining = false; };
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
    if (e.button === 2) { this.pendingRemove = true; return; } // 右鍵拆除
    if (this.selectedSlot != null) this.pendingPlace = true;    // 建造模式：放置
    else this.mining = true;                                    // 挖礦模式：長按
  }

  _syncPointer(e) {
    this.mouse.x = e.offsetX ?? this.mouse.x;
    this.mouse.y = e.offsetY ?? this.mouse.y;
  }

  _handleKey(event, isDown) {
    // 建造快捷鍵 / 退出（只在 keydown 處理）
    if (isDown) {
      if (event.code === 'Escape') { this.setSelectedSlot(null); event.preventDefault(); return; }
      const debugAction = keyToDebugAction(event);
      if (debugAction) {
        if (!event.repeat) this.pendingDebug.push(debugAction);
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
}

function keyToDebugAction(event) {
  switch (event.code) {
    case 'KeyH': return 'damageCore';
    case 'KeyJ': return 'healCore';
    case 'KeyK': return 'grantResources';
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
