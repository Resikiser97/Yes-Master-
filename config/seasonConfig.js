/**
 * @file        seasonConfig.js
 * @module      config
 * @summary     排行榜賽季 ID 格式與賽季稱號門檻（單一數值來源）
 * @exports     SEASON_CONFIG, currentSeasonId
 * @depends     （無）
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase F
 * @version     v0.0.14.1
 */

export const SEASON_CONFIG = {
  idPrefix: 'S',
  idFormat: 'SYYYYMM',
  leaderboardDefaultLimit: 50,
  titles: [
    { id: 'gold_crown', name: '金冠', topPercent: 10 },
    { id: 'silver_crown', name: '銀冠', topPercent: 30 },
    { id: 'none', name: '', topPercent: 100 },
  ],
};

export function currentSeasonId(date = new Date(), cfg = SEASON_CONFIG) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${cfg.idPrefix}${year}${month}`;
}
