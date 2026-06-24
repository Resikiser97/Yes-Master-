/**
 * @file        mobileLayout.js
 * @module      ui
 * @summary     手機版面輔助：動態 tilePx 計算、三欄觸控版面、觸控偵測、直向遮罩
 * @exports     computeTilePx, applyTilePx, computeThreeColumnLayout, applyThreeColumnLayout, isTouchDevice, isStandalone, getSavedInputMode, saveInputMode, setupOrientationGuard
 * @depends     （無）
 * @version     v0.0.12.0
 *
 * 注意：baseViewCols/baseViewRows 在首次呼叫時快取，避免反覆 applyTilePx 後計算漂移。
 */

let _baseViewCols = null;
let _baseViewRows = null;
let _baseViewportPx = null;

const MOBILE_VIEWPORT_CROP_TILES = {
  top: 9,
  right: 8,
  bottom: 3,
  left: 8,
};

function ensureBase(cfg) {
  if (_baseViewCols === null) {
    _baseViewCols = Math.round(cfg.map.viewportPx.width / cfg.render.tilePx);
    _baseViewRows = Math.round(cfg.map.viewportPx.height / cfg.render.tilePx);
    _baseViewportPx = { ...cfg.map.viewportPx };
  }
}

/**
 * 計算最佳 tilePx，優先填滿寬度。
 * 手機橫向不以高度列數限制 tilePx（高度由 applyTilePx 截斷）。
 */
export function computeTilePx(cfg) {
  ensureBase(cfg);
  return Math.max(4, Math.floor(window.innerWidth / _baseViewCols));
}

/**
 * 把新的 tilePx 寫回 cfg（by reference），並同步更新 viewportPx。
 * reserveBottomPx：底部按鍵佔用高度（觸控約 160px；桌面為 0）。
 * canvas 高度截斷至 (window.innerHeight - reserveBottomPx)，不超過原始列數 × tilePx。
 */
export function applyTilePx(cfg, tilePx, reserveBottomPx = 0) {
  ensureBase(cfg);
  cfg.render.tilePx = tilePx;
  const maxH = window.innerHeight - reserveBottomPx;
  cfg.map.viewportPx = {
    width:  _baseViewCols * tilePx,
    height: Math.min(_baseViewRows * tilePx, Math.max(maxH, tilePx * 6)),
  };
}

export function computeMobileGameViewportPx(cfg) {
  ensureBase(cfg);
  const tilePx = GAME_CONFIG_TILEPX_FALLBACK(cfg);
  const cropX = (MOBILE_VIEWPORT_CROP_TILES.left + MOBILE_VIEWPORT_CROP_TILES.right) * tilePx;
  const cropY = (MOBILE_VIEWPORT_CROP_TILES.top + MOBILE_VIEWPORT_CROP_TILES.bottom) * tilePx;
  return {
    width: Math.max(tilePx * 6, _baseViewportPx.width - cropX),
    height: Math.max(tilePx * 6, _baseViewportPx.height - cropY),
  };
}

/**
 * 手機三欄 layout：左右固定操作區，中間保留桌面 canvas 比例等比縮小。
 * 手機模式使用較小的遊戲內 viewport，讓 tile 在手機橫向畫面中更清楚。
 */
export function computeThreeColumnLayout(cfg) {
  ensureBase(cfg);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const sideMin = 150;
  const sideMax = 164;
  const preferredSide = Math.round(w * 0.22);
  const sideWidth = Math.max(sideMin, Math.min(sideMax, preferredSide));
  const centerWidth = Math.max(1, w - sideWidth * 2);
  const gameViewportPx = computeMobileGameViewportPx(cfg);
  const scale = Math.min(centerWidth / gameViewportPx.width, h / gameViewportPx.height);
  const canvasWidth = Math.floor(gameViewportPx.width * scale);
  const canvasHeight = Math.floor(gameViewportPx.height * scale);

  return {
    sideWidth,
    centerWidth,
    canvasWidth,
    canvasHeight,
    gameViewportPx,
    scale,
    stageLeft: sideWidth + Math.floor((centerWidth - canvasWidth) / 2),
    stageTop: Math.floor((h - canvasHeight) / 2),
  };
}

export function applyThreeColumnLayout(cfg, canvas) {
  ensureBase(cfg);
  cfg.render.tilePx = GAME_CONFIG_TILEPX_FALLBACK(cfg);
  cfg.map.viewportPx = { ..._baseViewportPx };

  const layout = computeThreeColumnLayout(cfg);
  const stage = document.getElementById('stage');
  if (stage) {
    stage.style.position = 'fixed';
    stage.style.left = `${layout.stageLeft}px`;
    stage.style.top = `${layout.stageTop}px`;
    stage.style.width = `${layout.canvasWidth}px`;
    stage.style.height = `${layout.canvasHeight}px`;
    stage.style.background = '#141820';
    stage.style.overflow = 'hidden';
  }
  if (canvas) {
    const scale = layout.scale;
    canvas.style.position = 'absolute';
    canvas.style.zIndex = '0';
    canvas.style.left = `${-MOBILE_VIEWPORT_CROP_TILES.left * cfg.render.tilePx * scale}px`;
    canvas.style.top = `${-MOBILE_VIEWPORT_CROP_TILES.top * cfg.render.tilePx * scale}px`;
    canvas.style.width = `${_baseViewportPx.width * scale}px`;
    canvas.style.height = `${_baseViewportPx.height * scale}px`;
  }
  const modeBadge = document.getElementById('mode-badge');
  if (modeBadge) {
    modeBadge.style.zIndex = '2';
  }
  const version = document.getElementById('version');
  if (version) {
    version.style.zIndex = '2';
  }
  document.body.style.background = '#30343a';
  return layout;
}

function GAME_CONFIG_TILEPX_FALLBACK(cfg) {
  return Math.round(_baseViewportPx.width / _baseViewCols) || cfg.render.tilePx;
}

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function isStandalone() {
  return window.navigator.standalone === true ||
         window.matchMedia('(display-mode: standalone)').matches;
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

