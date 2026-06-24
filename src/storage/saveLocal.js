/**
 * @file        saveLocal.js
 * @module      storage（IO 層，非純邏輯）
 * @summary     MVP localStorage 存檔讀寫；讀取時跑 schema migration
 * @exports     loadSave, writeSave, clearSave
 * @depends     config/gameConfig.js、src/logic/migration.js
 * @sourceOfTruth Docs/game-architecture-plan.md「Schema Versioning」「Save File 資料結構」
 * @version     v0.0.5.0
 *
 * 本檔屬 IO 層（碰 localStorage）。規則運算一律委派純邏輯，不在此寫遊戲規則。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { migrate, CURRENT_SCHEMA_VERSION } from '../logic/migration.js';

const KEY = GAME_CONFIG.save.storageKey;
const store = () => (typeof localStorage !== 'undefined' ? localStorage : null);

// 回 { ok, data?, reason? }
export function loadSave() {
  const s = store();
  if (!s) return { ok: false, reason: 'no_storage' };
  const raw = s.getItem(KEY);
  if (!raw) return { ok: false, reason: 'empty' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, reason: 'corrupt' }; }
  return migrate(parsed); // 版本判定 + 升級在純邏輯
}

export function writeSave(data) {
  const s = store();
  if (!s) return false;
  const payload = {
    ...data,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    clientBuildVersion: GAME_CONFIG.version,
    dataRevision: new Date().toISOString(),
  };
  s.setItem(KEY, JSON.stringify(payload));
  return true;
}

export function clearSave() {
  store()?.removeItem(KEY);
}
