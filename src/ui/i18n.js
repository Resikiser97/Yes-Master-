/**
 * @file        i18n.js
 * @module      ui
 * @summary     UI 文字語言包入口；目前提供繁體中文，避免新 UI 在元件內硬寫文案
 * @exports     t
 * @depends     （無）
 * @version     v0.0.42.0
 */

const ZH_TW = Object.freeze({
  'lobby.resumeActiveRoom': '返回進行中的房間',
  'lobby.resumeChecking': '檢查進行中的房間...',
  'lobby.resumeFailed': '無法返回房間',
});

export function t(key) {
  return ZH_TW[key] ?? key;
}
