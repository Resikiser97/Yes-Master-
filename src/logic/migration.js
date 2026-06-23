/**
 * @file        migration.js
 * @module      logic（pure）
 * @summary     存檔 schema 版本判定與 idempotent Migration chain（純函式）
 * @exports     CURRENT_SCHEMA_VERSION, needsMigration, migrate
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-architecture-plan.md「Schema Versioning」
 * @version     v0.0.3.0
 *
 * Migration 必須 idempotent：跑 1 次 = 跑 2 次 = 跑到一半重跑，結果相同（用覆寫不用累加）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';

export const CURRENT_SCHEMA_VERSION = GAME_CONFIG.save.schemaVersion;

// 各步 migration：vN → vN+1。新增版本時往這裡加，migrate() 會自動串接。
const STEPS = {
  // 1: (data) => migrate_v1_to_v2(data),
};

export function needsMigration(data) {
  const v = data?.schemaVersion ?? 0;
  return v < CURRENT_SCHEMA_VERSION;
}

/**
 * @returns {{ ok:boolean, data?:Object, reason?:string }}
 *   schemaVersion > CURRENT → 拒絕（不讓舊版遊戲覆蓋新版資料）
 */
export function migrate(data) {
  const v = data?.schemaVersion ?? 0;
  if (v > CURRENT_SCHEMA_VERSION) {
    return { ok: false, reason: 'save_newer_than_client' };
  }
  let out = { ...data, schemaVersion: v || CURRENT_SCHEMA_VERSION };
  let cur = v || CURRENT_SCHEMA_VERSION;
  while (cur < CURRENT_SCHEMA_VERSION && STEPS[cur]) {
    out = STEPS[cur](out);
    cur += 1;
    out.schemaVersion = cur;
  }
  return { ok: true, data: out };
}
