/**
 * @file        enemies.js
 * @module      config
 * @summary     敵人基礎數值表（第 1-10 關不成長的 base 值；成長由 waveGen 自動套）
 * @exports     ENEMIES
 * @depends     （無）
 * @sourceOfTruth Docs/waveplan.md「敵人成長規則」、Docs/simulation/simulation-log-2.md
 * @version     v0.0.33.0
 *
 * ⚠️ 交接給 Codex（見 Docs/claude-codex-worklist.md 任務 A / B）：
 *   - 請只填 hp / attack / moveSpeed（工兵另含 attackRange）= 目前為 null。
 *   - height / attackRange / defense 已依設計文件預填，勿改（除非要改設計）。
 *   - 請給「第 1-10 關不成長」的 base 值；11-20 成長、21-30 增壓由 src/logic/waveGen.js 自動套，
 *     不要把成長乘進這裡。
 *   - moveSpeed 單位：格/秒（玩家基礎 5 格/秒可當參考；跑者應更快）。
 */

export const ENEMIES = {
  // 普通怪 ---------------------------------------------------------------
  civilian: { zh: '平民', height: 2, attackRange: 1, defense: 0,
    hp: 30, attack: 1, moveSpeed: 4.5 },

  runner:   { zh: '跑者', height: 3, attackRange: 1, defense: 0,
    hp: 18, attack: 1, moveSpeed: 7 },

  brute:    { zh: '猛男', height: 3, attackRange: 1, defense: 0,
    hp: 50, attack: 2, moveSpeed: 3.5 },

  shielder: { zh: '盾兵', height: 3, attackRange: 1, defense: 30,
    hp: 40, attack: 1, moveSpeed: 3.8 },

  sapper:   { zh: '工兵', height: 3, attackRange: 3, defense: 0,
    hp: 35, attack: 1, moveSpeed: 4 },

  // Boss（不吃普通怪成長/數量倍率；各有獨立規則，見 waveplan.md）----------
  // doorAttack: true 的 Boss 有效攻擊距離 = height + attackRange（見 combatRuntime.js updateEnemies）。
  // doorAttack: false 或一般小怪，維持原始 attackRange，不吃 height 加成。
  // 任何已放置方塊（dirt/fore）都與 world.core 一樣是敵人的有效攻擊目標，沒有獨立的方塊 HP。
  boss10:   { zh: '小隊長', isBoss: true, height: 4, attackRange: 1, defense: 0,
    hp: 260, attack: 3, moveSpeed: 3,
    doorAttack: false }, // 第 10 Boss 不套用完整門口攻擊

  boss20:   { zh: 'Boss20', isBoss: true, height: 4, attackRange: 2, defense: 0,
    hp: 650, attack: 6, moveSpeed: 2.8,
    doorAttack: true, // 有效距離 = height + attackRange（不檢查建築高度門檻）
    // 多人門檻：3 人血量 +30%、4 人血量 +50%（waveGen 套用）
    multiHpBonusPct: { 3: 30, 4: 50 } },

  boss30:   { zh: 'Boss30', isBoss: true, height: 4, attackRange: 2, defense: 0,
    hp: 1200, attack: 10, moveSpeed: 2.6,
    doorAttack: true },
};
