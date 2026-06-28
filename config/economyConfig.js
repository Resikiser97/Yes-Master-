/**
 * @file        economyConfig.js
 * @module      config
 * @summary     貨幣經濟系統所有常數的單一來源（抽獎盤、商店、技能點、裝備合成、轉化率）
 *              任何計算（活動獎勵、商店定價、進度估算）必須 import 本檔，不得硬編數字。
 * @exports     ECONOMY
 * @depends     （無）
 * @sourceOfTruth Docs/game-design-plan.md「每日商店系統」「抽獎系統」「貨幣基準轉化率」
 *               Docs/simulation/economy-sim-log.md（Monte Carlo 模擬定案）
 * @version     v0.0.22.0
 */

export const ECONOMY = {

  // ─── 貨幣基準轉化率 ────────────────────────────────────────────────────────
  rate: {
    silverPerGold: 40,
    goldPerTicket: 30,
  },

  // ─── 場次收入 ───────────────────────────────────────────────────────────────
  session: {
    goldPerStage: 5,
    ticketsPerStage: 1,
  },

  // ─── 抽獎盤 ─────────────────────────────────────────────────────────────────
  gacha: {
    boardSize: 64,
    avgPullsPerBoard: 56.9,
    rewards: {
      silverSmall:  { slots: 7,  amount: 150,  isBigPrize: false },
      silverMedium: { slots: 3,  amount: 600,  isBigPrize: false },
      silverLarge:  { slots: 2,  amount: 2000, isBigPrize: true  },
      goldSmall:    { slots: 7,  amount: 8,    isBigPrize: false },
      goldMedium:   { slots: 3,  amount: 30,   isBigPrize: false },
      goldLarge:    { slots: 2,  amount: 120,  isBigPrize: true  },
      ticketSmall:  { slots: 3,  amount: 2,    isBigPrize: false },
      ticketMedium: { slots: 1,  amount: 8,    isBigPrize: true  },
      equip0:       { slots: 18, level: 0,     isBigPrize: false },
      equip1:       { slots: 8,  level: 1,     isBigPrize: false },
      equip2:       { slots: 5,  level: 2,     isBigPrize: false },
      equip3:       { slots: 3,  level: 3,     isBigPrize: false },
      equip4:       { slots: 2,  level: 4,     isBigPrize: true  },
    },
    // fairValue[N] = (boardSize / slots) * goldPerTicket
    equipFairValue: { 0: 107, 1: 240, 2: 384, 3: 640, 4: 960 },
    boardStorageKey: 'yesmaster.gacha.board',
  },

  // ─── 裝備庫存 ────────────────────────────────────────────────────────────────
  inventory: {
    storageKey: 'yesmaster.inventory',
  },

  // ─── 裝備合成 ────────────────────────────────────────────────────────────────
  synthesis: {
    silverCostPerPiece: 188_000,
    totalPieces: 50,
  },

  // ─── 技能點金幣花費曲線（index 0 = Lv1）────────────────────────────────────
  // 單屬性 Lv1~10 合計 112,800 金幣；六屬性全滿 676,800 金幣
  skillGoldCost: [700, 3550, 7100, 8350, 9850, 11650, 13750, 16200, 19100, 22550],

  // ─── 每日商店 ────────────────────────────────────────────────────────────────
  shop: {
    slotsPerDay: 6,
    maxRefreshesPerDay: 3,
    resetHourUTC: 16,
    items: [
      { id: 'gold_pack_s',   name: '金幣包（小）', desc: '+200 金幣',        currency: 'silver', price: 5600, reward: { gold: 200 },            weight: 20 },
      { id: 'ticket_pack_s', name: '票券包（小）', desc: '+5 張票券',        currency: 'silver', price: 4200, reward: { ticket: 5 },             weight: 20 },
      { id: 'silver_pack_l', name: '銀幣包（大）', desc: '+25,000 銀幣',     currency: 'gold',   price: 440,  reward: { silver: 25000 },          weight: 3  },
      { id: 'ticket_pack_m', name: '票券包（中）', desc: '+20 張票券',       currency: 'gold',   price: 420,  reward: { ticket: 20 },             weight: 10 },
      { id: 'equip_lv0',     name: '裝備（0級）',  desc: '隨機款式 0級裝備', currency: 'gold',   price: 70,   reward: { equipment: { level: 0 } }, weight: 22 },
      { id: 'equip_lv1',     name: '裝備（1級）',  desc: '隨機款式 1級裝備', currency: 'gold',   price: 170,  reward: { equipment: { level: 1 } }, weight: 15 },
      { id: 'equip_lv2',     name: '裝備（2級）',  desc: '隨機款式 2級裝備', currency: 'gold',   price: 270,  reward: { equipment: { level: 2 } }, weight: 7  },
      { id: 'equip_lv3',     name: '裝備（3級）',  desc: '隨機款式 3級裝備', currency: 'gold',   price: 450,  reward: { equipment: { level: 3 } }, weight: 3  },
    ],
    // 4級裝備不進商店，僅抽獎盤大獎可得
    walletDefault: { silver: 50_000, gold: 3_000 },
    walletStorageKey: 'yesmaster.wallet',
    walletTransactionsKey: 'yesmaster.wallet.transactions',
    shopStorageKeyPrefix: 'yesmaster.shop.',
  },
};
