#!/usr/bin/env node
'use strict';

/**
 * Lexer accuracy corpus: runs the built-in lexer over real open-source files (test/corpus/)
 * and scores every symbol span against a real parser ("judge"):
 *   TS/JS/TSX -> TypeScript compiler AST (needs `typescript` resolvable; CI installs it)
 *   Python    -> CPython `ast` module (needs python3/python on PATH)
 *
 * Usage: node test/accuracy.cjs [--verbose] [--update] [--require-all]
 *   --update       rewrite test/corpus/baseline.json with the current scores
 *   --require-all  fail (instead of skip) when a judge is unavailable
 * Exits 1 when a language scores below its recorded baseline.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const lib = require(path.resolve(__dirname, '..', 'scripts', 'repo-index.cjs'));
const CORPUS = path.join(__dirname, 'corpus');
const BASELINE_PATH = path.join(CORPUS, 'baseline.json');
const TOLERANCE_PCT = 0.5; // absorbs rounding only; real regressions are larger
const args = new Set(process.argv.slice(2));

const LANG_BY_EXT = { '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.py': 'Python' };

function lexerEntries(file) {
  process.env.ANTIS_FORCE_LEXER = '1';
  try { return lib.parseFileOutline(file).entries; } finally { delete process.env.ANTIS_FORCE_LEXER; }
}

// Truth rows: { symbol, starts: [accepted start lines], end }
function judgeTypeScript(file) {
  const parsed = lib.parseFileOutline(file);
  if (parsed.astEngine !== 'typescript-compiler') return null;
  return parsed.entries.map(e => ({ symbol: e.symbol, starts: [e.startLine], end: e.endLine }));
}

const PY_JUDGE = [
  'import ast, json, sys',
  't = ast.parse(open(sys.argv[1], encoding="utf8").read())',
  'kinds = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)',
  // A decorated def may be reported from its first decorator line or from the def line.
  'rows = [{"symbol": n.name, "starts": sorted({n.lineno, *[d.lineno for d in n.decorator_list]}), "end": n.end_lineno} for n in ast.walk(t) if isinstance(n, kinds)]',
  'print(json.dumps(rows))'
].join('\n');

let pythonCmd;
function findPython() {
  if (pythonCmd !== undefined) return pythonCmd;
  pythonCmd = ['python3', 'python'].find(c => {
    const r = spawnSync(c, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
    return r.status === 0 && r.stdout.trim() === '3';
  }) || null;
  return pythonCmd;
}

function judgePython(file) {
  const py = findPython();
  if (!py) return null;
  const r = spawnSync(py, ['-c', PY_JUDGE, file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`python judge failed on ${file}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const JUDGES = { TypeScript: judgeTypeScript, JavaScript: judgeTypeScript, Python: judgePython };

function scoreFile(file, lang) {
  const truth = JUDGES[lang](file);
  if (!truth) return null;
  const pool = lexerEntries(file).map(e => ({ symbol: e.symbol, start: e.startLine, end: e.endLine, used: false }));
  const res = { total: truth.length, exact: 0, wrongEnd: [], missed: [], phantom: [] };
  for (const t of truth) {
    const hit = pool.find(p => !p.used && p.symbol === t.symbol && t.starts.includes(p.start));
    if (!hit) { res.missed.push(`${t.symbol} L${t.starts[t.starts.length - 1]}-L${t.end}`); continue; }
    hit.used = true;
    if (hit.end === t.end) res.exact++;
    else res.wrongEnd.push(`${t.symbol} L${hit.start}: lexer end L${hit.end}, real L${t.end}`);
  }
  res.phantom = pool.filter(p => !p.used).map(p => `${p.symbol} L${p.start}-L${p.end}`);
  return res;
}

const pct = (n, d) => (d ? (n / d) * 100 : 100);
const manifest = JSON.parse(fs.readFileSync(path.join(CORPUS, 'manifest.json'), 'utf8'));
const byLang = {};
const skipped = new Set();

for (const { file } of manifest) {
  const lang = LANG_BY_EXT[path.extname(file)];
  if (!lang) throw new Error(`No judge for ${file}`);
  const r = scoreFile(path.join(CORPUS, file), lang);
  if (!r) { skipped.add(lang); continue; }
  const agg = byLang[lang] || (byLang[lang] = { files: 0, total: 0, exact: 0, wrongEnd: 0, missed: 0, phantom: 0 });
  agg.files++; agg.total += r.total; agg.exact += r.exact;
  agg.wrongEnd += r.wrongEnd.length; agg.missed += r.missed.length; agg.phantom += r.phantom.length;
  if (args.has('--verbose')) {
    console.log(`\n# ${file}: ${r.exact}/${r.total} exact`);
    for (const [label, rows] of [['wrong-end', r.wrongEnd], ['missed', r.missed], ['extra', r.phantom]]) {
      for (const row of rows) console.log(`  ${label}: ${row}`);
    }
  }
}

console.log('\n=== LEXER ACCURACY (real-world corpus, judged by real parsers) ===');
console.log('Language    Files  Symbols  Exact span  Wrong end  Missed    Extra');
const scores = {};
for (const [lang, a] of Object.entries(byLang)) {
  scores[lang] = +pct(a.exact, a.total).toFixed(1);
  console.log(`${lang.padEnd(11)} ${String(a.files).padStart(5)}  ${String(a.total).padStart(7)}  ${(scores[lang].toFixed(1) + '%').padStart(10)}  ${String(a.wrongEnd).padStart(9)}  ${String(a.missed).padStart(6)}  ${String(a.phantom).padStart(7)}`);
}
for (const lang of skipped) console.log(`${lang.padEnd(11)} SKIPPED (judge unavailable: install typescript / python3)`);

if (skipped.size && args.has('--require-all')) { console.error('FAIL: judge unavailable with --require-all'); process.exit(1); }

if (args.has('--update')) {
  if (skipped.size) { console.error('Refusing --update with skipped languages.'); process.exit(1); }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(scores, null, 2) + '\n');
  console.log(`Baseline written: ${path.relative(process.cwd(), BASELINE_PATH)}`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : {};
const regressions = Object.entries(scores).filter(([lang, s]) => baseline[lang] !== undefined && s < baseline[lang] - TOLERANCE_PCT);
if (regressions.length) {
  for (const [lang, s] of regressions) console.error(`FAIL: ${lang} exact-span accuracy ${s}% fell below baseline ${baseline[lang]}%`);
  process.exit(1);
}
console.log('Extra = symbols the lexer lists that the judge does not (mostly constructors and nested functions), not counted as errors.');
console.log('PASS: no language below its baseline.');
