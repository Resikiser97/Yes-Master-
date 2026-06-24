/**
 * @file        mobileLayout.js
 * @module      ui
 * @summary     手機版面輔助：動態 tilePx 計算、applyTilePx、觸控偵測、直向遮罩
 * @exports     computeTilePx, applyTilePx, isTouchDevice, getSavedInputMode, saveInputMode, setupOrientationGuard
 * @depends     （無）
 * @version     v0.0.8.0
 *
 * 注意：baseViewCols/baseViewRows 在首次呼叫時快取，避免反覆 applyTilePx 後計算漂移。
 */

let _baseViewCols = null;
let _baseViewRows = null;

function ensureBase(cfg) {
  if (_baseViewCols === null) {
    _baseViewCols = Math.round(cfg.map.viewportPx.width / cfg.render.tilePx);
    _baseViewRows = Math.round(cfg.map.viewportPx.height / cfg.render.tilePx);
  }
}

/**
 * 計算最佳 tilePx，讓遊戲地圖填滿可用空間。
 * reserveBottomPx：底部留給虛擬按鍵的高度（電腦=0，手機=140）。
 */
export function computeTilePx(cfg, reserveBottomPx = 0) {
  ensureBase(cfg);
  const vw = window.innerWidth;
  const vh = window.innerHeight - reserveBottomPx;
  const tByW = Math.floor(vw / _baseViewCols);
  const tByH = Math.floor(vh / _baseViewRows);
  return Math.max(4, Math.min(tByW, tByH));
}

/**
 * 把新的 tilePx 寫回 cfg（by reference），並同步更新 viewportPx。
 */
export function applyTilePx(cfg, tilePx) {
  ensureBase(cfg);
  cfg.render.tilePx = tilePx;
  cfg.map.viewportPx = {
    width:  _baseViewCols * tilePx,
    height: _baseViewRows * tilePx,
  };
}

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function getSavedInputMode() {
  try { return localStorage.getItem('yesmaster.inputMode') ?? null; } catch { return null; }
}

export function saveInputMode(mode) {
  try { localStorage.setItem('yesmaster.inputMode', mode); } catch {}
}

/**
 * 建立直向偵測遮罩（只在 inputMode==='touch' 時呼叫）。
 * 偵測到直向時顯示「請轉橫向遊玩」，橫向時隱藏。
 */
export function setupOrientationGuard() {
  if (document.getElementById('orientation-guard')) return;
  const guard = document.createElement('div');
  guard.id = 'orientation-guard';
  guard.style.cssText = [
    'display:none',
    'position:fixed',
    'top:0',
    'left:0',
    'width:100%',
    'height:100%',
    'background:#000',
    'z-index:9998',
    'align-items:center',
    'justify-content:center',
    'color:#D4A017',
    'font-size:18px',
    'letter-spacing:2px',
    'text-align:center',
  ].join(';') + ';';
  guard.textContent = '請轉橫向遊玩';
  document.body.appendChild(guard);

  const check = () => {
    const portrait = window.innerWidth < window.innerHeight;
    guard.style.display = portrait ? 'flex' : 'none';
  };
  window.addEventListener('resize', check);
  window.visualViewport?.addEventListener('resize', check);
  check();
}
