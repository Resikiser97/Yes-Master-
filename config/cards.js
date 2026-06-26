/**
 * @file        cards.js
 * @module      config
 * @summary     第 10 關 18 張 MVP 卡池、強度分層、出卡固定槽位規則
 * @exports     CARDS, CARD_OFFER_RULES
 * @depends     （無）
 * @sourceOfTruth Docs/bosscard.md（唯一卡片主檔）
 * @version     v0.0.14.0
 *
 * tier：'weak'（偏弱/功能）| 'standard'（標準）| 'strong'（偏強）
 * type：'resource' | 'ability' | 'core' | 'archetype'
 * effect 形狀：
 *   ability  → { kind:'playerStat', stat, add }
 *   core     → { kind:'coreStat', stat, add, heal? }
 *   resource → { kind:'resource', grant:null, hint }   ← grant 待 Codex C 填
 *   archetype→ { kind:'modifier', mods:[{ stat, pct }] }
 */

export const CARDS = {
  // 資源型（grant 待 Codex C：把「2000 挖掘量數」換算成各方塊實際顆數）-------
  minerFeel:      { zh: '老礦工手感', type: 'resource', tier: 'standard', value: 100, lane: '建築成長',
    effect: { kind: 'resource', grant: { dirt: 16, stone: 12, sand: 12 }, hint: '約 2000 挖掘量數，偏土/石/沙' } },
  rightMinePass:  { zh: '右礦通行證', type: 'resource', tier: 'strong', value: 100, lane: '高價資源',
    effect: { kind: 'resource', grant: { gold: 6, glass: 1, dirt: 20 }, hint: '約 2000 挖掘量數，偏金/琉璃/土' } },
  dirtSupply:     { zh: '土倉補給', type: 'resource', tier: 'standard', value: 100, lane: '地基流',
    effect: { kind: 'resource', grant: { dirt: 40 }, hint: '等價約 2000 挖掘量數的土' } },
  stoneIronSupply:{ zh: '鐵石補強', type: 'resource', tier: 'weak', value: 100, lane: '防禦流',
    effect: { kind: 'resource', grant: { stone: 20, iron: 10 }, hint: '等價約 2000 挖掘量數的石/鐵' } },
  sandSupply:     { zh: '沙眼備料', type: 'resource', tier: 'standard', value: 100, lane: '射程流',
    effect: { kind: 'resource', grant: { sand: 40 }, hint: '等價約 2000 挖掘量數的沙' } },

  // 能力型 ---------------------------------------------------------------
  carryBoost:     { zh: '背簍加固', type: 'ability', tier: 'weak', value: 100, lane: '挖礦效率',
    effect: { kind: 'playerStat', stat: 'carry', add: 25 } },
  miningPower:    { zh: '老礦工手腕', type: 'ability', tier: 'standard', value: 100, lane: '挖礦效率',
    effect: { kind: 'playerStat', stat: 'mining', add: 25 } },
  lightStep:      { zh: '輕腳步', type: 'ability', tier: 'weak', value: 100, lane: '通勤/偷挖',
    effect: { kind: 'playerStat', stat: 'moveSpeed', add: 20 } },
  repairInstinct: { zh: '縫補本能', type: 'ability', tier: 'standard', value: 100, lane: '修復流',
    effect: { kind: 'playerStat', stat: 'repair', add: 25 } },
  spiritBeat:     { zh: '靈動鼓點', type: 'ability', tier: 'strong', value: 100, lane: '核心輸出',
    effect: { kind: 'playerStat', stat: 'spirit', add: 20 } },

  // 核心型 ---------------------------------------------------------------
  ironFangCore:   { zh: '鐵牙核心', type: 'core', tier: 'standard', value: 100, lane: '攻擊流',
    effect: { kind: 'coreStat', stat: 'attack', add: 2 } },
  goldWheelCore:  { zh: '金輪核心', type: 'core', tier: 'strong', value: 100, lane: '攻速流',
    effect: { kind: 'coreStat', stat: 'attackSpeed', add: 0.20 } },
  thickEarthShell:{ zh: '厚土外殼', type: 'core', tier: 'standard', value: 100, lane: '血量流',
    effect: { kind: 'coreStat', stat: 'hpMax', add: 25, heal: 25 } },
  sandWatchCore:  { zh: '沙眼瞭望', type: 'core', tier: 'strong', value: 100, lane: '射程流',
    effect: { kind: 'coreStat', stat: 'range', add: 15 } },
  diamondRefract: { zh: '鑽光折射', type: 'core', tier: 'strong', value: 100, lane: '群怪流',
    effect: { kind: 'coreStat', stat: 'chain', add: 0.35 } },

  // 流派型（有代價）------------------------------------------------------
  nightRepairShift:{ zh: '夜修班', type: 'archetype', tier: 'weak', value: 100, lane: '守家修復流',
    risk: ['有代價'],
    effect: { kind: 'modifier', mods: [{ stat: 'nightRepairPct', pct: 20 }, { stat: 'nightMiningPct', pct: -10 }] } },
  greedyMinePact: { zh: '貪礦契約', type: 'archetype', tier: 'strong', value: 100, lane: '激進偷挖流',
    risk: ['有代價', '危險'],
    effect: { kind: 'modifier', mods: [{ stat: 'nightMiningPct', pct: 20 }, { stat: 'coreHpMax', pct: null, add: -10 }] } },
  towerCraft:     { zh: '高塔工法', type: 'archetype', tier: 'strong', value: 100, lane: '高塔/延伸流',
    risk: ['有代價'],
    effect: { kind: 'modifier', mods: [{ stat: 'heightCostPct', pct: -10 }, { stat: 'repairPct', pct: -10 }] } },
};

// 出卡規則（MVP：固定 3 槽位 + 小隨機，見 bosscard.md「出卡規則」）
export const CARD_OFFER_RULES = {
  slots: [
    { tierWeights: { standard: 1.0 } },                       // 第 1 張：必標準
    { tierWeights: { weak: 0.55, standard: 0.45 } },          // 第 2 張
    { tierWeights: { strong: 0.25, standard: 0.50, weak: 0.25 } }, // 第 3 張
  ],
  noDuplicateName: true,        // 同一次 3 張不得同名
  maxStrongPerOffer: 1,         // 偏強卡同時最多 1 張
  rerollSlot3IfAllSameType: true, // 三張同類型 → 重抽第 3 張
  // 第 20/30 關沿用同槽位規則，價值點 150/200（見 bosscard.md）
  valueByBossStage: { 10: 100, 20: 150, 30: 200 },
};

