/**
 * @file        damageDefense.js
 * @module      logic（pure）
 * @summary     防禦減傷與「物理+魔法」傷害合算（純函式）
 * @exports     defenseReduction, computeDamage
 * @depends     config/gameConfig.js（防禦係數 defenseK）
 * @sourceOfTruth Docs/game-design-plan.md「核心攻擊與防禦機制」
 * @version     v0.0.2.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';

// 減傷% = N / (K + N)，回傳 0~1 的小數
export function defenseReduction(defense, k = GAME_CONFIG.core.defenseK) {
  if (defense <= 0) return 0;
  return defense / (k + defense);
}

// 總傷害 = 物理(受防禦影響) + 魔法(無視防禦)
// attacker: { attack, magicPct }（magicPct 為百分比數，例 0.1 = 0.1%）
// target:   { defense }
export function computeDamage(attacker, target, k = GAME_CONFIG.core.defenseK) {
  const physical = attacker.attack * (1 - defenseReduction(target.defense ?? 0, k));
  const magic = attacker.attack * ((attacker.magicPct ?? 0) / 100);
  return physical + magic;
}
