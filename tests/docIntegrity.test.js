import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GAME_CONFIG } from '../config/gameConfig.js';

// 文件完整性機器檢查（.claude/instructions.md 第 9~11 節的執行端）。
// 失敗輸出格式固定：DOC_INTEGRITY_VIOLATION <規則> <檔案> <說明>
// —— AI agent 靠此 pattern 解析違規清單，勿改格式。

const violations = [];
function violate(rule, file, detail) {
  violations.push(`DOC_INTEGRITY_VIOLATION ${rule} ${file} ${detail}`);
}

function listJs(dir) {
  return readdirSync(dir, { recursive: true })
    .map((p) => String(p).replaceAll('\\', '/'))
    .filter((p) => p.endsWith('.js'))
    .map((p) => `${dir}/${p}`);
}

function codeLines(text) {
  // 過濾純註解行（避免 header 註解裡提到 Math.random 之類的字樣誤判）
  return text.split('\n').filter((line) => {
    const t = line.trim();
    return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'));
  });
}

const srcFiles = listJs('src');
const configFiles = listJs('config');

// ── 1. 版本同步：gameConfig header @version 與 GAME_CONFIG.version 一致且格式合法 ──
{
  const text = readFileSync('config/gameConfig.js', 'utf8');
  const headerVersion = text.match(/@version\s+(v0\.\d+\.\d+\.\d+)/)?.[1];
  if (!/^v0\.\d+\.\d+\.\d+$/.test(GAME_CONFIG.version)) {
    violate('version-format', 'config/gameConfig.js', `GAME_CONFIG.version=${GAME_CONFIG.version} 不符合 v0.x.y.z`);
  }
  if (headerVersion !== GAME_CONFIG.version) {
    violate('version-sync', 'config/gameConfig.js', `header @version=${headerVersion} ≠ GAME_CONFIG.version=${GAME_CONFIG.version}`);
  }
}

// ── 2. header 覆蓋率：src/config 每個 .js 必有 @version 與 @summary ──
for (const file of [...srcFiles, ...configFiles]) {
  const text = readFileSync(file, 'utf8');
  if (!/@version\s+v0\.\d+\.\d+\.\d+/.test(text)) violate('header-version-missing', file, '缺 @version');
  if (!text.includes('@summary')) violate('header-summary-missing', file, '缺 @summary');
}

// ── 3. logic/ 層純度：禁止 import 上層、禁止 DOM/localStorage/Math.random()/Date.now() ──
const LOGIC_FORBIDDEN_IMPORTS = ['../game/', '../render/', '../ui/', '../input/', '../net/', '../account/'];
const LOGIC_FORBIDDEN_CALLS = ['Math.random(', 'Date.now(', 'document.', 'window.', 'localStorage'];
for (const file of srcFiles.filter((f) => f.startsWith('src/logic/'))) {
  const lines = codeLines(readFileSync(file, 'utf8'));
  for (const line of lines) {
    if (line.includes('import') || line.includes('from')) {
      for (const bad of LOGIC_FORBIDDEN_IMPORTS) {
        if (line.includes(bad)) violate('logic-layer-import', file, `import 上層模組：${line.trim()}`);
      }
    }
    for (const bad of LOGIC_FORBIDDEN_CALLS) {
      if (line.includes(bad)) violate('logic-purity', file, `純函式層出現 ${bad}：${line.trim()}`);
    }
  }
}

// ── 4. 循環依賴禁令：equipmentService 不可 import walletService ──
{
  const text = readFileSync('src/account/equipmentService.js', 'utf8');
  if (codeLines(text).some((l) => l.includes('walletService'))) {
    violate('circular-import', 'src/account/equipmentService.js', '禁止 import walletService（鐵則）');
  }
}

// ── 5. 歸檔斷鏈：引用 Docs/history/ 內文件時必須帶 history/ 前綴 ──
{
  const archivedNames = readdirSync('Docs/history')
    .map(String)
    .filter((n) => n.endsWith('.md') && n !== 'README.md');
  const scanTargets = [
    ...srcFiles,
    ...configFiles,
    ...readdirSync('Docs').map(String).filter((n) => n.endsWith('.md')).map((n) => `Docs/${n}`),
    '.claude/CLAUDE.md',
    '.claude/instructions.md',
    '.codex/AGENTS.md',
  ];
  for (const file of scanTargets) {
    const text = readFileSync(file, 'utf8');
    for (const name of archivedNames) {
      if (text.includes(`Docs/${name}`)) {
        violate('archived-doc-link', file, `引用 Docs/${name} 缺 history/ 前綴（該檔已歸檔）`);
      }
    }
  }
}

// ── 6. 凍結橫幅守衛：根目錄歷史快照的警示不可被移除 ──
for (const file of ['MAIN.md', 'QUICKREF.md', 'CHANGELOG.md', 'ARCH.md', 'project_summary.md']) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('歷史快照') && !text.includes('只記錄到')) {
    violate('frozen-banner-removed', file, '凍結警示橫幅遺失（此檔為歷史快照，不可當現況讀）');
  }
}

// ── 7. @exports 語意比對：header 宣告必須涵蓋檔案實際的 named export（防 header 說謊）──
// 本專案 export 語法盤點（2026-07-07）：僅有 export [async] function/const/class/let，
// 無 export {} / export default / re-export；若未來引入新形式，此 parser 需同步擴充。
// v1 只檢查「漏列」（實際有 export 但 header 沒寫）；「多列」可能是合理註記，不檢查。
for (const file of [...srcFiles, ...configFiles]) {
  const text = readFileSync(file, 'utf8');
  const headerLine = text.match(/@exports\s+(.+)/)?.[1];
  if (!headerLine) continue; // header 缺 @exports 不在此規則管（@summary/@version 已由規則 2 管）
  const declared = headerLine
    .split(/[,、]/)
    .map((s) => s.trim().split(/[（(]/)[0].trim())
    .filter(Boolean);
  const actual = [...text.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|let|var)\s+(\w+)/gm)]
    .map((m) => m[1]);
  const missing = actual.filter((name) => !declared.includes(name));
  if (missing.length) {
    violate('exports-drift', file, `header @exports 漏列：${missing.join(', ')}`);
  }
}

// ── 8. 任務規格 G/M/B 四段檢查（instructions §8；T27 起強制，舊 prompt 豁免）──
// 驗收記錄為追加式：prompt 可先 commit 再執行任務，故「存在與否」不強制；
// 但一旦寫了「## 驗收記錄」，格式必須完整（驗收方/驗收日/完成標準/獨立複跑）。
{
  const promptFiles = readdirSync('Docs/history')
    .map(String)
    .filter((n) => /^codex-prompt-T(\d+)\.md$/.test(n))
    .filter((n) => Number(n.match(/T(\d+)/)[1]) >= 27);
  const REQUIRED_SECTIONS = [
    ['背景', /背景/],
    ['修改檔案', /修改檔案|範圍/],
    ['完成標準', /完成標準/],
    ['邊界', /邊界|架構約束/],
  ];
  for (const name of promptFiles) {
    const file = `Docs/history/${name}`;
    const text = readFileSync(file, 'utf8');
    for (const [label, pattern] of REQUIRED_SECTIONS) {
      if (!pattern.test(text)) violate('prompt-gmb-missing', file, `任務規格缺「${label}」段（instructions §8）`);
    }
    if (text.includes('## 驗收記錄')) {
      // 欄位檢查限定在驗收記錄段內——「完成標準」等字樣在 prompt 正文必然出現，搜全文會變成空檢查
      const record = text.slice(text.indexOf('## 驗收記錄'));
      for (const field of ['驗收方', '驗收日', '完成標準', '獨立複跑']) {
        if (!record.includes(field)) violate('acceptance-record-incomplete', file, `驗收記錄缺「${field}」欄（instructions §8）`);
      }
    }
  }
}

if (violations.length) {
  for (const v of violations) console.error(v);
  assert.fail(`docIntegrity 檢查失敗，共 ${violations.length} 項違規（清單見上方 DOC_INTEGRITY_VIOLATION 行）`);
}
console.log('docIntegrity tests passed');
