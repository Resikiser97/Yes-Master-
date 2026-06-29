import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NORMAL_STAGES_PER_DAY = 120;
const EXTREME_STAGES_PER_DAY = 600;
const BASE_NORMAL_SILVER = 17862;
const BASE_EXTREME_SILVER = 89309;
const BASE_NORMAL_GOLD = 1612;
const SYNTH_TOTAL_COST = 188000;
const TOTAL_EQUIPMENT_PIECES = 50;
const SYNTH_BUDGET_RATE = 0.5;
const SILVER_PACK_L_PRICE_GOLD = 440;

const MONSTER_SILVER_PER_STAGE = [0, 20, 50, 100, 150, 200, 300, 500];
const MONSTER_GOLD_PER_STAGE_CANDIDATES = [
  { label: '固定5金', fixed: 5, random: 0 },
  { label: '固定10金', fixed: 10, random: 0 },
  { label: '隨機0~20金（平均10）', fixed: 0, random: 20 },
];

function monsterGoldAverage(candidate) {
  if (candidate.random > 0) return candidate.fixed + candidate.random / 2;
  return candidate.fixed;
}

function silverImpactRows() {
  return MONSTER_SILVER_PER_STAGE.map((silverPerStage) => {
    const normalMonsterSilver = NORMAL_STAGES_PER_DAY * silverPerStage;
    const extremeMonsterSilver = EXTREME_STAGES_PER_DAY * silverPerStage;
    const normalDailySilver = BASE_NORMAL_SILVER + normalMonsterSilver;
    const extremeDailySilver = BASE_EXTREME_SILVER + extremeMonsterSilver;
    const normalSinglePieceDays = SYNTH_TOTAL_COST / (normalDailySilver * SYNTH_BUDGET_RATE);
    const extremeAllPiecesDays = (TOTAL_EQUIPMENT_PIECES * SYNTH_TOTAL_COST) / extremeDailySilver;
    const isReasonable = normalSinglePieceDays >= 10
      && normalSinglePieceDays <= 30
      && extremeAllPiecesDays >= 60
      && extremeAllPiecesDays <= 150;

    return {
      silverPerStage,
      normalDailySilver,
      normalSinglePieceDays,
      extremeAllPiecesDays,
      isReasonable,
    };
  });
}

function chooseSilverRecommendation(rows) {
  const targetNormalDays = 16;
  const targetExtremeDays = 90;
  return rows
    .filter((row) => row.isReasonable && row.silverPerStage > 0)
    .sort((a, b) => {
      const aScore = Math.abs(a.normalSinglePieceDays - targetNormalDays)
        + Math.abs(a.extremeAllPiecesDays - targetExtremeDays) / 5;
      const bScore = Math.abs(b.normalSinglePieceDays - targetNormalDays)
        + Math.abs(b.extremeAllPiecesDays - targetExtremeDays) / 5;
      return aScore - bScore;
    })[0] ?? rows.find((row) => row.isReasonable) ?? rows[0];
}

function normalizeRoundedCosts(rawCosts, total) {
  const costs = rawCosts.map((cost) => Math.round(cost));
  const delta = total - sum(costs);
  costs[costs.length - 1] += delta;
  return costs;
}

function linearCurve() {
  return Array.from({ length: 10 }, () => SYNTH_TOTAL_COST / 10);
}

function quadraticCurve() {
  const weights = Array.from({ length: 10 }, (_, index) => (index + 1) ** 2);
  const scale = SYNTH_TOTAL_COST / sum(weights);
  return weights.map((weight) => weight * scale);
}

function exponentialCurve() {
  const weights = Array.from({ length: 10 }, (_, index) => 1.5 ** index);
  const scale = SYNTH_TOTAL_COST / sum(weights);
  return weights.map((weight) => weight * scale);
}

function skillLikeCurve() {
  const earlyWeights = [0.02, 0.03, 0.05];
  const lateBaseWeights = Array.from({ length: 7 }, (_, index) => 1.18 ** index);
  const lateScale = 0.9 / sum(lateBaseWeights);
  return [
    ...earlyWeights,
    ...lateBaseWeights.map((weight) => weight * lateScale),
  ].map((ratio) => ratio * SYNTH_TOTAL_COST);
}

function synthCurveVariants() {
  return [
    { key: 'A', label: '變體 A（線性）', costs: normalizeRoundedCosts(linearCurve(), SYNTH_TOTAL_COST) },
    { key: 'B', label: '變體 B（二次方）', costs: normalizeRoundedCosts(quadraticCurve(), SYNTH_TOTAL_COST) },
    { key: 'C', label: '變體 C（指數 ×1.5）', costs: normalizeRoundedCosts(exponentialCurve(), SYNTH_TOTAL_COST) },
    { key: 'D', label: '變體 D（仿技能曲線）', costs: normalizeRoundedCosts(skillLikeCurve(), SYNTH_TOTAL_COST) },
  ];
}

function chooseCurveRecommendation(variants, normalDailySilver) {
  const dailyBudget = normalDailySilver * SYNTH_BUDGET_RATE;
  return variants
    .map((variant) => {
      const firstDays = variant.costs[0] / dailyBudget;
      const firstThreeRatio = sum(variant.costs.slice(0, 3)) / SYNTH_TOTAL_COST;
      const lastCostRatio = variant.costs[variant.costs.length - 1] / SYNTH_TOTAL_COST;
      const earlyPenalty = firstDays <= 1 ? 0 : (firstDays - 1) * 10;
      const frontloadPenalty = Math.abs(firstThreeRatio - 0.1) * 20;
      const lateSpikePenalty = Math.max(0, lastCostRatio - 0.25) * 15;
      return {
        variant,
        score: earlyPenalty + frontloadPenalty + lateSpikePenalty,
      };
    })
    .sort((a, b) => a.score - b.score)[0].variant;
}

function goldImpactRows() {
  return MONSTER_GOLD_PER_STAGE_CANDIDATES.map((candidate) => {
    const averageGoldPerStage = monsterGoldAverage(candidate);
    const normalMonsterGold = NORMAL_STAGES_PER_DAY * averageGoldPerStage;
    const normalDailyGold = BASE_NORMAL_GOLD + normalMonsterGold;
    return {
      ...candidate,
      averageGoldPerStage,
      normalDailyGold,
      silverPackIntervalDays: SILVER_PACK_L_PRICE_GOLD / normalDailyGold,
    };
  });
}

function formatNumber(value, digits = 0) {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatPercent(value, digits = 1) {
  return `${formatNumber(value * 100, digits)}%`;
}

function formatDays(value) {
  return `${formatNumber(value, 1)} 天`;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function buildSilverTable(rows) {
  const lines = [
    '| 怪物銀幣/關 | 正常日銀幣 | 正常單件天數 | 極限50件天數 | 是否合理 |',
    '|---:|---:|---:|---:|---|',
  ];

  for (const row of rows) {
    lines.push(`| ${row.silverPerStage} | ${formatNumber(row.normalDailySilver)} | ${formatDays(row.normalSinglePieceDays)} | ${formatDays(row.extremeAllPiecesDays)} | ${row.isReasonable ? '✅ 合理' : '❌ 不建議'} |`);
  }

  return lines.join('\n');
}

function buildCurveTable(costs, normalDailySilver) {
  const dailyBudget = normalDailySilver * SYNTH_BUDGET_RATE;
  const lines = [
    '| 升級 | 費用 | 佔總費用% | 正常玩家需攢幾天 |',
    '|---|---:|---:|---:|',
  ];

  costs.forEach((cost, index) => {
    lines.push(`| Lv${index}→${index + 1} | ${formatNumber(cost)} | ${formatPercent(cost / SYNTH_TOTAL_COST)} | ${formatDays(cost / dailyBudget)} |`);
  });
  lines.push(`| 合計 | ${formatNumber(sum(costs))} | 100.0% | — |`);

  return lines.join('\n');
}

function buildGoldTable(rows) {
  const lines = [
    '| 候選 | 平均金幣/關 | 正常日金幣 | 銀幣包大購買間隔（天） |',
    '|---|---:|---:|---:|',
  ];

  for (const row of rows) {
    lines.push(`| ${row.label} | ${formatNumber(row.averageGoldPerStage, 1)} | ${formatNumber(row.normalDailyGold)} | ${formatNumber(row.silverPackIntervalDays, 2)} |`);
  }

  return lines.join('\n');
}

function buildMarkdown() {
  const silverRows = silverImpactRows();
  const silverRecommendation = chooseSilverRecommendation(silverRows);
  const variants = synthCurveVariants();
  const curveRecommendation = chooseCurveRecommendation(variants, silverRecommendation.normalDailySilver);
  const goldRows = goldImpactRows();
  const lowestGoldCandidate = goldRows.slice().sort((a, b) => a.normalDailyGold - b.normalDailyGold)[0];

  const lines = [];
  lines.push('# Equipment Drop Simulation Log');
  lines.push(`> 執行時間：${new Date().toISOString().slice(0, 10)}`);
  lines.push(`> Node版本：${process.version}`);
  lines.push('');
  lines.push('## 任務1：怪物銀幣影響矩陣');
  lines.push('');
  lines.push(buildSilverTable(silverRows));
  lines.push('');
  lines.push(`建議採用值：${silverRecommendation.silverPerStage} 銀幣/關（理由：正常玩家單件約 ${formatDays(silverRecommendation.normalSinglePieceDays)}，極限玩家 50 件約 ${formatDays(silverRecommendation.extremeAllPiecesDays)}；比 100 銀/關更不貼近 60 天下限，保留後續活動與商店的平衡空間。）`);
  lines.push('');
  lines.push('## 任務2：合成費用曲線');
  lines.push('');
  lines.push(`以下「需攢幾天」以建議怪物銀幣 ${silverRecommendation.silverPerStage}/關計算：正常玩家日銀幣 ${formatNumber(silverRecommendation.normalDailySilver)}，其中 50%（${formatNumber(silverRecommendation.normalDailySilver * SYNTH_BUDGET_RATE)}）用於合成。`);
  lines.push('');
  for (const variant of variants) {
    lines.push(`### ${variant.label}`);
    lines.push('');
    lines.push(buildCurveTable(variant.costs, silverRecommendation.normalDailySilver));
    lines.push('');
  }
  lines.push(`推薦：${curveRecommendation.label}。理由：前 3 級合計 ${formatPercent(sum(curveRecommendation.costs.slice(0, 3)) / SYNTH_TOTAL_COST)}，Lv0→1 只需 ${formatDays(curveRecommendation.costs[0] / (silverRecommendation.normalDailySilver * SYNTH_BUDGET_RATE))}，新手當天可體驗；後段逐步拉高但單級最高不超過總成本約 ${formatPercent(curveRecommendation.costs[9] / SYNTH_TOTAL_COST)}，壓力比指數曲線更平滑。`);
  lines.push('');
  lines.push('## 任務3：怪物金幣快速評估');
  lines.push('');
  lines.push(buildGoldTable(goldRows));
  lines.push('');
  lines.push(`建議：短期不加入怪物金幣掉落，維持金幣主要來自場次與抽獎盤，避免技能與商店金幣消費過快。若一定要三選一，採 ${lowestGoldCandidate.label}，因為它對日金幣膨脹最小。`);
  lines.push('');
  lines.push('## 建議採用值');
  lines.push('');
  lines.push(`怪物銀幣掉落 = ${silverRecommendation.silverPerStage} 銀幣/關`);
  lines.push('怪物金幣掉落 = 暫不採用（若一定要測，採固定5金/關）');
  lines.push(`合成費用曲線 = ${curveRecommendation.label}`);
  lines.push(`合成 Lv0→10 費用 = [${curveRecommendation.costs.join(', ')}]`);
  lines.push(`合成總費用 = ${formatNumber(sum(curveRecommendation.costs))} 銀幣`);
  lines.push(`正常玩家日銀幣 = ${formatNumber(silverRecommendation.normalDailySilver)}，合成預算50% = ${formatNumber(silverRecommendation.normalDailySilver * SYNTH_BUDGET_RATE)} / 日`);
  lines.push(`正常玩家單件 Lv0→10 約 ${formatDays(silverRecommendation.normalSinglePieceDays)}`);
  lines.push(`極限玩家 50 件 Lv0→10 約 ${formatDays(silverRecommendation.extremeAllPiecesDays)}`);
  lines.push('');

  return lines.join('\n');
}

function main() {
  const markdown = buildMarkdown();
  const outputPath = path.join(__dirname, 'equipment-drop-sim-log.md');
  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main();
