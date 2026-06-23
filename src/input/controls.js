/**
 * @file        controls.js
 * @module      input（輸入層，非純邏輯）
 * @summary     把玩家操作（WASD 移動、滑鼠點擊/長按挖礦、放置）轉成資料事件
 * @exports     Controls
 * @depends     （無；僅綁瀏覽器事件，不 import 其他模組）
 * @sourceOfTruth Docs/game-design-plan.md「操作輸入方式」
 * @version     v0.0.3.0
 *
 * 輸入層只把操作「轉成資料」丟給純邏輯，不在此做規則判定（鐵則 9）。
 * 步驟 3 現況：已接 WASD/方向鍵移動與 pointer 長按挖礦；點擊 10/s、放置輸入待後續細分。
 */

export class Controls {
  constructor(target) {
    this.target = target;
    this.handlers = {};
    this.keys = new Set();
    this.bound = false;
    this.mining = false; // 滑鼠長按 = 挖礦中（自動挖最近方塊）
    this._onKeyDown = (event) => this._handleKey(event, true);
    this._onKeyUp = (event) => this._handleKey(event, false);
    this._onPointerDown = () => { this.target?.focus?.({ preventScroll: true }); this.mining = true; };
    this._onPointerUp = () => { this.mining = false; };
  }

  on(event, fn) { this.handlers[event] = fn; }

  // 挖礦輸入狀態（長按）；點擊/長按的次數上限差異留待後續細分
  isMining() { return this.mining; }

  attach() {
    if (this.bound || typeof window === 'undefined') return;
    this.target?.setAttribute?.('tabindex', '0');
    this.target?.focus?.({ preventScroll: true });
    this.target?.addEventListener?.('pointerdown', this._onPointerDown);
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
    this.keys.clear();
    this.mining = false;
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

  _handleKey(event, isDown) {
    const dir = keyToDirection(event);
    if (!dir) return;
    event.preventDefault();
    if (isDown) this.keys.add(dir);
    else this.keys.delete(dir);
    this.handlers.move?.(this.getMoveVector());
  }
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
