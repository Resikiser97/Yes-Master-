import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_NORMAL_DAILY_SILVER = 17862;
const NORMAL_STAGES_PER_DAY = 120;
const SYNTH_TOTAL_COST_PER_PIECE = 188000;
const SYNTH_BUDGET_RATE = 0.5;

const MONSTER_TYPES = ['平民', '跑者', '猛男', '盾兵', '工兵', 'Boss'];

const WAVES = [
  [3, 0, 0, 0, 0, 0],
  [4, 0, 0, 0, 0, 0],
  [4, 1, 0, 0, 0, 0],
  [5, 0, 1, 0, 0, 0],
  [5, 1, 1, 0, 0, 0],
  [5, 0, 2, 0, 0, 0],
  [5, 0, 2, 1, 0, 0],
  [6, 1, 2, 0, 0, 0],
  [5, 1, 3, 1, 0, 0],
  [4, 2, 2, 1, 0, 1],
  [5, 2, 2, 1, 0, 0],
  [5, 2, 3, 1, 0, 0],
  [5, 2, 3, 2, 0, 0],
  [6, 3, 3, 2, 0, 0],
  [5, 3, 4, 2, 1, 0],
  [6, 3, 4, 2, 1, 0],
  [7, 3, 4, 3, 1, 0],
  [7, 4, 5, 3, 1, 0],
  [8, 4, 5, 3, 1, 0],
  [6, 4, 4, 3, 2, 1],
];

const CANDIDATES = [
  {
    key: 'A',
    label: 'A 全部統一（基準）',
    drops: { 平民: 5, 跑者: 5, 猛男: 5, 盾兵: 5, 工兵: 5, Boss: 5 },
  },
  {
    key: 'B',
    label: 'B 輕度精英加成',
    drops: { 平民: 3, 跑者: 5, 猛男: 8, 盾兵: 10, 工兵: 12, Boss: 30 },
  },
  {
    key: 'C',
    label: 'C 中度精英加成',
    drops: { 平民: 4, 跑者: 6, 猛男: 10, 盾兵: 12, 工兵: 15, Boss: 40 },
  },
  {
    key: 'D',
    label: 'D 重度精英加成',
    drops: { 平民: 2, 跑者: 5, 猛男: 12, 盾兵: 18, 工兵: 25, Boss: 60 },
  },
];

const FARM_STAGES = [
  { label: '第5關', stage: 5 },
  { label: '第10關', stage: 10 },
  { label: '第15關', stage: 15 },
];

function stageSilver(wave, drops) {
  let normalSilver = 0;
  for (let index = 0; index < MONSTER_TYPES.length - 1; index += 1) {
    normalSilver += wave[index] * drops[MONSTER_TYPES[index]];
  }

  const bossSilver = wave[5] * drops.Boss;
  return {
    normalSilver,
    bossSilver,
    total: normalSilver + bossSilver,
  };
}

function candidateStageRows(candidate) {
  return WAVES.map((wave, index) => ({
    stage: index + 1,
    ...stageSilver(wave, candidate.drops),
  }));
}

function progressRows(stageRows) {
  return FARM_STAGES.map(({ label, stage }) => {
    const stageTotal = stageRows[stage - 1].total;
    const monsterDailySilver = NORMAL_STAGES_PER_DAY * stageTotal;
    const newDailySilver = BASE_NORMAL_DAILY_SILVER + monsterDailySilver;
    const monsterShare = monsterDailySilver / newDailySilver;
    const singlePieceDays = SYNTH_TOTAL_COST_PER_PIECE / (newDailySilver * SYNTH_BUDGET_RATE);

    return {
      label,
      monsterDailySilver,
      newDailySilver,
      monsterShare,
      singlePieceDays,
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
  return `${formatNumber(value, 1)}天`;
}

function dropSettingText(drops) {
  return MONSTER_TYPES.map((type) => `${type}=${drops[type]}`).join('  ');
}

function buildStageTable(stageRows) {
  const lines = [
    '| 關卡 | 普通怪銀幣 | Boss銀幣 | 合計 |',
    '|---:|---:|---:|---:|',
  ];

  for (const row of stageRows) {
    lines.push(`| ${row.stage} | ${formatNumber(row.normalSilver)} | ${formatNumber(row.bossSilver)} | ${formatNumber(row.total)} |`);
  }

  return lines.join('\n');
}

function buildProgressTable(rows) {
  const lines = [
    '| 農關 | 日怪物銀幣 | 新日銀幣合計 | 怪物佔比 | 單件天數 |',
    '|---|---:|---:|---:|---:|',
  ];

  for (const row of rows) {
    lines.push(`| ${row.label} | ${formatNumber(row.monsterDailySilver)} | ${formatNumber(row.newDailySilver)} | ${formatPercent(row.monsterShare)} | ${formatDays(row.singlePieceDays)} |`);
  }

  return lines.join('\n');
}

function buildSummaryRows(results) {
  const lines = [
    '| 候選 | 第5關單件天數 | 第10關單件天數 | 第15關單件天數 | 第15關怪物佔比 |',
    '|---|---:|---:|---:|---:|',
  ];

  for (const result of results) {
    const [stage5, stage10, stage15] = result.progressRows;
    lines.push(`| ${result.candidate.label} | ${formatDays(stage5.singlePieceDays)} | ${formatDays(stage10.singlePieceDays)} | ${formatDays(stage15.singlePieceDays)} | ${formatPercent(stage15.monsterShare)} |`);
  }

  return lines.join('\n');
}

function buildMarkdown() {
  const results = CANDIDATES.map((candidate) => {
    const stageRows = candidateStageRows(candidate);
    return {
      candidate,
      stageRows,
      progressRows: progressRows(stageRows),
    };
  });

  const lines = [];
  lines.push('# Monster Silver Drop Simulation Log');
  lines.push(`> 執行時間：${new Date().toISOString().slice(0, 10)}`);
  lines.push(`> Node版本：${process.version}`);
  lines.push('');
  lines.push('## 基準');
  lines.push('');
  lines.push(`- 正常玩家日銀幣（純抽獎盤）=${formatNumber(BASE_NORMAL_DAILY_SILVER)}`);
  lines.push(`- 正常玩家每天通關數=${NORMAL_STAGES_PER_DAY} 關`);
  lines.push(`- 裝備合成總費用=${formatNumber(SYNTH_TOTAL_COST_PER_PIECE)} 銀/件`);
  lines.push(`- 合成預算分配=${formatPercent(SYNTH_BUDGET_RATE, 0)}`);
  lines.push('');

  for (const result of results) {
    lines.push(`### 候選 ${result.candidate.key}：${result.candidate.label}`);
    lines.push('');
    lines.push(`掉落設定：${dropSettingText(result.candidate.drops)}`);
    lines.push('');
    lines.push('第 1-20 關銀幣表：');
    lines.push('');
    lines.push(buildStageTable(result.stageRows));
    lines.push('');
    lines.push('正常玩家進度影響：');
    lines.push('');
    lines.push(buildProgressTable(result.progressRows));
    lines.push('');
  }

  lines.push('## 總結比較');
  lines.push('');
  lines.push(buildSummaryRows(results));
  lines.push('');
  lines.push('觀察：A 與 B 對合成天數影響較溫和；C、D 在第15關後讓怪物銀幣佔比接近或超過 20%，會更明顯壓縮抽獎盤銀幣的經濟權重。若要接續前一份 equipment-drop-sim 的「約 50 銀/關」目標，候選 B 在第15關合計 106 銀偏高，但新手第5關 28 銀較溫和；候選 A 最穩定但缺少精英/Boss 擊殺回饋。');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const markdown = buildMarkdown();
  const outputPath = path.join(__dirname, 'monster-drop-sim-log.md');
  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main();
