/**
 * @file        achievements.js
 * @module      config
 * @summary     初版玩家成就定義與解鎖條件（單一數值來源）
 * @exports     ACHIEVEMENTS, ACHIEVEMENT_BY_ID
 * @depends     （無）
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase E
 * @version     v0.0.14.0
 */

export const ACHIEVEMENTS = [
  { id: 'first_clear', name: '初次守住', description: '首次通過任一波次。', category: 'progress', condition: { metric: 'highestWave', op: 'gte', value: 1 } },
  { id: 'wave_10_clear', name: '第十波防線', description: '通過第 10 關。', category: 'progress', condition: { metric: 'highestWave', op: 'gte', value: 10 } },
  { id: 'wave_20_clear', name: '第二防線', description: '通過第 20 關。', category: 'progress', condition: { metric: 'highestWave', op: 'gte', value: 20 } },
  { id: 'first_multiplayer', name: '首次並肩', description: '完成第一場多人遊戲。', category: 'social', condition: { metric: 'multiplayerRuns', op: 'gte', value: 1 } },
  { id: 'first_friend', name: '握手成盟', description: '新增第一位好友。', category: 'social', condition: { metric: 'friendCount', op: 'gte', value: 1 } },
  { id: 'mine_1000', name: '礦道熟手', description: '累計挖礦 1000 次。', category: 'mining', condition: { metric: 'minedBlocks', op: 'gte', value: 1000 } },
  { id: 'build_100', name: '百塊工事', description: '累計建造 100 塊。', category: 'building', condition: { metric: 'builtBlocks', op: 'gte', value: 100 } },
  { id: 'repair_500', name: '核心修補匠', description: '累計修復 500 點核心生命。', category: 'support', condition: { metric: 'repairedCoreHp', op: 'gte', value: 500 } },
  { id: 'first_equipment_upgrade', name: '第一次強化', description: '完成第一次裝備升級。', category: 'equipment', condition: { metric: 'equipmentUpgradeCount', op: 'gte', value: 1 } },
  { id: 'ranked_first_score', name: '榜上有名', description: '首次提交排行榜分數。', category: 'leaderboard', condition: { metric: 'leaderboardSubmissions', op: 'gte', value: 1 } },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));
