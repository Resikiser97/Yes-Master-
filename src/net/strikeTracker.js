/**
 * @file        strikeTracker.js
 * @module      net
 * @summary     反作弊 Strike 計數器：累積達 maxStrikes 回傳 kicked:true；key = auth.uid+room_id+slot_id
 * @exports     createStrikeTracker
 * @sourceOfTruth Docs/game-architecture-plan.md「反作弊／輸入驗證機制 → 違規分級處理」
 * @version     v0.0.19.0
 */
export function createStrikeTracker({ maxStrikes = 5 } = {}) {
  const strikes = new Map();
  return {
    add(key, reason = 'invalid_input') {
      const next = (strikes.get(key)?.count ?? 0) + 1;
      const entry = { count: next, reason, updatedAt: Date.now() };
      strikes.set(key, entry);
      return { ...entry, kicked: next >= maxStrikes };
    },
    get(key) {
      return strikes.get(key) ?? { count: 0, reason: null, updatedAt: 0 };
    },
    reset(key) {
      strikes.delete(key);
    },
  };
}
