/**
 * @file        cardEffect.js
 * @module      logic（pure）
 * @summary     套用卡片 effect 到 world 狀態（骨架；Codex-8A 填入各 handler 實作）
 * @exports     applyCardEffect
 * @depends     config/cards.js
 * @sourceOfTruth Docs/bosscard.md「卡片效果」
 * @version     v0.0.19.0
 *
 * 呼叫方須在此函式之後呼叫 refreshCoreSnapshot(world, { applyHpMaxDelta: true })
 * 以把 cardBonuses 合入核心數值快照，並正確夾取 coreHp。
 *
 * effect 形狀（與 config/cards.js 對齊）：
 *   coreStat   → { kind:'coreStat',   stat, add, heal? }
 *   playerStat → { kind:'playerStat', stat, add }
 *   resource   → { kind:'resource',   grant:{ blockKey: qty, ... } }
 *   modifier   → { kind:'modifier',   mods:[{ stat, pct?, add? }] }
 */

import { CARDS } from '../../config/cards.js';

/**
 * 套用選定卡片的 effect 到 world 狀態。
 *
 * @param {Object} world
 * @param {string} cardKey  CARDS 中的 key
 * @param {Object} [pool=CARDS]
 */
export function applyCardEffect(world, cardKey, pool = CARDS) {
  const card = pool[cardKey];
  if (!card?.effect) return;
  const { effect } = card;
  switch (effect.kind) {
    case 'coreStat':   _applyCoreStat(world, effect);   break;
    case 'playerStat': _applyPlayerStat(world, effect); break;
    case 'resource':   _applyResource(world, effect);   break;
    case 'modifier':   _applyModifier(world, effect);   break;
  }
}

function _applyCoreStat(world, effect) {
  world.cardBonuses[effect.stat] = (world.cardBonuses[effect.stat] ?? 0) + effect.add;
  if (effect.heal != null) {
    world.coreHp = (world.coreHp ?? 0) + effect.heal;
  }
}

function _applyPlayerStat(world, effect) {
  const players = world.players?.values?.() ?? [world.player];
  for (const player of players) {
    player[effect.stat] = (player[effect.stat] ?? 0) + effect.add;
  }
}

function _applyResource(world, effect) {
  for (const [k, qty] of Object.entries(effect.grant ?? {})) {
    world.storage[k] = (world.storage[k] ?? 0) + qty;
  }
}

function _applyModifier(world, effect) {
  for (const mod of effect.mods ?? []) {
    world.cardModifiers.push({ ...mod });
  }
}
