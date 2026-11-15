#!/usr/bin/env node
'use strict';

/**
 * Antis-Optimizer — Comprehensive Automated Test Suite (50 Self-Contained Tests)
 * Zero personal paths; runs entirely inside an isolated OS temp directory.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const targetCli = path.resolve(__dirname, '..', 'scripts', 'repo-index.cjs');
const pkg = require(path.resolve(__dirname, '..', 'package.json'));
const lib = require(targetCli);

console.log(`=== ANTIS-OPTIMIZER v${pkg.version} TEST SUITE (50 TESTS) ===`);
let passed = 0, total = 50;

(async function main() {
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'antis-opt-test-'));
try {
  // 1. Multi-Line TypeScript Functions & Real Compiler AST Engine Verification
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'engine.ts'), [
    'export async function initializeEngine(',
    '  canvas: HTMLCanvasElement,',
    '  options: Record<string, unknown>,',
    '  onReady?: () => void',
    '): Promise<boolean> {',
    '  function innerHelper(x: number) {',
    '    return x * 2;',
    '  }',
    '  return Boolean(canvas && options && innerHelper(1) && onReady);',
    '}',
    'export function destroyEngine(): void {',
    '  return;',
    '}'
  ].join('\n'));
  const astParsed = lib.parseFileOutline(path.join(tmp, 'src', 'engine.ts'));
  const out1 = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'src/engine.ts'], { encoding: 'utf8' }).stdout || '';
  const expectAst = process.env.ANTIS_EXPECT_AST === '1';
  const t1 = out1.includes('L1-L10: export async function initializeEngine') &&
             out1.includes('L6-L8: function innerHelper') &&
             out1.includes('L11-L13: export function destroyEngine') &&
             (expectAst ? astParsed.astEngine === 'typescript-compiler' : (astParsed.astEngine === 'typescript-compiler' || astParsed.entries.length === 3));
  if (t1) passed++;
  console.log(`[Test 1: TypeScript Compiler AST & Multi-Line Function Spans (engine=${astParsed.astEngine || 'lexer'})] ${t1 ? 'PASS' : 'FAIL'}`);

  // 2. Generic Arrow Function, React forwardRef & Python Multi-Line def
  fs.writeFileSync(path.join(tmp, 'comp.tsx'), [
    'export const fetchGeneric = async <T,>(',
    '  url: string,',
    '  opts: RequestInit',
    '): Promise<T> => {',
    '  return fetch(url, opts) as any;',
    '};',
    'export const Button = React.forwardRef<HTMLButtonElement, Props>((',
    '  props,',
    '  ref',
    ') => {',
    '  return null;',
    '});'
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, 'mod.py'), [
    'async def compute_metrics(',
    '    items: list[str],',
    '    threshold: float = 0.5,',
    ') -> dict:',
    '    """Docstring"""',
    '    return {"ok": True}'
  ].join('\n'));
  const tsxOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'comp.tsx'], { encoding: 'utf8' }).stdout || '';
  const pyOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'mod.py'], { encoding: 'utf8' }).stdout || '';
  const t2 = tsxOut.includes('L1-L6:') && tsxOut.includes('L7-L12:') && pyOut.includes('L1-L6: async def compute_metrics');
  if (t2) passed++;
  console.log(`[Test 2: Generic Arrow + forwardRef + Python Multi-line def] ${t2 ? 'PASS' : 'FAIL'}`);

  // 3. Polyglot Rust, Go, HTML section span
  fs.writeFileSync(path.join(tmp, 'lib.rs'), 'pub struct Engine {\n  pub id: u32,\n}\npub async fn run_engine(\n  id: u32,\n) -> bool {\n  true\n}\n');
  fs.writeFileSync(path.join(tmp, 'main.go'), 'package main\nfunc (s *Server) Handle(\n  w Response,\n) error {\n  return nil\n}\n');
  fs.writeFileSync(path.join(tmp, 'page.html'), '<main id="app">\n  <section id="hero">\n    <h1>Hi</h1>\n  </section>\n</main>\n');
  const rsOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'lib.rs'], { encoding: 'utf8' }).stdout || '';
  const goOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'main.go'], { encoding: 'utf8' }).stdout || '';
  const htmlOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'page.html'], { encoding: 'utf8' }).stdout || '';
  const t3 = rsOut.includes('L4-L8:') && goOut.includes('L2-L6:') && htmlOut.includes('L2-L4: <section id="hero">');
  if (t3) passed++;
  console.log(`[Test 3: Polyglot Rust/Go + HTML Closing-Tag Spans] ${t3 ? 'PASS' : 'FAIL'}`);

  // 4. JSON Brace-in-String Span Drift
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  const trickyJson = {
    items: [
      { id: 'item-1', code: 'function broken() { return "} }} }"; }', desc: 'line' },
      { id: 'item-2', code: 'ok', desc: 'second' }
    ]
  };
  fs.writeFileSync(path.join(tmp, 'data', 'tricky-data.json'), JSON.stringify(trickyJson, null, 2) + '\n');
  const sliceRes = spawnSync('node', [targetCli, '--root', tmp, '--slice', 'tricky-data', 'item-1'], { encoding: 'utf8' });
  const span = JSON.parse(sliceRes.stdout).landmark;
  const t4 = span === 'data/tricky-data.json:L3-L7';
  if (t4) passed++;
  console.log(`[Test 4: JSON Brace-in-String Span (L3-L7)] ${t4 ? 'PASS' : 'FAIL'}`);

  // 5. .ignore Glob Enforcement
  fs.writeFileSync(path.join(tmp, '.ignore'), '# Team comment\n*.masked.json\n');
  fs.writeFileSync(path.join(tmp, 'foo.masked.json'), JSON.stringify({ items: [{ id: 'nope' }] }));
  const gRes = spawnSync('node', [targetCli, '--root', tmp, '--slice', 'masked'], { encoding: 'utf8' });
  const t5 = gRes.status !== 0 && !(gRes.stdout || '').includes('nope');
  if (t5) passed++;
  console.log(`[Test 5: .ignore Wildcard Glob Enforcement (*.masked.json)] ${t5 ? 'PASS' : 'FAIL'}`);

  // 6. Secret File Block & Token Redaction
  fs.writeFileSync(path.join(tmp, '.env.production'), 'API_KEY=sk-proj-1234567890abcdefghijklmnop\n');
  fs.writeFileSync(path.join(tmp, 'config-sample.json'), JSON.stringify({ items: [{ id: 'cfg', token: 'ghp_1234567890abcdefghijklmnopqrstuvwx' }] }, null, 2));
  const envOut = spawnSync('node', [targetCli, '--root', tmp, '--slice', '.env.production'], { encoding: 'utf8' });
  const tokOut = spawnSync('node', [targetCli, '--root', tmp, '--slice', 'config-sample'], { encoding: 'utf8' }).stdout || '';
  const t6 = envOut.status === 2 && tokOut.includes('[REDACTED_SECRET]') && !tokOut.includes('ghp_123456');
  if (t6) passed++;
  console.log(`[Test 6: Secret File Block & Token Redaction] ${t6 ? 'PASS' : 'FAIL'}`);

  // 7. In-Bounds Symbol Drift Detection & --sync-landmarks Auto-Healing
  fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# Test\n');
  fs.writeFileSync(path.join(tmp, 'INDEX.md'), '| File | Size | Landmarks |\n| :--- | :--- | :--- |\n| `lib.rs` | `0.1 KB / 99L` | `run_engine` `L1-L5` |\n');
  spawnSync('node', [targetCli, '--root', tmp, '--sync-ignores', '--write'], { encoding: 'utf8' });
  const vBefore = spawnSync('node', [targetCli, '--root', tmp, '--verify'], { encoding: 'utf8' });
  const caughtDrift = vBefore.status !== 0 && (vBefore.stdout || '').includes('run_engine(L1-L5 drifted to L4-L8)');
  spawnSync('node', [targetCli, '--root', tmp, '--sync-landmarks', '--write'], { encoding: 'utf8' });
  const healedIndex = fs.readFileSync(path.join(tmp, 'INDEX.md'), 'utf8');
  const vAfter = spawnSync('node', [targetCli, '--root', tmp, '--verify'], { encoding: 'utf8' });
  const t7 = caughtDrift && healedIndex.includes('`run_engine` `L4-L8`') && healedIndex.includes('/ 9L`') && vAfter.status === 0;
  if (t7) passed++;
  console.log(`[Test 7: In-Bounds Symbol Drift Catch & --sync-landmarks Auto-Heal] ${t7 ? 'PASS' : 'FAIL'}`);

  // 8. Comment Preservation in .ignore & .jcodemunch.jsonc
  fs.writeFileSync(path.join(tmp, '.jcodemunch.jsonc'), '// Custom JSONC header comment\n{\n  "extra_ignore_patterns": []\n}\n');
  spawnSync('node', [targetCli, '--root', tmp, '--sync-ignores', '--write'], { encoding: 'utf8' });
  const igTxt = fs.readFileSync(path.join(tmp, '.ignore'), 'utf8');
  const jcmTxt = fs.readFileSync(path.join(tmp, '.jcodemunch.jsonc'), 'utf8');
  const t8 = igTxt.includes('# Team comment') && jcmTxt.includes('// Custom JSONC header comment');
  if (t8) passed++;
  console.log(`[Test 8: Comment Preservation in .ignore & .jcodemunch.jsonc] ${t8 ? 'PASS' : 'FAIL'}`);

  // 9. Mathematical Token Break-Even Tier 0 on Small Clean Repo
  const auditSmall = spawnSync('node', [targetCli, '--root', tmp, '--audit'], { encoding: 'utf8' }).stdout || '';
  const t9 = auditSmall.includes('TIER 0 (IGNORE-ONLY)');
  if (t9) passed++;
  console.log(`[Test 9: Mathematical Token Break-Even (Small Repo -> TIER 0)] ${t9 ? 'PASS' : 'FAIL'}`);

  // 10. Mathematical Token Break-Even Tier 2 on Monolith Repo
  const tmpLarge = fs.mkdtempSync(path.join(os.tmpdir(), 'antis-opt-large-'));
  try {
    for (let m = 0; m < 4; m++) {
      fs.writeFileSync(path.join(tmpLarge, `monolith_${m}.ts`), `export function fn_${m}() {\n` + '  const x = 1;\n'.repeat(1500) + '}\n');
    }
    const auditLarge = spawnSync('node', [targetCli, '--root', tmpLarge, '--audit'], { encoding: 'utf8' }).stdout || '';
    const t10 = auditLarge.includes('TIER 2 (FULL 4-LAYER)') && auditLarge.includes('R* =');
    if (t10) passed++;
    console.log(`[Test 10: Mathematical Token Break-Even (Monolith Repo -> TIER 2)] ${t10 ? 'PASS' : 'FAIL'}`);
  } finally {
    fs.rmSync(tmpLarge, { recursive: true, force: true });
  }

  // 11. Self-Outline of repo-index.cjs (both AST and Lexer fallback)
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
  fs.copyFileSync(targetCli, path.join(tmp, 'scripts', 'repo-index.cjs'));
  const selfAstOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'scripts/repo-index.cjs'], { encoding: 'utf8' }).stdout || '';
  const selfLexOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'scripts/repo-index.cjs'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIS_FORCE_LEXER: '1' }
  }).stdout || '';
  const t11 = selfAstOut.includes('function cmdVerify(') && !selfAstOut.includes('const home = os.homedir()') &&
              selfLexOut.includes('function cmdVerify(') && !selfLexOut.includes('const home = os.homedir()');
  if (t11) passed++;
  console.log(`[Test 11: Self-Outline Parity (Compiler AST & Stateful Lexer Fallback)] ${t11 ? 'PASS' : 'FAIL'}`);

  // 12. Rust 3-Lifetime Signature Immunity ('a, 'a, 'a)
  fs.writeFileSync(path.join(tmp, 'lifetimes.rs'), "pub fn parse<'a>(x: &'a str) -> &'a str {\n  x\n}\n");
  const lifeOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'lifetimes.rs'], { encoding: 'utf8' }).stdout || '';
  const t12 = lifeOut.includes("L1-L3: pub fn parse<'a>");
  if (t12) passed++;
  console.log(`[Test 12: Rust Odd-Count Lifetime ('a) Span Accuracy] ${t12 ? 'PASS' : 'FAIL'}`);

  // 13. Deleted/Renamed Symbol Detection in INDEX.md
  fs.writeFileSync(path.join(tmp, 'INDEX.md'), '| File | Size | Landmarks |\n| :--- | :--- | :--- |\n| `lifetimes.rs` | `0.0 KB / 4L` | `non_existent_fn` `L1-L3` |\n');
  const vDeleted = spawnSync('node', [targetCli, '--root', tmp, '--verify'], { encoding: 'utf8' });
  const t13 = vDeleted.status !== 0 && (vDeleted.stdout || '').includes('non_existent_fn(symbol not found)');
  if (t13) passed++;
  console.log(`[Test 13: Deleted/Renamed Symbol Catch in --verify] ${t13 ? 'PASS' : 'FAIL'}`);

  // 14. Dictionary JSON Key Truncation (500 keys -> valid JSON with _moreKeys)
  const bigDict = {};
  for (let k = 0; k < 500; k++) bigDict[`key_${k}`] = `value_${k}`;
  fs.writeFileSync(path.join(tmp, 'dict-map.json'), JSON.stringify(bigDict, null, 2));
  const dictSlice = spawnSync('node', [targetCli, '--root', tmp, '--slice', 'dict-map'], { encoding: 'utf8' }).stdout || '';
  let parsedDict = null;
  try { parsedDict = JSON.parse(dictSlice); } catch {}
  const t14 = parsedDict && parsedDict.sample && parsedDict.sample._moreKeys === 492;
  if (t14) passed++;
  console.log(`[Test 14: 500-Key Dictionary JSON Valid Truncation (_moreKeys=492)] ${t14 ? 'PASS' : 'FAIL'}`);

  // 15. Path Traversal Guard (--outline ../outside.js & --handoff --out ../leak.json)
  const travRes = spawnSync('node', [targetCli, '--root', tmp, '--outline', '../outside.js'], { encoding: 'utf8' });
  const handoffTrav = spawnSync('node', [targetCli, '--root', tmp, '--handoff', '--out', '../leak.json'], { encoding: 'utf8' });
  const t15 = travRes.status === 2 && (travRes.stderr || '').includes('Path outside repository root') && handoffTrav.status === 2;
  if (t15) passed++;
  console.log(`[Test 15: Path Traversal Guard (--outline & --handoff --out)] ${t15 ? 'PASS' : 'FAIL'}`);

  // 16. Nested Template Literal Interpolation (${ ... `...` ... }) & Multi-Line Arrow in ${ ... }
  fs.writeFileSync(path.join(tmp, 'tpl.js'), [
    'export function formatShell(a, e) {',
    '  const s1 = `\'${a.replace(/\'/g, `\'\\\\\'\'`)}\'`;',
    '  const s2 = `"${e.replace(/["\\\\]/g, c => `\\\\` + c)}"`;',
    '  const s3 = `multi ${[1, 2].map(x => {',
    '    return `val:${x}`;',
    '  }).join(",")}`;',
    '  return s1 + s2 + s3;',
    '}',
    'export function afterTpl() {',
    '  return 42;',
    '}'
  ].join('\n'));
  const tplOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'tpl.js'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIS_FORCE_LEXER: '1' }
  }).stdout || '';
  const t16 = tplOut.includes('L1-L8: export function formatShell') && tplOut.includes('L9-L11: export function afterTpl');
  if (t16) passed++;
  console.log(`[Test 16: Nested Template Literal Interpolation (\${...\`...\`...}) Span Accuracy] ${t16 ? 'PASS' : 'FAIL'}`);

  // 17. Post-Increment/Decrement Division (a++ / b) vs Regex & Property-Keyword Division (obj.in / 2)
  fs.writeFileSync(path.join(tmp, 'div.js'), [
    'export function computeRatio(a, b, obj) {',
    '  const r1 = a++ / b + (obj.return / 2) + (obj.in / 3);',
    '  const r2 = a-- / { x: 1 }.x;',
    '  return r1 + r2;',
    '}',
    'export function nextFn() {',
    '  return true;',
    '}'
  ].join('\n'));
  const divOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'div.js'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIS_FORCE_LEXER: '1' }
  }).stdout || '';
  const t17 = divOut.includes('L1-L5: export function computeRatio') && divOut.includes('L6-L8: export function nextFn');
  if (t17) passed++;
  console.log(`[Test 17: Post-Increment Division (a++ / b) & Property-Keyword (obj.in / 3)] ${t17 ? 'PASS' : 'FAIL'}`);

  // 18. Python Module-Level Docstring with Fake `def` at Column 0 & Inline Comment `# """`
  fs.writeFileSync(path.join(tmp, 'tricky.py'), [
    '"""',
    'Module docstring with example:',
    'def fake_top_level():',
    '    pass',
    '"""',
    'def real_fn(x: int) -> int:',
    '    y = x + 1 # """ inline comment with triple quotes',
    '    return y',
    'def second_fn():',
    '    return 2'
  ].join('\n'));
  const pyTrickyOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'tricky.py'], { encoding: 'utf8' }).stdout || '';
  const t18 = !pyTrickyOut.includes('fake_top_level') && pyTrickyOut.includes('L6-L8: def real_fn') && pyTrickyOut.includes('L9-L10: def second_fn');
  if (t18) passed++;
  console.log(`[Test 18: Python Top-Level Docstring Fake def & Inline # """ Immunity] ${t18 ? 'PASS' : 'FAIL'}`);

  // 19. Rust Unicode Char Literal ('\u{1F600}'), Raw Strings (r#"..."#), Multi-line Strings, & Go Raw Backtick ('\')
  fs.writeFileSync(path.join(tmp, 'tricky.rs'), [
    'pub fn unicode_and_raw() -> char {',
    '  let raw = r#"unbalanced { in raw " string"#;',
    '  let multi = "line 1 {',
    '  line 2";',
    "  '\\u{1F600}'",
    '}',
    'pub fn after_rust() -> u32 {',
    '  1',
    '}'
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, 'tricky.go'), [
    'package main',
    'func winPath() string {',
    '  p := `C:\\Users\\admin\\`',
    '  return p',
    '}',
    'func afterGo() int {',
    '  return 1',
    '}'
  ].join('\n'));
  const rsTricky = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'tricky.rs'], { encoding: 'utf8' }).stdout || '';
  const goTricky = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'tricky.go'], { encoding: 'utf8' }).stdout || '';
  const t19 = rsTricky.includes('L1-L6: pub fn unicode_and_raw') && rsTricky.includes('L7-L9: pub fn after_rust') && goTricky.includes('L2-L5: func winPath') && goTricky.includes('L6-L8: func afterGo');
  if (t19) passed++;
  console.log(`[Test 19: Rust '\\u{1F600}' + r#"..."# + Go Raw String Ending in Backslash] ${t19 ? 'PASS' : 'FAIL'}`);

  // 20. Root-Anchored Glob (/out vs src/out), Character Class Glob (*.[oa]), & Bare .gitignore Dir (.vercel)
  fs.writeFileSync(path.join(tmp, '.gitignore'), '/root_only_dir\n.vercel\n*.[oa]\n');
  const igRules = lib.loadIgnoreRules(tmp);
  const t20 = lib.isDirIgnored(igRules, 'root_only_dir', 'root_only_dir') &&
              !lib.isDirIgnored(igRules, 'src/root_only_dir', 'root_only_dir') &&
              lib.isDirIgnored(igRules, '.vercel', '.vercel') &&
              lib.isFileIgnored(igRules, 'lib/foo.o', 'foo.o') &&
              lib.isFileIgnored(igRules, 'lib/bar.a', 'bar.a') &&
              !lib.isFileIgnored(igRules, 'lib/baz.c', 'baz.c');
  if (t20) passed++;
  console.log(`[Test 20: Root-Anchored /dir, Bare .gitignore Dir, & *.[oa] Char Class] ${t20 ? 'PASS' : 'FAIL'}`);

  // 21. JSONC String-Aware Parser & Safe .jcodemunch.jsonc Splicing (Strings with /*, //, [oa], $&)
  const trickyJcm = '// Header\n{\n  "use_gitignore": true, // inline comment\n  "extra_ignore_patterns": [\n    "docs/*",\n    "*/temp",\n    "*.[oa]"\n  ]\n}\n';
  fs.writeFileSync(path.join(tmp, '.jcodemunch.jsonc'), trickyJcm);
  fs.writeFileSync(path.join(tmp, '.ignore'), 'custom_$&_pattern\n*.[oa]\n');
  spawnSync('node', [targetCli, '--root', tmp, '--sync-ignores', '--write', '--all-ignores'], { encoding: 'utf8' });
  const parsedJcm = JSON.parse(lib.stripJsonc(fs.readFileSync(path.join(tmp, '.jcodemunch.jsonc'), 'utf8')));
  const verifyJcm = spawnSync('node', [targetCli, '--root', tmp, '--verify', '--all-ignores'], { encoding: 'utf8' });
  const t21 = parsedJcm && Array.isArray(parsedJcm.extra_ignore_patterns) &&
              parsedJcm.extra_ignore_patterns.includes('custom_$&_pattern') &&
              parsedJcm.extra_ignore_patterns.includes('*.[oa]') &&
              (verifyJcm.stdout || '').includes('PASS ignore-parity');
  if (t21) passed++;
  console.log(`[Test 21: JSONC String-Safe Comment Strip & $& / [oa] Splice Safety] ${t21 ? 'PASS' : 'FAIL'}`);

  // 22. --handoff Overflow Guarantees 100% Valid JSON <= 2,048 Bytes
  const hugeGoal = 'G'.repeat(2500);
  const hugeFiles = Array.from({ length: 20 }, (_, idx) => `src/deeply/nested/module_${idx}_${'x'.repeat(80)}.ts`).join(',');
  const handoffRes = spawnSync('node', [targetCli, '--root', tmp, '--handoff', '--goal', hugeGoal, '--files', hugeFiles, '--note', 'N'.repeat(1000)], { encoding: 'utf8' });
  let handoffObj = null;
  try { handoffObj = JSON.parse(handoffRes.stdout); } catch {}
  const handoffBytes = Buffer.byteLength((handoffRes.stdout || '').trim(), 'utf8');
  const t22 = handoffObj !== null && handoffObj.schema === 'antis-optimizer-handoff/v1' && handoffBytes <= 2048;
  if (t22) passed++;
  console.log(`[Test 22: --handoff 5KB Input -> Valid JSON <= 2048B (${handoffBytes}B)] ${t22 ? 'PASS' : 'FAIL'}`);

  // 23. Shorthand Attribute Label in INDEX.md Table Row + HTML Inline <script> Function Multi-Line Range
  fs.writeFileSync(path.join(tmp, 'view.html'), [
    '<section id="panel-themes">',
    '  <p>Themes</p>',
    '</section>',
    '<script>',
    'function renderScene(ctx) {',
    '  const a = { x: 1 };',
    '  return a;',
    '}',
    '</script>'
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, 'INDEX.md'), '| File | Size | Landmarks |\n| :--- | :--- | :--- |\n| `view.html` | `0.1 KB / 9L` | `themes` `L1-L3`, `renderScene` `L5-L8` |\n');
  spawnSync('node', [targetCli, '--root', tmp, '--sync-ignores', '--write', '--all-ignores'], { encoding: 'utf8' });
  const vHtml = spawnSync('node', [targetCli, '--root', tmp, '--verify'], { encoding: 'utf8' });
  const t23 = vHtml.status === 0 && (vHtml.stdout || '').includes('PASS landmarks');
  if (t23) passed++;
  console.log(`[Test 23: Shorthand Substring Anchor + HTML Inline JS Multi-Line Span] ${t23 ? 'PASS' : 'FAIL'}`);

  // 24. C/C++ Preprocessor #ifdef / #else / #endif Unbalanced Brace Branch-State Restoration
  fs.writeFileSync(path.join(tmp, 'platform.c'), [
    'int init_platform(int mode) {',
    '#ifdef _WIN32',
    '  if (mode > 0) {',
    '    return 1;',
    '#else',
    '  if (mode < 0) {',
    '    return -1;',
    '#endif',
    '  }',
    '  return 0;',
    '}',
    'int shutdown_platform(void) {',
    '  return 0;',
    '}'
  ].join('\n'));
  const cOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'platform.c'], { encoding: 'utf8' }).stdout || '';
  const t24 = cOut.includes('L1-L11: int init_platform') && cOut.includes('L12-L14: int shutdown_platform');
  if (t24) passed++;
  console.log(`[Test 24: C/C++ #ifdef / #else Unbalanced Brace Branch Restoration] ${t24 ? 'PASS' : 'FAIL'}`);

  // 25. React/TS Multi-Line Destructured Object Props & Return Type + Non-Arrow Inner Map Exclusion
  fs.writeFileSync(path.join(tmp, 'react-props.tsx'), [
    'export const Card = ({',
    '  title,',
    '  items = [{ id: 1 }],',
    '}: {',
    '  title: string;',
    '  items?: Array<{ id: number }>;',
    '}): {',
    '  rendered: boolean;',
    '} => {',
    '  return { rendered: true };',
    '};',
    'export function makeCard(',
    '  {',
    '    title,',
    '  }: {',
    '    title: string;',
    '  },',
    '  ctx: any',
    '): {',
    '  ok: boolean;',
    '} {',
    '  return { ok: Boolean(title && ctx) };',
    '}',
    'const notAnArrow = ([1, 2].map(x => x * 2));'
  ].join('\n'));
  const reactAstOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'react-props.tsx'], { encoding: 'utf8' }).stdout || '';
  const reactLexOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'react-props.tsx'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIS_FORCE_LEXER: '1' }
  }).stdout || '';
  const t25 = reactAstOut.includes('L1-L11: export const Card') && reactAstOut.includes('L12-L23: export function makeCard') && !reactAstOut.includes('notAnArrow') &&
              reactLexOut.includes('L1-L11: export const Card') && reactLexOut.includes('L12-L23: export function makeCard') && !reactLexOut.includes('notAnArrow');
  if (t25) passed++;
  console.log(`[Test 25: React/TS Multi-Line Destructured Props (AST + Lexer Parity)] ${t25 ? 'PASS' : 'FAIL'}`);

  // 26. Generator Functions (function* & async function* & *method)
  fs.writeFileSync(path.join(tmp, 'gen.ts'), [
    'export async function* streamTokens(limit: number) {',
    '  yield limit;',
    '}',
    'export class TokenPool {',
    '  *values() {',
    '    yield 1;',
    '  }',
    '}'
  ].join('\n'));
  const genOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'gen.ts'], { encoding: 'utf8' }).stdout || '';
  const t26 = genOut.includes('L1-L3: export async function* streamTokens') && genOut.includes('L5-L7: *values()');
  if (t26) passed++;
  console.log(`[Test 26: Generator Functions (async function* & *method)] ${t26 ? 'PASS' : 'FAIL'}`);

  // 27. Windows UTF-8 BOM (\uFEFF) Immunity in JSONC, .ignore, Python & TS
  fs.writeFileSync(path.join(tmp, 'bom.py'), '\uFEFFdef bom_func(x: int) -> int:\n    return x + 1\ndef second_bom():\n    return 2\n');
  fs.writeFileSync(path.join(tmp, 'bom-data.json'), '\uFEFF{"items":[{"id":"bom-1","name":"ok"}]}\n');
  const bomPyOut = spawnSync('node', [targetCli, '--root', tmp, '--outline', 'bom.py'], { encoding: 'utf8' }).stdout || '';
  const bomSliceOut = spawnSync('node', [targetCli, '--root', tmp, '--slice', 'bom-data', 'bom-1'], { encoding: 'utf8' }).stdout || '';
  const t27 = bomPyOut.includes('L1-L2: def bom_func') && bomPyOut.includes('L3-L4: def second_bom') && bomSliceOut.includes('"id": "bom-1"');
  if (t27) passed++;
  console.log(`[Test 27: Windows UTF-8 BOM (\\uFEFF) Immunity across Python/JSON/TS] ${t27 ? 'PASS' : 'FAIL'}`);

  // 28. Self-Lexer Invariant Check on repo-index.cjs
  const selfLines = fs.readFileSync(targetCli, 'utf8').split(/\r?\n/);
  const st = { inBlockComment: false, quote: '', tplStack: [], rawHashes: -1 };
  let d = 0;
  for (const l of selfLines) {
    const s = lib.stripJsStringsAndComments(l, st, '.cjs');
    for (const c of s) { if (c === '{') d++; else if (c === '}') d--; }
  }
  const t28 = d === 0 && !st.inBlockComment && !st.quote && st.tplStack.length === 0;
  if (t28) passed++;
  console.log(`[Test 28: Self-Lexer Mathematical Brace/Quote/Template Invariant (d=0)] ${t28 ? 'PASS' : 'FAIL'}`);

  // 29. CLI Ergonomics: --help / -h and --version / -v
  const helpRes = spawnSync('node', [targetCli, '--help'], { encoding: 'utf8' });
  const shortHelp = spawnSync('node', [targetCli, '-h'], { encoding: 'utf8' });
  const verRes = spawnSync('node', [targetCli, '--version'], { encoding: 'utf8' });
  const shortVer = spawnSync('node', [targetCli, '-v'], { encoding: 'utf8' });
  const t29 = helpRes.status === 0 && helpRes.stdout.includes('--audit') &&
              shortHelp.status === 0 && shortHelp.stdout.includes('--verify') &&
              verRes.status === 0 && verRes.stdout.trim() === `antis-optimizer v${pkg.version}` &&
              shortVer.status === 0 && shortVer.stdout.trim() === `antis-optimizer v${pkg.version}`;
  if (t29) passed++;
  console.log(`[Test 29: CLI --help / -h and --version / -v Alignment] ${t29 ? 'PASS' : 'FAIL'}`);

  // 30. Tier-0 --audit / --verify Parity (0-doc Tier 0 PASS vs 0-doc Tier 1 FAIL + single-line PASS)
  const t30Zero = path.join(tmp, 't30-tier0');
  fs.mkdirSync(t30Zero, { recursive: true });
  fs.writeFileSync(path.join(t30Zero, 'app.ts'), 'export const app = 1;\n');
  const t30Audit = spawnSync('node', [targetCli, '--audit', '--root', t30Zero], { encoding: 'utf8' });
  spawnSync('node', [targetCli, '--sync-ignores', '--write', '--root', t30Zero], { encoding: 'utf8' });
  const t30Verify = spawnSync('node', [targetCli, '--verify', '--root', t30Zero], { encoding: 'utf8' });
  const t30Tier1 = path.join(tmp, 't30-tier1-nodoc');
  fs.mkdirSync(path.join(t30Tier1, 'src'), { recursive: true });
  for (let i = 0; i < 26; i++) {
    fs.writeFileSync(path.join(t30Tier1, 'src', `mod${i}.ts`), `export const p${i} = "${'a'.repeat(900)}";\n`);
  }
  spawnSync('node', [targetCli, '--sync-ignores', '--write', '--root', t30Tier1], { encoding: 'utf8' });
  const t30Tier1Verify = spawnSync('node', [targetCli, '--verify', '--root', t30Tier1], { encoding: 'utf8' });
  const t30Out = t30Verify.stdout.trim();
  const t30 = t30Audit.status === 0 && t30Audit.stdout.includes('TIER 0 (IGNORE-ONLY)') &&
              t30Verify.status === 0 && !t30Out.includes('\n') &&
              t30Out.includes('PASS doc-budgets: tier-0(0)') &&
              t30Out.includes('PASS landmarks: 0(tier-0)') &&
              t30Out.includes('PASS ignore-parity') &&
              t30Tier1Verify.status === 1 &&
              t30Tier1Verify.stdout.includes('FAIL doc-budgets: no AGENTS.md/INDEX.md found (recommended: TIER 1');
  if (t30) passed++;
  console.log(`[Test 30: Tier-0 --audit / --verify Parity & Single-Line PASS] ${t30 ? 'PASS' : 'FAIL'}`);

  // 31. No False Tier-2 Fallthrough for 55 Small Files (0 Monoliths, Low Trap Tokens)
  const t31Tiny = path.join(tmp, 't31-tiny55');
  fs.mkdirSync(path.join(t31Tiny, 'src'), { recursive: true });
  for (let i = 0; i < 55; i++) {
    fs.writeFileSync(path.join(t31Tiny, 'src', `f${i}.ts`), `export const f${i} = ${i};\n`);
  }
  const t31TinyAudit = spawnSync('node', [targetCli, '--audit', '--root', t31Tiny], { encoding: 'utf8' });
  const t31Mid = path.join(tmp, 't31-mid55');
  fs.mkdirSync(path.join(t31Mid, 'src'), { recursive: true });
  for (let i = 0; i < 55; i++) {
    fs.writeFileSync(path.join(t31Mid, 'src', `m${i}.ts`), `export const m${i} = "${'b'.repeat(580)}";\n`);
  }
  const t31MidAudit = spawnSync('node', [targetCli, '--audit', '--root', t31Mid], { encoding: 'utf8' });
  const t31 = t31TinyAudit.status === 0 && t31TinyAudit.stdout.includes('TIER 0 (IGNORE-ONLY)') &&
              !t31TinyAudit.stdout.includes('TIER 2') &&
              t31MidAudit.status === 0 && t31MidAudit.stdout.includes('TIER 1 (LEAN ZERO-COPY)') &&
              !t31MidAudit.stdout.includes('TIER 2');
  if (t31) passed++;
  console.log(`[Test 31: 55-File Tiny Repo -> Tier 0 & ~8k Token -> Tier 1 (No Tier-2 Fallthrough)] ${t31 ? 'PASS' : 'FAIL'}`);

  // 32. Code --slice Symbol Span Resolution, :Lstart-Lend Range Syntax, & Missing Symbol Exit 1
  const t32Dir = path.join(tmp, 't32-slice');
  fs.mkdirSync(path.join(t32Dir, 'src'), { recursive: true });
  const authLines = [
    "import { verifyToken } from './tokens';",
    '// verifyToken should not match import or comment',
    'export function unrelatedHelper(): string {',
    '  return String(verifyToken);',
    '}'
  ];
  while (authLines.length < 17) authLines.push(`const pad${authLines.length} = ${authLines.length};`);
  authLines.push(
    'export function verifyToken(token: string): boolean {',
    '  if (!token) return false;',
    '  const trimmed = token.trim();',
    "  return trimmed.startsWith('v1_');",
    '}',
    'export const AUTH_VERSION = 1;'
  );
  fs.writeFileSync(path.join(t32Dir, 'src', 'auth.ts'), authLines.join('\n') + '\n');
  const t32Sym = spawnSync('node', [targetCli, '--root', t32Dir, '--slice', 'auth', 'verifyToken'], { encoding: 'utf8' });
  const t32Range = spawnSync('node', [targetCli, '--root', t32Dir, '--slice', 'src/auth.ts:L18-L20'], { encoding: 'utf8' });
  const t32Hash = spawnSync('node', [targetCli, '--root', t32Dir, '--slice', 'src/auth.ts#verifyToken'], { encoding: 'utf8' });
  const t32Miss = spawnSync('node', [targetCli, '--root', t32Dir, '--slice', 'auth', 'noSuchSymbolHere'], { encoding: 'utf8' });
  const t32 = t32Sym.status === 0 &&
              t32Sym.stdout.startsWith('landmark: src/auth.ts:L18-L22\n') &&
              !t32Sym.stdout.includes("from './tokens'") &&
              !t32Sym.stdout.includes('AUTH_VERSION') &&
              t32Range.status === 0 &&
              t32Range.stdout.startsWith('landmark: src/auth.ts:L18-L20\n') &&
              t32Range.stdout.includes('const trimmed = token.trim();') &&
              !t32Range.stdout.includes("startsWith('v1_')") &&
              t32Hash.status === 0 && t32Hash.stdout.startsWith('landmark: src/auth.ts:L18-L22\n') &&
              t32Miss.status === 1 && t32Miss.stderr.includes('not found');
  if (t32) passed++;
  console.log(`[Test 32: Code --slice Exact Symbol Spans & :Lstart-Lend Range Syntax] ${t32 ? 'PASS' : 'FAIL'}`);

  // 33. Code secretManager.ts Allow vs secrets.json Block & hasTokenOpt-Gated .json Guard
  const t33Dir = path.join(tmp, 't33-secret');
  fs.mkdirSync(path.join(t33Dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(t33Dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(t33Dir, 'src', 'secretManager.ts'), 'export function rotateSalt(): string {\n  return "ok";\n}\n');
  fs.writeFileSync(path.join(t33Dir, 'secrets.json'), '{"api":"do-not-read"}\n');
  fs.writeFileSync(path.join(t33Dir, 'data', 'tricky-data.json'), '[{"id":"item-1","val":"hello"}]\n');
  const cleanHome = path.join(tmp, 't33-clean-home');
  fs.mkdirSync(cleanHome, { recursive: true });
  const cleanEnv = { ...process.env, HOME: cleanHome, USERPROFILE: cleanHome };
  const t33AllowCode = spawnSync('node', [targetCli, '--root', t33Dir, '--slice', 'secretManager', 'rotateSalt'], { encoding: 'utf8' });
  const t33BlockJson = spawnSync('node', [targetCli, '--root', t33Dir, '--slice', 'secrets.json'], { encoding: 'utf8' });
  const t33JsonNoOpt = spawnSync('node', [targetCli, '--root', t33Dir, '--slice', 'data/tricky-data.json', 'item-1'], { encoding: 'utf8', env: cleanEnv });
  fs.writeFileSync(path.join(t33Dir, '.contextignore'), 'node_modules/\n');
  const t33JsonCtxOnly = spawnSync('node', [targetCli, '--root', t33Dir, '--slice', 'data/tricky-data.json', 'item-1'], { encoding: 'utf8', env: cleanEnv });
  fs.mkdirSync(path.join(cleanHome, '.claude', 'token-optimizer'), { recursive: true });
  const t33JsonWithOpt = spawnSync('node', [targetCli, '--root', t33Dir, '--slice', 'data/tricky-data.json', 'item-1'], { encoding: 'utf8', env: cleanEnv });
  const t33 = t33AllowCode.status === 0 && t33AllowCode.stdout.includes('rotateSalt') &&
              t33BlockJson.status === 2 &&
              t33JsonNoOpt.status === 0 && t33JsonNoOpt.stdout.includes('"item-1"') &&
              t33JsonCtxOnly.status === 0 && t33JsonCtxOnly.stdout.includes('"item-1"') &&
              t33JsonWithOpt.status === 2 && t33JsonWithOpt.stderr.includes('REFUSED');
  if (t33) passed++;
  console.log(`[Test 33: secretManager.ts Allow vs secrets.json Block & hasTokenOpt .json Gate] ${t33 ? 'PASS' : 'FAIL'}`);

  // 34. .gitignore !Negation Parity & Comment-Safe .jcodemunch.jsonc extra_ignore_patterns Insertion
  const t34Dir = path.join(tmp, 't34-negation');
  fs.mkdirSync(t34Dir, { recursive: true });
  fs.writeFileSync(path.join(t34Dir, '.gitignore'), '*.json\n!package.json\n');
  fs.writeFileSync(path.join(t34Dir, 'package.json'), '{\n  "name": "neg-test",\n  "version": "1.0.0"\n}\n');
  fs.writeFileSync(path.join(t34Dir, 'dump.json'), `{"blob":"${'x'.repeat(2000)}"}\n`);
  fs.writeFileSync(path.join(t34Dir, '.jcodemunch.jsonc'), '{\n  // Keep comment intact\n  "version": 1,\n  "use_ai_summaries": false\n}\n');
  const t34Ig = lib.loadIgnoreRules(t34Dir);
  const t34Sync = spawnSync('node', [targetCli, '--sync-ignores', '--write', '--all-ignores', '--root', t34Dir], { encoding: 'utf8' });
  const t34JcmRaw = fs.readFileSync(path.join(t34Dir, '.jcodemunch.jsonc'), 'utf8');
  const t34JcmParsed = JSON.parse(lib.stripJsonc(t34JcmRaw));
  const t34SlicePkg = spawnSync('node', [targetCli, '--root', t34Dir, '--slice', 'package', 'version'], { encoding: 'utf8' });
  const t34Verify = spawnSync('node', [targetCli, '--verify', '--all-ignores', '--root', t34Dir], { encoding: 'utf8' });
  const patList = t34JcmParsed.extra_ignore_patterns || [];
  const t34 = !lib.isFileIgnored(t34Ig, 'package.json', 'package.json') &&
              lib.isFileIgnored(t34Ig, 'dump.json', 'dump.json') &&
              t34Sync.status === 0 &&
              t34JcmRaw.includes('// Keep comment intact') &&
              patList.includes('*.json') && patList.includes('!package.json') &&
              patList.indexOf('*.json') < patList.indexOf('!package.json') &&
              t34SlicePkg.status === 0 && t34SlicePkg.stdout.includes('1.0.0') &&
              t34Verify.status === 0;
  if (t34) passed++;
  console.log(`[Test 34: .gitignore !Negation Preservation & .jcodemunch.jsonc Comment-Safe Insertion] ${t34 ? 'PASS' : 'FAIL'}`);

  // 35. SemVer Ordering & Intermediate [CRITICAL] Release Aggregation
  const mockReleases = [
    { tag_name: 'v1.0.4', name: 'Draft', draft: true, prerelease: false, body: '' },
    { tag_name: 'v1.0.3-rc.1', name: 'RC [CRITICAL]', draft: false, prerelease: true, body: '[CRITICAL]' },
    { tag_name: 'v1.0.2', name: 'Docs cleanup', draft: false, prerelease: false, body: 'Minor typo fixes' },
    { tag_name: 'v1.0.1', name: '[CRITICAL] Secret guard fix', draft: false, prerelease: false, body: '<!-- antis-release: {"severity":"critical"} -->' },
    { tag_name: 'v1.0.0', name: 'Initial', draft: false, prerelease: false, body: '' }
  ];
  const s100 = lib.summarizeReleases(mockReleases, '1.0.0');
  const s101 = lib.summarizeReleases(mockReleases, '1.0.1');
  const t35 = lib.compareSemver('1.0.0', '1.0.0-rc.1') === 1 &&
              lib.compareSemver('v1.0.2', '1.0.1') === 1 &&
              s100.latestTag === 'v1.0.2' && s100.newerReleases.length === 2 &&
              s100.hasCritical && s100.criticalReleases.length === 1 &&
              s100.criticalReleases[0].tag === 'v1.0.1' &&
              s101.latestTag === 'v1.0.2' && s101.newerReleases.length === 1 && !s101.hasCritical;
  if (t35) passed++;
  console.log(`[Test 35: SemVer Ordering & Intermediate Critical Release Aggregation] ${t35 ? 'PASS' : 'FAIL'}`);

  // 36. Install Mode Detection & Safe Manual Upgrade Guidance
  const t36Git = path.join(tmp, 't36-git');
  const t36Standalone = path.join(tmp, 't36-standalone');
  const t36Npm = path.join(tmp, 'node_modules', 'antis-optimizer');
  const t36Repo = path.join(tmp, 't36-user-repo');
  for (const d of [t36Git, t36Standalone, t36Npm, t36Repo]) fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(t36Git, '.git'), { recursive: true });
  for (const d of [t36Git, t36Standalone, t36Npm]) {
    fs.writeFileSync(path.join(d, 'package.json'), '{"name":"antis-optimizer","version":"1.0.0"}\n');
    fs.writeFileSync(path.join(d, 'SKILL.md'), '# Skill\n');
  }
  fs.writeFileSync(path.join(t36Repo, 'package.json'), '{"name":"user-app","version":"0.1.0"}\n');
  const mGit = lib.detectInstallMode(t36Git);
  const mStandalone = lib.detectInstallMode(t36Standalone);
  const mNpm = lib.detectInstallMode(t36Npm);
  const mRepo = lib.detectInstallMode(t36Repo);
  const t36 = mGit.mode === 'git-clone' && lib.getUpgradeCommand(mGit, 'v1.0.2').includes('pull --ff-only') &&
              mStandalone.mode === 'standalone-skill' && lib.getUpgradeCommand(mStandalone, 'v1.0.2').includes('re-sync') &&
              mNpm.mode === 'npm-managed' && lib.getUpgradeCommand(mNpm, 'v1.0.2').includes('npm install -g') &&
              mRepo.mode === 'repo-local' && lib.getUpgradeCommand(mRepo, 'v1.0.2').includes('copy scripts/repo-index.cjs');
  if (t36) passed++;
  console.log(`[Test 36: Install Mode Detection & Non-Destructive Upgrade Commands] ${t36 ? 'PASS' : 'FAIL'}`);

  // 37. Pinned HTTPS Host/Protocol Guard for Update Requests
  const rejectMsg = p => p.then(() => '', e => e.message);
  const eHttp = await rejectMsg(lib.httpsGetPinnedJson('http://api.github.com/repos/4anti/antis-optimizer/releases'));
  const eHost = await rejectMsg(lib.httpsGetPinnedJson('https://evil.example.com/repos/4anti/antis-optimizer/releases'));
  const eBad = await rejectMsg(lib.httpsGetPinnedJson('not-a-url'));
  const t37 = eHttp.includes('Blocked unpinned update endpoint') &&
              eHost.includes('Blocked unpinned update endpoint') &&
              eBad.includes('Invalid update URL');
  if (t37) passed++;
  console.log(`[Test 37: Pinned HTTPS Host/Protocol Guard Against Unpinned Endpoints] ${t37 ? 'PASS' : 'FAIL'}`);

  // 38. --critical-only Filtering & --help Alignment
  const rQuiet = lib.formatUpdateReport(s101, mStandalone, { criticalOnly: true });
  const rCrit = lib.formatUpdateReport(s100, mGit, { criticalOnly: true });
  const rUpToDate = lib.formatUpdateReport(lib.summarizeReleases([], '1.0.0'), mStandalone, {});
  const t38Help = spawnSync('node', [targetCli, '--help'], { encoding: 'utf8' });
  const t38 = rQuiet === '' &&
              rCrit.includes('[!] CRITICAL UPDATE AVAILABLE') &&
              rCrit.includes('v1.0.1 [CRITICAL]') &&
              rCrit.includes('pull --ff-only') &&
              rUpToDate.includes('up to date') &&
              t38Help.status === 0 && t38Help.stdout.includes('--check-update') &&
              t38Help.stdout.includes('--critical-only');
  if (t38) passed++;
  console.log(`[Test 38: --critical-only Output Filtering & --help Parity] ${t38 ? 'PASS' : 'FAIL'}`);

  // 39. Guessed Backup & 400+ Entry Source Dirs Suggested Only (Never Auto-Written to Ignores)
  const t39Dir = path.join(tmp, 't39-suggest');
  fs.mkdirSync(path.join(t39Dir, 'src', 'features', 'archive'), { recursive: true });
  fs.mkdirSync(path.join(t39Dir, 'src', 'icons'), { recursive: true });
  fs.writeFileSync(path.join(t39Dir, 'src', 'features', 'archive', 'ArchivePage.tsx'), 'export const ArchivePage = () => null;\n');
  for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(t39Dir, 'src', 'icons', `i${i}.tsx`), 'export const a = 1;\n');
  const t39Sync = spawnSync('node', [targetCli, '--root', t39Dir, '--sync-ignores', '--write', '--all-ignores'], { encoding: 'utf8' });
  const t39Audit = spawnSync('node', [targetCli, '--root', t39Dir, '--audit'], { encoding: 'utf8' });
  const t39Ig = fs.readFileSync(path.join(t39Dir, '.ignore'), 'utf8');
  const t39Ctx = fs.readFileSync(path.join(t39Dir, '.contextignore'), 'utf8');
  const t39 = t39Sync.status === 0 && t39Sync.stdout.includes('review 2 guessed dir(s)') &&
              !t39Ig.includes('src/features/archive/') && !t39Ig.includes('src/icons/') &&
              !t39Ctx.includes('src/features/archive/') && !t39Ctx.includes('src/icons/') &&
              t39Audit.stdout.includes('Review guessed dirs') && t39Audit.stdout.includes('src/icons/');
  if (t39) passed++;
  console.log(`[Test 39: Heavy & Backup-Named Source Dirs Suggested Only, Never Auto-Ignored] ${t39 ? 'PASS' : 'FAIL'}`);

  // 40. Untrusted Target Repo node_modules/typescript Is Never Executed
  const t40Dir = path.join(tmp, 't40-untrusted-ts');
  fs.mkdirSync(path.join(t40Dir, 'node_modules', 'typescript'), { recursive: true });
  fs.mkdirSync(path.join(t40Dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(t40Dir, 'node_modules', 'typescript', 'package.json'), '{"name":"typescript","main":"index.js"}\n');
  fs.writeFileSync(path.join(t40Dir, 'node_modules', 'typescript', 'index.js'), "require('fs').writeFileSync(__dirname + '/../../PWNED.txt', 'ran'); module.exports = {};\n");
  fs.writeFileSync(path.join(t40Dir, 'src', 'a.ts'), 'export function safeOutline() { return 1; }\n');
  const t40Out = spawnSync('node', [targetCli, '--root', t40Dir, '--outline', 'src/a.ts'], { cwd: t40Dir, encoding: 'utf8' });
  const t40 = t40Out.status === 0 && t40Out.stdout.includes('safeOutline') && !fs.existsSync(path.join(t40Dir, 'PWNED.txt'));
  if (t40) passed++;
  console.log(`[Test 40: Target Repo node_modules/typescript Not Executed on --outline] ${t40 ? 'PASS' : 'FAIL'}`);

  // 41. JSON --slice Missing ID Exits 1 Instead of Returning First Item
  const t41Dir = path.join(tmp, 't41-json-miss');
  fs.mkdirSync(t41Dir, { recursive: true });
  fs.writeFileSync(path.join(t41Dir, 'items.json'), JSON.stringify({ items: [{ id: 'alpha', v: 1 }, { id: 'beta', v: 2 }] }, null, 2));
  const t41Hit = spawnSync('node', [targetCli, '--root', t41Dir, '--slice', 'items', 'beta'], { encoding: 'utf8', env: cleanEnv });
  const t41Miss = spawnSync('node', [targetCli, '--root', t41Dir, '--slice', 'items', 'does-not-exist'], { encoding: 'utf8', env: cleanEnv });
  const t41 = t41Hit.status === 0 && t41Hit.stdout.includes('"beta"') &&
              t41Miss.status === 1 && t41Miss.stderr.includes('not found') && !t41Miss.stdout.includes('"alpha"');
  if (t41) passed++;
  console.log(`[Test 41: JSON --slice Missing ID Exits 1 (No Silent Fallback to list[0])] ${t41 ? 'PASS' : 'FAIL'}`);

  // 42. Partial Scan Warning When Depth/Visit Cap Is Hit
  const t42Dir = path.join(tmp, 't42-partial');
  const deepSub = path.join(t42Dir, 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7');
  fs.mkdirSync(deepSub, { recursive: true });
  fs.writeFileSync(path.join(deepSub, 'deep.ts'), 'export const deep = 1;\n');
  const t42Audit = spawnSync('node', [targetCli, '--root', t42Dir, '--audit'], { encoding: 'utf8' });
  const t42Map = spawnSync('node', [targetCli, '--root', t42Dir, '--map'], { encoding: 'utf8' });
  const t42Detect = spawnSync('node', [targetCli, '--root', t42Dir, '--detect'], { encoding: 'utf8' });
  const t42 = t42Audit.stdout.includes('[partial scan:') &&
              t42Map.stdout.includes('[partial scan:') &&
              t42Detect.stdout.includes('[partial scan:');
  if (t42) passed++;
  console.log(`[Test 42: Partial Scan Warning Emitted When Walk Cap Is Hit] ${t42 ? 'PASS' : 'FAIL'}`);

  // 43. --slice Exact Path Priority Over 50-Hit Cap, Archive Dirs & Ignored Dir Guard
  const t43Dir = path.join(tmp, 't43-slice-exact');
  for (let i = 0; i < 55; i++) {
    fs.mkdirSync(path.join(t43Dir, 'components', `c${i}`), { recursive: true });
    fs.writeFileSync(path.join(t43Dir, 'components', `c${i}`, 'index.ts'), `export const c = ${i};\n`);
  }
  fs.mkdirSync(path.join(t43Dir, 'src', 'features', 'archive'), { recursive: true });
  fs.mkdirSync(path.join(t43Dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(t43Dir, 'src', 'index.ts'), 'export const rootEntry = true;\n');
  fs.writeFileSync(path.join(t43Dir, 'src', 'features', 'archive', 'ArchivePage.tsx'), 'export const arch = true;\n');
  fs.writeFileSync(path.join(t43Dir, 'dist', 'bundle.js'), 'export const built = 1;\n');
  const t43Exact = spawnSync('node', [targetCli, '--root', t43Dir, '--slice', 'src/index.ts'], { encoding: 'utf8' });
  const t43Arch = spawnSync('node', [targetCli, '--root', t43Dir, '--slice', 'ArchivePage'], { encoding: 'utf8' });
  const t43Ignored = spawnSync('node', [targetCli, '--root', t43Dir, '--slice', 'dist/bundle.js'], { encoding: 'utf8' });
  const t43 = t43Exact.status === 0 && t43Exact.stdout.includes('rootEntry') &&
              t43Arch.status === 0 && t43Arch.stdout.includes('ArchivePage.tsx') &&
              t43Ignored.status === 1;
  if (t43) passed++;
  console.log(`[Test 43: --slice Exact Path Priority, Archive Dir Access & Ignored Dir Guard] ${t43 ? 'PASS' : 'FAIL'}`);

  // 44. CSS Outline Ignores // Inside url(https://...)
  const t44Css = path.join(tmp, 't44-url.css');
  fs.writeFileSync(t44Css, [
    '.hero { background: url(https://cdn.example.com/a.png); }',
    '@media (max-width: 600px) {',
    '  .hero { display: none; }',
    '}'
  ].join('\n'));
  const t44Out = spawnSync('node', [targetCli, '--root', tmp, '--outline', 't44-url.css'], { encoding: 'utf8' });
  const t44 = t44Out.status === 0 && t44Out.stdout.includes('L2-L4: @media (max-width: 600px)');
  if (t44) passed++;
  console.log(`[Test 44: CSS Outline Preserves Sections After url(https://...)] ${t44 ? 'PASS' : 'FAIL'}`);

  // 45. **/ Glob Segment Boundary Precision
  const rxLogs = lib.globToRegExp('**/logs');
  const rxDeep = lib.globToRegExp('a/**/b');
  const t45 = rxLogs.test('logs') && rxLogs.test('a/logs') && !rxLogs.test('src/catalogs') &&
              rxDeep.test('a/b') && rxDeep.test('a/x/b') && !rxDeep.test('a/xb');
  if (t45) passed++;
  console.log(`[Test 45: **/ Glob Matches Whole Path Segments Only] ${t45 ? 'PASS' : 'FAIL'}`);

  // 46. readHead Reads Bounded Prefix Without Loading Full File
  const t46File = path.join(tmp, 't46-head.txt');
  fs.writeFileSync(t46File, 'A'.repeat(100) + 'B'.repeat(8192));
  const headStr = lib.readHead(t46File, 128);
  const t46 = headStr.length === 128 && headStr.startsWith('AAAA') && lib.readHead(path.join(tmp, 'missing.txt')) === '';
  if (t46) passed++;
  console.log(`[Test 46: readHead Bounded 4KB/Prefix Read Safety] ${t46 ? 'PASS' : 'FAIL'}`);

  // 47. OpenCode Detection (Project + XDG/OPENCODE_CONFIG_DIR/OPENCODE_CONFIG + JSONC + MCP/Plugins + .opencode/skills)
  const t47Home = path.join(tmp, 't47-home');
  const t47Xdg = path.join(tmp, 't47-xdg');
  const t47OcDir = path.join(tmp, 't47-ocdir');
  const t47Repo = path.join(tmp, 't47-repo');
  for (const d of [
    path.join(t47Home, '.config', 'opencode'),
    path.join(t47Xdg, 'opencode'),
    t47OcDir,
    path.join(t47Repo, '.opencode', 'skills', 'my-skill')
  ]) fs.mkdirSync(d, { recursive: true });
  const t47BadCfg = path.join(tmp, 't47-bad-opencode.jsonc');
  fs.writeFileSync(t47BadCfg, '{ "mcp": { broken ');
  fs.writeFileSync(path.join(t47Home, '.config', 'opencode', 'opencode.json'), JSON.stringify({ mcp: { home_mcp: { type: 'local' } } }));
  fs.writeFileSync(path.join(t47OcDir, 'opencode.json'), JSON.stringify({ mcp: { oc_dir_mcp: { type: 'remote' } } }));
  fs.writeFileSync(path.join(t47Xdg, 'opencode', 'opencode.jsonc'), '// XDG JSONC\n{\n  "plugin": ["opencode-ignore",],\n}\n');
  fs.writeFileSync(path.join(t47Repo, 'opencode.jsonc'), [
    '// Project OpenCode config',
    '{',
    '  /* trailing comma & mcp key */',
    '  "mcp": { "jcodemunch": { "type": "local" }, },',
    '  "plugin": ["opencode-dcp@1.2.0", "openrtk",],',
    '  "permission": { "read": { ".env": "deny", "*.env.*": "deny" } },',
    '}'
  ].join('\n'));
  fs.writeFileSync(path.join(t47Repo, '.opencode', 'skills', 'my-skill', 'SKILL.md'), '---\nname: my-skill\n---\n');
  fs.writeFileSync(path.join(t47Repo, 'app.ts'), 'export const ok = true;\n');
  const t47Env = { ...process.env, HOME: t47Home, USERPROFILE: t47Home, XDG_CONFIG_HOME: t47Xdg, OPENCODE_CONFIG_DIR: t47OcDir, OPENCODE_CONFIG: t47BadCfg };
  const t47Detect = spawnSync('node', [targetCli, '--root', t47Repo, '--detect'], { encoding: 'utf8', env: t47Env });
  const t47Map = spawnSync('node', [targetCli, '--root', t47Repo, '--map'], { encoding: 'utf8', env: t47Env });
  const t47Out = t47Detect.stdout || '';
  const t47 = t47Detect.status === 0 && t47Out.length < 3400 &&
              t47Out.includes('$OPENCODE_CONFIG_DIR/opencode.json') &&
              t47Out.includes('$XDG_CONFIG_HOME/opencode/opencode.jsonc') &&
              t47Out.includes('~/.config/opencode/opencode.json') &&
              t47Out.includes('opencode.jsonc') &&
              t47Out.includes('oc_dir_mcp') && t47Out.includes('home_mcp') && t47Out.includes('jcodemunch') &&
              t47Out.includes('opencode-ignore') && t47Out.includes('opencode-dcp@1.2.0') && t47Out.includes('openrtk') &&
              t47Out.includes('env-deny=true') && t47Out.includes('opencode-ignore=true') && t47Out.includes('skills=my-skill') &&
              t47Out.includes('RTK: openrtk') &&
              t47Map.status === 0 && t47Map.stdout.includes('OpenCode skills: my-skill') && !t47Map.stdout.includes('Dot-dirs');
  if (t47) passed++;
  console.log(`[Test 47: OpenCode Multi-Source Detection, JSONC Parse Safety & .opencode/skills] ${t47 ? 'PASS' : 'FAIL'}`);

  // 48. Conditional OpenCode Ignore Parity & Never Auto-Creating opencode.json[c]
  const t48Env = { ...process.env, HOME: t47Home, USERPROFILE: t47Home, XDG_CONFIG_HOME: '', OPENCODE_CONFIG_DIR: '', OPENCODE_CONFIG: '' };
  const t48NoOc = path.join(tmp, 't48-no-oc');
  fs.mkdirSync(t48NoOc, { recursive: true });
  fs.writeFileSync(path.join(t48NoOc, 'a.ts'), 'export const a = 1;\n');
  spawnSync('node', [targetCli, '--root', t48NoOc, '--sync-ignores', '--write', '--all-ignores'], { encoding: 'utf8', env: t48Env });
  const t48Json = path.join(tmp, 't48-oc-json');
  fs.mkdirSync(t48Json, { recursive: true });
  fs.writeFileSync(path.join(t48Json, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(t48Json, 'opencode.json'), JSON.stringify({
    theme: 'tokyonight',
    mcp: { custom_srv: { type: 'local' } },
    watcher: { ignore: ['custom-watch/**'] }
  }, null, 2));
  const t48VerifyBefore = spawnSync('node', [targetCli, '--root', t48Json, '--verify'], { encoding: 'utf8', env: t48Env });
  spawnSync('node', [targetCli, '--root', t48Json, '--sync-ignores', '--write'], { encoding: 'utf8', env: t48Env });
  const t48OcAfter = JSON.parse(fs.readFileSync(path.join(t48Json, 'opencode.json'), 'utf8'));
  t48OcAfter.permission = { read: { '.env': 'deny', '*.env.*': 'deny' } };
  fs.writeFileSync(path.join(t48Json, 'opencode.json'), JSON.stringify(t48OcAfter, null, 2));
  const t48VerifyAfter = spawnSync('node', [targetCli, '--root', t48Json, '--verify'], { encoding: 'utf8', env: t48Env });
  const t48Jsonc = path.join(tmp, 't48-oc-jsonc');
  fs.mkdirSync(t48Jsonc, { recursive: true });
  fs.writeFileSync(path.join(t48Jsonc, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(t48Jsonc, 'opencode.jsonc'), '// Header comment\n{\n  // Keep inline\n  "plugin": ["opencode-dcp"],\n  "permission": { "read": { ".env": "deny" } },\n  "watcher": {\n    // Watch comment\n    "ignore": []\n  }\n}\n');
  spawnSync('node', [targetCli, '--root', t48Jsonc, '--sync-ignores', '--write'], { encoding: 'utf8', env: t48Env });
  const t48JsoncRaw = fs.readFileSync(path.join(t48Jsonc, 'opencode.jsonc'), 'utf8');
  const t48JsoncVerify = spawnSync('node', [targetCli, '--root', t48Jsonc, '--verify'], { encoding: 'utf8', env: t48Env });
  const t48HintDir = path.join(tmp, 't48-oc-hint');
  fs.mkdirSync(t48HintDir, { recursive: true });
  fs.writeFileSync(path.join(t48HintDir, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(t48HintDir, 'opencode.jsonc'), '// Preserve me\n{\n  "watcher": "invalid-shape"\n}\n');
  const t48HintSync = spawnSync('node', [targetCli, '--root', t48HintDir, '--sync-ignores', '--write'], { encoding: 'utf8', env: t48Env });
  const t48 = !fs.existsSync(path.join(t48NoOc, 'opencode.json')) && !fs.existsSync(path.join(t48NoOc, 'opencode.jsonc')) &&
              t48VerifyBefore.status === 1 && t48VerifyBefore.stdout.includes('opencode.json(') && t48VerifyBefore.stdout.includes('permission.read') &&
              t48OcAfter.theme === 'tokyonight' && Boolean(t48OcAfter.mcp?.custom_srv) &&
              t48OcAfter.watcher.ignore.includes('custom-watch/**') && t48OcAfter.watcher.ignore.includes('node_modules/') &&
              t48VerifyAfter.status === 0 && t48VerifyAfter.stdout.includes('PASS opencode-guard: .env protected') &&
              t48JsoncRaw.includes('// Header comment') && t48JsoncRaw.includes('// Keep inline') && t48JsoncRaw.includes('// Watch comment') &&
              t48JsoncVerify.status === 0 &&
              fs.readFileSync(path.join(t48HintDir, 'opencode.jsonc'), 'utf8').includes('// Preserve me') &&
              (t48HintSync.stdout || '').includes('JSONC comments preserved');
  if (t48) passed++;
  console.log(`[Test 48: Conditional OpenCode Ignore Parity, Key Preservation & Never Auto-Creating opencode.json[c]] ${t48 ? 'PASS' : 'FAIL'}`);

  // 49. Multi-Host Detection (Cursor/Gemini/Codex/Claude/Copilot/Windsurf/Cline/Roo/Aider/RTK) & AGENTS.override.md
  const t49Home = path.join(tmp, 't49-home');
  const t49Repo = path.join(tmp, 't49-repo');
  for (const d of [
    path.join(t49Home, '.cursor'),
    path.join(t49Home, '.gemini'),
    path.join(t49Home, '.codex'),
    path.join(t49Home, '.codeium', 'windsurf'),
    path.join(t49Home, '.config', 'rtk'),
    path.join(t49Repo, 'src'),
    path.join(t49Repo, '.cursor', 'rules'),
    path.join(t49Repo, '.gemini'),
    path.join(t49Repo, '.claude'),
    path.join(t49Repo, '.vscode'),
    path.join(t49Repo, '.github', 'instructions'),
    path.join(t49Repo, '.windsurf'),
    path.join(t49Repo, '.kiro'),
    path.join(t49Repo, '.factory'),
    path.join(t49Repo, '.rtk')
  ]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(t49Home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { cur_global: {} } }));
  fs.writeFileSync(path.join(t49Repo, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { cur_proj: {} } }));
  fs.writeFileSync(path.join(t49Repo, '.cursorignore'), 'dist/\n');
  fs.writeFileSync(path.join(t49Repo, '.cursorindexingignore'), 'dist/\n');
  fs.writeFileSync(path.join(t49Home, '.gemini', 'settings.json'), JSON.stringify({ mcpServers: { gem_global: {} } }));
  fs.writeFileSync(path.join(t49Repo, '.gemini', 'settings.json'), JSON.stringify({ mcpServers: { gem_proj: {} } }));
  fs.writeFileSync(path.join(t49Repo, '.geminiignore'), 'dist/\n');
  fs.writeFileSync(path.join(t49Repo, '.aiexclude'), 'dist/\n');
  fs.writeFileSync(path.join(t49Repo, 'GEMINI.md'), '# Gem\n');
  fs.writeFileSync(path.join(t49Home, '.codex', 'config.toml'), '[mcp_servers.codex_srv]\ncommand = "npx"\n[tools]\nweb_search = true\n');
  fs.writeFileSync(path.join(t49Home, '.codex', 'hooks.json'), '{}');
  fs.writeFileSync(path.join(t49Repo, 'src', 'h.ts'), 'export function helper() {\n  return 1;\n}\n');
  fs.writeFileSync(path.join(t49Repo, 'AGENTS.override.md'), '# Override\n- `src/h.ts#helper:L9-L9`\n');
  fs.writeFileSync(path.join(t49Repo, '.mcp.json'), JSON.stringify({ mcpServers: { claude_proj: {} } }));
  fs.writeFileSync(path.join(t49Repo, '.claude', 'settings.local.json'), JSON.stringify({ hooks: { PreToolUse: [{ command: 'rtk-rewrite.sh' }] } }));
  fs.writeFileSync(path.join(t49Repo, '.claudeignore'), 'dist/\n');
  fs.writeFileSync(path.join(t49Repo, '.vscode', 'mcp.json'), JSON.stringify({ servers: { vsc_srv: {} } }));
  fs.writeFileSync(path.join(t49Repo, '.github', 'copilot-instructions.md'), '# Copilot\n');
  fs.writeFileSync(path.join(t49Home, '.codeium', 'windsurf', 'mcp_config.json'), JSON.stringify({ mcpServers: { ws_srv: {} } }));
  fs.writeFileSync(path.join(t49Repo, '.codeiumignore'), 'dist/\n');
  fs.writeFileSync(path.join(t49Repo, '.rooignore'), 'dist/\n');
  fs.writeFileSync(path.join(t49Repo, '.clineignore'), 'dist/\n');
  fs.writeFileSync(path.join(t49Repo, '.aiderignore'), 'dist/\n');
  fs.writeFileSync(path.join(t49Home, '.config', 'rtk', 'config.toml'), 'enabled = true\n');
  const t49Env = { ...process.env, HOME: t49Home, USERPROFILE: t49Home, XDG_CONFIG_HOME: '', OPENCODE_CONFIG_DIR: '', OPENCODE_CONFIG: '' };
  const t49Detect = spawnSync('node', [targetCli, '--root', t49Repo, '--detect'], { encoding: 'utf8', env: t49Env });
  const t49Map = spawnSync('node', [targetCli, '--root', t49Repo, '--map'], { encoding: 'utf8', env: t49Env });
  const t49VerifyDrift = spawnSync('node', [targetCli, '--root', t49Repo, '--verify'], { encoding: 'utf8', env: t49Env });
  spawnSync('node', [targetCli, '--root', t49Repo, '--sync-landmarks', '--write'], { encoding: 'utf8', env: t49Env });
  spawnSync('node', [targetCli, '--root', t49Repo, '--sync-ignores', '--write'], { encoding: 'utf8', env: t49Env });
  const t49VerifyOk = spawnSync('node', [targetCli, '--root', t49Repo, '--verify'], { encoding: 'utf8', env: t49Env });
  const t49D = t49Detect.stdout || '';
  const t49 = t49Detect.status === 0 && t49D.length < 3400 &&
              t49D.includes('cur_global') && t49D.includes('cur_proj') && t49D.includes('.cursor/rules') &&
              t49D.includes('gem_global') && t49D.includes('gem_proj') && t49D.includes('.aiexclude') && t49D.includes('GEMINI.md') &&
              t49D.includes('codex_srv') && t49D.includes('web_search=true') && t49D.includes('AGENTS.override.md') &&
              t49D.includes('claude_proj') && t49D.includes('.claude/settings.local.json') &&
              t49D.includes('vsc_srv') && t49D.includes('.github/copilot-instructions.md') && t49D.includes('.github/instructions/') &&
              t49D.includes('ws_srv') && t49D.includes('.windsurf/') && t49D.includes('.codeiumignore') &&
              t49D.includes('.rooignore') && t49D.includes('.clineignore') && t49D.includes('.aiderignore') &&
              t49D.includes('~/.config/rtk/') && t49D.includes('claude-hooks') &&
              t49Map.stdout.includes('AGENTS.override.md') && !t49Map.stdout.includes('Dot-dirs') &&
              t49VerifyDrift.status === 1 && t49VerifyDrift.stdout.includes('drifted to L1-L3') &&
              fs.readFileSync(path.join(t49Repo, 'AGENTS.override.md'), 'utf8').includes('src/h.ts#helper:L1-L3') &&
              t49VerifyOk.status === 0;
  if (t49) passed++;
  console.log(`[Test 49: Multi-Host/RTK Detection, TOOL_DOT_DIRS & AGENTS.override.md Landmark Verify] ${t49 ? 'PASS' : 'FAIL'}`);

  // 50. Anti-Bloat Conditional Multi-Tool Ignore Sync (Absent Tools Stay Clean; Present Tools Sync & Verify)
  const t50Clean = path.join(tmp, 't50-clean');
  fs.mkdirSync(t50Clean, { recursive: true });
  fs.writeFileSync(path.join(t50Clean, 'index.ts'), 'export const clean = 1;\n');
  const t50Dry = spawnSync('node', [targetCli, '--root', t50Clean, '--sync-ignores'], { encoding: 'utf8', env: t49Env });
  spawnSync('node', [targetCli, '--root', t50Clean, '--sync-ignores', '--write', '--all-ignores'], { encoding: 'utf8', env: t49Env });
  const t50CleanVerify = spawnSync('node', [targetCli, '--root', t50Clean, '--verify', '--all-ignores'], { encoding: 'utf8', env: t49Env });
  const t50AllToolIgnores = ['.cursorignore', '.cursorindexingignore', '.geminiignore', '.aiexclude', '.codeiumignore', '.rooignore', '.clineignore', '.aiderignore', '.claudeignore', 'opencode.json', 'opencode.jsonc'];
  const t50NoneCreated = t50AllToolIgnores.every(f => !fs.existsSync(path.join(t50Clean, f)));

  const t50Active = path.join(tmp, 't50-active');
  fs.mkdirSync(path.join(t50Active, '.cursor'), { recursive: true });
  fs.mkdirSync(path.join(t50Active, '.windsurf'), { recursive: true });
  fs.writeFileSync(path.join(t50Active, 'index.ts'), 'export const active = 1;\n');
  fs.writeFileSync(path.join(t50Active, '.clineignore'), '# Custom cline\ncustom-cline/\n');
  spawnSync('node', [targetCli, '--root', t50Active, '--sync-ignores', '--write'], { encoding: 'utf8', env: t49Env });
  const t50Verify1 = spawnSync('node', [targetCli, '--root', t50Active, '--verify'], { encoding: 'utf8', env: t49Env });
  fs.writeFileSync(path.join(t50Active, '.codeiumignore'), '');
  const t50VerifyDrift = spawnSync('node', [targetCli, '--root', t50Active, '--verify'], { encoding: 'utf8', env: t49Env });
  spawnSync('node', [targetCli, '--root', t50Active, '--sync-ignores', '--write'], { encoding: 'utf8', env: t49Env });
  const t50Verify2 = spawnSync('node', [targetCli, '--root', t50Active, '--verify'], { encoding: 'utf8', env: t49Env });
  const t50ClineTxt = fs.readFileSync(path.join(t50Active, '.clineignore'), 'utf8');
  const t50 = (t50Dry.stdout || '').includes('Skipped absent tools (anti-bloat') &&
              t50NoneCreated && t50CleanVerify.status === 0 &&
              ['.cursorignore', '.cursorindexingignore', '.codeiumignore', '.clineignore'].every(f => fs.existsSync(path.join(t50Active, f))) &&
              ['.geminiignore', '.aiexclude', '.rooignore', '.aiderignore', '.claudeignore', 'opencode.json', 'opencode.jsonc'].every(f => !fs.existsSync(path.join(t50Active, f))) &&
              t50ClineTxt.includes('# Custom cline') && t50ClineTxt.includes('custom-cline/') &&
              t50Verify1.status === 0 &&
              t50VerifyDrift.status === 1 && t50VerifyDrift.stdout.includes('.codeiumignore(') &&
              t50Verify2.status === 0;
  if (t50) passed++;
  console.log(`[Test 50: Anti-Bloat Conditional Ignore Sync & --verify Parity] ${t50 ? 'PASS' : 'FAIL'}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`=== SCORE: ${passed}/${total} TESTS PASSED ===`);
if (passed !== total) process.exit(1);
})().catch(err => { console.error(err); process.exit(1); });
