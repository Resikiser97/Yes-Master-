import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FINAL_BOARD_SIMULATIONS = 100000;
const FINAL_NORMAL_CLEARS = 120;
const FINAL_EXTREME_CLEARS = 600;
const FINAL_GOLD_TO_SILVER = 40;
const FINAL_TICKET_TO_GOLD = 30;
const FINAL_SESSION_GOLD = 5;
const FINAL_EQUIPMENT_COST = 188000;
const FINAL_SKILL_COSTS = [700, 3550, 7100, 8350, 9850, 11650, 13750, 16200, 19100, 22550];
const FINAL_SKILL_SINGLE_TOTAL = FINAL_SKILL_COSTS.reduce((sum, value) => sum + value, 0);
const FINAL_SKILL_ALL_TOTAL = FINAL_SKILL_SINGLE_TOTAL * 6;
const FINAL_STORE_DISCOUNT = 0.7;

const FINAL_VALUES = {
  silver: { small: 150, medium: 600, large: 2000 },
  gold: { small: 8, medium: 30, large: 120 },
  ticket: { small: 2, medium: 8 },
};

const FINAL_BOARD_COUNTS = {
  smallSilver: 7,
  mediumSilver: 3,
  largeSilver: 2,
  smallGold: 7,
  mediumGold: 3,
  largeGold: 2,
  smallTicket: 3,
  mediumTicket: 1,
  equipment0: 18,
  equipment1: 8,
  equipment2: 5,
  equipment3: 3,
  equipment4: 2,
};

const FINAL_BOARD_TEMPLATE = [
  ...finalRepeatPrize('smallSilver', FINAL_BOARD_COUNTS.smallSilver),
  ...finalRepeatPrize('mediumSilver', FINAL_BOARD_COUNTS.mediumSilver),
  ...finalRepeatPrize('largeSilver', FINAL_BOARD_COUNTS.largeSilver, true),
  ...finalRepeatPrize('smallGold', FINAL_BOARD_COUNTS.smallGold),
  ...finalRepeatPrize('mediumGold', FINAL_BOARD_COUNTS.mediumGold),
  ...finalRepeatPrize('largeGold', FINAL_BOARD_COUNTS.largeGold, true),
  ...finalRepeatPrize('smallTicket', FINAL_BOARD_COUNTS.smallTicket),
  ...finalRepeatPrize('mediumTicket', FINAL_BOARD_COUNTS.mediumTicket, true),
  ...finalRepeatPrize('equipment0', FINAL_BOARD_COUNTS.equipment0),
  ...finalRepeatPrize('equipment1', FINAL_BOARD_COUNTS.equipment1),
  ...finalRepeatPrize('equipment2', FINAL_BOARD_COUNTS.equipment2),
  ...finalRepeatPrize('equipment3', FINAL_BOARD_COUNTS.equipment3),
  ...finalRepeatPrize('equipment4', FINAL_BOARD_COUNTS.equipment4, true),
];

function finalRepeatPrize(name, count, isMajor = false) {
  return Array.from({ length: count }, () => ({ name, isMajor }));
}

function finalCreateRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function finalShuffle(array, rng) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function finalCreatePrizeCounter() {
  return {
    smallSilver: 0,
    mediumSilver: 0,
    largeSilver: 0,
    smallGold: 0,
    mediumGold: 0,
    largeGold: 0,
    smallTicket: 0,
    mediumTicket: 0,
    equipment0: 0,
    equipment1: 0,
    equipment2: 0,
    equipment3: 0,
    equipment4: 0,
  };
}

function finalSimulateBoards(iterations) {
  const rng = finalCreateRng(20260628);
  const totalCounts = finalCreatePrizeCounter();
  let totalPulls = 0;

  for (let boardIndex = 0; boardIndex < iterations; boardIndex += 1) {
    const board = finalShuffle(FINAL_BOARD_TEMPLATE, rng);
    let majorsHit = 0;

    for (const prize of board) {
      totalPulls += 1;
      totalCounts[prize.name] += 1;

      if (prize.isMajor) {
        majorsHit += 1;
        if (majorsHit === 7) break;
      }
    }
  }

  const averageCounts = {};
  for (const [key, value] of Object.entries(totalCounts)) {
    averageCounts[key] = value / iterations;
  }

  return {
    iterations,
    pullsPerBoard: totalPulls / iterations,
    averageCounts,
  };
}

function finalTicketValuePerBoard(counts) {
  return counts.smallTicket * FINAL_VALUES.ticket.small + counts.mediumTicket * FINAL_VALUES.ticket.medium;
}

function finalExpectedPullsFromBaseTickets(baseTickets, stats) {
  const ticketPerPull = finalTicketValuePerBoard(stats.averageCounts) / stats.pullsPerBoard;
  if (ticketPerPull >= 1) return Number.POSITIVE_INFINITY;
  return baseTickets / (1 - ticketPerPull);
}

function finalCurrencyPerBoard(stats) {
  const counts = stats.averageCounts;
  const silver = counts.smallSilver * FINAL_VALUES.silver.small
    + counts.mediumSilver * FINAL_VALUES.silver.medium
    + counts.largeSilver * FINAL_VALUES.silver.large;
  const gold = counts.smallGold * FINAL_VALUES.gold.small
    + counts.mediumGold * FINAL_VALUES.gold.medium
    + counts.largeGold * FINAL_VALUES.gold.large;
  const tickets = finalTicketValuePerBoard(counts);
  return { silver, gold, tickets };
}

function finalDailyIncome(clears, stats) {
  const pulls = finalExpectedPullsFromBaseTickets(clears, stats);
  const perBoard = finalCurrencyPerBoard(stats);
  const boardRate = pulls / stats.pullsPerBoard;
  const silver = perBoard.silver * boardRate;
  const lotteryGold = perBoard.gold * boardRate;
  const sessionGold = clears * FINAL_SESSION_GOLD;
  const gold = lotteryGold + sessionGold;

  return {
    clears,
    baseTickets: clears,
    expectedPulls: pulls,
    silver,
    lotteryGold,
    sessionGold,
    gold,
    ratio: silver / gold,
  };
}

function finalEquipmentFairValues() {
  return {
    equipment0: 64 / FINAL_BOARD_COUNTS.equipment0 * FINAL_TICKET_TO_GOLD,
    equipment1: 64 / FINAL_BOARD_COUNTS.equipment1 * FINAL_TICKET_TO_GOLD,
    equipment2: 64 / FINAL_BOARD_COUNTS.equipment2 * FINAL_TICKET_TO_GOLD,
    equipment3: 64 / FINAL_BOARD_COUNTS.equipment3 * FINAL_TICKET_TO_GOLD,
    equipment4: 64 / FINAL_BOARD_COUNTS.equipment4 * FINAL_TICKET_TO_GOLD,
  };
}

function finalBoardValueAnalysis(stats) {
  const perBoard = finalCurrencyPerBoard(stats);
  const fair = finalEquipmentFairValues();
  const costGold = stats.pullsPerBoard * FINAL_TICKET_TO_GOLD;
  const currencyGold = perBoard.silver / FINAL_GOLD_TO_SILVER
    + perBoard.gold
    + perBoard.tickets * FINAL_TICKET_TO_GOLD;
  const equipmentGold = stats.averageCounts.equipment0 * fair.equipment0
    + stats.averageCounts.equipment1 * fair.equipment1
    + stats.averageCounts.equipment2 * fair.equipment2
    + stats.averageCounts.equipment3 * fair.equipment3
    + stats.averageCounts.equipment4 * fair.equipment4;

  return {
    costGold,
    currencyGold,
    currencyRoi: currencyGold / costGold,
    fair,
    equipmentGold,
    totalMultiple: (currencyGold + equipmentGold) / costGold,
  };
}

function finalRoundTo(value, step) {
  return Math.max(0, Math.round(value / step) * step);
}

function finalBuildStoreItems(fairValues) {
  const silverPriceFromGoldFair = (goldFair) => finalRoundTo(goldFair * FINAL_GOLD_TO_SILVER * FINAL_STORE_DISCOUNT, 100);
  const goldPriceFromGoldFair = (goldFair) => finalRoundTo(goldFair * FINAL_STORE_DISCOUNT, 10);
  return [
    {
      label: '金幣包小',
      currency: 'silver',
      fairGold: 200,
      price: silverPriceFromGoldFair(200),
    },
    {
      label: '票券包小',
      currency: 'silver',
      fairGold: 5 * FINAL_TICKET_TO_GOLD,
      price: silverPriceFromGoldFair(5 * FINAL_TICKET_TO_GOLD),
    },
    {
      label: '銀幣包大',
      currency: 'gold',
      fairGold: 25000 / FINAL_GOLD_TO_SILVER,
      price: goldPriceFromGoldFair(25000 / FINAL_GOLD_TO_SILVER),
    },
    {
      label: '票券包中',
      currency: 'gold',
      fairGold: 20 * FINAL_TICKET_TO_GOLD,
      price: goldPriceFromGoldFair(20 * FINAL_TICKET_TO_GOLD),
    },
    {
      label: '0級裝備',
      currency: 'gold',
      fairGold: fairValues.equipment0,
      price: goldPriceFromGoldFair(fairValues.equipment0),
    },
    {
      label: '1級裝備',
      currency: 'gold',
      fairGold: fairValues.equipment1,
      price: goldPriceFromGoldFair(fairValues.equipment1),
    },
    {
      label: '2級裝備',
      currency: 'gold',
      fairGold: fairValues.equipment2,
      price: goldPriceFromGoldFair(fairValues.equipment2),
    },
    {
      label: '3級裝備',
      currency: 'gold',
      fairGold: fairValues.equipment3,
      price: goldPriceFromGoldFair(fairValues.equipment3),
    },
  ].map((item) => ({
    ...item,
    discount: item.currency === 'silver'
      ? item.price / (item.fairGold * FINAL_GOLD_TO_SILVER)
      : item.price / item.fairGold,
  }));
}

function finalExpectedStoreSpend(storeItems) {
  const chance = 1 / storeItems.length;
  return storeItems.reduce((spend, item) => {
    if (item.currency === 'silver') spend.silver += item.price * chance;
    if (item.currency === 'gold') spend.gold += item.price * chance;
    return spend;
  }, { silver: 0, gold: 0 });
}

const TASK6_ITEMS = [
  {
    key: 'smallGoldPack',
    label: '金幣包小',
    silverCost: 5600,
    goldCost: 0,
    silverGain: 0,
    goldEquivalentGain: 200,
    ticketEquivalentGain: 0,
    equipmentGain: 0,
  },
  {
    key: 'smallTicketPack',
    label: '票券包小',
    silverCost: 4200,
    goldCost: 0,
    silverGain: 0,
    goldEquivalentGain: 150,
    ticketEquivalentGain: 150,
    equipmentGain: 0,
  },
  {
    key: 'largeSilverPack',
    label: '銀幣包大',
    silverCost: 0,
    goldCost: 440,
    silverGain: 25000,
    goldEquivalentGain: 625,
    ticketEquivalentGain: 0,
    equipmentGain: 0,
  },
  {
    key: 'mediumTicketPack',
    label: '票券包中',
    silverCost: 0,
    goldCost: 420,
    silverGain: 0,
    goldEquivalentGain: 600,
    ticketEquivalentGain: 600,
    equipmentGain: 0,
  },
  {
    key: 'equipment0',
    label: '0級',
    silverCost: 0,
    goldCost: 70,
    silverGain: 0,
    goldEquivalentGain: 0,
    ticketEquivalentGain: 0,
    equipmentGain: 1,
  },
  {
    key: 'equipment1',
    label: '1級',
    silverCost: 0,
    goldCost: 170,
    silverGain: 0,
    goldEquivalentGain: 0,
    ticketEquivalentGain: 0,
    equipmentGain: 1,
  },
  {
    key: 'equipment2',
    label: '2級',
    silverCost: 0,
    goldCost: 270,
    silverGain: 0,
    goldEquivalentGain: 0,
    ticketEquivalentGain: 0,
    equipmentGain: 1,
  },
  {
    key: 'equipment3',
    label: '3級',
    silverCost: 0,
    goldCost: 450,
    silverGain: 0,
    goldEquivalentGain: 0,
    ticketEquivalentGain: 0,
    equipmentGain: 1,
  },
];

const TASK6_WEIGHT_SETS = [
  {
    label: 'A',
    weights: {
      smallGoldPack: 10,
      smallTicketPack: 10,
      largeSilverPack: 5,
      mediumTicketPack: 5,
      equipment0: 30,
      equipment1: 25,
      equipment2: 10,
      equipment3: 5,
    },
  },
  {
    label: 'B',
    weights: {
      smallGoldPack: 20,
      smallTicketPack: 20,
      largeSilverPack: 15,
      mediumTicketPack: 15,
      equipment0: 15,
      equipment1: 10,
      equipment2: 3,
      equipment3: 2,
    },
  },
  {
    label: 'C',
    weights: {
      smallGoldPack: 15,
      smallTicketPack: 15,
      largeSilverPack: 10,
      mediumTicketPack: 10,
      equipment0: 20,
      equipment1: 15,
      equipment2: 10,
      equipment3: 5,
    },
  },
  {
    label: '建議',
    weights: {
      smallGoldPack: 20,
      smallTicketPack: 20,
      largeSilverPack: 3,
      mediumTicketPack: 10,
      equipment0: 22,
      equipment1: 15,
      equipment2: 7,
      equipment3: 3,
    },
  },
];

function task6EvaluateWeights(weightSet, baseline) {
  const expected = TASK6_ITEMS.reduce((sum, item) => {
    const rate = (weightSet.weights[item.key] ?? 0) / 100;
    sum.silverCost += item.silverCost * rate;
    sum.goldCost += item.goldCost * rate;
    sum.silverGain += item.silverGain * rate;
    sum.goldEquivalentGain += item.goldEquivalentGain * rate;
    sum.ticketEquivalentGain += item.ticketEquivalentGain * rate;
    sum.equipmentGain += item.equipmentGain * rate;
    return sum;
  }, {
    silverCost: 0,
    goldCost: 0,
    silverGain: 0,
    goldEquivalentGain: 0,
    ticketEquivalentGain: 0,
    equipmentGain: 0,
  });

  const silverOverflow = Math.max(0, expected.silverCost - baseline.silverShopBudget);
  const goldOverflow = Math.max(0, expected.goldCost - baseline.goldShopBudget);
  const equipmentDaily = baseline.equipmentDaily + expected.silverGain - silverOverflow;
  const skillDaily = baseline.skillDaily + expected.goldEquivalentGain - goldOverflow;
  const equipmentDays = FINAL_EQUIPMENT_COST / equipmentDaily;
  const skillDays = FINAL_SKILL_SINGLE_TOTAL / skillDaily;
  const equipmentAcceleration = (baseline.equipmentDays - equipmentDays) / baseline.equipmentDays;
  const skillAcceleration = (baseline.skillDays - skillDays) / baseline.skillDays;

  return {
    ...weightSet,
    expected,
    equipmentDays,
    skillDays,
    equipmentAcceleration,
    skillAcceleration,
    passed: equipmentAcceleration <= 0.1 && skillAcceleration <= 0.1,
  };
}

function task6MandatoryLargeSilverPack(baseline) {
  const equipmentDaily = baseline.equipmentDaily + 25000;
  const goldOverflow = Math.max(0, 440 - baseline.goldShopBudget);
  const skillDaily = baseline.skillDaily - goldOverflow;
  const equipmentDays = FINAL_EQUIPMENT_COST / equipmentDaily;
  const skillDays = FINAL_SKILL_SINGLE_TOTAL / skillDaily;
  return {
    equipmentAcceleration: (baseline.equipmentDays - equipmentDays) / baseline.equipmentDays,
    skillSlowdown: (skillDays - baseline.skillDays) / baseline.skillDays,
  };
}

function task6WeightText(weights) {
  return `金幣包小:${weights.smallGoldPack}%, 票券包小:${weights.smallTicketPack}%, 銀幣包大:${weights.largeSilverPack}%, 票券包中:${weights.mediumTicketPack}%, 0級:${weights.equipment0}%, 1級:${weights.equipment1}%, 2級:${weights.equipment2}%, 3級:${weights.equipment3}%`;
}

function task6AppendMarkdown(lines, normal) {
  const baseline = {
    silverDaily: normal.silver,
    goldDaily: normal.gold,
    equipmentDaily: normal.silver * 0.5,
    equipmentDays: FINAL_EQUIPMENT_COST / (normal.silver * 0.5),
    silverShopBudget: normal.silver * 0.5,
    skillDaily: normal.gold - 228,
    skillDays: FINAL_SKILL_SINGLE_TOTAL / (normal.gold - 228),
    goldShopBudget: 228,
  };
  const mandatory = task6MandatoryLargeSilverPack(baseline);
  const results = TASK6_WEIGHT_SETS.map((weightSet) => task6EvaluateWeights(weightSet, baseline));
  const recommendation = results.find((result) => result.label === '建議');

  lines.push('## 任務6：商店機率權重');
  lines.push('');
  lines.push(`銀幣包大若每天必買：裝備加速=${finalPercent(mandatory.equipmentAcceleration)}，技能減速=${finalPercent(mandatory.skillSlowdown)}`);
  lines.push('');
  lines.push('| 組合 | 各品項權重 | 期望日淨銀幣 | 期望日淨金/票等值 | 期望裝備件數 | 裝備加速% | 技能加速% | 通過? |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---|');
  for (const result of results) {
    lines.push(`| ${result.label} | ${task6WeightText(result.weights)} | ${finalFormat(result.expected.silverGain - result.expected.silverCost)} | ${finalFormat(result.expected.goldEquivalentGain - result.expected.goldCost, 1)} | ${finalFormat(result.expected.equipmentGain, 2)} | ${finalPercent(result.equipmentAcceleration)} | ${finalPercent(result.skillAcceleration)} | ${result.passed ? '✅' : '❌'} |`);
  }
  lines.push('');
  lines.push('建議採用權重：');
  lines.push(`  金幣包小=${recommendation.weights.smallGoldPack}%  票券包小=${recommendation.weights.smallTicketPack}%  銀幣包大=${recommendation.weights.largeSilverPack}%  票券包中=${recommendation.weights.mediumTicketPack}%`);
  lines.push(`  0級=${recommendation.weights.equipment0}%  1級=${recommendation.weights.equipment1}%  2級=${recommendation.weights.equipment2}%  3級=${recommendation.weights.equipment3}%`);
  lines.push('');
  lines.push(`原因說明：把銀幣包大壓到 ${recommendation.weights.largeSilverPack}% 可避免 25,000 銀的轉換包讓合成速度暴衝；同時保留金幣包與票券包合計 ${recommendation.weights.smallGoldPack + recommendation.weights.smallTicketPack + recommendation.weights.mediumTicketPack}% 的出現率，讓商店每天仍常有可買品項。此組裝備加速 ${finalPercent(recommendation.equipmentAcceleration)}、技能加速 ${finalPercent(recommendation.skillAcceleration)}，都低於 10%。`);
  lines.push('');
}

function finalFormat(value, digits = 0) {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function finalPercent(value, digits = 1) {
  return `${finalFormat(value * 100, digits)}%`;
}

function finalDiscountText(value) {
  return `${finalFormat(value * 100, 0)}%`;
}

function finalBuildMarkdown(stats) {
  const normal = finalDailyIncome(FINAL_NORMAL_CLEARS, stats);
  const extreme = finalDailyIncome(FINAL_EXTREME_CLEARS, stats);
  const value = finalBoardValueAnalysis(stats);
  const storeItems = finalBuildStoreItems(value.fair);
  const storeSpend = finalExpectedStoreSpend(storeItems);
  const normalSilverAfterStore = Math.max(0, normal.silver - storeSpend.silver);
  const normalGoldAfterStore = Math.max(0, normal.gold - storeSpend.gold);
  const normalEquipmentDays = FINAL_EQUIPMENT_COST / (normal.silver * 0.5);
  const normalSkillDays = FINAL_SKILL_SINGLE_TOTAL / normalGoldAfterStore;
  const extremeEquipmentDays = (FINAL_EQUIPMENT_COST * 50) / extreme.silver;
  const extremeSkillDays = FINAL_SKILL_ALL_TOTAL / extreme.gold;
  const fullBoardDelta = 64 - stats.pullsPerBoard;
  const fullBoardRate = stats.pullsPerBoard / 64;

  const item = (label) => storeItems.find((entry) => entry.label === label);
  const lines = [];
  lines.push('# Economy Simulation Log');
  lines.push(`> 執行時間：${new Date().toISOString().slice(0, 10)}`);
  lines.push(`> Node版本：${process.version}`);
  lines.push('> 隨機種子：20260628');
  lines.push('');
  lines.push('## 任務1 結果：抽獎盤基礎統計');
  lines.push('');
  lines.push(`=== 任務1：抽獎盤基礎統計（N=${finalFormat(stats.iterations)} 盤）===`);
  lines.push(`平均 pulls_per_board: ${finalFormat(stats.pullsPerBoard, 1)}`);
  lines.push(`每盤平均銀幣格數：少銀幣 ${finalFormat(stats.averageCounts.smallSilver, 2)}, 中銀幣 ${finalFormat(stats.averageCounts.mediumSilver, 2)}, 多銀幣 ${finalFormat(stats.averageCounts.largeSilver, 2)}`);
  lines.push(`每盤平均金幣格數：少金幣 ${finalFormat(stats.averageCounts.smallGold, 2)}, 中金幣 ${finalFormat(stats.averageCounts.mediumGold, 2)}, 多金幣 ${finalFormat(stats.averageCounts.largeGold, 2)}`);
  lines.push(`每盤平均票券格數：少票券 ${finalFormat(stats.averageCounts.smallTicket, 2)}, 中票券 ${finalFormat(stats.averageCounts.mediumTicket, 2)}`);
  lines.push(`每盤平均裝備格數：0級 ${finalFormat(stats.averageCounts.equipment0, 2)}, 1級 ${finalFormat(stats.averageCounts.equipment1, 2)}, 2級 ${finalFormat(stats.averageCounts.equipment2, 2)}, 3級 ${finalFormat(stats.averageCounts.equipment3, 2)}, 4級 ${finalFormat(stats.averageCounts.equipment4, 2)}`);
  lines.push('');
  lines.push(`全清 64 格 vs 平均 pulls_per_board：平均少抽 ${finalFormat(fullBoardDelta, 1)} 格，約等於完整盤面的 ${finalFormat(fullBoardRate * 100, 1)}%。因為重置條件是 7 格大獎全清，不需要抽完整 64 格。`);
  lines.push('');
  lines.push('## 任務2 結果：每日收入驗算');
  lines.push('');
  lines.push('日票券欄位只列場次給的基礎票券；抽獎盤內抽到的票券用期望值回流繼續抽。');
  lines.push('');
  lines.push('| 玩家 | 日票券（場次） | 期望抽數 | 日銀幣收入 | 抽獎金幣 | 場次金幣 | 日金幣收入 | 銀/金比 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  lines.push(`| 正常玩家 | ${normal.baseTickets} | ${finalFormat(normal.expectedPulls, 1)} | ${finalFormat(normal.silver)} | ${finalFormat(normal.lotteryGold)} | ${finalFormat(normal.sessionGold)} | ${finalFormat(normal.gold)} | ${finalFormat(normal.ratio, 1)} |`);
  lines.push(`| 極限玩家 | ${extreme.baseTickets} | ${finalFormat(extreme.expectedPulls, 1)} | ${finalFormat(extreme.silver)} | ${finalFormat(extreme.lotteryGold)} | ${finalFormat(extreme.sessionGold)} | ${finalFormat(extreme.gold)} | ${finalFormat(extreme.ratio, 1)} |`);
  lines.push('');
  lines.push('## 任務3 結果：進度時程驗算');
  lines.push('');
  lines.push(`- 正常玩家裝備合成一件 0→10：${finalFormat(normalEquipmentDays, 1)} 天（188,000銀，假設 50% 日銀幣用於合成）`);
  lines.push(`- 正常玩家技能點單屬性 Lv1→10：${finalFormat(normalSkillDays, 1)} 天（扣掉等權重每日買 1 件商店品項的期望金幣支出後）`);
  lines.push(`- 極限玩家 50件裝備全部 0→10：${finalFormat(extremeEquipmentDays, 1)} 天（不扣商店）`);
  lines.push(`- 極限玩家 6屬性技能點全滿：${finalFormat(extremeSkillDays, 1)} 天（不扣商店）`);
  lines.push('');
  lines.push('## 任務4 結果：一盤完整價值分析');
  lines.push('');
  lines.push(`- 花費：${finalFormat(stats.pullsPerBoard, 1)} 抽 × 30金 = ${finalFormat(value.costGold)} 金`);
  lines.push(`- 貨幣回收：銀+金+票換算 = ${finalFormat(value.currencyGold)} 金`);
  lines.push(`- 純貨幣回報率：${finalPercent(value.currencyRoi)}`);
  lines.push(`- 裝備公平值：0級=${finalFormat(value.fair.equipment0, 1)}金  1級=${finalFormat(value.fair.equipment1, 1)}金  2級=${finalFormat(value.fair.equipment2, 1)}金  3級=${finalFormat(value.fair.equipment3, 1)}金  4級=${finalFormat(value.fair.equipment4, 1)}金`);
  lines.push(`- 裝備總公平值：${finalFormat(value.equipmentGold)} 金`);
  lines.push(`- 一盤總回報倍數：${finalFormat(value.totalMultiple, 2)}x`);
  lines.push('');
  lines.push('## 任務5 結果：商店最終定價');
  lines.push('');
  lines.push('本輪未指定商店槽位權重；此處用 8 個品項等權重估算「每天買 1 件」的平均扣款。售價採公平值約 70%，落在 60~80% 目標內。');
  lines.push('');
  lines.push('| 品項 | 收費 | 公平值（金幣） | 建議售價 | 折扣 |');
  lines.push('|---|---|---:|---:|---:|');
  for (const entry of storeItems) {
    const price = entry.currency === 'silver' ? `${finalFormat(entry.price)}銀` : `${finalFormat(entry.price)}金`;
    lines.push(`| ${entry.label} | ${entry.currency === 'silver' ? '銀幣' : '金幣'} | ${finalFormat(entry.fairGold, 1)} | ${price} | ${finalDiscountText(entry.discount)} |`);
  }
  lines.push('');
  lines.push(`- 正常玩家每天買 1 件（等權重期望）：日銀幣扣 ${finalFormat(storeSpend.silver)}，日金幣扣 ${finalFormat(storeSpend.gold)}`);
  lines.push(`- 扣商店後：可用於合成銀幣約 ${finalFormat(normalSilverAfterStore)} / 日；可用於技能金幣約 ${finalFormat(normalGoldAfterStore)} / 日`);
  lines.push(`- 合理性：若裝備仍固定用 50% 銀幣合成，商店銀幣支出約佔日銀幣 ${finalPercent(storeSpend.silver / normal.silver)}；技能在扣商店後約 ${finalFormat(normalSkillDays, 1)} 天滿單屬性，仍在 60~150 天內。`);
  lines.push('');
  task6AppendMarkdown(lines, normal);
  lines.push('## 最終定案值');
  lines.push('');
  lines.push(`pulls_per_board 平均 = ${finalFormat(stats.pullsPerBoard, 1)}`);
  lines.push('');
  lines.push(`正常玩家每日：銀幣=${finalFormat(normal.silver)}  金幣=${finalFormat(normal.gold)}  銀/金比=${finalFormat(normal.ratio, 1)}`);
  lines.push(`極限玩家每日：銀幣=${finalFormat(extreme.silver)}  金幣=${finalFormat(extreme.gold)}`);
  lines.push('');
  lines.push(`裝備公平值：0級=${finalFormat(value.fair.equipment0, 1)}金  1級=${finalFormat(value.fair.equipment1, 1)}金  2級=${finalFormat(value.fair.equipment2, 1)}金  3級=${finalFormat(value.fair.equipment3, 1)}金  4級=${finalFormat(value.fair.equipment4, 1)}金`);
  lines.push(`一盤貨幣回報率=${finalPercent(value.currencyRoi)}  總回報倍數=${finalFormat(value.totalMultiple, 2)}x`);
  lines.push('');
  lines.push(`裝備合成一件天數（正常）=${finalFormat(normalEquipmentDays, 1)}天  50件全滿（極限）=${finalFormat(extremeEquipmentDays, 1)}天`);
  lines.push(`技能單屬性天數（正常）=${finalFormat(normalSkillDays, 1)}天  全屬性（極限）=${finalFormat(extremeSkillDays, 1)}天`);
  lines.push('');
  lines.push('商店定價：');
  lines.push(`  金幣包小  公平=${finalFormat(item('金幣包小').fairGold, 1)}金  售價=${finalFormat(item('金幣包小').price)}銀  折扣=${finalDiscountText(item('金幣包小').discount)}`);
  lines.push(`  票券包小  公平=${finalFormat(item('票券包小').fairGold, 1)}金  售價=${finalFormat(item('票券包小').price)}銀  折扣=${finalDiscountText(item('票券包小').discount)}`);
  lines.push(`  銀幣包大  公平=${finalFormat(item('銀幣包大').fairGold, 1)}金  售價=${finalFormat(item('銀幣包大').price)}金  折扣=${finalDiscountText(item('銀幣包大').discount)}`);
  lines.push(`  票券包中  公平=${finalFormat(item('票券包中').fairGold, 1)}金  售價=${finalFormat(item('票券包中').price)}金  折扣=${finalDiscountText(item('票券包中').discount)}`);
  lines.push(`  0級裝備   公平=${finalFormat(item('0級裝備').fairGold, 1)}金  售價=${finalFormat(item('0級裝備').price)}金  折扣=${finalDiscountText(item('0級裝備').discount)}`);
  lines.push(`  1級裝備   公平=${finalFormat(item('1級裝備').fairGold, 1)}金  售價=${finalFormat(item('1級裝備').price)}金  折扣=${finalDiscountText(item('1級裝備').discount)}`);
  lines.push(`  2級裝備   公平=${finalFormat(item('2級裝備').fairGold, 1)}金  售價=${finalFormat(item('2級裝備').price)}金  折扣=${finalDiscountText(item('2級裝備').discount)}`);
  lines.push(`  3級裝備   公平=${finalFormat(item('3級裝備').fairGold, 1)}金  售價=${finalFormat(item('3級裝備').price)}金  折扣=${finalDiscountText(item('3級裝備').discount)}`);
  lines.push('');
  return lines.join('\n');
}

function runEconomySimFinal() {
  const stats = finalSimulateBoards(FINAL_BOARD_SIMULATIONS);
  const markdown = finalBuildMarkdown(stats);
  const outputPath = path.join(__dirname, 'economy-sim-log.md');
  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

const V2_BOARD_SIMULATIONS = 100000;
const V2_EXTREME_DAILY_CLEARS = 600;
const V2_NORMAL_DAILY_CLEARS = 120;
const V2_EQUIPMENT_TARGET_DAYS = 15;
const V2_EQUIPMENT_SILVER_BUDGET_RATE = 0.7;
const V2_SKILL_TARGET_DAYS = 100;
const V2_SKILL_GOLD_BUDGET_RATE = 0.7;

const V2_SILVER_CANDIDATES = [
  { label: 'S1', small: 100, medium: 400, large: 1500 },
  { label: 'S2', small: 150, medium: 600, large: 2000 },
  { label: 'S3', small: 200, medium: 800, large: 3000 },
];

const V2_GOLD_CANDIDATES = [
  { label: 'G1', small: 5, medium: 20, large: 80 },
  { label: 'G2', small: 8, medium: 30, large: 120 },
  { label: 'G3', small: 10, medium: 40, large: 150 },
];

const V2_SESSION_GOLD = [2, 5, 10];
const V2_TICKET_VALUES = { label: 'T1', small: 2, medium: 8 };

const V2_SHOP_ITEM_WEIGHTS = [
  { label: '金幣包小', weight: 30 },
  { label: '票券包小', weight: 25 },
  { label: '銀幣包大', weight: 20 },
  { label: '票券包中', weight: 10 },
  { label: '裝備（隨機1件）', weight: 10 },
  { label: '鑽石（小量）', weight: 5 },
];

const V2_BOARD_TEMPLATE = [
  ...v2RepeatPrize('smallSilver', 7),
  ...v2RepeatPrize('mediumSilver', 3),
  ...v2RepeatPrize('largeSilver', 2, true),
  ...v2RepeatPrize('smallGold', 7),
  ...v2RepeatPrize('mediumGold', 3),
  ...v2RepeatPrize('largeGold', 2, true),
  ...v2RepeatPrize('smallTicket', 3),
  ...v2RepeatPrize('mediumTicket', 1, true),
  ...v2RepeatPrize('equipment0', 18),
  ...v2RepeatPrize('equipment1', 8),
  ...v2RepeatPrize('equipment2', 5),
  ...v2RepeatPrize('equipment3', 3),
  ...v2RepeatPrize('equipment4', 2, true),
];

function v2RepeatPrize(name, count, isMajor = false) {
  return Array.from({ length: count }, () => ({ name, isMajor }));
}

function v2CreateRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function v2Shuffle(array, rng) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function v2CreatePrizeCounter() {
  return {
    smallSilver: 0,
    mediumSilver: 0,
    largeSilver: 0,
    smallGold: 0,
    mediumGold: 0,
    largeGold: 0,
    smallTicket: 0,
    mediumTicket: 0,
    equipment0: 0,
    equipment1: 0,
    equipment2: 0,
    equipment3: 0,
    equipment4: 0,
  };
}

function v2SimulateBoards(iterations) {
  const rng = v2CreateRng(20260628);
  const totalCounts = v2CreatePrizeCounter();
  let totalPulls = 0;

  for (let boardIndex = 0; boardIndex < iterations; boardIndex += 1) {
    const board = v2Shuffle(V2_BOARD_TEMPLATE, rng);
    let majorsHit = 0;

    for (const prize of board) {
      totalPulls += 1;
      totalCounts[prize.name] += 1;

      if (prize.isMajor) {
        majorsHit += 1;
        if (majorsHit === 7) break;
      }
    }
  }

  const averageCounts = {};
  for (const [key, value] of Object.entries(totalCounts)) {
    averageCounts[key] = value / iterations;
  }

  return {
    iterations,
    pullsPerBoard: totalPulls / iterations,
    averageCounts,
  };
}

function v2ValuePerBoard(counts, values, names) {
  return names.reduce((sum, [countKey, valueKey]) => sum + counts[countKey] * values[valueKey], 0);
}

function v2TicketValuePerBoard(counts, ticket) {
  return counts.smallTicket * ticket.small + counts.mediumTicket * ticket.medium;
}

function v2ExpectedPullsFromBaseTickets(baseTickets, stats, ticket) {
  const ticketPerBoard = v2TicketValuePerBoard(stats.averageCounts, ticket);
  const ticketPerPull = ticketPerBoard / stats.pullsPerBoard;
  if (ticketPerPull >= 1) return Number.POSITIVE_INFINITY;
  return baseTickets / (1 - ticketPerPull);
}

function v2LotterySilver(baseTickets, stats, silver, ticket) {
  const pulls = v2ExpectedPullsFromBaseTickets(baseTickets, stats, ticket);
  const silverPerBoard = v2ValuePerBoard(stats.averageCounts, silver, [
    ['smallSilver', 'small'],
    ['mediumSilver', 'medium'],
    ['largeSilver', 'large'],
  ]);
  return pulls * (silverPerBoard / stats.pullsPerBoard);
}

function v2LotteryGold(baseTickets, stats, gold, ticket) {
  const pulls = v2ExpectedPullsFromBaseTickets(baseTickets, stats, ticket);
  const goldPerBoard = v2ValuePerBoard(stats.averageCounts, gold, [
    ['smallGold', 'small'],
    ['mediumGold', 'medium'],
    ['largeGold', 'large'],
  ]);
  return pulls * (goldPerBoard / stats.pullsPerBoard);
}

function v2DailyEconomy(baseClears, stats, silver, gold, sessionGold) {
  const silverIncome = v2LotterySilver(baseClears, stats, silver, V2_TICKET_VALUES);
  const lotteryGoldIncome = v2LotteryGold(baseClears, stats, gold, V2_TICKET_VALUES);
  const sessionGoldIncome = baseClears * sessionGold;
  const goldIncome = lotteryGoldIncome + sessionGoldIncome;

  return {
    silverIncome,
    lotteryGoldIncome,
    sessionGoldIncome,
    goldIncome,
    ratio: silverIncome / goldIncome,
  };
}

function v2BuildCandidateRows(stats) {
  const rows = [];
  for (const silver of V2_SILVER_CANDIDATES) {
    for (const gold of V2_GOLD_CANDIDATES) {
      for (const sessionGold of V2_SESSION_GOLD) {
        const normal = v2DailyEconomy(V2_NORMAL_DAILY_CLEARS, stats, silver, gold, sessionGold);
        const extreme = v2DailyEconomy(V2_EXTREME_DAILY_CLEARS, stats, silver, gold, sessionGold);
        rows.push({ silver, gold, sessionGold, normal, extreme });
      }
    }
  }
  return rows;
}

function v2ChooseRecommendation(rows) {
  return rows
    .filter((row) => row.normal.ratio >= 10 && row.extreme.ratio >= 10)
    .sort((a, b) => {
      const scoreA = Math.abs(a.sessionGold - 5) + Math.abs(a.normal.ratio - 11) + Math.abs(a.normal.silverIncome - 15000) / 10000;
      const scoreB = Math.abs(b.sessionGold - 5) + Math.abs(b.normal.ratio - 11) + Math.abs(b.normal.silverIncome - 15000) / 10000;
      return scoreA - scoreB;
    })[0] ?? rows[0];
}

function v2BuildEquipmentRecommendation(row) {
  const dailyEquipmentBudget = row.normal.silverIncome * V2_EQUIPMENT_SILVER_BUDGET_RATE;
  const totalCost = v2RoundTo(dailyEquipmentBudget * V2_EQUIPMENT_TARGET_DAYS, 1000);
  return {
    totalCost,
    daysWithAllSilver: totalCost / row.normal.silverIncome,
    daysWithBudget: totalCost / dailyEquipmentBudget,
    dailyConsumption: totalCost / V2_EQUIPMENT_TARGET_DAYS,
    dailyShopSilver: Math.max(0, row.normal.silverIncome - totalCost / V2_EQUIPMENT_TARGET_DAYS),
  };
}

function v2BuildSkillCurve(row) {
  const weights = [10, 50, 100];
  while (weights.length < 10) {
    weights.push(weights[weights.length - 1] * 1.18);
  }

  const totalTarget = v2RoundTo(row.normal.goldIncome * V2_SKILL_GOLD_BUDGET_RATE * V2_SKILL_TARGET_DAYS, 50);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const costs = weights.map((weight) => v2RoundTo((weight / weightSum) * totalTarget, 50));
  const diff = totalTarget - costs.reduce((sum, value) => sum + value, 0);
  costs[costs.length - 1] += diff;

  return {
    costs,
    singleAttrTotal: totalTarget,
    allAttrTotal: totalTarget * 6,
    daysWithAllGold: totalTarget / row.normal.goldIncome,
    daysWithBudget: totalTarget / (row.normal.goldIncome * V2_SKILL_GOLD_BUDGET_RATE),
    dailyConsumption: totalTarget / V2_SKILL_TARGET_DAYS,
    dailyShopGold: Math.max(0, row.normal.goldIncome - totalTarget / V2_SKILL_TARGET_DAYS),
  };
}

function v2BuildShopPricing(equipment, skill) {
  const silverBudget = equipment.dailyShopSilver;
  const goldBudget = skill.dailyShopGold;
  return {
    silver: {
      smallGoldPack: {
        range: v2PriceRange(silverBudget * 0.85, silverBudget * 1.1, 100),
        recommended: v2RoundTo(silverBudget, 100),
      },
      smallTicketPack: {
        range: v2PriceRange(silverBudget * 0.65, silverBudget * 0.9, 100),
        recommended: v2RoundTo(silverBudget * 0.8, 100),
      },
    },
    gold: {
      largeSilverPack: {
        range: v2PriceRange(goldBudget * 0.75, goldBudget * 1.05, 10),
        recommended: v2RoundTo(goldBudget * 0.9, 10),
      },
      mediumTicketPack: {
        range: v2PriceRange(goldBudget * 0.85, goldBudget * 1.2, 10),
        recommended: v2RoundTo(goldBudget, 10),
      },
      equipment: {
        range: v2PriceRange(goldBudget * 1.1, goldBudget * 1.6, 10),
        recommended: v2RoundTo(goldBudget * 1.3, 10),
      },
      smallDiamond: {
        range: v2PriceRange(goldBudget * 1.5, goldBudget * 2.2, 10),
        recommended: v2RoundTo(goldBudget * 1.8, 10),
      },
    },
  };
}

function v2FormatNumber(value, digits = 0) {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function v2RoundTo(value, step) {
  return Math.max(0, Math.round(value / step) * step);
}

function v2PriceRange(low, high, step) {
  return `${v2RoundTo(low, step)}~${v2RoundTo(high, step)}`;
}

function v2FormatWeights() {
  return V2_SHOP_ITEM_WEIGHTS.map((item) => `${item.label}${item.weight}%`).join('、');
}

function v2BuildMarkdown(stats) {
  const rows = v2BuildCandidateRows(stats);
  const recommendation = v2ChooseRecommendation(rows);
  const equipment = v2BuildEquipmentRecommendation(recommendation);
  const skill = v2BuildSkillCurve(recommendation);
  const shop = v2BuildShopPricing(equipment, skill);

  const lines = [];
  lines.push('# Economy Simulation Log');
  lines.push(`> 執行時間：${new Date().toISOString().slice(0, 10)}`);
  lines.push(`> Node版本：${process.version}`);
  lines.push('> 隨機種子：20260628');
  lines.push('');
  lines.push('## 任務1 結果');
  lines.push('');
  lines.push(`=== 任務1：抽獎盤基礎統計（N=${v2FormatNumber(stats.iterations)} 盤）===`);
  lines.push(`平均 pulls_per_board: ${v2FormatNumber(stats.pullsPerBoard, 1)}`);
  lines.push(`每盤平均銀幣格數：少銀幣 ${v2FormatNumber(stats.averageCounts.smallSilver, 2)}, 中銀幣 ${v2FormatNumber(stats.averageCounts.mediumSilver, 2)}, 多銀幣 ${v2FormatNumber(stats.averageCounts.largeSilver, 2)}`);
  lines.push(`每盤平均金幣格數：少金幣 ${v2FormatNumber(stats.averageCounts.smallGold, 2)}, 中金幣 ${v2FormatNumber(stats.averageCounts.mediumGold, 2)}, 多金幣 ${v2FormatNumber(stats.averageCounts.largeGold, 2)}`);
  lines.push(`每盤平均票券格數：少票券 ${v2FormatNumber(stats.averageCounts.smallTicket, 2)}, 中票券 ${v2FormatNumber(stats.averageCounts.mediumTicket, 2)}`);
  lines.push(`每盤平均裝備格數：0級 ${v2FormatNumber(stats.averageCounts.equipment0, 2)}, 1級 ${v2FormatNumber(stats.averageCounts.equipment1, 2)}, 2級 ${v2FormatNumber(stats.averageCounts.equipment2, 2)}, 3級 ${v2FormatNumber(stats.averageCounts.equipment3, 2)}, 4級 ${v2FormatNumber(stats.averageCounts.equipment4, 2)}`);
  lines.push('');
  lines.push('## 任務2 結果（候選值矩陣）');
  lines.push('');
  lines.push(`票券值本輪沿用前版最低組：少票券=${V2_TICKET_VALUES.small}, 中票券=${V2_TICKET_VALUES.medium}。每天通關票券投入抽獎，抽中的票券包會繼續投入；使用期望值 baseTickets / (1 - ticketPerPull)。`);
  lines.push('');
  lines.push('| 銀幣組 | 少/中/多銀幣 | 金幣組 | 少/中/多金幣 | 場次金幣 | 正常日銀幣 | 正常日金幣 | 正常銀/金 | 極限日銀幣 | 極限日金幣 | 極限銀/金 |');
  lines.push('|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of rows) {
    lines.push(`| ${row.silver.label} | ${row.silver.small}/${row.silver.medium}/${row.silver.large} | ${row.gold.label} | ${row.gold.small}/${row.gold.medium}/${row.gold.large} | ${row.sessionGold}/關 | ${v2FormatNumber(row.normal.silverIncome)} | ${v2FormatNumber(row.normal.goldIncome)} | ${v2FormatNumber(row.normal.ratio, 1)} | ${v2FormatNumber(row.extreme.silverIncome)} | ${v2FormatNumber(row.extreme.goldIncome)} | ${v2FormatNumber(row.extreme.ratio, 1)} |`);
  }
  lines.push('');
  lines.push('## 任務3 結果：裝備合成成本反推');
  lines.push('');
  lines.push(`採用建議組時，正常玩家每日銀幣約 ${v2FormatNumber(recommendation.normal.silverIncome)}。以每日銀幣的 ${v2FormatNumber(V2_EQUIPMENT_SILVER_BUDGET_RATE * 100)}% 投入裝備、中心值 ${V2_EQUIPMENT_TARGET_DAYS} 天反推：`);
  lines.push('');
  lines.push(`- 裝備 0→10 級總銀幣成本建議：${v2FormatNumber(equipment.totalCost)} 銀幣`);
  lines.push(`- 若全銀幣都存裝備：約 ${v2FormatNumber(equipment.daysWithAllSilver, 1)} 天`);
  lines.push(`- 若保留約 ${v2FormatNumber((1 - V2_EQUIPMENT_SILVER_BUDGET_RATE) * 100)}% 給銀幣商店：約 ${v2FormatNumber(equipment.daysWithBudget, 1)} 天`);
  lines.push(`- 每日裝備估計銀幣消耗：${v2FormatNumber(equipment.dailyConsumption)}，每日可用於商店銀幣：約 ${v2FormatNumber(equipment.dailyShopSilver)}`);
  lines.push('');
  lines.push('## 任務4 結果：技能點金幣花費曲線反推');
  lines.push('');
  lines.push(`採用建議組時，正常玩家每日金幣約 ${v2FormatNumber(recommendation.normal.goldIncome)}。以每日金幣的 ${v2FormatNumber(V2_SKILL_GOLD_BUDGET_RATE * 100)}% 投入技能、中心值 ${V2_SKILL_TARGET_DAYS} 天反推：`);
  lines.push('');
  lines.push(`- Lv1~10 建議金幣花費：${skill.costs.map((value, index) => `Lv${index + 1}=${v2FormatNumber(value)}`).join(', ')}`);
  lines.push(`- 單屬性總計：${v2FormatNumber(skill.singleAttrTotal)} 金幣`);
  lines.push(`- 6屬性總計：${v2FormatNumber(skill.allAttrTotal)} 金幣`);
  lines.push(`- 若全金幣都投技能：約 ${v2FormatNumber(skill.daysWithAllGold, 1)} 天；若保留 ${v2FormatNumber((1 - V2_SKILL_GOLD_BUDGET_RATE) * 100)}% 給金幣商店：約 ${v2FormatNumber(skill.daysWithBudget, 1)} 天`);
  lines.push(`- 每日技能估計金幣消耗：${v2FormatNumber(skill.dailyConsumption)}，每日可用於商店金幣：約 ${v2FormatNumber(skill.dailyShopGold)}`);
  lines.push('');
  lines.push('## 任務5 結果：商店銀幣與金幣消費試算');
  lines.push('');
  lines.push(`每日商店 6 槽位，各槽獨立抽取，可重複。權重：${v2FormatWeights()}。`);
  lines.push('');
  lines.push(`正常玩家每日可用於商店銀幣：${v2FormatNumber(equipment.dailyShopSilver)}。假設平均每天買 1 件銀幣品項：`);
  lines.push('');
  lines.push(`- 金幣包小（銀幣定價）建議區間：${shop.silver.smallGoldPack.range}，建議採 ${v2FormatNumber(shop.silver.smallGoldPack.recommended)}`);
  lines.push(`- 票券包小（銀幣定價）建議區間：${shop.silver.smallTicketPack.range}，建議採 ${v2FormatNumber(shop.silver.smallTicketPack.recommended)}`);
  lines.push('');
  lines.push(`正常玩家每日可用於商店金幣：${v2FormatNumber(skill.dailyShopGold)}。假設平均每天買 1 件金幣品項：`);
  lines.push('');
  lines.push(`- 銀幣包大（金幣定價）建議區間：${shop.gold.largeSilverPack.range}，建議採 ${v2FormatNumber(shop.gold.largeSilverPack.recommended)}`);
  lines.push(`- 票券包中（金幣定價）建議區間：${shop.gold.mediumTicketPack.range}，建議採 ${v2FormatNumber(shop.gold.mediumTicketPack.recommended)}`);
  lines.push(`- 裝備（隨機1件，金幣定價）建議區間：${shop.gold.equipment.range}，建議採 ${v2FormatNumber(shop.gold.equipment.recommended)}`);
  lines.push(`- 鑽石小量（金幣定價）建議區間：${shop.gold.smallDiamond.range}，建議採 ${v2FormatNumber(shop.gold.smallDiamond.recommended)}`);
  lines.push('');
  lines.push('## 建議採用值（Codex 自行判斷最符合目標的一組）');
  lines.push('');
  lines.push(`少銀幣=${recommendation.silver.small}, 中銀幣=${recommendation.silver.medium}, 多銀幣=${recommendation.silver.large}`);
  lines.push(`少金幣=${recommendation.gold.small}, 中金幣=${recommendation.gold.medium}, 多金幣=${recommendation.gold.large}`);
  lines.push(`少票券=${V2_TICKET_VALUES.small}, 中票券=${V2_TICKET_VALUES.medium}`);
  lines.push(`裝備合成 0→10 級銀幣成本=${equipment.totalCost}`);
  lines.push(`場次金幣=${recommendation.sessionGold}/關`);
  lines.push(`技能點 Lv1~10 金幣花費=[${skill.costs.join(',')}]`);
  lines.push(`商店銀幣定價：金幣包小=${shop.silver.smallGoldPack.recommended}, 票券包小=${shop.silver.smallTicketPack.recommended}`);
  lines.push(`商店金幣定價：銀幣包大=${shop.gold.largeSilverPack.recommended}, 票券包中=${shop.gold.mediumTicketPack.recommended}, 裝備=${shop.gold.equipment.recommended}, 鑽石=${shop.gold.smallDiamond.recommended}`);
  lines.push('');
  lines.push(`驗算：正常玩家日銀幣=${v2FormatNumber(recommendation.normal.silverIncome)}，日金幣=${v2FormatNumber(recommendation.normal.goldIncome)}，銀/金=${v2FormatNumber(recommendation.normal.ratio, 1)}；裝備約 ${v2FormatNumber(equipment.daysWithBudget, 1)} 天；技能單屬性約 ${v2FormatNumber(skill.daysWithBudget, 1)} 天。`);
  lines.push('');
  return lines.join('\n');
}

function runEconomySimV2() {
  const stats = v2SimulateBoards(V2_BOARD_SIMULATIONS);
  const markdown = v2BuildMarkdown(stats);
  const outputPath = path.join(__dirname, 'economy-sim-log.md');
  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

/*
Legacy v1 implementation kept below for diff continuity; the active entrypoint
is runEconomySimV2().

const BOARD_SIMULATIONS = 100000;
const EXTREME_DAILY_CLEARS = 600;
const NORMAL_DAILY_CLEARS = 120;
const SKILL_ALL_SILVER_COST = 34200;
const SKILL_SINGLE_ATTR_COST = 5700;
const TWO_MONTH_DAYS = 60;
const EQUIPMENT_COUNT = 50;
const SAFETY_SPEND_RATE = 0.9;

const SILVER_CANDIDATES = [
  { label: 'S1', small: 5, medium: 20, large: 80 },
  { label: 'S2', small: 10, medium: 40, large: 150 },
  { label: 'S3', small: 15, medium: 60, large: 200 },
  { label: 'S4', small: 20, medium: 80, large: 300 },
];

const GOLD_CANDIDATES = [
  { label: 'G1', small: 10, medium: 40, large: 150 },
  { label: 'G2', small: 20, medium: 80, large: 300 },
  { label: 'G3', small: 30, medium: 120, large: 500 },
];

const TICKET_CANDIDATES = [
  { label: 'T1', small: 2, medium: 8 },
  { label: 'T2', small: 3, medium: 12 },
  { label: 'T3', small: 5, medium: 20 },
];

const BOARD_TEMPLATE = [
  ...repeatPrize('smallSilver', 7),
  ...repeatPrize('mediumSilver', 3),
  ...repeatPrize('largeSilver', 2, true),
  ...repeatPrize('smallGold', 7),
  ...repeatPrize('mediumGold', 3),
  ...repeatPrize('largeGold', 2, true),
  ...repeatPrize('smallTicket', 3),
  ...repeatPrize('mediumTicket', 1, true),
  ...repeatPrize('equipment0', 18),
  ...repeatPrize('equipment1', 8),
  ...repeatPrize('equipment2', 5),
  ...repeatPrize('equipment3', 3),
  ...repeatPrize('equipment4', 2, true),
];

function repeatPrize(name, count, isMajor = false) {
  return Array.from({ length: count }, () => ({ name, isMajor }));
}

function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle(array, rng) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function simulateBoards(iterations) {
  const rng = createRng(20260628);
  const totalCounts = createPrizeCounter();
  let totalPulls = 0;

  for (let boardIndex = 0; boardIndex < iterations; boardIndex += 1) {
    const board = shuffle(BOARD_TEMPLATE, rng);
    let majorsHit = 0;

    for (const prize of board) {
      totalPulls += 1;
      totalCounts[prize.name] += 1;

      if (prize.isMajor) {
        majorsHit += 1;
        if (majorsHit === 7) break;
      }
    }
  }

  const averageCounts = {};
  for (const [key, value] of Object.entries(totalCounts)) {
    averageCounts[key] = value / iterations;
  }

  return {
    iterations,
    pullsPerBoard: totalPulls / iterations,
    averageCounts,
  };
}

function createPrizeCounter() {
  return {
    smallSilver: 0,
    mediumSilver: 0,
    largeSilver: 0,
    smallGold: 0,
    mediumGold: 0,
    largeGold: 0,
    smallTicket: 0,
    mediumTicket: 0,
    equipment0: 0,
    equipment1: 0,
    equipment2: 0,
    equipment3: 0,
    equipment4: 0,
  };
}

function valuePerBoard(counts, values, names) {
  return names.reduce((sum, [countKey, valueKey]) => sum + counts[countKey] * values[valueKey], 0);
}

function ticketValuePerBoard(counts, ticket) {
  return counts.smallTicket * ticket.small + counts.mediumTicket * ticket.medium;
}

function expectedPullsFromBaseTickets(baseTickets, stats, ticket) {
  const ticketPerBoard = ticketValuePerBoard(stats.averageCounts, ticket);
  const ticketPerPull = ticketPerBoard / stats.pullsPerBoard;
  if (ticketPerPull >= 1) {
    return Number.POSITIVE_INFINITY;
  }
  return baseTickets / (1 - ticketPerPull);
}

function dailySilver(baseTickets, stats, silver, ticket) {
  const pulls = expectedPullsFromBaseTickets(baseTickets, stats, ticket);
  const silverPerBoard = valuePerBoard(stats.averageCounts, silver, [
    ['smallSilver', 'small'],
    ['mediumSilver', 'medium'],
    ['largeSilver', 'large'],
  ]);
  return pulls * (silverPerBoard / stats.pullsPerBoard);
}

function dailyGoldFromLottery(baseTickets, stats, gold, ticket) {
  const pulls = expectedPullsFromBaseTickets(baseTickets, stats, ticket);
  const goldPerBoard = valuePerBoard(stats.averageCounts, gold, [
    ['smallGold', 'small'],
    ['mediumGold', 'medium'],
    ['largeGold', 'large'],
  ]);
  return pulls * (goldPerBoard / stats.pullsPerBoard);
}

function formatNumber(value, digits = 0) {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatDays(value) {
  return formatNumber(value, 1);
}

function roundDownTo(value, step) {
  return Math.max(0, Math.floor(value / step) * step);
}

function priceRange(centerLow, centerHigh, step = 50) {
  return `${roundDownTo(centerLow, step)}~${roundDownTo(centerHigh, step)}`;
}

function buildCandidateRows(stats) {
  const rows = [];
  for (const silver of SILVER_CANDIDATES) {
    for (const gold of GOLD_CANDIDATES) {
      for (const ticket of TICKET_CANDIDATES) {
        const extremeSilver = dailySilver(EXTREME_DAILY_CLEARS, stats, silver, ticket);
        const normalSilver = dailySilver(NORMAL_DAILY_CLEARS, stats, silver, ticket);
        rows.push({
          silver,
          gold,
          ticket,
          extremeSilver,
          normalSilver,
          extremeSkillDays: SKILL_ALL_SILVER_COST / extremeSilver,
          normalSingleAttrDays: SKILL_SINGLE_ATTR_COST / normalSilver,
        });
      }
    }
  }
  return rows;
}

function buildEquipmentRecommendation(row) {
  const twoMonthIncome = row.extremeSilver * TWO_MONTH_DAYS;
  const spendBudget = twoMonthIncome * SAFETY_SPEND_RATE;
  const equipmentBudget = Math.max(0, spendBudget - SKILL_ALL_SILVER_COST);
  const perEquipment = roundDownTo(equipmentBudget / EQUIPMENT_COUNT, 50);
  const totalSpend = SKILL_ALL_SILVER_COST + perEquipment * EQUIPMENT_COUNT;

  return {
    twoMonthIncome,
    spendBudget,
    perEquipment,
    totalSpend,
    spendRate: totalSpend / twoMonthIncome,
  };
}

function chooseMatrixRecommendation(rows) {
  return rows
    .slice()
    .sort((a, b) => {
      const aSkillPenalty = Math.abs(a.extremeSkillDays - 60);
      const bSkillPenalty = Math.abs(b.extremeSkillDays - 60);
      const aNormalPenalty = Math.abs(a.normalSingleAttrDays - 90);
      const bNormalPenalty = Math.abs(b.normalSingleAttrDays - 90);
      return (aSkillPenalty + aNormalPenalty) - (bSkillPenalty + bNormalPenalty);
    })[0];
}

function buildGoldRows(stats) {
  const rows = [];
  for (const gold of GOLD_CANDIDATES) {
    for (const ticket of TICKET_CANDIDATES) {
      const lotteryGold = dailyGoldFromLottery(NORMAL_DAILY_CLEARS, stats, gold, ticket);
      rows.push({
        gold,
        ticket,
        lotteryGold,
        assumptionA: lotteryGold + NORMAL_DAILY_CLEARS * 5,
        assumptionB: lotteryGold + NORMAL_DAILY_CLEARS * 10,
      });
    }
  }
  return rows;
}

function buildCustomPacingRecommendation(stats) {
  const silver = { small: 1, medium: 4, large: 12 };
  const ticket = { small: 1, medium: 2 };
  const gold = GOLD_CANDIDATES[0];
  const extremeSilver = dailySilver(EXTREME_DAILY_CLEARS, stats, silver, ticket);
  const normalSilver = dailySilver(NORMAL_DAILY_CLEARS, stats, silver, ticket);
  const lotteryGold = dailyGoldFromLottery(NORMAL_DAILY_CLEARS, stats, gold, ticket);
  const normalGold = lotteryGold + NORMAL_DAILY_CLEARS * 5;
  const equipment = buildEquipmentRecommendation({ extremeSilver });

  return {
    silver,
    ticket,
    gold,
    sessionGoldPerClear: 5,
    extremeSilver,
    normalSilver,
    extremeSkillDays: SKILL_ALL_SILVER_COST / extremeSilver,
    normalSingleAttrDays: SKILL_SINGLE_ATTR_COST / normalSilver,
    normalGold,
    equipment,
  };
}

function buildShopPricing(normalGold) {
  return {
    smallSilverPack: priceRange(normalGold * 0.25, normalGold * 0.35),
    mediumSilverPack: priceRange(normalGold * 0.5, normalGold * 0.75),
    largeSilverPack: priceRange(normalGold * 0.95, normalGold * 1.3),
    smallTicketPack: priceRange(normalGold * 0.35, normalGold * 0.55),
    mediumTicketPack: priceRange(normalGold * 0.75, normalGold * 1.1),
    equipment: priceRange(normalGold * 0.7, normalGold * 1.2),
    smallDiamond: priceRange(normalGold * 1.2, normalGold * 1.8),
  };
}

function buildMarkdown(stats) {
  const rows = buildCandidateRows(stats);
  const matrixRecommendation = chooseMatrixRecommendation(rows);
  const matrixEquipment = buildEquipmentRecommendation(matrixRecommendation);
  const goldRows = buildGoldRows(stats);
  const custom = buildCustomPacingRecommendation(stats);
  const customPrices = buildShopPricing(custom.normalGold);
  const matrixNormalGold = dailyGoldFromLottery(
    NORMAL_DAILY_CLEARS,
    stats,
    matrixRecommendation.gold,
    matrixRecommendation.ticket,
  ) + NORMAL_DAILY_CLEARS * 5;
  const matrixPrices = buildShopPricing(matrixNormalGold);

  const lines = [];
  lines.push('# Economy Simulation Log');
  lines.push(`> 執行時間：${new Date().toISOString().slice(0, 10)}`);
  lines.push(`> Node版本：${process.version}`);
  lines.push('> 隨機種子：20260628');
  lines.push('');
  lines.push('## 任務1 結果');
  lines.push('');
  lines.push(`=== 任務1：抽獎盤基礎統計（N=${formatNumber(stats.iterations)} 盤）===`);
  lines.push(`平均 pulls_per_board: ${formatNumber(stats.pullsPerBoard, 1)}`);
  lines.push(`每盤平均銀幣格數：少銀幣 ${formatNumber(stats.averageCounts.smallSilver, 2)}, 中銀幣 ${formatNumber(stats.averageCounts.mediumSilver, 2)}, 多銀幣 ${formatNumber(stats.averageCounts.largeSilver, 2)}`);
  lines.push(`每盤平均金幣格數：少金幣 ${formatNumber(stats.averageCounts.smallGold, 2)}, 中金幣 ${formatNumber(stats.averageCounts.mediumGold, 2)}, 多金幣 ${formatNumber(stats.averageCounts.largeGold, 2)}`);
  lines.push(`每盤平均票券格數：少票券 ${formatNumber(stats.averageCounts.smallTicket, 2)}, 中票券 ${formatNumber(stats.averageCounts.mediumTicket, 2)}`);
  lines.push(`每盤平均裝備格數：0級 ${formatNumber(stats.averageCounts.equipment0, 2)}, 1級 ${formatNumber(stats.averageCounts.equipment1, 2)}, 2級 ${formatNumber(stats.averageCounts.equipment2, 2)}, 3級 ${formatNumber(stats.averageCounts.equipment3, 2)}, 4級 ${formatNumber(stats.averageCounts.equipment4, 2)}`);
  lines.push('');
  lines.push('> 注意：依照目前「7 個大獎全中才重置」規則，pulls_per_board 約 56.9；因此「不超過 50 抽」的驗收條件與盤面規則互相衝突。');
  lines.push('');
  lines.push('## 任務2 結果（候選值矩陣）');
  lines.push('');
  lines.push('計算方式：每天通關票券會投入抽獎，抽中的票券包會繼續投入；使用期望值 `baseTickets / (1 - ticketPerPull)`。');
  lines.push('');
  lines.push('| 銀幣組 | 少銀幣 | 中銀幣 | 多銀幣 | 金幣組 | 票券組 | 極限玩家日銀幣 | 極限玩家技能全滿天數 | 正常玩家日銀幣 | 正常玩家1屬性天數 |');
  lines.push('|---|---:|---:|---:|---|---|---:|---:|---:|---:|');
  for (const row of rows) {
    lines.push(`| ${row.silver.label} | ${row.silver.small} | ${row.silver.medium} | ${row.silver.large} | ${row.gold.label} | ${row.ticket.label} | ${formatNumber(row.extremeSilver, 0)} | ${formatDays(row.extremeSkillDays)} | ${formatNumber(row.normalSilver, 0)} | ${formatDays(row.normalSingleAttrDays)} |`);
  }
  lines.push('');
  lines.push('> 結論：候選銀幣組全都會讓技能進度過快；即使最低銀幣組 S1 搭配最低票券組 T1，極限玩家約 10.2 天滿 6 屬性，正常玩家約 8.5 天滿 1 屬性。');
  lines.push('');
  lines.push('## 任務3 結果');
  lines.push('');
  lines.push('候選矩陣內最接近驗收節奏的是最低銀幣/最低票券組，但仍明顯過快。若硬從候選矩陣取值：');
  lines.push('');
  lines.push(`- 採用候選：${matrixRecommendation.silver.label} 銀幣、${matrixRecommendation.gold.label} 金幣、${matrixRecommendation.ticket.label} 票券`);
  lines.push(`- 每件裝備 0→10 級建議銀幣成本：${formatNumber(matrixEquipment.perEquipment)} 銀幣`);
  lines.push(`- 驗算：極限玩家 2 個月銀幣總收入 ${formatNumber(matrixEquipment.twoMonthIncome)}；技能+裝備總支出 ${formatNumber(matrixEquipment.totalSpend)}；支出率 ${formatNumber(matrixEquipment.spendRate * 100, 1)}%`);
  lines.push('');
  lines.push('若優先滿足技能天數驗收，銀幣格值需要低於候選矩陣，例如少/中/多銀幣 = 1/4/12。此時技能節奏合理，但 2 個月總收入不足以同時支付 34,200 技能點與 50 件裝備合成，代表「技能天數」與「裝備全滿」目標也需要重新分配預算。');
  lines.push('');
  lines.push('## 任務4 結果');
  lines.push('');
  lines.push('| 金幣組 | 少金幣 | 中金幣 | 多金幣 | 票券組 | 抽獎金幣/日（正常） | 假設A +5/關 | 假設B +10/關 |');
  lines.push('|---|---:|---:|---:|---|---:|---:|---:|');
  for (const row of goldRows) {
    lines.push(`| ${row.gold.label} | ${row.gold.small} | ${row.gold.medium} | ${row.gold.large} | ${row.ticket.label} | ${formatNumber(row.lotteryGold)} | ${formatNumber(row.assumptionA)} | ${formatNumber(row.assumptionB)} |`);
  }
  lines.push('');
  lines.push('商店定價建議以「正常玩家每日總金幣」的比例回推，讓普通道具每天可買 1~2 件，稀有道具約 1 天或數天買 1 件。候選矩陣最低組加 +5/關時，正常玩家每日金幣約 ' + formatNumber(matrixNormalGold) + '。');
  lines.push('');
  lines.push(`- 銀幣包小/中/大：${matrixPrices.smallSilverPack} / ${matrixPrices.mediumSilverPack} / ${matrixPrices.largeSilverPack} 金幣`);
  lines.push(`- 票券包小/中：${matrixPrices.smallTicketPack} / ${matrixPrices.mediumTicketPack} 金幣`);
  lines.push(`- 裝備1件：${matrixPrices.equipment} 金幣`);
  lines.push(`- 鑽石小量：${matrixPrices.smallDiamond} 金幣`);
  lines.push('');
  lines.push('## 建議採用值（Codex 自行判斷最符合目標的一組）');
  lines.push('');
  lines.push('目前不建議直接採用候選矩陣，因為候選銀幣值會讓技能進度過快。若要優先符合「極限玩家 45~75 天滿 6 屬性」與「正常玩家 60~150 天滿 1 屬性」，建議先採用以下低銀幣版，並另外調高裝備銀幣來源或降低裝備全滿目標：');
  lines.push('');
  lines.push(`少銀幣 = ${custom.silver.small}, 中銀幣 = ${custom.silver.medium}, 多銀幣 = ${custom.silver.large}`);
  lines.push(`少金幣 = ${custom.gold.small}, 中金幣 = ${custom.gold.medium}, 多金幣 = ${custom.gold.large}`);
  lines.push(`少票券 = ${custom.ticket.small}, 中票券 = ${custom.ticket.medium}`);
  lines.push(`裝備合成 0→10級 銀幣成本 = ${formatNumber(custom.equipment.perEquipment)}（此值會因技能成本已吃掉 2 個月預算而變成 0；需補規則或放寬目標）`);
  lines.push(`場次金幣建議 = ${custom.sessionGoldPerClear}/關`);
  lines.push(`商店各道具建議定價 = 銀幣包小/中/大 ${customPrices.smallSilverPack}/${customPrices.mediumSilverPack}/${customPrices.largeSilverPack} 金幣；票券包小/中 ${customPrices.smallTicketPack}/${customPrices.mediumTicketPack} 金幣；裝備1件 ${customPrices.equipment} 金幣；鑽石小量 ${customPrices.smallDiamond} 金幣`);
  lines.push('');
  lines.push(`驗算：極限玩家日銀幣約 ${formatNumber(custom.extremeSilver)}，6 屬性技能滿約 ${formatDays(custom.extremeSkillDays)} 天；正常玩家日銀幣約 ${formatNumber(custom.normalSilver)}，1 屬性滿約 ${formatDays(custom.normalSingleAttrDays)} 天；正常玩家每日金幣約 ${formatNumber(custom.normalGold)}。`);
  lines.push('');
  lines.push('備用方案：如果必須只用候選矩陣，採最低組：少銀幣 5 / 中銀幣 20 / 多銀幣 80，少金幣 10 / 中金幣 40 / 多金幣 150，少票券 2 / 中票券 8，裝備 0→10 級約 2,900 銀幣，場次金幣 +5/關。但這會造成技能天數不符合驗收。');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const stats = simulateBoards(BOARD_SIMULATIONS);
  const markdown = buildMarkdown(stats);
  const outputPath = path.join(__dirname, 'economy-sim-log.md');
  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

*/

runEconomySimFinal();
