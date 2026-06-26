/**
 * @file        cardOffer.js
 * @module      logic（pure）
 * @summary     王關固定 3 槽位出卡（含類型保護、偏強上限、同名去重，隨機注入）
 * @exports     generateOffer
 * @depends     config/cards.js
 * @sourceOfTruth Docs/bosscard.md「出卡規則」
 * @version     v0.0.14.0
 */

import { CARDS, CARD_OFFER_RULES } from '../../config/cards.js';

// 依 tierWeights 加權挑一個 tier
function pickTier(weights, rng) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [tier, w] of entries) {
    r -= w;
    if (r <= 0) return tier;
  }
  return entries[entries.length - 1][0];
}

// 從某 tier 取一張未被排除的卡 key（找不到回 null）
function pickCardOfTier(tier, excludeKeys, pool, rng) {
  const candidates = Object.entries(pool)
    .filter(([key, c]) => c.tier === tier && !excludeKeys.has(key))
    .map(([key]) => key);
  return candidates.length ? rng.pick(candidates) : null;
}

/**
 * 產生 3 張卡。
 * @param {Object} rng createRng() 注入
 * @param {number} [bossStage=10] 10/20/30 決定價值點
 * @param {Object} [pool=CARDS]
 * @returns {Array<{key, value, ...card}>}
 */
export function generateOffer(rng, bossStage = 10, pool = CARDS) {
  const rules = CARD_OFFER_RULES;
  const chosen = [];
  const usedKeys = new Set();
  let strongCount = 0;

  for (let slot = 0; slot < rules.slots.length; slot++) {
    const isLast = slot === rules.slots.length - 1;
    let key = null;

    for (let attempt = 0; attempt < 8 && !key; attempt++) {
      let tier = pickTier(rules.slots[slot].tierWeights, rng);
      // 偏強上限保護
      if (tier === 'strong' && strongCount >= rules.maxStrongPerOffer) tier = 'standard';
      let candidate = pickCardOfTier(tier, usedKeys, pool, rng);
      // 該 tier 沒卡 → 退回標準
      if (!candidate) candidate = pickCardOfTier('standard', usedKeys, pool, rng);

      // 最後一張：三張同類型則重抽
      if (candidate && isLast && rules.rerollSlot3IfAllSameType) {
        const types = new Set(chosen.map((c) => pool[c].type));
        if (types.size === 1 && types.has(pool[candidate].type)) candidate = null;
      }
      key = candidate;
    }

    if (key) {
      if (pool[key].tier === 'strong') strongCount++;
      usedKeys.add(key);
      chosen.push(key);
    }
  }

  const value = rules.valueByBossStage[bossStage] ?? rules.valueByBossStage[10];
  return chosen.map((key) => ({ key, value, ...pool[key] }));
}

