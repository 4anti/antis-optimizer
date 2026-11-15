#!/usr/bin/env node
'use strict';

/**
 * Antis-Optimizer CLI — Universal Off-Context Repo CLI, AST & Token ROI Engine
 * Subcommands: --audit | --detect | --sync-ignores [--write] | --sync-landmarks [--write]
 *              --map | --slice <scope> [id|L-L] | --outline <rel-path> [filter] | --handoff | --verify | --check-update
 * Optional flags: --root <dir> --goal <text> --files <csv> --note <text> --out <rel>
 *                 --exec "<cmd>" --skip-validators --all-ignores --critical-only --help --version
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawnSync } = require('child_process');

const MAX_CLI_CHARS = 3400; // Stays safely under Token Optimizer 4,096-char archive_result cap.
const MAX_HANDOFF_BYTES = 2048; // Pre-compaction handoff snapshot cap.
const MAX_CODE_SLICE_LINES = 120;
const DOC_MAX_LINES = 80;
const DOC_MAX_BYTES = 4500;
const MAX_WALK_VISITS = 3500;
const HEAVY_DIR_ENTRIES = 400;
const EXEC_TIMEOUT_MS = 30000;

const SKIP_WALK_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', '__pycache__', 'build', 'target',
  'coverage', '.next', '.nuxt', '.pytest_cache', '.mypy_cache', '.ruff_cache', '_archive',
  'vendor', 'Pods', '.gradle', '.cargo'
]);
const BACKUP_DIR_RE = /^(?:\.(?:.*backup.*|.*cache.*|.*preview.*)|(?:.*[-_])?(?:backup|backups|archive|archives|snapshots?|decompiled|reverse[-_]?engineer|unwanted)|_archive|_work)$/i;
const BINARY_EXT_RE = /\.(?:exe|dll|pyd|so|dylib|bin|obj|glb|tsv|pyz|pdf|mp3|mp4|wav|woff2|ttf|webp|png|jpg|jpeg|gif|ico|zip|tar\.gz)$/i;
const TEXT_TRAP_EXT_RE = /\.(?:js|cjs|mjs|ts|tsx|jsx|json|jsonc|html?|css|md|txt|svg|xml|ya?ml|toml|py|rs|go|c|cpp|cc|h|hpp|cs|svelte|vue|astro|java|kts?|swift|php|rb|exs?|sql|sh|bash|lock)$/i;
const CODE_EXTS = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.rs', '.go',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.html', '.htm', '.css',
  '.md', '.yml', '.yaml', '.toml', '.json', '.jsonc',
  '.svelte', '.vue', '.astro',
  '.java', '.kt', '.kts', '.swift', '.php', '.rb', '.ex', '.exs', '.sql', '.sh', '.bash'
]);
const SLICE_EXTS = /\.(?:json|jsonc|js|cjs|mjs|ts|tsx|jsx|py|rs|go|c|cpp|cc|h|hpp|cs|ya?ml|toml|md|html?|css|svelte|vue|astro|java|kts?|swift|php|rb|exs?|sql|sh|bash)$/i;
const LOCKFILE_RE = /(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock)$/i;
const SECRET_FILE_RE = /(?:^|\/)(?:\.env(?:\.(?!example$)[^/]+)?|.*\.(?:pem|key|p12|pfx)|id_rsa.*|.*(?:secret|credential|private[-_]?key).*\.(?:json|ya?ml|toml|env|txt))$/i;
const SECRET_TOKEN_RES = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
];

const TOOL_DOT_DIRS = new Set([
  '.github', '.vscode', '.claude', '.cursor', '.idea', '.qodo',
  '.gemini', '.agents', '.codex', '.devcontainer', '.husky', '.circleci', '.gitlab',
  '.opencode', '.windsurf', '.roo', '.cline', '.kiro', '.factory', '.rtk'
]);

const BASE_TRAPS = [
  '.git/', 'node_modules/', '.venv/', '__pycache__/', 'target/',
  '.claude/worktrees/', '.playwright-mcp/', '.wrangler/', 'dist/',
  '*.pdf', '*.mp3', '*.mp4', '*.wav', '*.woff2', '*.ttf', '*.webp', '*.png', '*.jpg', '*.zip', '*.tar.gz',
  '*.original.md', '.claude/settings.local.json', 'package-lock.json'
];

const fmtInt = n => Number(n).toLocaleString('en-US');

function redactSecrets(text) {
  let out = text;
  for (const re of SECRET_TOKEN_RES) out = out.replace(re, '[REDACTED_SECRET]');
  return out;
}

function isSecretPath(relPath) {
  return SECRET_FILE_RE.test(normalizePattern(relPath));
}

// Reads only the first `n` bytes; full reads of huge junk files are slow and throw above V8's string limit.
function readHead(fullPath, n = 4096) {
  let fd;
  try {
    fd = fs.openSync(fullPath, 'r');
    const buf = Buffer.alloc(n);
    return buf.toString('utf8', 0, fs.readSync(fd, buf, 0, n, 0));
  } catch { return ''; } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

const partialNote = truncated => truncated ? ' [partial scan: depth/entry cap hit; counts are lower bounds]' : '';

function isInsideRoot(root, fullPath) {
  const rel = path.relative(path.resolve(root), path.resolve(fullPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function capOutput(text, limit = MAX_CLI_CHARS) {
  const safe = redactSecrets(text);
  if (safe.length <= limit) return safe;
  const msg = `\n...[capped at ${limit}/${safe.length} chars; pass [filter] or narrow scope]`;
  return safe.slice(0, Math.max(0, limit - msg.length)) + msg;
}

function parseCli(argv) {
  const opts = { root: process.cwd(), pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' && argv[i + 1]) opts.root = path.resolve(argv[++i]);
    else if (a === '--goal' && argv[i + 1]) opts.goal = argv[++i];
    else if (a === '--files' && argv[i + 1]) opts.files = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--note' && argv[i + 1]) opts.note = argv[++i];
    else if (a === '--out' && argv[i + 1]) opts.out = argv[++i];
    else if (a === '--exec' && argv[i + 1]) opts.exec = argv[++i];
    else if (a === '--write') opts.write = true;
    else if (a === '--all-ignores') opts.allIgnores = true;
    else if (a === '--skip-validators') opts.skipValidators = true;
    else if (a === '--critical-only') opts.criticalOnly = true;
    else if (!opts.cmd && (a === '-h' || a === '--help')) opts.cmd = '--help';
    else if (!opts.cmd && (a === '-v' || a === '--version')) opts.cmd = '--version';
    else if (!opts.cmd && a.startsWith('--')) opts.cmd = a;
    else opts.pos.push(a);
  }
  opts.cmd = opts.cmd || '--map';
  return opts;
}

function getPkgVersion() {
  return (readJsonSafe(path.join(__dirname, '..', 'package.json')) || {}).version || '1.0.0';
}

function cmdHelp() {
  console.log([
    `antis-optimizer v${getPkgVersion()} — Off-Context Repo CLI & Token ROI Engine`,
    '',
    'Commands:',
    '  --audit                     Audit bloat traps, monoliths & ROI break-even tier',
    '  --detect                    Detect agent hosts, MCP servers & nested .git dirs',
    '  --sync-ignores [--write]    Sync .ignore, .contextignore, .jcodemunch & active tool ignores',
    '  --sync-landmarks [--write]  Verify/auto-heal symbol:Lstart-Lend in AGENTS/INDEX.md',
    '  --map                       Compact repo map & domain landmarks (<3.5 KB)',
    '  --outline <rel> [filter]    Compiler-AST / polyglot symbol & line-span outline',
    '  --slice <scope> [id|L-L]    Slice JSON item, AST symbol span, or :Lstart-Lend range',
    '  --handoff [--goal "..."]    Emit <=2 KB pre-compaction JSON state snapshot',
    '  --verify [--exec "<cmd>"]   1-line PASS verification of budgets, landmarks & ignores',
    '  --check-update              Check GitHub Releases for updates (read-only)',
    '  --help | -h                 Show this help',
    '  --version | -v              Print CLI version',
    '',
    'Options: --root <dir> --goal <text> --files <csv> --note <text> --out <rel> --all-ignores --skip-validators --critical-only'
  ].join('\n'));
}

function stripJsonc(raw) {
  let out = '', inStr = false, inBlk = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i], nx = raw[i + 1];
    if (inBlk) { if (ch === '*' && nx === '/') { inBlk = false; i++; } continue; }
    if (inStr) {
      out += ch;
      if (ch === '\\' && i + 1 < raw.length) out += raw[++i];
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === '/' && nx === '/') { while (i < raw.length && raw[i] !== '\n') i++; out += '\n'; continue; }
    if (ch === '/' && nx === '*') { inBlk = true; i++; continue; }
    out += ch;
  }
  let res = '';
  inStr = false;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (inStr) {
      res += ch;
      if (ch === '\\' && i + 1 < out.length) res += out[++i];
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; res += ch; continue; }
    if (ch === ',') {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      if (out[j] === '}' || out[j] === ']') continue;
    }
    res += ch;
  }
  return res;
}

function readJsonSafe(filePath, isJsonc = false) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(isJsonc ? stripJsonc(raw) : raw);
  } catch { return null; }
}

function normalizePattern(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function parseLinesFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
}

function globToRegExp(glob) {
  const clean = glob.replace(/^\//, '').replace(/\/$/, '');
  if (!clean) return null;
  const anchored = glob.startsWith('/') || (clean.includes('/') && !clean.startsWith('**/'));
  let reStr = '';
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '*' && clean[i + 1] === '*') {
      i++;
      // `**/` spans whole path segments only: `**/logs` must not match `catalogs`.
      if (clean[i + 1] === '/') { reStr += '(?:.*/)?'; i++; }
      else reStr += '.*';
    } else if (c === '*') {
      reStr += '[^/]*';
    } else if (c === '?') {
      reStr += '[^/]';
    } else if (c === '[') {
      const closeIdx = clean.indexOf(']', i + 1);
      if (closeIdx > i + 1) {
        const inner = clean.slice(i + 1, closeIdx).replace(/^!/, '^');
        reStr += '[' + inner + ']';
        i = closeIdx;
      } else {
        reStr += '\\[';
      }
    } else if ('+^$().|{}!\\'.includes(c)) {
      reStr += '\\' + c;
    } else {
      reStr += c;
    }
  }
  try {
    return new RegExp(`${anchored ? '^' : '(?:^|/)'}${reStr}(?:$|/)`, 'i');
  } catch { return null; }
}

function loadIgnoreRules(root) {
  const rules = [];
  const gitLines = parseLinesFile(path.join(root, '.gitignore')).map(normalizePattern).filter(Boolean);
  const igLines = parseLinesFile(path.join(root, '.ignore')).map(normalizePattern).filter(Boolean);
  const lines = [...BASE_TRAPS, ...gitLines, ...igLines];
  for (const raw of lines) {
    const neg = raw.startsWith('!');
    const p = neg ? raw.slice(1).trim() : raw;
    if (!p) continue;
    const isDirOnly = p.endsWith('/');
    if (/[*?[\]]/.test(p)) {
      const rx = globToRegExp(p);
      if (rx) rules.push({ neg, isDirOnly, rx });
      continue;
    }
    const clean = (isDirOnly ? p.slice(0, -1) : p).replace(/^\//, '');
    if (!clean) continue;
    const isAnchored = p.startsWith('/') || clean.includes('/');
    rules.push({ neg, isDirOnly, isAnchored, clean });
  }
  return { rules };
}

function matchIgnoreRules(ig, rel, name, isDir) {
  let ignored = false;
  for (const r of ig.rules) {
    if (!isDir && r.isDirOnly) continue;
    const hit = r.rx ? r.rx.test(rel) : (r.isAnchored ? rel === r.clean : (name === r.clean || rel === r.clean));
    if (hit) ignored = !r.neg;
  }
  return ignored;
}
const isDirIgnored = (ig, rel, name) => matchIgnoreRules(ig, rel, name, true);
const isFileIgnored = (ig, rel, name) => matchIgnoreRules(ig, rel, name, false);

function isDynamicTextTrap(fullPath, fileName, sizeBytes) {
  if (LOCKFILE_RE.test(fileName) || /\.min\.(?:js|css)$/i.test(fileName)) return true;
  if (sizeBytes >= 50 * 1024 && /\.(?:json|js|css|html?|md|txt|svg)$/i.test(fileName)) {
    const head = readHead(fullPath);
    if (/data:image\/[^;]+;base64,/.test(head) || head.split(/\r?\n/).some(l => l.length >= 2048)) return true;
  }
  return false;
}

function walkRepo(root, maxDepth = 5) {
  // backupDirs: well-known output dirs (safe to sync). suggestDirs: name/size guesses, shown but never auto-written.
  const res = {
    gitDirs: [], agents: [], indexFiles: [], opencodeSkills: [], largeTraps: [],
    generatedHints: [], backupDirs: [], suggestDirs: [], dotSourceDirs: [], truncated: false
  };
  const ig = loadIgnoreRules(root);
  const seenRealDirs = new Set();
  let visits = 0;

  function visit(dir, depth) {
    if (depth > maxDepth || visits >= MAX_WALK_VISITS) {
      res.truncated = true;
      return;
    }
    try {
      const rp = fs.realpathSync(dir);
      if (seenRealDirs.has(rp)) return;
      seenRealDirs.add(rp);
    } catch { return; }
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    if (depth > 0 && entries.length >= HEAVY_DIR_ENTRIES) {
      const relDir = normalizePattern(path.relative(root, dir));
      if (relDir) res.suggestDirs.push(relDir + '/');
      return;
    }

    for (const e of entries) {
      if (visits++ >= MAX_WALK_VISITS) { res.truncated = true; return; }
      const full = path.join(dir, e.name);
      const rel = normalizePattern(path.relative(root, full));
      if (e.isDirectory()) {
        if (e.name === '.git') { res.gitDirs.push(rel); continue; }
        if (isDirIgnored(ig, rel, e.name)) continue;
        if (BACKUP_DIR_RE.test(e.name)) { res.suggestDirs.push(rel + '/'); continue; }
        if (SKIP_WALK_DIRS.has(e.name)) {
          if (depth > 0 && !BASE_TRAPS.includes(e.name + '/') && e.name !== 'venv') res.backupDirs.push(rel + '/');
          continue;
        }
        if (depth === 0 && e.name.startsWith('.') && !TOOL_DOT_DIRS.has(e.name)) res.dotSourceDirs.push(rel + '/');
        visit(full, depth + 1);
      } else if (e.isFile()) {
        if (e.name === 'AGENTS.md' || e.name === 'AGENTS.override.md') res.agents.push(rel);
        else if (e.name === 'INDEX.md') res.indexFiles.push(rel);
        else if (rel.startsWith('.opencode/skills/') && e.name === 'SKILL.md') res.opencodeSkills.push(rel);
        if (isFileIgnored(ig, rel, e.name)) continue;
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (/\.(?:md|html?)$/i.test(e.name) && st.size >= 50 * 1024) {
          const head = readHead(full);
          if (/data:image\/[^;]+;base64,/.test(head) || st.size >= 150 * 1024 || head.split(/\r?\n/).some(l => l.length >= 2048)) {
            res.largeTraps.push({ rel, bytes: st.size, base64: head.includes('base64,') });
          }
        } else if (BINARY_EXT_RE.test(e.name) && st.size >= 100 * 1024) {
          res.generatedHints.push(`*${path.extname(e.name).toLowerCase()}`);
        } else if (isDynamicTextTrap(full, e.name, st.size) && st.size >= 50 * 1024) {
          res.generatedHints.push(rel);
        } else if (/(?:^|\/)(?:dist|build|out)\/.*\.(?:js|css)$/i.test(rel) && st.size >= 10 * 1024) {
          const head = readHead(full);
          if (st.size >= 50 * 1024 || /\.(?:bundle|vendor|chunk)\.(?:js|css)$/i.test(e.name) || head.split(/\r?\n/).some(l => l.length >= 2048)) {
            res.generatedHints.push(rel);
          }
        }
      }
    }
  }
  visit(root, 0);
  return res;
}

function detectStack(root) {
  const stack = [];
  const pkg = readJsonSafe(path.join(root, 'package.json'));
  if (pkg) {
    const scripts = Object.keys(pkg.scripts || {}).filter(k => /^(?:test|build|check|lint|typecheck|validate)$/.test(k));
    stack.push(`node(${scripts.length ? scripts.join('/') : 'pkg'})`);
  }
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'pytest.ini')) || fs.existsSync(path.join(root, 'tests'))) {
    stack.push('python');
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) stack.push('rust');
  if (fs.existsSync(path.join(root, 'go.mod'))) stack.push('go');

  const files = new Set();
  const subdirs = [];
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.isFile()) files.add(e.name);
      else if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_WALK_DIRS.has(e.name)) subdirs.push(e.name);
    }
  } catch {}
  for (const d of subdirs) {
    try {
      for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        if (e.isFile()) files.add(e.name);
      }
    } catch {}
  }

  const hasMaven = files.has('pom.xml');
  const hasGradle = files.has('build.gradle') || files.has('build.gradle.kts');
  if (hasMaven || hasGradle) stack.push(`java(${hasMaven && hasGradle ? 'maven/gradle' : hasMaven ? 'maven' : 'gradle'})`);
  if (files.has('Package.swift')) stack.push('swift');
  if (files.has('Gemfile')) stack.push('ruby');
  if (files.has('composer.json')) stack.push('php');
  if (files.has('mix.exs')) stack.push('elixir');
  if ([...files].some(f => /\.(?:csproj|sln)$/i.test(f))) stack.push('dotnet');
  return stack;
}

function collectAuditStats(root) {
  const ig = loadIgnoreRules(root);
  const seenRealDirs = new Set();
  let rawFiles = 0, rawBytes = 0, activeFiles = 0, activeBytes = 0;
  let trapTextFiles = 0, trapTextBytes = 0, trapBinaryBytes = 0;
  let visits = 0, truncated = false;
  const trapBuckets = {};
  const monoliths = [];
  const suggestSet = new Set();

  function scanAll(dir, depth, parentIgnored, bucketName) {
    if (depth > 6 || visits >= MAX_WALK_VISITS * 3) {
      if (!parentIgnored || visits >= MAX_WALK_VISITS * 3) truncated = true; // deep ignored junk is not "missed source"
      return;
    }
    try {
      const rp = fs.realpathSync(dir);
      if (seenRealDirs.has(rp)) return;
      seenRealDirs.add(rp);
    } catch { return; }
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (depth > 0 && !parentIgnored && entries.length >= HEAVY_DIR_ENTRIES) {
      const relDir = normalizePattern(path.relative(root, dir));
      if (relDir) suggestSet.add(relDir + '/');
    }
    for (const e of entries) {
      if (visits++ >= MAX_WALK_VISITS * 3) { truncated = true; return; }
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '.venv' || e.name === 'venv') continue;
      const full = path.join(dir, e.name);
      const rel = normalizePattern(path.relative(root, full));
      if (e.isDirectory()) {
        // Name guesses (BACKUP_DIR_RE) are not synced, so they must not count as quarantined either.
        const dirIg = parentIgnored || isDirIgnored(ig, rel, e.name) || SKIP_WALK_DIRS.has(e.name);
        if (!dirIg && BACKUP_DIR_RE.test(e.name)) suggestSet.add(rel + '/');
        const bName = bucketName || (dirIg ? rel + '/' : '');
        scanAll(full, depth + 1, dirIg, bName);
      } else if (e.isFile()) {
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        rawFiles++;
        rawBytes += st.size;
        const dynTrap = !parentIgnored && !BINARY_EXT_RE.test(e.name) && isDynamicTextTrap(full, e.name, st.size);
        const fileIg = parentIgnored || isFileIgnored(ig, rel, e.name) || BINARY_EXT_RE.test(e.name) || dynTrap;
        if (fileIg) {
          const key = bucketName || (BINARY_EXT_RE.test(e.name) ? `*${path.extname(e.name).toLowerCase()} (media/fonts)` : rel);
          trapBuckets[key] = (trapBuckets[key] || 0) + st.size;
          if (BINARY_EXT_RE.test(e.name)) {
            trapBinaryBytes += st.size;
          } else if (TEXT_TRAP_EXT_RE.test(e.name)) {
            trapTextFiles++;
            trapTextBytes += st.size;
          }
        } else {
          activeFiles++;
          activeBytes += st.size;
          if (st.size >= 15 * 1024 && SLICE_EXTS.test(e.name) && !/(?:^|\/)scripts\/repo-index\.cjs$/.test(rel)) {
            monoliths.push({ rel, bytes: st.size, estTokens: Math.ceil(st.size / 4) });
          }
        }
      }
    }
  }
  scanAll(root, 0, false, '');
  monoliths.sort((a, b) => b.bytes - a.bytes);

  return {
    rawFiles,
    rawBytes,
    activeFiles,
    activeBytes,
    activeTokens: Math.ceil(activeBytes / 4),
    trapTextFiles,
    trapTextBytes,
    trapTextTokens: Math.ceil(trapTextBytes / 4),
    trapBinaryBytes,
    trapBuckets,
    monoliths,
    suggestDirs: [...suggestSet],
    truncated
  };
}

function classifyRepoTier({ activeFiles, activeTokens, monoliths, trapTextTokens }) {
  if (monoliths.length === 0 && trapTextTokens < 5000 && (activeFiles < 25 || activeTokens < 5000)) {
    return {
      key: 0,
      label: 'TIER 0 (IGNORE-ONLY)',
      estDocTokens: 0,
      reason: `Small/clean repo (${activeFiles} files, 0 monoliths) — INDEX.md doc tax would exceed read savings`
    };
  }
  if (monoliths.length <= 2 && trapTextTokens < 25000) {
    return {
      key: 1,
      label: 'TIER 1 (LEAN ZERO-COPY)',
      estDocTokens: 450,
      reason: `Moderate repo (${activeFiles} files, ${monoliths.length} monoliths) — use root AGENTS.md only + global CLI`
    };
  }
  return {
    key: 2,
    label: 'TIER 2 (FULL 4-LAYER)',
    estDocTokens: 1900,
    reason: `${monoliths.length} monoliths (>=15KB) & ${(trapTextTokens / 1000).toFixed(1)}k trap tokens quarantined`
  };
}

function cmdAudit(opts) {
  const stats = collectAuditStats(opts.root);
  const {
    rawFiles, rawBytes, activeFiles, activeBytes, activeTokens,
    trapTextFiles, trapTextBytes, trapTextTokens, trapBinaryBytes, trapBuckets, monoliths
  } = stats;
  const sliceCostTokens = 450;
  const avgMonoSave = monoliths.length
    ? Math.round(monoliths.reduce((s, m) => s + Math.max(0, m.estTokens - sliceCostTokens), 0) / monoliths.length)
    : 0;

  const tierInfo = classifyRepoTier(stats);
  let docBytes = 0;
  for (const d of ['AGENTS.md', 'AGENTS.override.md', 'INDEX.md', 'CLAUDE.md']) {
    const p = path.join(opts.root, d);
    if (fs.existsSync(p)) docBytes += fs.statSync(p).size;
  }
  const actualOrEstDocTokens = docBytes > 0 ? Math.ceil(docBytes / 4) : tierInfo.estDocTokens;
  const sessionTaxTokens = Math.ceil(actualOrEstDocTokens * 1.5);
  const breakEvenReads = avgMonoSave > 0 ? (sessionTaxTokens / avgMonoSave).toFixed(1) : 'N/A';

  const topTraps = Object.entries(trapBuckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, b]) => `${k} (${b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'})`);

  const fileReductionPct = rawFiles > 0 ? (((rawFiles - activeFiles) / rawFiles) * 100).toFixed(1) : '0.0';
  const mbQuarantined = ((rawBytes - activeBytes) / 1048576).toFixed(1);

  const out = [
    `=== ANTIS-OPTIMIZER AUDIT & TOKEN ROI MODEL ===`,
    `Repo: ${path.basename(opts.root)} | Stack: ${detectStack(opts.root).join(', ') || 'generic'}`,
    `├─ Search noise filtered:  ${fmtInt(rawFiles)} raw files ──► ${fmtInt(activeFiles)} active files (▼ ${fileReductionPct}% file noise)`,
    `├─ Total bloat quarantined: ${mbQuarantined} MB (${(trapBinaryBytes / 1048576).toFixed(1)} MB media/fonts + ${fmtInt(Math.round(trapTextBytes / 1024))} KB text/JSON/bundles)`,
    `├─ Ghost text traps blocked: ~${fmtInt(trapTextTokens)} tokens across ${fmtInt(trapTextFiles)} non-source text/JSON/bundle files`,
    `├─ Top quarantined paths:   ${topTraps.join(', ') || 'none'}`,
    `├─ Active source footprint: ${fmtInt(activeFiles)} files (~${fmtInt(activeTokens)} tokens total)`,
    `├─ Monoliths (>=15KB):      ${monoliths.length} files (${monoliths.slice(0, 5).map(m => `${m.rel}:${Math.round(m.bytes / 1024)}KB`).join(', ') || 'none'})`,
    `├─ Mathematical ROI model:  Session doc tax = ~${fmtInt(sessionTaxTokens)} tok (1.5x compact) | Avg monolith slice save = ~${fmtInt(avgMonoSave)} tok/read`,
    `├─ Break-even threshold:    R* = ${breakEvenReads} monolith reads/session (plus ~${fmtInt(trapTextTokens)} tok of trap files kept out of searches)`,
    `└─ Optimal configuration:   ${tierInfo.label} — ${tierInfo.reason}`,
    ...(stats.suggestDirs.length ? [`⚠ Review guessed dirs (not auto-ignored): ${stats.suggestDirs.slice(0, 6).join(', ')}`] : []),
    ...(stats.truncated ? [`⚠${partialNote(true)}`] : [])
  ];
  console.log(capOutput(out.join('\n')));
}

const EXTRA_IGNORE_SPECS = [
  { file: '.cursorignore', dirs: ['.cursor'] },
  { file: '.cursorindexingignore', dirs: ['.cursor'] },
  { file: '.geminiignore', dirs: ['.gemini'] },
  { file: '.aiexclude', dirs: ['.gemini'] },
  { file: '.codeiumignore', dirs: ['.windsurf'] },
  { file: '.rooignore', dirs: ['.roo'] },
  { file: '.clineignore', dirs: ['.cline'] },
  { file: '.aiderignore', dirs: [] },
  { file: '.claudeignore', dirs: ['.claude'] }
];

const HU = Object.freeze({
  isPlainObj: v => v !== null && typeof v === 'object' && !Array.isArray(v),
  uniq: arr => [...new Set(arr.filter(Boolean))],
  fmtList: (arr, max = 8) => (!arr.length ? 'none' : arr.length <= max ? arr.join(', ') : `${arr.slice(0, max).join(', ')} (+${arr.length - max})`),
  existsFile: p => { try { return fs.statSync(p).isFile(); } catch { return false; } },
  existsDir: p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
  readMcpKeys: (filePath, key = 'mcpServers') => {
    const obj = readJsonSafe(filePath, true);
    return HU.isPlainObj(obj?.[key]) ? Object.keys(obj[key]) : [];
  },
  isPluginMatch: (pluginEntry, name) => new RegExp(`(?:^|[\\\\/@])${name}(?:@|\\.[cm]?[jt]s|$)`).test(String(pluginEntry || '').toLowerCase()),
  hasEnvReadDeny: cfg => {
    const rd = cfg?.permission?.read;
    if (rd === 'deny') return true;
    if (!HU.isPlainObj(rd)) return false;
    return Object.entries(rd).some(([k, v]) => v === 'deny' && (k === '*' || /\.env/i.test(k)));
  },
  hasRtkInClaude: settings => {
    if (!HU.isPlainObj(settings)) return false;
    if (settings.rtk) return true;
    if (HU.isPlainObj(settings.enabledPlugins) && Object.entries(settings.enabledPlugins).some(([k, v]) => v && /\brtk\b/i.test(k))) return true;
    return /(?:^|[^a-z0-9])rtk(?:$|[^a-z0-9])/i.test(JSON.stringify({ hooks: settings.hooks, statusLine: settings.statusLine }));
  },
  parseCodexToml: filePath => {
    const mcp = new Set(), tools = [];
    if (!HU.existsFile(filePath)) return { present: false, mcp: [], tools: [] };
    try {
      const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
      let section = '';
      for (const rawLine of lines) {
        const t = rawLine.trim();
        if (!t || t.startsWith('#')) continue;
        const secM = t.match(/^\[\[?\s*(.+?)\s*\]\]?(?:\s*#.*)?$/);
        if (secM) {
          section = secM[1];
          const mcpM = section.match(/^mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))/);
          if (mcpM) mcp.add(mcpM[1] || mcpM[2] || mcpM[3]);
          continue;
        }
        if (section === 'tools' || section.startsWith('tools.')) {
          const kv = t.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
          if (kv) {
            const pfx = section === 'tools' ? '' : `${section.slice(6)}.`;
            tools.push(`${pfx}${kv[1]}=${kv[2].replace(/\s+#.*$/, '').trim()}`);
          }
        }
      }
    } catch {}
    return { present: true, mcp: [...mcp], tools };
  },
  listSkillDirs: dirPath => {
    if (!HU.existsDir(dirPath)) return [];
    try {
      return fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(e => e.isDirectory() && HU.existsFile(path.join(dirPath, e.name, 'SKILL.md')))
        .map(e => e.name);
    } catch { return []; }
  },
  fmtHost: (label, sigs, mcp, extra = '') => (sigs.length || mcp.length || extra)
    ? `${label}: ${HU.fmtList(sigs, 5)}${mcp.length ? ` | mcp=${HU.fmtList(mcp)}` : ''}${extra}`
    : `${label}: none`,
  hasComments: raw => {
    let inStr = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i], nx = raw[i + 1];
      if (inStr) {
        if (ch === '\\') i++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '/' && (nx === '/' || nx === '*')) return true;
    }
    return false;
  },
  skipWs: (raw, idx) => {
    let i = idx;
    while (i < raw.length) {
      const ch = raw[i], nx = raw[i + 1];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '/' && nx === '/') { while (i < raw.length && raw[i] !== '\n') i++; continue; }
      if (ch === '/' && nx === '*') {
        i += 2;
        while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      break;
    }
    return i;
  },
  readStrEnd: (raw, startIdx) => {
    for (let i = startIdx + 1; i < raw.length; i++) {
      if (raw[i] === '\\') { i++; continue; }
      if (raw[i] === '"') return i;
    }
    return -1;
  },
  findPropSpan: (raw, propName, fromIdx = 0) => {
    let i = HU.skipWs(raw, fromIdx);
    if (raw[i] !== '{') return null;
    const objStart = i;
    let depth = 1;
    i++;
    while (i < raw.length) {
      i = HU.skipWs(raw, i);
      if (i >= raw.length) break;
      const ch = raw[i];
      if (ch === '"') {
        const strEnd = HU.readStrEnd(raw, i);
        if (strEnd < 0) return null;
        const afterStr = HU.skipWs(raw, strEnd + 1);
        if (depth === 1 && raw[afterStr] === ':') {
          let key = '';
          try { key = JSON.parse(raw.slice(i, strEnd + 1)); } catch {}
          const valStart = HU.skipWs(raw, afterStr + 1);
          if (key === propName) {
            const vc = raw[valStart];
            if (vc !== '{' && vc !== '[') return { objStart, objEnd: -1, nonContainer: true };
            let vDepth = 0, j = valStart;
            while (j < raw.length) {
              j = HU.skipWs(raw, j);
              if (j >= raw.length) break;
              const c = raw[j];
              if (c === '"') {
                const se = HU.readStrEnd(raw, j);
                if (se < 0) return null;
                j = se + 1;
                continue;
              }
              if (c === '{' || c === '[') vDepth++;
              else if (c === '}' || c === ']') {
                vDepth--;
                if (vDepth === 0) return { objStart, objEnd: -1, valStart, valEnd: j, valChar: vc };
              }
              j++;
            }
            return null;
          }
        }
        i = strEnd + 1;
        continue;
      }
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) return { objStart, objEnd: i, notFound: true };
      }
      i++;
    }
    return null;
  },
  insertProp: (raw, objStart, objEnd, propText, indent = '  ') => {
    let lastCodeIdx = objStart, i = objStart + 1;
    while (i < objEnd) {
      i = HU.skipWs(raw, i);
      if (i >= objEnd) break;
      if (raw[i] === '"') {
        const se = HU.readStrEnd(raw, i);
        if (se < 0) return null;
        lastCodeIdx = se;
        i = se + 1;
        continue;
      }
      lastCodeIdx = i;
      i++;
    }
    const lastCh = raw[lastCodeIdx];
    const needsComma = Boolean(lastCh && lastCh !== '{' && lastCh !== ',');
    const lastNl = raw.lastIndexOf('\n', objEnd - 1);
    const sameLineWs = lastNl >= 0 && /^[ \t]*$/.test(raw.slice(lastNl + 1, objEnd));
    const closeIndent = sameLineWs ? raw.slice(lastNl + 1, objEnd) : '';
    const insertAt = sameLineWs ? lastNl + 1 : objEnd;
    const beforeClose = needsComma
      ? raw.slice(0, lastCodeIdx + 1) + ',' + raw.slice(lastCodeIdx + 1, insertAt)
      : raw.slice(0, insertAt);
    const leadNl = (beforeClose.length === 0 || beforeClose.endsWith('\n')) ? '' : '\n';
    const trailIndent = insertAt === objEnd ? closeIndent : '';
    return beforeClose + leadNl + `${indent}${propText}\n` + trailIndent + raw.slice(insertAt);
  },
  spliceWatcherIgnore: (raw, nextIgnore) => {
    const arrLiteral = JSON.stringify(nextIgnore, null, 4).replace(/\n\]$/, '\n  ]');
    const wSpan = HU.findPropSpan(raw, 'watcher');
    if (!wSpan) return null;
    if (wSpan.notFound) {
      return HU.insertProp(raw, wSpan.objStart, wSpan.objEnd, `"watcher": {\n    "ignore": ${arrLiteral.replace(/\n/g, '\n  ')}\n  }`, '  ');
    }
    if (wSpan.valChar !== '{') return null;
    const igSpan = HU.findPropSpan(raw, 'ignore', wSpan.valStart);
    if (!igSpan) return null;
    if (igSpan.valChar === '[') {
      return raw.slice(0, igSpan.valStart) + arrLiteral.replace(/\n/g, '\n  ') + raw.slice(igSpan.valEnd + 1);
    }
    if (igSpan.notFound) {
      return HU.insertProp(raw, igSpan.objStart, igSpan.objEnd, `"ignore": ${arrLiteral.replace(/\n/g, '\n  ')}`, '    ');
    }
    return null;
  },
  mergeToolPatterns: (basePatterns, extraExisting) => {
    const baseSet = new Set(basePatterns), extraPos = [], extraNeg = [];
    for (const p of extraExisting) {
      if (!baseSet.has(p)) (p.startsWith('!') ? extraNeg : extraPos).push(p);
    }
    return [...basePatterns.filter(p => !p.startsWith('!')), ...extraPos, ...basePatterns.filter(p => p.startsWith('!')), ...extraNeg];
  }
});

function detectHostTools(root) {
  const home = os.homedir();
  const has = p => fs.existsSync(path.join(home, p));
  const envOcCfg = (process.env.OPENCODE_CONFIG || '').trim();
  const envOcDir = (process.env.OPENCODE_CONFIG_DIR || '').trim();
  const xdgHome = (process.env.XDG_CONFIG_HOME || '').trim();

  // Claude Code & Antigravity
  const claudeMcp = HU.uniq([...HU.readMcpKeys(path.join(home, '.claude.json')), ...HU.readMcpKeys(path.join(root, '.mcp.json'))]);
  const agyMcp = HU.readMcpKeys(path.join(home, '.gemini/config/mcp_config.json'));
  const claudeGlobalSettings = readJsonSafe(path.join(home, '.claude/settings.json'), true) || {};
  const claudeProjSettings = readJsonSafe(path.join(root, '.claude/settings.json'), true) || {};
  const claudeLocalSettings = readJsonSafe(path.join(root, '.claude/settings.local.json'), true) || {};
  const claudeSignals = [
    fs.existsSync(path.join(root, '.mcp.json')) && '.mcp.json',
    HU.existsFile(path.join(root, '.claude/settings.local.json')) && '.claude/settings.local.json',
    HU.existsFile(path.join(root, '.claudeignore')) && '.claudeignore',
    HU.existsDir(path.join(root, '.claude')) && '.claude/'
  ].filter(Boolean);

  // OpenCode (project + $OPENCODE_CONFIG + $OPENCODE_CONFIG_DIR + $XDG_CONFIG_HOME + ~/.config/opencode)
  const projectOcRels = ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'];
  const projectOcPaths = new Set(projectOcRels.map(r => path.resolve(root, r)));
  const ocCandidates = [
    ...(envOcCfg ? [[path.resolve(envOcCfg), `$OPENCODE_CONFIG(${path.basename(envOcCfg)})`]] : []),
    ...(envOcDir ? [[path.join(envOcDir, 'opencode.json'), '$OPENCODE_CONFIG_DIR/opencode.json'], [path.join(envOcDir, 'opencode.jsonc'), '$OPENCODE_CONFIG_DIR/opencode.jsonc']] : []),
    ...(xdgHome ? [[path.join(xdgHome, 'opencode', 'opencode.json'), '$XDG_CONFIG_HOME/opencode/opencode.json'], [path.join(xdgHome, 'opencode', 'opencode.jsonc'), '$XDG_CONFIG_HOME/opencode/opencode.jsonc']] : []),
    [path.join(home, '.config/opencode/opencode.json'), '~/.config/opencode/opencode.json'],
    [path.join(home, '.config/opencode/opencode.jsonc'), '~/.config/opencode/opencode.jsonc'],
    ...projectOcRels.map(r => [path.join(root, r), r])
  ];
  const ocSeen = new Set();
  const ocConfigs = [];
  for (const [fullPath, label] of ocCandidates) {
    const abs = path.resolve(fullPath);
    if (ocSeen.has(abs) || !HU.existsFile(abs)) continue;
    ocSeen.add(abs);
    let raw = '';
    try { raw = fs.readFileSync(abs, 'utf8'); } catch {}
    const parsed = readJsonSafe(abs, true);
    const valid = HU.isPlainObj(parsed);
    const isProject = projectOcPaths.has(abs);
    ocConfigs.push({
      path: abs,
      label: isProject ? normalizePattern(path.relative(root, abs)) : label,
      isProject,
      valid,
      cfg: valid ? parsed : null,
      raw,
      hasComments: /\.jsonc$/i.test(abs) || HU.hasComments(raw)
    });
  }

  const ocMcp = HU.uniq(ocConfigs.flatMap(c => HU.isPlainObj(c.cfg?.mcp) ? Object.keys(c.cfg.mcp) : []));
  const ocPlugins = HU.uniq(ocConfigs.flatMap(c => Array.isArray(c.cfg?.plugin) ? c.cfg.plugin.map(String) : []));
  const ocSkills = HU.uniq([
    ...HU.listSkillDirs(path.join(root, '.opencode/skills')),
    ...HU.listSkillDirs(path.join(home, '.config/opencode/skills')),
    ...(envOcDir ? HU.listSkillDirs(path.join(envOcDir, 'skills')) : []),
    ...(xdgHome ? HU.listSkillDirs(path.join(xdgHome, 'opencode/skills')) : [])
  ]);
  const ocDirs = [
    HU.existsDir(path.join(root, '.opencode')) && '.opencode/',
    HU.existsDir(path.join(root, '.opencode/skills')) && '.opencode/skills/',
    HU.existsDir(path.join(home, '.config/opencode')) && '~/.config/opencode/'
  ].filter(Boolean);
  const opencode = {
    configs: ocConfigs,
    projectConfigs: ocConfigs.filter(c => c.isProject),
    dirs: ocDirs,
    skills: ocSkills,
    mcp: ocMcp,
    plugins: ocPlugins,
    hasOpencodeIgnore: ocPlugins.some(p => HU.isPluginMatch(p, 'opencode-ignore')),
    hasOpencodeDcp: ocPlugins.some(p => HU.isPluginMatch(p, 'opencode-dcp')),
    hasOpenRtk: ocPlugins.some(p => HU.isPluginMatch(p, 'openrtk')),
    hasWatcherIgnore: ocConfigs.some(c => Array.isArray(c.cfg?.watcher?.ignore) && c.cfg.watcher.ignore.length > 0),
    hasEnvReadGuard: ocConfigs.some(c => HU.hasEnvReadDeny(c.cfg)),
    present: ocConfigs.length > 0 || ocDirs.length > 0 || ocSkills.length > 0
  };

  // Cursor
  const cursorMcp = HU.uniq([...HU.readMcpKeys(path.join(home, '.cursor/mcp.json')), ...HU.readMcpKeys(path.join(root, '.cursor/mcp.json'))]);
  const cursorSignals = [
    HU.existsFile(path.join(home, '.cursor/mcp.json')) && '~/.cursor/mcp.json',
    HU.existsFile(path.join(root, '.cursor/mcp.json')) && '.cursor/mcp.json',
    HU.existsFile(path.join(root, '.cursorignore')) && '.cursorignore',
    HU.existsFile(path.join(root, '.cursorindexingignore')) && '.cursorindexingignore',
    fs.existsSync(path.join(root, '.cursor/rules')) && '.cursor/rules',
    HU.existsDir(path.join(root, '.cursor')) && '.cursor/'
  ].filter(Boolean);

  // Gemini CLI / Code Assist
  const geminiMcp = HU.uniq([...HU.readMcpKeys(path.join(home, '.gemini/settings.json')), ...HU.readMcpKeys(path.join(root, '.gemini/settings.json'))]);
  const geminiSignals = [
    HU.existsFile(path.join(home, '.gemini/settings.json')) && '~/.gemini/settings.json',
    HU.existsFile(path.join(root, '.gemini/settings.json')) && '.gemini/settings.json',
    HU.existsFile(path.join(root, '.geminiignore')) && '.geminiignore',
    HU.existsFile(path.join(root, '.aiexclude')) && '.aiexclude',
    HU.existsFile(path.join(root, 'GEMINI.md')) && 'GEMINI.md',
    HU.existsDir(path.join(root, '.gemini')) && '.gemini/'
  ].filter(Boolean);

  // Codex CLI
  const codexGlobal = HU.parseCodexToml(path.join(home, '.codex/config.toml'));
  const codexProject = HU.parseCodexToml(path.join(root, '.codex/config.toml'));
  const codexMcp = HU.uniq([...codexGlobal.mcp, ...codexProject.mcp]);
  const codexTools = HU.uniq([...codexGlobal.tools, ...codexProject.tools]);
  const codexSignals = [
    codexGlobal.present && '~/.codex/config.toml',
    HU.existsFile(path.join(root, '.codex/config.toml')) && '.codex/config.toml',
    HU.existsFile(path.join(home, '.codex/hooks.json')) && '~/.codex/hooks.json',
    HU.existsFile(path.join(root, '.codex/hooks.json')) && '.codex/hooks.json',
    HU.existsFile(path.join(root, 'AGENTS.override.md')) && 'AGENTS.override.md',
    HU.existsDir(path.join(root, '.codex')) && '.codex/'
  ].filter(Boolean);

  // VS Code / GitHub Copilot
  const vscodeMcp = HU.readMcpKeys(path.join(root, '.vscode/mcp.json'), 'servers');
  const copilotSignals = [
    HU.existsFile(path.join(root, '.vscode/mcp.json')) && '.vscode/mcp.json',
    HU.existsFile(path.join(root, '.github/copilot-instructions.md')) && '.github/copilot-instructions.md',
    HU.existsDir(path.join(root, '.github/instructions')) && '.github/instructions/'
  ].filter(Boolean);

  // Windsurf
  const windsurfMcp = HU.readMcpKeys(path.join(home, '.codeium/windsurf/mcp_config.json'));
  const windsurfSignals = [
    HU.existsFile(path.join(home, '.codeium/windsurf/mcp_config.json')) && '~/.codeium/windsurf/mcp_config.json',
    HU.existsDir(path.join(root, '.windsurf')) && '.windsurf/',
    HU.existsFile(path.join(root, '.codeiumignore')) && '.codeiumignore'
  ].filter(Boolean);

  // Cline / Roo / Aider
  const editorAgentSignals = [
    HU.existsFile(path.join(root, '.rooignore')) && '.rooignore',
    HU.existsDir(path.join(root, '.roo')) && '.roo/',
    HU.existsFile(path.join(root, '.clineignore')) && '.clineignore',
    HU.existsDir(path.join(root, '.cline')) && '.cline/',
    HU.existsFile(path.join(root, '.aiderignore')) && '.aiderignore'
  ].filter(Boolean);

  // RTK
  const rtkSignals = [
    (HU.existsDir(path.join(home, '.config/rtk')) || Boolean(xdgHome && HU.existsDir(path.join(xdgHome, 'rtk')))) && '~/.config/rtk/',
    opencode.hasOpenRtk && 'openrtk',
    (HU.hasRtkInClaude(claudeGlobalSettings) || HU.hasRtkInClaude(claudeProjSettings) || HU.hasRtkInClaude(claudeLocalSettings)) && 'claude-hooks'
  ].filter(Boolean);

  // Install-only signal: a repo-local .contextignore (which --sync-ignores itself writes) must not gate --slice.
  const hasTokenOptInstall = has('.claude/token-optimizer') || has('.gemini/token-optimizer');
  const hasTokenOpt = hasTokenOptInstall || HU.existsFile(path.join(root, '.contextignore'));
  const allMcp = [...claudeMcp, ...agyMcp, ...ocMcp, ...cursorMcp, ...geminiMcp, ...codexMcp, ...vscodeMcp, ...windsurfMcp];
  const hasJcm = allMcp.includes('jcodemunch') || HU.existsFile(path.join(root, '.jcodemunch.jsonc'));
  return {
    home,
    has,
    claudeMcp,
    claudeSignals,
    claudeSettings: claudeGlobalSettings,
    agyMcp,
    hasTokenOpt,
    hasTokenOptInstall,
    hasJcm,
    opencode,
    cursor: { signals: cursorSignals, mcp: cursorMcp },
    gemini: { signals: geminiSignals, mcp: geminiMcp },
    codex: { signals: codexSignals, mcp: codexMcp, tools: codexTools },
    copilot: { signals: copilotSignals, mcp: vscodeMcp },
    windsurf: { signals: windsurfSignals, mcp: windsurfMcp },
    editorAgents: editorAgentSignals,
    rtk: rtkSignals
  };
}

function cmdDetect(opts) {
  const hosts = detectHostTools(opts.root);
  const { home, has, claudeMcp, claudeSignals, claudeSettings, agyMcp, hasTokenOpt, hasJcm, opencode, cursor, gemini, codex, copilot, windsurf, editorAgents, rtk } = hosts;
  const caveman = has('.claude/.caveman-active') ? fs.readFileSync(path.join(home, '.claude/.caveman-active'), 'utf8').trim() : 'off';
  const enabledPlugins = Object.keys(claudeSettings.enabledPlugins || {}).filter(k => claudeSettings.enabledPlugins[k]);
  const repo = walkRepo(opts.root, 5);
  const pluginCfg = claudeSettings.pluginConfigs || {};
  const compactKey = Object.keys(pluginCfg).find(k => pluginCfg[k]?.options?.autoCompactAt !== undefined);
  const compactAt = compactKey ? pluginCfg[compactKey].options.autoCompactAt : undefined;
  const activeExtraIgnores = EXTRA_IGNORE_SPECS
    .filter(s => HU.existsFile(path.join(opts.root, s.file)) || s.dirs.some(d => HU.existsDir(path.join(opts.root, d))))
    .map(s => s.file);
  const syncList = [
    '.ignore',
    ...(hasTokenOpt ? ['.contextignore'] : []),
    ...(hasJcm ? ['.jcodemunch.jsonc'] : []),
    ...activeExtraIgnores,
    ...opencode.projectConfigs.map(c => c.label)
  ];

  const ocLabels = HU.uniq([...opencode.configs.map(c => c.label), ...opencode.dirs]);
  const ocGuardSummary = `env-deny=${opencode.hasEnvReadGuard}, watcher-ignore=${opencode.hasWatcherIgnore}, opencode-ignore=${opencode.hasOpencodeIgnore}`;
  const ocLine = opencode.present
    ? `OpenCode: ${HU.fmtList(ocLabels, 5)} | mcp=${HU.fmtList(opencode.mcp)} | plugins=${HU.fmtList(opencode.plugins)} | guards(${ocGuardSummary})${opencode.skills.length ? ` | skills=${HU.fmtList(opencode.skills, 6)}` : ''}`
    : 'OpenCode: none';
  const codexExtra = codex.tools.length ? ` | tools=${HU.fmtList(codex.tools, 5)}` : '';

  const out = [
    '=== ANTIS-OPTIMIZER --DETECT ===',
    `Root: ${opts.root}`,
    `Stack: ${detectStack(opts.root).join(', ') || 'generic'} | Git dirs: ${repo.gitDirs.join(', ') || 'none'}`,
    `Token Optimizer: claude=${has('.claude/token-optimizer')} | antigravity=${has('.gemini/token-optimizer')} (PreToolUse off on Windows Antigravity)`,
    `TokenEconomizer: ${has('.tokeneconomizer/index.json')} | Caveman: ${caveman} | Ponytail: ${has('.gemini/config/plugins/ponytail')} | RTK: ${HU.fmtList(rtk)}`,
    `AutoCompact threshold: ${compactAt ?? 'unset'}`,
    `MCP servers (Claude): ${HU.fmtList(claudeMcp)}`,
    `MCP servers (Antigravity): ${HU.fmtList(agyMcp)}`,
    `Claude plugins: ${HU.fmtList(enabledPlugins)} | project=${HU.fmtList(claudeSignals)} | Codex hooks: ${has('.codex/hooks.json') ? 'present' : 'none'}`,
    ocLine,
    HU.fmtHost('Cursor', cursor.signals, cursor.mcp),
    HU.fmtHost('Gemini CLI', gemini.signals, gemini.mcp),
    HU.fmtHost('Codex CLI', codex.signals, codex.mcp, codexExtra),
    HU.fmtHost('VS Code / Copilot', copilot.signals, copilot.mcp),
    HU.fmtHost('Windsurf', windsurf.signals, windsurf.mcp),
    `Cline / Roo / Aider: ${HU.fmtList(editorAgents)}`,
    'Recommended Profile:',
    '  - Skip prose brevity rules in AGENTS.md when Ponytail/Caveman active; keep Codex AGENTS.md pointer-only.',
    `  - Sync ${syncList.join(' + ')} (traps=${repo.largeTraps.length}, generated=${repo.generatedHints.length}, dirs=${repo.backupDirs.length}).${partialNote(repo.truncated)}`
  ];
  if (repo.suggestDirs.length) {
    out.push(`  - Review (not auto-synced; add to .ignore by hand if junk): ${repo.suggestDirs.join(', ')}`);
  }
  if (repo.dotSourceDirs.length) {
    out.push(`  - Dot-dirs (rg/Grep needs --hidden or explicit path; Windows rg prints \\): ${repo.dotSourceDirs.join(', ')}`);
  }
  console.log(capOutput(out.join('\n')));
}

function extractUserComments(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.startsWith('#') && !/^#\s*Synced by antis?-optimizer/i.test(s));
}

function computeIgnoreTargets(root) {
  const repo = walkRepo(root, 5);
  const existingIgnore = parseLinesFile(path.join(root, '.ignore')).map(normalizePattern).filter(Boolean);
  const rootGitIgnore = parseLinesFile(path.join(root, '.gitignore')).map(normalizePattern).filter(Boolean);
  const posSet = new Set(BASE_TRAPS);
  const negSet = new Set();
  for (const p of [...existingIgnore, ...rootGitIgnore]) {
    if (p.startsWith('!')) negSet.add(p);
    else posSet.add(p);
  }
  for (const d of repo.backupDirs) posSet.add(d); // well-known output dirs only; guesses live in suggestDirs
  for (const t of repo.largeTraps) if (t.base64) posSet.add(t.rel);
  for (const g of repo.generatedHints) posSet.add(g);
  const patterns = [...posSet, ...negSet];
  const extraTargets = EXTRA_IGNORE_SPECS.map(spec => {
    const filePath = path.join(root, spec.file);
    const active = HU.existsFile(filePath) || spec.dirs.some(d => HU.existsDir(path.join(root, d)));
    const existing = parseLinesFile(filePath).map(normalizePattern).filter(Boolean);
    return { ...spec, filePath, active, existing, missing: active ? missingIgnorePatterns(patterns, existing) : [] };
  });
  return {
    patterns,
    suggestDirs: repo.suggestDirs.filter(d => !posSet.has(d)),
    truncated: repo.truncated,
    existingIgnore,
    existingContext: parseLinesFile(path.join(root, '.contextignore')).map(normalizePattern),
    jcmPath: path.join(root, '.jcodemunch.jsonc'),
    jcmObj: readJsonSafe(path.join(root, '.jcodemunch.jsonc'), true),
    extraTargets
  };
}

function missingIgnorePatterns(targets, rawList) {
  const norm = Array.isArray(rawList) ? rawList.map(normalizePattern) : [];
  return targets.filter(p => !norm.includes(p) && !norm.includes(`**/${p}`));
}

function cmdSyncIgnores(opts) {
  const { patterns, suggestDirs, truncated, existingIgnore, existingContext, jcmPath, jcmObj, extraTargets } = computeIgnoreTargets(opts.root);
  const hosts = detectHostTools(opts.root);
  const { hasTokenOpt, hasJcm, opencode } = hosts;
  const syncCtx = Boolean(opts.allIgnores || hasTokenOpt);
  const syncJcm = Boolean(opts.allIgnores || hasJcm);

  const mIg = missingIgnorePatterns(patterns, existingIgnore);
  const mCtx = syncCtx ? missingIgnorePatterns(patterns, existingContext) : [];
  const mJcm = syncJcm ? missingIgnorePatterns(patterns, jcmObj?.extra_ignore_patterns) : [];
  const activeExtras = extraTargets.filter(t => t.active);
  const skippedExtras = extraTargets.filter(t => !t.active).map(t => t.file);

  if (!opts.write) {
    const ocDry = opencode.projectConfigs.map(c => {
      if (!c.valid) return `${c.label} (skipped: invalid JSON/JSONC)`;
      const mOc = missingIgnorePatterns(patterns, c.cfg?.watcher?.ignore);
      const note = c.hasComments ? ' [JSONC: comment-safe splice/hint]' : '';
      return `${c.label} watcher.ignore missing (${mOc.length}): ${HU.fmtList(mOc, 10)}${note}`;
    });
    const skippedAll = [...skippedExtras, ...(!opencode.projectConfigs.length ? ['opencode.json[c]'] : [])];
    const out = [
      '=== TRIPLE-IGNORE SYNC (DRY RUN) ===',
      `Target patterns (${patterns.length}): ${HU.fmtList(patterns, 12)}`,
      `.ignore missing (${mIg.length}): ${HU.fmtList(mIg, 10)}`,
      `.contextignore ${syncCtx ? `missing (${mCtx.length}): ${HU.fmtList(mCtx, 10)}` : '(skipped: Token Optimizer not detected)'}`,
      `.jcodemunch.jsonc ${syncJcm ? `missing (${mJcm.length}): ${HU.fmtList(mJcm, 10)}` : '(skipped: jCodemunch not detected)'}`,
      ...activeExtras.map(t => `${t.file} missing (${t.missing.length}): ${HU.fmtList(t.missing, 10)}`),
      ...ocDry,
      ...(skippedAll.length ? [`Skipped absent tools (anti-bloat; never auto-created): ${skippedAll.join(', ')}`] : []),
      ...(suggestDirs.length ? [`Review (guessed backup/heavy dirs, NOT written; add to .ignore by hand if junk): ${suggestDirs.join(', ')}`] : []),
      `Re-run with --write to write/update files.${partialNote(truncated)}`
    ].join('\n');
    console.log(capOutput(out));
    return;
  }

  const igComments = extractUserComments(path.join(opts.root, '.ignore'));
  const igHeader = ['# Synced by antis-optimizer repo-index', ...igComments].join('\n') + '\n';
  fs.writeFileSync(path.join(opts.root, '.ignore'), igHeader + patterns.join('\n') + '\n');
  const written = ['.ignore'];
  const hints = [];

  if (syncCtx) {
    const ctxComments = extractUserComments(path.join(opts.root, '.contextignore'));
    const ctxHeader = ['# Synced by antis-optimizer repo-index', ...(ctxComments.length ? ctxComments : igComments)].join('\n') + '\n';
    fs.writeFileSync(path.join(opts.root, '.contextignore'), ctxHeader + patterns.join('\n') + '\n');
    written.push('.contextignore');
  }

  if (syncJcm) {
    if (fs.existsSync(jcmPath)) {
      const rawJcm = fs.readFileSync(jcmPath, 'utf8');
      const arrLiteral = JSON.stringify(patterns, null, 4).replace(/\n\]$/, '\n  ]');
      const span = HU.findPropSpan(rawJcm, 'extra_ignore_patterns');
      const spliced = span?.valChar === '['
        ? rawJcm.slice(0, span.valStart) + arrLiteral + rawJcm.slice(span.valEnd + 1)
        : (span?.notFound ? HU.insertProp(rawJcm, span.objStart, span.objEnd, `"extra_ignore_patterns": ${arrLiteral}`, '  ') : null);
      if (spliced !== null) {
        fs.writeFileSync(jcmPath, spliced);
      } else {
        const nextJcm = { ...(jcmObj || {}), extra_ignore_patterns: patterns };
        fs.writeFileSync(jcmPath, JSON.stringify(nextJcm, null, 2) + '\n');
      }
    } else {
      const nextJcm = { ...(jcmObj || {}), extra_ignore_patterns: patterns };
      fs.writeFileSync(jcmPath, '// Synced by antis-optimizer repo-index\n' + JSON.stringify(nextJcm, null, 2) + '\n');
    }
    written.push('.jcodemunch.jsonc');
  }

  for (const t of activeExtras) {
    const tComments = extractUserComments(t.filePath);
    const tHeader = ['# Synced by antis-optimizer repo-index', ...(tComments.length ? tComments : igComments)].join('\n') + '\n';
    const merged = HU.mergeToolPatterns(patterns, t.existing);
    fs.writeFileSync(t.filePath, tHeader + merged.join('\n') + '\n');
    written.push(t.file);
  }

  for (const oc of opencode.projectConfigs) {
    if (!oc.valid) {
      hints.push(`skipped ${oc.label}: invalid JSON/JSONC`);
      continue;
    }
    const curWatcher = Array.isArray(oc.cfg?.watcher?.ignore) ? oc.cfg.watcher.ignore.map(normalizePattern).filter(Boolean) : [];
    const nextIgnore = HU.uniq([...curWatcher, ...patterns]);
    if (!oc.hasComments) {
      const nextObj = { ...oc.cfg, watcher: { ...(HU.isPlainObj(oc.cfg.watcher) ? oc.cfg.watcher : {}), ignore: nextIgnore } };
      fs.writeFileSync(oc.path, JSON.stringify(nextObj, null, 2) + '\n');
      written.push(oc.label);
    } else {
      const spliced = HU.spliceWatcherIgnore(oc.raw, nextIgnore);
      if (spliced !== null) {
        fs.writeFileSync(oc.path, spliced);
        written.push(oc.label);
      } else {
        hints.push(`skipped ${oc.label}: JSONC comments preserved — add "watcher.ignore" or "opencode-ignore" plugin manually`);
      }
    }
  }

  const review = suggestDirs.length ? ` | review ${suggestDirs.length} guessed dir(s) via dry run` : '';
  const hintNote = hints.length ? ` | ${hints.join('; ')}` : '';
  console.log(capOutput(`PASS sync-ignores: wrote ${written.join(', ')} (${patterns.length} patterns)${review}${hintNote}${partialNote(truncated)}`));
}

function cmdMap(opts) {
  const repo = walkRepo(opts.root, 5);
  const ig = loadIgnoreRules(opts.root);
  const top = fs.readdirSync(opts.root, { withFileTypes: true })
    .filter(e => e.name !== '.git' && !SKIP_WALK_DIRS.has(e.name) && !(e.isDirectory() ? isDirIgnored(ig, e.name, e.name) : (isFileIgnored(ig, e.name, e.name) || BINARY_EXT_RE.test(e.name))))
    .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name))
    .slice(0, 30);
  const lines = [
    '=== REPO-INDEX --MAP ===',
    `Root: ${opts.root} | Stack: ${detectStack(opts.root).join(', ') || 'generic'}${partialNote(repo.truncated)}`,
    `Git dirs: ${repo.gitDirs.join(', ') || 'none'} | AGENTS.md: ${repo.agents.join(', ') || 'none'}`,
    `INDEX.md: ${repo.indexFiles.join(', ') || 'none'} | Traps: ${repo.largeTraps.map(t => `${t.rel}(${Math.round(t.bytes / 1024)}KB)`).join(', ') || 'none'}`,
    ...(repo.opencodeSkills.length ? [`OpenCode skills: ${repo.opencodeSkills.map(s => path.basename(path.dirname(s))).join(', ')}`] : []),
    ...(repo.dotSourceDirs.length ? [`Dot-dirs (rg needs --hidden or explicit path): ${repo.dotSourceDirs.join(', ')}`] : []),
    'Top entries:'
  ];
  for (const e of top) {
    if (e.isDirectory()) {
      let n = 0;
      try { n = fs.readdirSync(path.join(opts.root, e.name)).length; } catch {}
      lines.push(`  dir  ${e.name}/ (${n} entries)`);
    } else {
      let sz = 0;
      try { sz = fs.statSync(path.join(opts.root, e.name)).size; } catch {}
      lines.push(`  file ${e.name} (${sz} B)`);
    }
  }
  console.log(capOutput(lines.join('\n')));
}

function canStartRegex(prevSigChar, outSoFar) {
  if (!prevSigChar) return true;
  if (prevSigChar === '+' || prevSigChar === '-') return !/(?:\+\+|--)$/.test(outSoFar.trimEnd());
  if ('=(,[!&|?:;{}~*%^<>'.includes(prevSigChar)) return true;
  return /(?<![.$\w])(?:return|case|throw|typeof|void|delete|in|of|yield|await)$/.test(outSoFar.trimEnd());
}

function cloneLexState(st) {
  return {
    inBlockComment: Boolean(st.inBlockComment),
    quote: st.quote || '',
    tplStack: Array.isArray(st.tplStack) ? [...st.tplStack] : [],
    rawHashes: st.rawHashes ?? -1
  };
}

/**
 * Stateful lexer that strips strings (including nested JS `${...}` template literals,
 * Go raw backtick strings, Rust multi-line/raw strings & Unicode char literals),
 * comments, JS/TS regex literals (/.../), and Rust lifetimes ('a).
 */
function stripJsStringsAndComments(line, state, ext = '.js') {
  let out = '', exprOut = '';
  let quote = state.quote || '';
  const tplStack = state.tplStack || (state.tplStack = []);
  let rawHashes = state.rawHashes ?? -1;
  let inRegex = false, inRegexCharClass = false;
  let prevSig = '';
  let escapedEol = false;
  const isJsLike = ext === '.js' || ext === '.cjs' || ext === '.mjs' || ext === '.ts' || ext === '.tsx' || ext === '.jsx';
  const isRust = ext === '.rs';
  const isGo = ext === '.go';
  const isPhp = ext === '.php';
  const isTripleStrLang = ext === '.java' || ext === '.kt' || ext === '.kts' || ext === '.swift';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i], next = line[i + 1];
    if (state.inBlockComment) {
      if (ch === '*' && next === '/') { state.inBlockComment = false; i++; }
      continue;
    }
    if (rawHashes >= 0) {
      if (ch === '"') {
        let h = 0;
        while (h < rawHashes && line[i + 1 + h] === '#') h++;
        if (h === rawHashes) {
          i += rawHashes;
          rawHashes = -1;
          prevSig = '"';
        }
      }
      continue;
    }
    if (inRegex) {
      if (ch === '\\') { i++; continue; }
      if (ch === '[') inRegexCharClass = true;
      else if (ch === ']') inRegexCharClass = false;
      else if (ch === '/' && !inRegexCharClass) {
        inRegex = false;
        prevSig = '/';
        exprOut += '/';
      }
      continue;
    }
    if (quote) {
      if (quote === '"""') {
        if (ch === '\\') { i++; continue; }
        if (line.startsWith('"""', i)) {
          quote = '';
          i += 2;
          prevSig = '"';
          exprOut += '"';
        }
        continue;
      }
      if (ch === '\\' && !(isGo && quote === '`')) {
        if (i + 1 >= line.length) escapedEol = true;
        i++;
        continue;
      }
      if (isJsLike && quote === '`' && ch === '$' && next === '{') {
        tplStack.push(0);
        quote = '';
        prevSig = '{';
        exprOut += '{';
        i++;
        continue;
      }
      if (ch === quote) {
        quote = '';
        prevSig = ch;
        exprOut += ch;
      }
      continue;
    }
    if (ch === '/' && next === '/' && ext !== '.css') break; // CSS has no line comments: `url(https://…)`
    if (isPhp && ch === '#' && next !== '[') break;
    if (ch === '/' && next === '*') { state.inBlockComment = true; i++; continue; }
    if (isJsLike && ch === '/' && canStartRegex(prevSig, exprOut)) {
      inRegex = true;
      inRegexCharClass = false;
      continue;
    }
    if (isRust && (ch === 'r' || (ch === 'b' && next === 'r')) && (i === 0 || !/[A-Za-z0-9_]/.test(line[i - 1]))) {
      const rm = /^(?:b?r)(#*)"/.exec(line.slice(i));
      if (rm) {
        rawHashes = rm[1].length;
        i += rm[0].length - 1;
        continue;
      }
    }
    if (ext === '.swift' && ch === '#') {
      const srm = /^(#+)"(?!"")/.exec(line.slice(i));
      if (srm) {
        rawHashes = srm[1].length;
        i += srm[0].length - 1;
        continue;
      }
    }
    if (isTripleStrLang && line.startsWith('"""', i)) {
      quote = '"""';
      i += 2;
      continue;
    }
    if (ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === "'") {
      if (isRust) {
        const cm = /^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F_]{1,6}\}|.)|[^'\\])'/.exec(line.slice(i));
        if (cm) {
          i += cm[0].length - 1;
          prevSig = "'";
        }
        continue;
      }
      quote = "'";
      continue;
    }
    if (tplStack.length > 0) {
      if (ch === '{') tplStack[tplStack.length - 1]++;
      else if (ch === '}') {
        if (tplStack[tplStack.length - 1] > 0) tplStack[tplStack.length - 1]--;
        else {
          tplStack.pop();
          quote = '`';
          continue;
        }
      }
      exprOut += ch;
      if (ch.trim()) prevSig = ch;
      continue;
    }
    out += ch;
    exprOut += ch;
    if (ch.trim()) prevSig = ch;
  }
  state.rawHashes = rawHashes;
  state.quote = (quote === '`' || quote === '"""' || (isRust && quote === '"') || (isPhp && (quote === '"' || quote === "'")) || (quote && escapedEol)) ? quote : '';
  return out;
}

function findObjectSpan(filePath, keyRegex) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const idx = lines.findIndex(l => keyRegex.test(l));
    if (idx < 0) return null;
    const startIdx = (idx > 0 && lines[idx - 1].trim() === '{') ? idx - 1 : idx;
    let depth = 0, started = false, end = startIdx;
    const lexState = { inBlockComment: false, quote: '' };
    for (let i = startIdx; i < Math.min(lines.length, startIdx + 450); i++) {
      const structural = stripJsStringsAndComments(lines[i], lexState, '.json');
      for (const ch of structural) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') depth--;
      }
      end = i;
      if (started && depth <= 0) break;
    }
    return `${path.basename(filePath)}:L${startIdx + 1}-L${end + 1}`;
  } catch { return null; }
}

function trimValue(v, depth = 0) {
  if (depth > 3) return '[...]';
  if (typeof v === 'string') {
    const clean = redactSecrets(v);
    return clean.length > 100 ? clean.slice(0, 100) + '...' : clean;
  }
  if (Array.isArray(v)) return v.slice(0, 1).map(x => trimValue(x, depth + 1));
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    const out = {};
    for (const [k, val] of entries.slice(0, 8)) out[k] = trimValue(val, depth + 1);
    if (entries.length > 8) out._moreKeys = entries.length - 8;
    return out;
  }
  return v;
}

function parseSliceTargetSpec(raw) {
  const m = String(raw || '').match(/^(.*?)(?:#([^:#]+))?(?::L(\d+)(?:-L(\d+))?)?$/i);
  if (!m || !m[1]) return null;
  const start = m[3] ? parseInt(m[3], 10) : null;
  const end = m[4] ? parseInt(m[4], 10) : start;
  return {
    scopeRaw: m[1],
    scope: normalizePattern(m[1]).toLowerCase(),
    inlineSym: m[2] || '',
    explicitStart: start,
    explicitEnd: end
  };
}

function findBestOutlineEntry(entries, symQuery) {
  const q = symQuery.toLowerCase();
  const strip = s => s.toLowerCase().replace(/^[#.]/, '');
  return entries.find(e => e.symbol.toLowerCase() === q || strip(e.symbol) === q)
    || entries.find(e => strip(e.symbol).startsWith(q))
    || entries.find(e => e.symbol.toLowerCase().includes(q) || e.text.toLowerCase().includes(q))
    || null;
}

function isRelPathIgnored(ig, rel) {
  const parts = rel.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === '.git' || SKIP_WALK_DIRS.has(parts[i])) return true;
    if (isDirIgnored(ig, parts.slice(0, i + 1).join('/'), parts[i])) return true;
  }
  return isFileIgnored(ig, rel, parts[parts.length - 1]);
}

function cmdSlice(opts) {
  const { hasTokenOptInstall } = detectHostTools(opts.root);
  if (hasTokenOptInstall && opts.pos.some(a => /\.json(?:$|:)/i.test(a))) {
    console.error('REFUSED: Do not pass raw .json paths to --slice when Token Optimizer is active (triggers bash_compress on node args). Pass logical module IDs instead.');
    process.exit(2);
  }
  const [scopeArg, idArg] = opts.pos;
  const spec = parseSliceTargetSpec(scopeArg);
  if (!spec) { console.error('Usage: --slice <scope> [id] | <file>:Lstart-Lend'); process.exit(1); }
  if (/(?:^|\/)\.env(?:\.|$)/i.test(spec.scope) || isSecretPath(spec.scope)) {
    console.error(`REFUSED: Secret/credential scope blocked by security guard: ${scopeArg}`);
    process.exit(2);
  }
  const resolvedDirect = path.resolve(opts.root, spec.scopeRaw);
  if ((spec.scopeRaw.includes('..') || path.isAbsolute(spec.scopeRaw)) && !isInsideRoot(opts.root, resolvedDirect)) {
    console.error(`REFUSED: Path outside repository root: ${scopeArg}`);
    process.exit(2);
  }

  const candidates = [];
  let blockedSecret = false;
  const ig = loadIgnoreRules(opts.root);
  const directRel = normalizePattern(path.relative(opts.root, resolvedDirect));
  let directIsFile = false;
  try { directIsFile = isInsideRoot(opts.root, resolvedDirect) && fs.statSync(resolvedDirect).isFile(); } catch {}
  if (directIsFile && isSecretPath(directRel)) {
    blockedSecret = true;
  } else if (directIsFile && !isRelPathIgnored(ig, directRel) && SLICE_EXTS.test(resolvedDirect) && !LOCKFILE_RE.test(path.basename(resolvedDirect))) {
    candidates.push(resolvedDirect);
  } else {
    let visits = 0;
    (function findMod(dir, depth) {
      if (depth > 5 || candidates.length >= 50 || visits >= MAX_WALK_VISITS) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (visits++ >= MAX_WALK_VISITS || candidates.length >= 50) return;
        if (SKIP_WALK_DIRS.has(e.name) || e.name === '.git') continue;
        const p = path.join(dir, e.name);
        const rel = normalizePattern(path.relative(opts.root, p));
        if (e.isDirectory()) {
          if (!isDirIgnored(ig, rel, e.name)) findMod(p, depth + 1);
        } else if (e.name.toLowerCase().includes(spec.scope) || rel.toLowerCase().includes(spec.scope)) {
          if (isSecretPath(rel)) {
            blockedSecret = true;
            continue;
          }
          if (
            !isFileIgnored(ig, rel, e.name) &&
            !(rel === 'scripts/repo-index.cjs' && !spec.scope.includes('repo-index')) &&
            SLICE_EXTS.test(e.name) &&
            !LOCKFILE_RE.test(e.name)
          ) {
            candidates.push(p);
          }
        }
      }
    })(opts.root, 0);
  }

  if (!candidates.length) {
    if (blockedSecret) {
      console.error(`REFUSED: Secret/credential file blocked by security guard: ${scopeArg}`);
      process.exit(2);
    }
    console.error(`Slice target not found: ${spec.scope}`);
    process.exit(1);
  }
  const rank = p => {
    const rel = normalizePattern(path.relative(opts.root, p)).toLowerCase();
    const base = path.basename(p).toLowerCase();
    if (rel === spec.scope) return -1;
    if (path.parse(base).name === spec.scope || base === spec.scope) return 0;
    if (base.startsWith(spec.scope)) return 1;
    return 2;
  };
  candidates.sort((a, b) => rank(a) - rank(b));
  const target = candidates[0];
  const rel = normalizePattern(path.relative(opts.root, target));
  const effectiveId = idArg || spec.inlineSym;

  if (spec.explicitStart !== null) {
    const lines = fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    const startIdx = Math.max(0, Math.min(lines.length - 1, spec.explicitStart - 1));
    const reqEnd = Math.max(startIdx + 1, Math.min(lines.length, spec.explicitEnd || spec.explicitStart));
    const endIdx = Math.min(reqEnd, startIdx + MAX_CODE_SLICE_LINES);
    console.log(capOutput(`landmark: ${rel}:L${startIdx + 1}-L${endIdx}\n` + lines.slice(startIdx, endIdx).join('\n')));
    return;
  }

  if (target.endsWith('.json')) {
    const data = readJsonSafe(target, true);
    if (data !== null) {
      const arrKey = Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length);
      const list = Array.isArray(data) ? data : (arrKey ? data[arrKey] : [data]);
      const byKey = effectiveId && list.find(x => x && (x.id === effectiveId || x.name === effectiveId || x.tagName === effectiveId || x.tag === effectiveId || x.slug === effectiveId));
      const byProp = effectiveId && data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, effectiveId) ? { [effectiveId]: data[effectiveId] } : null;
      if (effectiveId && !byKey && !byProp) {
        console.error(`Slice target id "${effectiveId}" not found in ${rel}`);
        process.exit(1);
      }
      const item = byKey || byProp || list[0];
      const keyVal = item?.id || item?.name || item?.tagName || item?.tag || item?.slug;
      const escId = keyVal ? String(keyVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      const span = escId ? findObjectSpan(target, new RegExp(`"(?:id|name|tagName|tag|slug)"\\s*:\\s*"${escId}"`)) : `${path.basename(target)}:L1-L40`;
      const dirPrefix = path.dirname(rel) === '.' ? '' : `${path.dirname(rel)}/`;
      console.log(capOutput(JSON.stringify({ landmark: `${dirPrefix}${span}`, sample: trimValue(item) }, null, 2)));
      return;
    }
  }

  const lines = fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const ext = path.extname(target).toLowerCase();
  if (effectiveId && CODE_EXTS.has(ext)) {
    const { entries } = parseFileOutline(target);
    const entry = findBestOutlineEntry(entries, effectiveId);
    if (entry) {
      const startIdx = Math.max(0, entry.startLine - 1);
      const isMarker = /^(?:<!--|\/\*|<script\b|<style\b)/i.test(entry.symbol);
      const endIdx = entry.endLine > entry.startLine
        ? Math.min(lines.length, entry.endLine, startIdx + MAX_CODE_SLICE_LINES)
        : (isMarker ? Math.min(lines.length, startIdx + 40) : Math.min(lines.length, entry.endLine));
      console.log(capOutput(`landmark: ${rel}:L${startIdx + 1}-L${endIdx}\n` + lines.slice(startIdx, endIdx).join('\n')));
      return;
    }
  }

  let start = 0;
  if (effectiveId) {
    const idx = lines.findIndex(l => l.toLowerCase().includes(effectiveId.toLowerCase()));
    if (idx < 0) {
      console.error(`Slice target symbol/pattern "${effectiveId}" not found in ${rel}`);
      process.exit(1);
    }
    start = Math.max(0, idx - 3);
  }
  const end = Math.min(lines.length, start + 40);
  console.log(capOutput(`landmark: ${rel}:L${start + 1}-L${end}\n` + lines.slice(start, end).join('\n')));
}

function updatePyTriple(line, inTriple) {
  let q = inTriple, singleQ = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') { i++; continue; }
    if (q) {
      if (line.startsWith(q, i)) { q = ''; i += 2; }
      continue;
    }
    if (singleQ) {
      if (ch === singleQ) singleQ = '';
      continue;
    }
    if (ch === '#') break;
    if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
      q = line.slice(i, i + 3);
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") singleQ = ch;
  }
  return q;
}

let cachedTs = undefined;
function loadTypeScript() {
  if (process.env.ANTIS_FORCE_LEXER === '1') return null;
  if (cachedTs !== undefined) return cachedTs;
  // Only the tool's own install or the global npm dir: resolving from the target repo/cwd would
  // require() (execute) whatever an untrusted clone ships as node_modules/typescript.
  const searchPaths = [__dirname];
  if (process.env.APPDATA) searchPaths.push(path.join(process.env.APPDATA, 'npm', 'node_modules'));
  for (const base of searchPaths) {
    try {
      const resolved = require.resolve('typescript', { paths: [base] });
      cachedTs = require(resolved);
      return cachedTs;
    } catch {}
  }
  cachedTs = null;
  return null;
}

function tryParseTypeScriptAst(fullPath, raw, lines) {
  const ts = loadTypeScript();
  if (!ts) return null;
  try {
    const sf = ts.createSourceFile(fullPath, raw, ts.ScriptTarget.Latest, true);
    const entries = [];
    const addEntry = (node, sym) => {
      if (!sym) return;
      const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const firstIdx = startLine - 1;
      const trimmed = (lines[firstIdx] || '').trim();
      let sig = trimmed.split(/\s*\{\s*/)[0].replace(/(=>\s*).+$/, '$1...');
      if ((sig.endsWith('(') || trimmed.endsWith('{')) && !trimmed.includes(')') && firstIdx + 1 < lines.length) {
        sig = trimmed + ' ' + lines[firstIdx + 1].trim().replace(/,\s*$/, '') + '...)';
      }
      entries.push({
        startLine,
        endLine,
        symbol: sym,
        text: `L${startLine}${endLine > startLine ? '-L' + endLine : ''}: ${sig.slice(0, 96)}`
      });
    };

    const unwrapInit = expr => {
      let cur = expr;
      while (cur && (ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(cur)))) {
        cur = cur.expression;
      }
      return cur;
    };

    const visitNode = (node, depth) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        addEntry(node, node.name.getText(sf));
        if (depth === 0 && node.body && ts.isBlock(node.body)) {
          for (const st of node.body.statements) visitNode(st, 1);
        }
        return;
      }
      if ((ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) && node.name) {
        addEntry(node, node.name.getText(sf));
        if (ts.isClassDeclaration(node) && node.members) {
          for (const m of node.members) {
            if ((ts.isMethodDeclaration(m) || ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) && m.name) {
              addEntry(m, m.name.getText(sf));
            }
          }
        }
        return;
      }
      if (ts.isVariableStatement(node) && depth <= 1) {
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          const init = unwrapInit(decl.initializer);
          const isFn = ts.isArrowFunction(init) || ts.isFunctionExpression(init);
          const isWrapper = depth === 0 && ts.isCallExpression(init) && /(?:^|\.)(?:forwardRef|memo)$/.test(init.expression.getText(sf));
          if (isFn || isWrapper) {
            addEntry(node, decl.name.getText(sf));
            if (depth === 0 && isFn && init.body && ts.isBlock(init.body)) {
              for (const st of init.body.statements) visitNode(st, 1);
            }
          }
        }
      }
    };

    for (const st of sf.statements) visitNode(st, 0);
    return entries;
  } catch {
    return null;
  }
}

function parseFileOutline(fullPath) {
  const ext = path.extname(fullPath).toLowerCase();
  const raw = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  const entries = [];

  if (ext === '.js' || ext === '.cjs' || ext === '.mjs' || ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
    const astEntries = tryParseTypeScriptAst(fullPath, raw, lines);
    if (astEntries !== null) {
      return { lines, rawBytes: Buffer.byteLength(raw), entries: astEntries, astEngine: 'typescript-compiler' };
    }
  }

  const h = {
    fmtSpan(s, e) { return `L${s + 1}${e > s ? '-L' + (e + 1) : ''}`; },

    findTagSpanEnd(start, tag, nest) {
      if (nest) {
        let depth = 0, end = start;
        const openRe = new RegExp(`<${tag}\\b`, 'gi');
        const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
        for (let j = start; j < lines.length; j++) {
          depth += (lines[j].match(openRe) || []).length - (lines[j].match(closeRe) || []).length;
          end = j;
          if (depth <= 0) break;
        }
        return end;
      }
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      for (let j = start; j < lines.length; j++) {
        if (j === start && closeRe.test(lines[j].slice(1))) return j;
        if (j > start && new RegExp(`^\\s*</${tag}\\s*>`, 'i').test(lines[j])) return j;
      }
      for (let j = start + 1; j < lines.length; j++) {
        if (closeRe.test(lines[j])) return j;
      }
      return start;
    },

    advanceYamlBlock(line, blk) {
      if (blk.active) {
        if (!line.trim()) return true;
        const ind = line.match(/^( *)/)[1].length;
        if (blk.contentIndent < 0) {
          if (ind <= blk.headerIndent) blk.active = false;
          else { blk.contentIndent = ind; return true; }
        } else if (ind < blk.contentIndent) blk.active = false;
        else return true;
      }
      if (/^(?: *-\s+| *[^#\s][^:]*:\s*)[|>](?:[+-]\d*|\d+[+-]?)?\s*(?:#.*)?$/.test(line)) {
        blk.active = true;
        blk.headerIndent = line.match(/^( *)/)[1].length;
        blk.contentIndent = -1;
      }
      return false;
    },

    stripHashTriple(line, st, isToml) {
      let code = '', structural = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (st.triple) {
          if ((!isToml || st.triple === '"""') && ch === '\\') { i++; continue; }
          if (line.startsWith(st.triple, i)) { st.triple = ''; i += 2; }
          continue;
        }
        if (ch === '#') break;
        if (line.startsWith('"""', i) || line.startsWith("'''", i)) { st.triple = line.slice(i, i + 3); i += 2; continue; }
        if (ch === '"' || ch === "'") {
          const q = ch;
          code += q;
          i++;
          while (i < line.length) {
            const sc = line[i];
            code += sc;
            if ((!isToml || q === '"') && sc === '\\' && i + 1 < line.length) { code += line[++i]; i++; continue; }
            if (sc === q) break;
            i++;
          }
          structural += ' ';
          continue;
        }
        code += ch;
        structural += ch;
      }
      return { code, structural };
    },

    stripRuby(line, st) {
      if (st.inDoc) { if (/^=end(?:\s|$)/.test(line)) st.inDoc = false; return ''; }
      if (/^=begin(?:\s|$)/.test(line)) { st.inDoc = true; return ''; }
      if (st.heredoc) {
        if ((st.heredocStrip ? line.trimStart() : line).trimEnd() === st.heredoc) { st.heredoc = ''; st.heredocStrip = false; }
        return '';
      }
      let out = '', q = '', interp = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i], nx = line[i + 1];
        if (q) {
          if (ch === '\\') { i++; continue; }
          if (q === '"' && ch === '#' && nx === '{') { interp++; i++; out += ' '; continue; }
          if (ch === q) { q = ''; out += ' '; }
          continue;
        }
        if (interp > 0) {
          if (ch === '{') interp++;
          else if (ch === '}') { interp--; q = '"'; }
          else if (ch === '"' || ch === "'") q = ch;
          continue;
        }
        if (ch === '#') break;
        if (ch === '<' && nx === '<') {
          const hm = /^<<([-~]?)(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(line.slice(i));
          if (hm) { st.nextHeredoc = hm[3]; st.nextStrip = Boolean(hm[1]); i += hm[0].length - 1; continue; }
        }
        if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
        out += ch;
      }
      if (st.nextHeredoc) { st.heredoc = st.nextHeredoc; st.heredocStrip = st.nextStrip; st.nextHeredoc = ''; }
      return out;
    },

    stripSql(line, st) {
      let out = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i], nx = line[i + 1];
        if (st.dollarTag) {
          if (line.startsWith(st.dollarTag, i)) { i += st.dollarTag.length - 1; st.dollarTag = ''; out += ' '; }
          continue;
        }
        if (st.inBlockComment) { if (ch === '*' && nx === '/') { st.inBlockComment = false; i++; } continue; }
        if (st.quote) {
          if (ch === '\\' || (ch === "'" && nx === "'")) { i++; continue; }
          if (ch === st.quote) { st.quote = ''; out += ' '; }
          continue;
        }
        if (ch === '-' && nx === '-') break;
        if (ch === '/' && nx === '*') { st.inBlockComment = true; i++; continue; }
        if (ch === "'") { st.quote = "'"; continue; }
        if (ch === '$') {
          const dm = /^\$([A-Za-z0-9_]*)\$/.exec(line.slice(i));
          if (dm) { st.dollarTag = dm[0]; i += dm[0].length - 1; continue; }
        }
        out += ch;
      }
      return out;
    },

    stripShell(line, st) {
      if (st.heredoc) {
        if ((st.heredocStrip ? line.replace(/^\t+/, '') : line) === st.heredoc) { st.heredoc = ''; st.heredocStrip = false; }
        return '';
      }
      let out = '', q = st.quote || '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
          if (q === '"' && ch === '\\') { i++; continue; }
          if (ch === q) q = '';
          continue;
        }
        if (ch === '\\') { i++; continue; }
        if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
        if (ch === '"' || ch === "'") { q = ch; continue; }
        if (ch === '<' && line[i + 1] === '<' && line[i + 2] !== '<') {
          const hm = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(line.slice(i));
          if (hm) { st.nextHeredoc = hm[3]; st.nextStrip = Boolean(hm[1]); i += hm[0].length - 1; continue; }
        }
        out += ch;
      }
      st.quote = q;
      if (st.nextHeredoc) { st.heredoc = st.nextHeredoc; st.heredocStrip = st.nextStrip; st.nextHeredoc = ''; }
      return out;
    },

    scanBrace(bExt, startIdx, endIdx, labelPrefix) {
      let braceDepth = 0;
      const ppStack = [];
      const lexState = { inBlockComment: false, quote: '', tplStack: [], rawHashes: -1 };
      const fnOrTypeRe = /^(?:export\s+(?:default\s+)?)?(?:pub(?:\([^)]*\))?\s+)?(?:declare\s+)?(?:(?:async|const|unsafe|static|inline|virtual)\s+)*(?:(?:function|fn|func)\s*\*?\s*(?:\([^)]*\)\s*)?([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*\(|(?:class|interface|enum|type|struct|trait|impl|mod|namespace)\s+(?:<[^>]*>\s*)?([A-Za-z0-9_$]+))/;
      const topVarFnRe = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?(?:\(|[A-Za-z0-9_$]+\s*=>|(?:React\.)?(?:forwardRef|memo)\b)/;
      const innerArrowRe = /^(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/;
      const methodRe = /^\s{2,8}(?:(?:public|private|protected|static|async|readonly|get|set|pub|virtual|override)\s+)*\*?([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*\([^;]*\{/;
      const isCFamily = bExt === '.c' || bExt === '.cpp' || bExt === '.cc' || bExt === '.h' || bExt === '.hpp' || bExt === '.cs';
      const cFnRe = /^(?:(?:static|inline|extern|virtual|explicit|constexpr|const|unsigned|signed|long|short|struct|enum|public|private|protected)\s+)*[A-Za-z_][A-Za-z0-9_:<>*,&]*[\s*&]+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*$/;
      const isJava = bExt === '.java', isKt = bExt === '.kt' || bExt === '.kts', isSwift = bExt === '.swift', isPhp = bExt === '.php';
      const isJvKtSwPhp = isJava || isKt || isSwift || isPhp;
      const jvTypeRe = /^(?:(?:public|protected|private|internal|fileprivate|open|abstract|final|sealed|non-sealed|data|inner|static|readonly|indirect|nonisolated|strictfp|expect|actual|inline|value|annotation|fun)\s+)*(?:@?interface|class|enum(?:\s+class)?|struct|protocol|extension|actor|record|trait|object)\s+([A-Za-z_][A-Za-z0-9_$]*)|^(?:(?:public|protected|private|internal)\s+)?(companion\s+object)(?:\s+([A-Za-z_][A-Za-z0-9_$]*))?\s*\{/;
      const ktFunRe = /^(?:(?:public|private|protected|internal|open|abstract|final|override|suspend|inline|noinline|crossinline|infix|operator|tailrec|external|expect|actual)\s+)*fun\s+(?:<[^>{}()]+>\s+)?(?:[A-Za-z0-9_<>?.,*]+\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
      const swFunRe = /^(?:(?:public|private|fileprivate|internal|open|static|class|mutating|nonmutating|override|final|convenience|required|async)\s+)*(?:func\s+(?:<[^>{}()]+>\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(|(init[?!]?|deinit)\b)/;
      const phpFnRe = /^(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+&?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
      const jvCtorRe = /^(?:(?:public|protected|private)\s+)+([A-Z][A-Za-z0-9_$]*)\s*\(/;
      const jvMethodRe = /^(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>{};]+>\s+)?(?:[A-Za-z_$][A-Za-z0-9_$.]*(?:<[^>{};]+>)?(?:\[\])*\s+)([A-Za-z_$][A-Za-z0-9_$]*)\s*\((?:[^;=]*$|\s*[^;]*\)\s*(?:throws\s+[A-Za-z0-9_.,\s]+)?\{)/;
      const skipKw = new Set(['if', 'for', 'while', 'switch', 'catch', 'else', 'with', 'match', 'loop', 'return', 'sizeof', 'typedef', 'using', 'namespace', 'throw', 'new', 'super', 'this', 'try', 'finally', 'do', 'synchronized']);
      const maxLen = labelPrefix ? 92 : 96;

      for (let i = startIdx; i <= endIdx; i++) {
        const line = lines[i];
        const trimmed = (isPhp ? line.replace(/^\s*<\?(?:php)?\s*/i, '') : line).trim();
        const matchTrim = (isJava || isKt || isSwift) ? trimmed.replace(/^(?:@[A-Za-z_][A-Za-z0-9_.]*(?:\([^)]*\))?\s+)+/, '') : trimmed;
        const wasInCommentOrString = Boolean(lexState.inBlockComment || lexState.quote || lexState.rawHashes >= 0 || lexState.tplStack.length > 0);
        if (!wasInCommentOrString && !isPhp && trimmed.startsWith('#')) {
          if (/^#\s*(?:if|ifdef|ifndef)\b/.test(trimmed)) { ppStack.push(braceDepth); continue; }
          if (/^#\s*(?:else|elif)\b/.test(trimmed) && ppStack.length) { braceDepth = ppStack[ppStack.length - 1]; continue; }
          if (/^#\s*endif\b/.test(trimmed) && ppStack.length) { ppStack.pop(); continue; }
        }
        const structural = stripJsStringsAndComments(line, lexState, bExt);

        if (isJvKtSwPhp && !wasInCommentOrString && braceDepth === 0) {
          const pm = matchTrim.match(/^(?:package|namespace)\s+([A-Za-z0-9_.\\]+)\s*;?\s*(\{)?/);
          if (pm && !pm[2] && !(i + 1 <= endIdx && lines[i + 1].trim().startsWith('{'))) {
            entries.push({ startLine: i + 1, endLine: i + 1, symbol: pm[1], text: `${h.fmtSpan(i, i)}: ${labelPrefix}${trimmed.slice(0, maxLen)}` });
            continue;
          }
        }

        const fm = !wasInCommentOrString && braceDepth <= 1 ? trimmed.match(fnOrTypeRe) : null;
        const vm = !wasInCommentOrString && braceDepth === 0 ? trimmed.match(topVarFnRe) : null;
        const im = !wasInCommentOrString && braceDepth === 1 ? trimmed.match(innerArrowRe) : null;
        const mm = !wasInCommentOrString && braceDepth === 1 ? line.match(methodRe) : null;
        const cm = isCFamily && !wasInCommentOrString && braceDepth <= 1 && !fm && !mm ? trimmed.match(cFnRe) : null;
        const jtm = isJvKtSwPhp && !wasInCommentOrString && braceDepth <= 2 && !fm ? matchTrim.match(jvTypeRe) : null;
        const jfm = !wasInCommentOrString && braceDepth <= 2 && !fm && !jtm
          ? (isKt ? matchTrim.match(ktFunRe) : isSwift ? matchTrim.match(swFunRe) : isPhp ? matchTrim.match(phpFnRe) : null)
          : null;
        const jmm = isJava && !wasInCommentOrString && braceDepth === 1 && !fm && !jtm && !/^[^(=]*=/.test(matchTrim)
          ? (matchTrim.match(jvCtorRe) || matchTrim.match(jvMethodRe))
          : null;

        if (fm || vm || im || (mm && !skipKw.has(mm[1])) || (cm && !skipKw.has(cm[1])) || jtm || (jfm && !skipKw.has(jfm[1] || jfm[2])) || (jmm && !skipKw.has(jmm[1]))) {
          const sym = fm ? (fm[1] || fm[2]) : vm ? vm[1] : im ? im[1] : mm ? mm[1] : cm ? cm[1]
            : jtm ? (jtm[1] || jtm[3] || 'companion') : jfm ? (jfm[1] || jfm[2]) : jmm[1];
          const isWrapperCall = Boolean(vm && /\b(?:forwardRef|memo)\b/.test(trimmed));
          const isIdentArrow = Boolean((vm || im) && /=\s*(?:async\s*)?[A-Za-z0-9_$]+\s*=>/.test(trimmed));

          if (vm && !isWrapperCall && !isIdentArrow) {
            let pDepth = 0, bDepth = 0, sawOpen = false, sawClose = false, isArrow = false, hitSemi = false;
            const lookLex = cloneLexState(lexState);
            for (let k = i; k <= Math.min(endIdx, i + 16); k++) {
              const st = k === i ? structural : stripJsStringsAndComments(lines[k], lookLex, bExt);
              const startCi = k === i ? Math.max(0, st.indexOf('=')) : 0;
              for (let ci = startCi; ci < st.length; ci++) {
                const ch = st[ci], nx = st[ci + 1];
                if (ch === '(') { pDepth++; sawOpen = true; }
                else if (ch === ')' && pDepth > 0) {
                  pDepth--;
                  if (pDepth === 0 && sawOpen) sawClose = true;
                } else if (sawClose && pDepth === 0) {
                  if (ch === '{') bDepth++;
                  else if (ch === '}' && bDepth > 0) bDepth--;
                  else if (bDepth === 0 && ch === '=' && nx === '>') { isArrow = true; break; }
                  else if (bDepth === 0 && ch === ';') { hitSemi = true; break; }
                }
              }
              if (isArrow || hitSemi) break;
            }
            if (!isArrow) {
              for (const ch of structural) {
                if (ch === '{') braceDepth++;
                else if (ch === '}' && braceDepth > 0) braceDepth--;
              }
              continue;
            }
          }

          const isArrowDecl = Boolean((vm || im) && !isWrapperCall);
          const isFnDecl = Boolean(fm?.[1] || mm || cm || jfm?.[1] || jmm);
          const isKtBodylessType = Boolean(isKt && jtm && trimmed.includes('('));
          let d = 0, p = 0, started = false, sawOpenP = false, paramsClosed = !(isFnDecl || isKtBodylessType), sawArrow = !isArrowDecl, end = i;
          const spanPpStack = [];
          const spanLex = cloneLexState(lexState);
          for (let j = i; j <= endIdx; j++) {
            const jt = lines[j].trim();
            const spanInStr = Boolean(spanLex.inBlockComment || spanLex.quote || spanLex.rawHashes >= 0 || spanLex.tplStack.length > 0);
            if (j > i && !spanInStr && !isPhp && jt.startsWith('#')) {
              if (/^#\s*(?:if|ifdef|ifndef)\b/.test(jt)) { spanPpStack.push({ d, p, started, paramsClosed }); continue; }
              if (/^#\s*(?:else|elif)\b/.test(jt) && spanPpStack.length) {
                const top = spanPpStack[spanPpStack.length - 1];
                d = top.d; p = top.p; started = top.started; paramsClosed = top.paramsClosed;
                continue;
              }
              if (/^#\s*endif\b/.test(jt) && spanPpStack.length) { spanPpStack.pop(); continue; }
            }
            const stLine = j === i ? structural : stripJsStringsAndComments(lines[j], spanLex, bExt);
            const startCi = (j === i && isArrowDecl) ? Math.max(0, stLine.indexOf('=') + 1) : 0;
            for (let ci = startCi; ci < stLine.length; ci++) {
              const ch = stLine[ci], nx = stLine[ci + 1];
              if (!started) {
                if (isArrowDecl && !sawArrow) {
                  if (ch === '(') { p++; sawOpenP = true; }
                  else if (ch === ')' && p > 0) p--;
                  else if (p === 0 && ch === '=' && nx === '>') { sawArrow = true; ci++; }
                  continue;
                }
                if ((isFnDecl || isKtBodylessType) && !paramsClosed) {
                  if (ch === '(') { p++; sawOpenP = true; }
                  else if (ch === ')' && p > 0) {
                    p--;
                    if (p === 0 && sawOpenP) paramsClosed = true;
                  }
                  continue;
                }
              }
              if (ch === '(') p++;
              else if (ch === ')' && p > 0) p--;
              else if (ch === '{') { d++; started = true; }
              else if (ch === '}') d--;
            }
            end = j;
            if (started && d <= 0 && !(isFnDecl && j + 1 <= endIdx && lines[j + 1].trim().startsWith('{'))) break;
            if (!started && paramsClosed && sawArrow && p === 0 && (stLine.trimEnd().endsWith(';') || (j === i && (vm || im) && !stLine.includes('{')))) break;
            if (!started && paramsClosed && p === 0 && (isKt || isSwift)) {
              const stTrim = stLine.trimEnd();
              const nextTrim = j + 1 <= endIdx ? lines[j + 1].trim() : '';
              if (!/(?:=|->|:|\bthrows|\bwhere)$/.test(stTrim) && !/^(?:\{|->|:|\bwhere\b)/.test(nextTrim)) break;
            }
            if (!started && j - i >= 18) break;
          }
          let sig = trimmed.split(/\s*\{\s*/)[0].replace(/(=>\s*).+$/, '$1...');
          if ((sig.endsWith('(') || (trimmed.includes('(') && trimmed.endsWith('{'))) && !trimmed.includes(')') && i + 1 <= endIdx) {
            sig = trimmed + ' ' + lines[i + 1].trim().replace(/,\s*$/, '') + '...)';
          }
          entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${labelPrefix}${sig.slice(0, maxLen)}` });
        }
        for (const ch of structural) {
          if (ch === '{') braceDepth++;
          else if (ch === '}' && braceDepth > 0) braceDepth--;
        }
      }
    }
  };

  if (ext === '.md') {
    let startIdx = 0;
    if (lines.length && lines[0].trim() === '---') {
      let hasYamlKey = false, hasHeading = false;
      for (let k = 1; k < Math.min(lines.length, 80); k++) {
        const kt = lines[k].trim();
        if (kt === '---' || kt === '...') { if (hasYamlKey && !hasHeading) startIdx = k + 1; break; }
        if (/^#{2,4}\s/.test(kt)) { hasHeading = true; break; }
        if (/^[A-Za-z0-9_.-]+\s*:/.test(kt)) hasYamlKey = true;
      }
    }
    let fence = null;
    const headings = [];
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      if (fence) {
        const cm = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (cm && cm[1][0] === fence.ch && cm[1].length >= fence.len) fence = null;
        continue;
      }
      const fm = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fm && !(fm[1][0] === '`' && fm[2].includes('`'))) { fence = { ch: fm[1][0], len: fm[1].length }; continue; }
      const hm = line.match(/^ {0,3}(#{1,4})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
      if (hm) headings.push({ idx: i, level: hm[1].length, title: hm[2].trim() });
    }
    for (let k = 0; k < headings.length; k++) {
      const hd = headings[k];
      let nextIdx = lines.length;
      for (let m = k + 1; m < headings.length; m++) {
        if (headings[m].level <= hd.level) { nextIdx = headings[m].idx; break; }
      }
      let end = nextIdx - 1;
      while (end > hd.idx && !lines[end].trim()) end--;
      const label = `${'#'.repeat(hd.level)} ${hd.title}`;
      entries.push({ startLine: hd.idx + 1, endLine: end + 1, symbol: hd.title, text: `${h.fmtSpan(hd.idx, end)}: [sec] ${label.slice(0, 90)}` });
    }
  } else if (ext === '.yml' || ext === '.yaml') {
    const indentStack = [];
    const blk = { active: false, headerIndent: 0, contentIndent: -1 };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (h.advanceYamlBlock(line, blk)) continue;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...' || trimmed.startsWith('-')) continue;
      const km = line.match(/^( *)([A-Za-z0-9_.-]+|"[^"\r\n]+"|'[^'\r\n]+')\s*:(?:\s|$|#)/);
      if (!km) continue;
      const indent = km[1].length;
      const rawKey = km[2];
      const sym = (rawKey[0] === '"' || rawKey[0] === "'") ? rawKey.slice(1, -1) : rawKey;
      while (indentStack.length && indent <= indentStack[indentStack.length - 1]) indentStack.pop();
      indentStack.push(indent);
      if (indentStack.length > 2 || indent > 4) continue;
      let end = i;
      const spanBlk = { ...blk };
      for (let j = i + 1; j < lines.length; j++) {
        if (h.advanceYamlBlock(lines[j], spanBlk)) { if (lines[j].trim()) end = j; continue; }
        const jt = lines[j].trim();
        if (!jt || jt.startsWith('#')) continue;
        if (jt === '---' || jt === '...') break;
        const jInd = lines[j].match(/^( *)/)[1].length;
        if (jInd < indent || (jInd === indent && !jt.startsWith('-'))) break;
        end = j;
      }
      entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${km[1]}${trimmed.slice(0, 92)}` });
    }
  } else if (ext === '.toml') {
    const st = { triple: '' };
    let bracketDepth = 0, inTable = false;
    const sections = [];
    for (let i = 0; i < lines.length; i++) {
      const wasInTriple = Boolean(st.triple);
      const { code, structural } = h.stripHashTriple(lines[i], st, true);
      if (!wasInTriple && bracketDepth === 0) {
        const ct = code.trim();
        const tm = ct.match(/^\[\[\s*(.+?)\s*\]\]$/) || ct.match(/^\[\s*(.+?)\s*\]$/);
        if (tm) {
          inTable = true;
          sections.push({ idx: i, sym: tm[1].replace(/["']/g, '').trim(), text: ct });
        } else if (!inTable && ct) {
          const km = ct.match(/^([A-Za-z0-9_-]+|"[^"\r\n]+"|'[^'\r\n]+')\s*=/);
          if (km) {
            const sym = km[1].replace(/^["']|["']$/g, '');
            let sd = bracketDepth;
            for (const ch of structural) { if (ch === '[' || ch === '{') sd++; else if ((ch === ']' || ch === '}') && sd > 0) sd--; }
            let end = i;
            const spanSt = { triple: st.triple };
            for (let j = i + 1; (sd > 0 || spanSt.triple) && j < lines.length; j++) {
              const nxt = h.stripHashTriple(lines[j], spanSt, true);
              for (const ch of nxt.structural) { if (ch === '[' || ch === '{') sd++; else if ((ch === ']' || ch === '}') && sd > 0) sd--; }
              end = j;
            }
            entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${ct.slice(0, 96)}` });
          }
        }
      }
      for (const ch of structural) {
        if (ch === '[' || ch === '{') bracketDepth++;
        else if ((ch === ']' || ch === '}') && bracketDepth > 0) bracketDepth--;
      }
    }
    for (let k = 0; k < sections.length; k++) {
      const sec = sections[k];
      let end = (k + 1 < sections.length ? sections[k + 1].idx : lines.length) - 1;
      while (end > sec.idx && !lines[end].trim()) end--;
      entries.push({ startLine: sec.idx + 1, endLine: end + 1, symbol: sec.sym, text: `${h.fmtSpan(sec.idx, end)}: ${sec.text.slice(0, 96)}` });
    }
  } else if (ext === '.json' || ext === '.jsonc') {
    let depth = 0;
    const lexState = { inBlockComment: false, quote: '', tplStack: [], rawHashes: -1 };
    for (let i = 0; i < lines.length; i++) {
      const wasInStr = Boolean(lexState.inBlockComment || lexState.quote);
      const structural = stripJsStringsAndComments(lines[i], lexState, '.json');
      const trimmed = lines[i].trim();
      if (!wasInStr && (depth === 1 || (i === 0 && depth === 0 && trimmed.startsWith('{')))) {
        const km = trimmed.match(/^(?:\{\s*)?"((?:[^"\\]|\\.)+)"\s*:/);
        if (km && !(lines.length === 1 && lines[0].length > 300)) {
          const sym = km[1];
          const colonIdx = structural.indexOf(':');
          let bDepth = 0, started = false, end = i;
          const spanLex = cloneLexState(lexState);
          const firstTail = colonIdx >= 0 ? structural.slice(colonIdx + 1) : '';
          for (const ch of firstTail) {
            if (ch === '{' || ch === '[') { bDepth++; started = true; }
            else if (ch === '}' || ch === ']') bDepth--;
          }
          if ((started && bDepth > 0) || (!started && !firstTail.trim() && i + 1 < lines.length && /^[{[]/.test(lines[i + 1].trim()))) {
            for (let j = i + 1; j < lines.length; j++) {
              const st = stripJsStringsAndComments(lines[j], spanLex, '.json');
              for (const ch of st) {
                if (ch === '{' || ch === '[') { bDepth++; started = true; }
                else if (ch === '}' || ch === ']') bDepth--;
              }
              end = j;
              if (started && bDepth <= 0) break;
            }
          }
          entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${trimmed.slice(0, 92)}` });
        }
      }
      for (const ch of structural) {
        if (ch === '{' || ch === '[') depth++;
        else if ((ch === '}' || ch === ']') && depth > 0) depth--;
      }
    }
  } else if (ext === '.svelte' || ext === '.vue' || ext === '.astro') {
    let startIdx = 0;
    if (ext === '.astro' && lines.length && lines[0].trim() === '---') {
      const fmEnd = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---');
      if (fmEnd > 0) {
        entries.push({ startLine: 1, endLine: fmEnd + 1, symbol: 'frontmatter', text: `${h.fmtSpan(0, fmEnd)}: --- (frontmatter)` });
        h.scanBrace('.ts', 1, fmEnd - 1, '[ts] ');
        startIdx = fmEnd + 1;
      }
    }
    for (let i = startIdx; i < lines.length; i++) {
      const t = lines[i].trim();
      const commentMatch = t.match(/^<!--\s*([A-Za-z0-9_-]+)\s*-->/);
      if (commentMatch) {
        entries.push({ startLine: i + 1, endLine: i + 1, symbol: `<!-- ${commentMatch[1]} -->`, text: `L${i + 1}: ${t.slice(0, 96)}` });
        continue;
      }
      const blkMatch = t.match(/^<(script|style|template)\b([^>]*)>/i);
      if (blkMatch && !/\/>\s*$/.test(t)) {
        const tag = blkMatch[1].toLowerCase();
        const end = h.findTagSpanEnd(i, tag, tag === 'template');
        entries.push({ startLine: i + 1, endLine: end + 1, symbol: tag, text: `${h.fmtSpan(i, end)}: ${t.slice(0, 92)}` });
        if (tag === 'script') {
          if (end > i + 1) h.scanBrace('.ts', i + 1, end - 1, '[js] ');
          i = end;
        } else if (tag === 'style') {
          i = end;
        }
        continue;
      }
      const tagMatch = t.match(/^<(section|main|nav|header|aside|footer)\b([^>]*)>/i);
      if (tagMatch) {
        const tag = tagMatch[1].toLowerCase();
        const attrs = tagMatch[2] || '';
        const idM = attrs.match(/\bid=["']([^"']+)["']/i);
        const clsM = attrs.match(/\bclass=["']([^"']+)["']/i);
        const sym = idM ? `#${idM[1]}` : (clsM ? `.${clsM[1].split(/\s+/)[0]}` : tag);
        const end = h.findTagSpanEnd(i, tag, true);
        entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${t.slice(0, 96)}` });
      }
    }
  } else if (ext === '.rb') {
    const st = { inDoc: false, heredoc: '', heredocStrip: false, nextHeredoc: '', nextStrip: false };
    const declRe = /^(\s*)(?:(?:private|protected|public|module_function)\s+)?(class|module|def)\s+(<<\s*self|(?:self\.)?[A-Za-z_][A-Za-z0-9_:]*[?!=]?)/;
    for (let i = 0; i < lines.length; i++) {
      const wasBlocked = st.inDoc || Boolean(st.heredoc);
      const code = h.stripRuby(lines[i], st);
      if (wasBlocked || !code.trim()) continue;
      const m = lines[i].match(declRe);
      if (!m) continue;
      const sym = m[3].replace(/^<<\s*/, '<<');
      let end = i;
      const isEndless = m[2] === 'def' && /^(?:\s*(?:private|protected|public|module_function)\s+)?def\s+[^()\n]*(?:\([^)]*\))?\s*=\s*(?!=)/.test(code);
      if (!isEndless) {
        let depth = 0;
        const spanSt = { ...st };
        for (let j = i; j < lines.length; j++) {
          const sc = j === i ? code : h.stripRuby(lines[j], spanSt);
          if (sc.trim()) {
            const mods = (sc.match(/(?:^|[=;])\s*(?:if|unless|while|until)\b/g) || []).length;
            const blk = (sc.match(/(?<![.:@])\b(?:class|module|def|case|begin|for)\b(?!:)/g) || []).length;
            const doBlk = !/^\s*(?:for|while|until)\b/.test(sc) ? (sc.match(/(?<![.:@])\bdo\b(?:\s*\|[^|]*\|)?\s*(?:$|[;#])/g) || []).length : 0;
            const ends = (sc.match(/(?<![.:@])\bend\b(?!:)/g) || []).length;
            depth += mods + blk + doBlk - ends;
          }
          end = j;
          if (depth <= 0) break;
        }
      }
      entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${m[1]}${lines[i].trim().slice(0, 92)}` });
    }
  } else if (ext === '.ex' || ext === '.exs') {
    const st = { triple: '' };
    const declRe = /^(\s*)(defmodule|defp?|defmacrop?)\s+([A-Za-z0-9_.?!]+)/;
    for (let i = 0; i < lines.length; i++) {
      const wasInTriple = Boolean(st.triple);
      const { code } = h.stripHashTriple(lines[i], st, false);
      if (wasInTriple) continue;
      const m = lines[i].match(declRe);
      if (!m) continue;
      let depth = 0, started = false, end = i;
      const spanSt = { triple: st.triple };
      for (let j = i; j < lines.length; j++) {
        const sc = j === i ? code : h.stripHashTriple(lines[j], spanSt, false).code;
        const dos = (sc.match(/(?<![:.@])\bdo\b(?!:)/g) || []).length;
        const fns = (sc.match(/(?<![:.@])\bfn\b(?!:)/g) || []).length;
        const ends = (sc.match(/(?<![:.@])\bend\b(?!:)/g) || []).length;
        if (dos > 0 || fns > 0) started = true;
        depth += dos + fns - ends;
        end = j;
        if (started && depth <= 0) break;
        if (!started && /,\s*do:/.test(sc)) break;
      }
      entries.push({ startLine: i + 1, endLine: end + 1, symbol: m[3], text: `${h.fmtSpan(i, end)}: ${m[1]}${lines[i].trim().slice(0, 92)}` });
    }
  } else if (ext === '.sql') {
    const st = { inBlockComment: false, quote: '', dollarTag: '' };
    const createRe = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+|UNIQUE\s+|MATERIALIZED\s+)?(TABLE|VIEW|FUNCTION|PROCEDURE|INDEX|TRIGGER|TYPE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."`[\]]+)/i;
    for (let i = 0; i < lines.length; i++) {
      const wasBlocked = Boolean(st.inBlockComment || st.quote || st.dollarTag);
      const code = h.stripSql(lines[i], st);
      if (wasBlocked || !/^\s*CREATE\b/i.test(code)) continue;
      const m = code.match(createRe);
      if (!m) continue;
      const sym = m[2].replace(/["`[\]]/g, '');
      let pDepth = 0, bDepth = 0, end = i, done = false;
      const spanSt = { ...st };
      for (let j = i; j < lines.length; j++) {
        const sc = j === i ? code : h.stripSql(lines[j], spanSt);
        if (j > i && /^\s*GO\s*$/i.test(sc)) { end = j; break; }
        const tokens = sc.match(/\b(?:BEGIN|CASE|END)\b|[();]/gi) || [];
        for (const tok of tokens) {
          const up = tok.toUpperCase();
          if (tok === '(') pDepth++;
          else if (tok === ')' && pDepth > 0) pDepth--;
          else if (up === 'BEGIN' || up === 'CASE') bDepth++;
          else if (up === 'END' && bDepth > 0) bDepth--;
          else if (tok === ';' && !spanSt.dollarTag && !spanSt.quote && !spanSt.inBlockComment && pDepth === 0 && bDepth === 0) { done = true; break; }
        }
        end = j;
        if (done) break;
      }
      entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${lines[i].trim().slice(0, 96)}` });
    }
  } else if (ext === '.sh' || ext === '.bash') {
    const st = { quote: '', heredoc: '', heredocStrip: false, nextHeredoc: '', nextStrip: false };
    const fnRe = /^(\s*)(?:function\s+([A-Za-z_][A-Za-z0-9_:-]*)(?:\s*\(\s*\))?|([A-Za-z_][A-Za-z0-9_:-]*)\s*\(\s*\))\s*(?:\{|$)/;
    let braceDepth = 0;
    for (let i = 0; i < lines.length; i++) {
      const wasBlocked = Boolean(st.quote || st.heredoc);
      const code = h.stripShell(lines[i], st);
      if (!wasBlocked && braceDepth === 0) {
        const m = code.match(fnRe);
        if (m) {
          const sym = m[2] || m[3];
          let d = 0, started = false, end = i;
          const spanSt = { ...st };
          for (let j = i; j < lines.length; j++) {
            const sc = j === i ? code : h.stripShell(lines[j], spanSt);
            for (const ch of sc) {
              if (ch === '{') { d++; started = true; }
              else if (ch === '}') d--;
            }
            end = j;
            if (started && d <= 0) break;
            if (!started && j > i + 1) break;
          }
          const sig = lines[i].trim().split(/\s*\{\s*/)[0];
          entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${sig.slice(0, 96)}` });
        }
      }
      for (const ch of code) {
        if (ch === '{') braceDepth++;
        else if (ch === '}' && braceDepth > 0) braceDepth--;
      }
    }
  } else if (ext === '.html' || ext === '.htm') {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      const commentMatch = t.match(/^<!--\s*([A-Za-z0-9_-]+)\s*-->/);
      if (commentMatch) {
        entries.push({ startLine: i + 1, endLine: i + 1, symbol: `<!-- ${commentMatch[1]} -->`, text: `L${i + 1}: ${t.slice(0, 96)}` });
        continue;
      }
      if (/^<(?:\/)?(style|script)\b/i.test(t)) {
        entries.push({ startLine: i + 1, endLine: i + 1, symbol: t.slice(0, 24), text: `L${i + 1}: ${t.slice(0, 96)}` });
      } else if (/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(|^(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/.test(t)) {
        const m = t.match(/function\s+([A-Za-z0-9_$]+)|(?:const|let)\s+([A-Za-z0-9_$]+)/);
        const sym = m ? (m[1] || m[2]) : '';
        let d = 0, started = false, end = i;
        const jsLex = { inBlockComment: false, quote: '', tplStack: [], rawHashes: -1 };
        for (let j = i; j < lines.length; j++) {
          if (/^<\/script\b/i.test(lines[j].trim())) break;
          const stLine = stripJsStringsAndComments(lines[j], jsLex, '.js');
          for (const ch of stLine) {
            if (ch === '{') { d++; started = true; }
            else if (ch === '}') d--;
          }
          end = j;
          if (started && d <= 0) break;
          if (!started && j === i && !stLine.includes('{')) break;
        }
        const sig = t.split(/\s*\{\s*/)[0].replace(/(=>\s*).+$/, '$1...');
        entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: [js] ${sig.slice(0, 92)}` });
      } else {
        const tagMatch = t.match(/^<(section|main|nav|header|aside|footer)\b([^>]*)>/i);
        if (tagMatch) {
          const tag = tagMatch[1].toLowerCase();
          const attrs = tagMatch[2] || '';
          const idM = attrs.match(/\bid=["']([^"']+)["']/i);
          const clsM = attrs.match(/\bclass=["']([^"']+)["']/i);
          const sym = idM ? `#${idM[1]}` : (clsM ? `.${clsM[1].split(/\s+/)[0]}` : tag);
          const end = h.findTagSpanEnd(i, tag, true);
          entries.push({ startLine: i + 1, endLine: end + 1, symbol: sym, text: `${h.fmtSpan(i, end)}: ${t.slice(0, 96)}` });
        }
      }
    }
  } else if (ext === '.css') {
    let braceDepth = 0;
    const lexState = { inBlockComment: false, quote: '', tplStack: [], rawHashes: -1 };
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      const structural = stripJsStringsAndComments(lines[i], lexState, ext);
      if (/^\/\*\s*[-=A-Z0-9]/.test(t)) {
        entries.push({ startLine: i + 1, endLine: i + 1, symbol: t, text: `L${i + 1}: ${t.slice(0, 96)}` });
      } else if (braceDepth === 0 && (/^@(?:media|keyframes|supports|font-face|layer)\b/i.test(t) || /^:root\b/.test(t))) {
        let d = 0, started = false, end = i;
        const spanLex = cloneLexState(lexState);
        for (let j = i; j < lines.length; j++) {
          const stLine = j === i ? structural : stripJsStringsAndComments(lines[j], spanLex, ext);
          for (const ch of stLine) {
            if (ch === '{') { d++; started = true; }
            else if (ch === '}') d--;
          }
          end = j;
          if (started && d <= 0) break;
        }
        const symMatch = t.match(/^(@keyframes\s+[A-Za-z0-9_-]+|@[A-Za-z-]+|:root)/);
        entries.push({ startLine: i + 1, endLine: end + 1, symbol: symMatch ? symMatch[1] : t.slice(0, 32), text: `${h.fmtSpan(i, end)}: ${t.slice(0, 96)}` });
      }
      for (const ch of structural) {
        if (ch === '{') braceDepth++;
        else if (ch === '}' && braceDepth > 0) braceDepth--;
      }
    }
  } else if (ext === '.py') {
    let topTriple = '';
    for (let i = 0; i < lines.length; i++) {
      const wasInTopTriple = Boolean(topTriple);
      topTriple = updatePyTriple(lines[i], topTriple);
      if (wasInTopTriple) continue;
      const m = lines[i].match(/^(\s*)(async\s+def|def|class)\s+([A-Za-z0-9_]+)/);
      if (!m) continue;
      const indent = m[1].length;
      const sym = m[3];
      let start = i;
      while (start > 0 && lines[start - 1].trim().startsWith('@') && lines[start - 1].match(/^(\s*)/)[1].length === indent) start--;
      let sigEnd = i, parenDepth = 0, sigTriple = topTriple;
      for (let k = i; k < Math.min(lines.length, i + 25); k++) {
        if (k > i) sigTriple = updatePyTriple(lines[k], sigTriple);
        for (const ch of lines[k]) {
          if (ch === '(') parenDepth++;
          else if (ch === ')' && parenDepth > 0) parenDepth--;
        }
        sigEnd = k;
        if (parenDepth === 0 && lines[k].trim().replace(/#.*$/, '').trim().endsWith(':')) break;
      }
      let end = sigEnd, inTriple = sigTriple;
      for (let j = sigEnd + 1; j < lines.length; j++) {
        const lt = lines[j].trim();
        const wasInTriple = Boolean(inTriple);
        if (!wasInTriple && lt.startsWith('#')) continue;
        inTriple = updatePyTriple(lines[j], inTriple);
        if (!wasInTriple && !inTriple && lt && lines[j].match(/^(\s*)/)[1].length <= indent) break;
        if (lt || wasInTriple || inTriple) end = j;
      }
      const sig = lines[i].trim().replace(/\(self,\s*/, '(').replace(/\(self\)/, '()');
      entries.push({ startLine: start + 1, endLine: end + 1, symbol: sym, text: `L${start + 1}-L${end + 1}: ${m[1]}${sig.slice(0, 92)}` });
    }
  } else {
    h.scanBrace(ext, 0, lines.length - 1, '');
  }
  return { lines, rawBytes: Buffer.byteLength(raw), entries };
}

function cmdOutline(opts) {
  const rel = opts.pos[0];
  const filter = (opts.pos[1] || '').toLowerCase();
  if (!rel) { console.error('Usage: --outline <rel-path> [filter]'); process.exit(1); }
  if (isSecretPath(rel)) {
    console.error(`REFUSED: Secret/credential file blocked by security guard: ${rel}`);
    process.exit(2);
  }
  const full = path.resolve(opts.root, rel);
  if (!isInsideRoot(opts.root, full)) {
    console.error(`REFUSED: Path outside repository root: ${rel}`);
    process.exit(2);
  }
  if (!fs.existsSync(full)) { console.error(`File not found: ${rel}`); process.exit(1); }
  const ext = path.extname(full).toLowerCase();
  if (!CODE_EXTS.has(ext)) { console.error(`--outline supports extensions (${[...CODE_EXTS].join(',')})`); process.exit(1); }

  const { lines, rawBytes, entries } = parseFileOutline(full);
  const items = entries.map(e => e.text);
  const matched = filter ? items.filter(it => it.toLowerCase().includes(filter)) : items;
  const importCount = lines.filter(l => /^\s*(?:import\s|from\s+\S+\s+import|const\s+.*=\s*require\(|use\s+[A-Za-z0-9_:]+|#include\s+)/.test(l)).length;
  const out = [
    `=== OUTLINE ${rel} (${lines.length}L, ${rawBytes}B, imports=${importCount}${filter ? `, filter="${filter}"` : ''}) ===`,
    matched.length ? matched.join('\n') : '(no declarations matched; inspect bounded ranges directly)'
  ].join('\n');
  console.log(capOutput(out));
}

function cmdHandoff(opts) {
  let dirty = [];
  if (fs.existsSync(path.join(opts.root, '.git'))) {
    const g = spawnSync('git', ['status', '--short'], { cwd: opts.root, encoding: 'utf8', timeout: 5000 });
    if (g.status === 0 && g.stdout) {
      const rawDirty = g.stdout.trim().split(/\r?\n/).filter(Boolean);
      dirty = rawDirty.length > 6 && rawDirty.every(l => l.startsWith('?? '))
        ? [`${rawDirty.length} untracked paths`]
        : rawDirty.slice(0, 10);
    }
  }
  const snap = {
    schema: 'antis-optimizer-handoff/v1',
    root: opts.root,
    goal: redactSecrets(opts.goal || 'resume active task cleanly'),
    files: (opts.files || []).map(redactSecrets),
    dirty: dirty.map(redactSecrets),
    note: redactSecrets(opts.note || ''),
    next: 'Re-read only listed landmark lines via Read(file, offset, limit) and run --verify before final reply.'
  };
  let serialized = JSON.stringify(snap, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_HANDOFF_BYTES) {
    snap.note = snap.note.slice(0, 160);
    snap.dirty = snap.dirty.slice(0, 6);
    snap.files = snap.files.slice(0, 6).map(f => f.slice(0, 120));
    snap.goal = snap.goal.slice(0, 300);
    serialized = JSON.stringify(snap);
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_HANDOFF_BYTES) {
    snap.note = '';
    snap.dirty = [];
    snap.files = snap.files.slice(0, 3).map(f => f.slice(0, 60));
    snap.goal = snap.goal.slice(0, 120);
    serialized = JSON.stringify(snap);
  }
  if (opts.out) {
    const outFull = path.resolve(opts.root, opts.out);
    if (!isInsideRoot(opts.root, outFull)) {
      console.error(`REFUSED: --out path outside repository root: ${opts.out}`);
      process.exit(2);
    }
    fs.writeFileSync(outFull, serialized + '\n');
  }
  console.log(serialized);
}

function findClosestSymbolEntry(entries, sym, refLine) {
  const matches = entries.filter(e => e.symbol === sym);
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  return matches.reduce((best, cur) => Math.abs(cur.startLine - refLine) < Math.abs(best.startLine - refLine) ? cur : best);
}

function inspectAndHealLandmarks(root, docs, writeChanges = false) {
  const issues = [];
  const updates = [];
  const outlineCache = new Map();

  function getOutline(relPath) {
    if (!outlineCache.has(relPath)) {
      const full = path.join(root, relPath);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        outlineCache.set(relPath, null);
      } else {
        const raw = fs.readFileSync(full, 'utf8');
        const lines = raw.split(/\r?\n/);
        const ext = path.extname(full).toLowerCase();
        const parsed = CODE_EXTS.has(ext) ? parseFileOutline(full) : { lines, rawBytes: Buffer.byteLength(raw), entries: [] };
        outlineCache.set(relPath, { lines, rawBytes: Buffer.byteLength(raw), entries: parsed.entries, hasOutline: CODE_EXTS.has(ext) && ext !== '.css' });
      }
    }
    return outlineCache.get(relPath);
  }

  for (const docRel of docs) {
    const docFull = path.join(root, docRel);
    const origContent = fs.readFileSync(docFull, 'utf8');
    const eol = origContent.includes('\r\n') ? '\r\n' : '\n';
    const docLines = origContent.split(/\r?\n/);
    let modified = false;

    for (let li = 0; li < docLines.length; li++) {
      let line = docLines[li];

      // 1. Check inline references: path/file.ext:L10-L20 or path/file.ext#symbol:L10-L20
      const inlineRe = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?:#([A-Za-z0-9_$-]+))?:L(\d+)(?:-L(\d+))?/g;
      line = line.replace(inlineRe, (fullMatch, targetRel, sym, sStr, eStr) => {
        if (targetRel.includes('*') || targetRel.includes('{') || targetRel === 'file.ts') return fullMatch;
        const info = getOutline(targetRel);
        if (!info) {
          issues.push(`${docRel}->${targetRel}(missing)`);
          return fullMatch;
        }
        const startL = parseInt(sStr, 10);
        const endL = eStr ? parseInt(eStr, 10) : startL;
        if (sym) {
          const entry = findClosestSymbolEntry(info.entries, sym, startL);
          if (!entry && info.hasOutline) {
            issues.push(`${docRel}->${targetRel}#${sym}(symbol not found)`);
            return fullMatch;
          }
          if (entry && (entry.startLine !== startL || (eStr && entry.endLine !== endL))) {
            const nextRange = eStr ? `L${entry.startLine}-L${entry.endLine}` : `L${entry.startLine}`;
            issues.push(`${docRel}->${targetRel}#${sym}(L${startL}-L${endL} drifted to ${nextRange})`);
            updates.push(`${docRel}:${targetRel}#${sym} -> ${nextRange}`);
            modified = true;
            return `${targetRel}#${sym}:${nextRange}`;
          }
        }
        if (startL < 1 || endL > info.lines.length || startL > endL) {
          issues.push(`${docRel}->${targetRel}:L${startL}-L${endL}(max L${info.lines.length})`);
        }
        return fullMatch;
      });

      // 2. Check table rows starting with | `path/to/file.ext` |
      const rowFileMatch = line.match(/^\|\s*`([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`\s*\|/);
      if (rowFileMatch) {
        const targetRel = rowFileMatch[1];
        if (!targetRel.includes('*') && !targetRel.includes('{')) {
          const info = getOutline(targetRel);
          if (!info) {
            issues.push(`${docRel}->${targetRel}(missing)`);
          } else {
            line = line.replace(/`(\d+(?:\.\d+)?\s*KB\s*\/\s*)(\d+)L`/g, (m, prefix, lStr) => {
              const docL = parseInt(lStr, 10);
              if (docL !== info.lines.length) {
                const kb = (info.rawBytes / 1024).toFixed(1) + ' KB / ';
                issues.push(`${docRel}->${targetRel}(line count ${docL}L != ${info.lines.length}L)`);
                updates.push(`${docRel}:${targetRel} lines ${docL}L -> ${info.lines.length}L`);
                modified = true;
                return `\`${kb}${info.lines.length}L\``;
              }
              return m;
            });

            line = line.replace(/((?:`[#.]?[A-Za-z0-9_$-]+`(?:\s*(?:\/|&|\+)\s*)?)+)\s+`L(\d+)(?:-L(\d+))?`/g, (m, symGroup, sStr, eStr) => {
              const syms = [...symGroup.matchAll(/`([#.]?[A-Za-z0-9_$-]+)`/g)].map(x => x[1]);
              if (!syms.length) return m;
              const startL = parseInt(sStr, 10);
              const endL = eStr ? parseInt(eStr, 10) : startL;
              const firstSym = syms[0];
              const lastSym = syms[syms.length - 1];
              if (startL < 1 || endL > info.lines.length || startL > endL) {
                issues.push(`${docRel}->${targetRel}#${firstSym}:L${startL}-L${endL}(out of bounds max L${info.lines.length})`);
              }
              const matchedEntries = syms.map(s => findClosestSymbolEntry(info.entries, s, startL)).filter(Boolean);
              if (matchedEntries.length < syms.length && info.hasOutline && info.entries.length > 0) {
                const sliceText = info.lines.slice(Math.max(0, startL - 1), Math.min(info.lines.length, endL)).join('\n');
                const missingSyms = syms.filter(s => !findClosestSymbolEntry(info.entries, s, startL) && !sliceText.includes(s.replace(/^[#.]/, '')));
                if (missingSyms.length) {
                  issues.push(`${docRel}->${targetRel}#${missingSyms.join(',')}(symbol not found)`);
                  return m;
                }
              }
              if (matchedEntries.length === syms.length) {
                const expStart = Math.min(...matchedEntries.map(e => e.startLine));
                const expEnd = eStr ? Math.max(...matchedEntries.map(e => e.endLine)) : expStart;
                if (expStart !== startL || (eStr && expEnd !== endL)) {
                  const nextRange = eStr ? `L${expStart}-L${expEnd}` : `L${expStart}`;
                  const label = firstSym === lastSym ? firstSym : `${firstSym}..${lastSym}`;
                  issues.push(`${docRel}->${targetRel}#${label}(L${startL}${eStr ? '-L' + endL : ''} drifted to ${nextRange})`);
                  updates.push(`${docRel}:${targetRel}#${label} -> ${nextRange}`);
                  modified = true;
                  return `${symGroup.trim()} \`${nextRange}\``;
                }
              }
              return m;
            });
          }
        }
      }

      docLines[li] = line;
    }

    if (modified && writeChanges) {
      fs.writeFileSync(docFull, docLines.join(eol));
    }
  }

  return { issues, updates };
}

function cmdSyncLandmarks(opts) {
  const repo = walkRepo(opts.root, 5);
  const docs = [...repo.agents, ...repo.indexFiles];
  if (!docs.length) {
    console.log('No AGENTS.md or INDEX.md found to sync landmarks.');
    return;
  }
  const { issues, updates } = inspectAndHealLandmarks(opts.root, docs, Boolean(opts.write));
  if (!issues.length) {
    console.log(`PASS sync-landmarks: all landmarks in ${docs.join(', ')} are exact.`);
    return;
  }
  if (!opts.write) {
    console.log(capOutput(`=== SYNC-LANDMARKS (DRY RUN) ===\nDrifted/stale (${issues.length}): ${issues.join(', ')}\nRe-run with --write to auto-heal ${updates.length} landmark(s).`));
    return;
  }
  console.log(capOutput(`PASS sync-landmarks: healed ${updates.length} landmark(s): ${updates.join(', ')}`));
}

function runVerifyCmd(label, cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: args.length === 0, timeout: EXEC_TIMEOUT_MS });
  if (res.error && res.error.code === 'ETIMEDOUT') {
    return { ok: false, line: `FAIL ${label}: timed out after ${EXEC_TIMEOUT_MS}ms` };
  }
  if (res.status !== 0) {
    const rawErr = [res.stdout, res.stderr].filter(Boolean).join('\n').trim().split(/\r?\n/);
    const clipped = rawErr.length > 25 ? [...rawErr.slice(0, 15), `...(${rawErr.length - 25} omitted)...`, ...rawErr.slice(-10)] : rawErr;
    return { ok: false, line: `FAIL ${label}:\n${clipped.join('\n')}` };
  }
  const last = (res.stdout || '').trim().split(/\r?\n/).pop() || 'ok';
  return { ok: true, line: `PASS ${label}: ${last.slice(0, 80)}` };
}

function cmdVerify(opts) {
  const lines = [];
  let ok = true;
  const repo = walkRepo(opts.root, 5);

  const docs = [...repo.agents, ...repo.indexFiles];
  const badDocs = [];
  for (const rel of docs) {
    const s = fs.readFileSync(path.join(opts.root, rel), 'utf8').replace(/\r\n/g, '\n');
    const lc = s.split('\n').length, bc = Buffer.byteLength(s, 'utf8');
    if (lc > DOC_MAX_LINES || bc > DOC_MAX_BYTES) badDocs.push(`${rel}(${lc}L/${bc}B)`);
  }
  const tierInfo = !docs.length ? classifyRepoTier(collectAuditStats(opts.root)) : null;
  if (badDocs.length || (!docs.length && tierInfo.key > 0)) {
    ok = false;
    lines.push(`FAIL doc-budgets: ${!docs.length ? `no AGENTS.md/INDEX.md found (recommended: ${tierInfo.label})` : badDocs.join(', ')}`);
  } else {
    lines.push(`PASS doc-budgets: ${docs.length ? `${docs.length}<=${DOC_MAX_LINES}L` : 'tier-0(0)'}`);
  }

  const { issues: staleLandmarks } = inspectAndHealLandmarks(opts.root, docs, false);
  if (staleLandmarks.length) {
    ok = false;
    lines.push(`FAIL landmarks: ${staleLandmarks.join(', ')} (run --sync-landmarks --write)`);
  } else {
    lines.push(`PASS landmarks: ${docs.length ? 'verified' : '0(tier-0)'}`);
  }

  const unguardedGit = repo.gitDirs
    .filter(g => g !== '.git')
    .map(g => path.dirname(g))
    .filter(dir => !fs.existsSync(path.join(opts.root, dir, 'AGENTS.md')) && !fs.existsSync(path.join(opts.root, dir, 'AGENTS.override.md')));
  if (unguardedGit.length) {
    ok = false;
    lines.push(`FAIL nested-git: missing AGENTS.md in ${unguardedGit.join(', ')}`);
  } else {
    lines.push(`PASS nested-git: ${repo.gitDirs.length}`);
  }

  const ig = computeIgnoreTargets(opts.root);
  const { hasTokenOpt, hasJcm, opencode } = detectHostTools(opts.root);
  const mIg = missingIgnorePatterns(ig.patterns, ig.existingIgnore);
  const mCtx = (opts.allIgnores || hasTokenOpt) ? missingIgnorePatterns(ig.patterns, ig.existingContext) : [];
  const mJcm = (opts.allIgnores || hasJcm) ? missingIgnorePatterns(ig.patterns, ig.jcmObj?.extra_ignore_patterns) : [];
  const activeExtras = ig.extraTargets.filter(t => t.active);
  const extraFails = activeExtras.filter(t => t.missing.length > 0).map(t => `${t.file}(${t.missing.length})`);
  const ocFails = [];
  for (const oc of opencode.projectConfigs) {
    if (!oc.valid) {
      ocFails.push(`${oc.label}(invalid)`);
      continue;
    }
    const hasWatcherArr = Array.isArray(oc.cfg?.watcher?.ignore);
    if (!hasWatcherArr && opencode.hasOpencodeIgnore) continue;
    const mOc = missingIgnorePatterns(ig.patterns, oc.cfg?.watcher?.ignore);
    if (mOc.length) ocFails.push(`${oc.label}(${mOc.length})`);
  }
  if (mIg.length || mCtx.length || mJcm.length || extraFails.length || ocFails.length) {
    ok = false;
    const more = [...extraFails, ...ocFails];
    lines.push(`FAIL ignore-parity: missing .ignore(${mIg.length}) .contextignore(${mCtx.length}) .jcodemunch.jsonc(${mJcm.length})${more.length ? ' ' + more.join(' ') : ''}`);
  } else {
    const syncedCount = 1 + ((opts.allIgnores || hasTokenOpt) ? 1 : 0) + ((opts.allIgnores || hasJcm) ? 1 : 0) + activeExtras.length + opencode.projectConfigs.length;
    lines.push(`PASS ignore-parity: ${syncedCount}(${ig.patterns.length})`);
  }
  if (opencode.projectConfigs.length) {
    lines.push(opencode.hasEnvReadGuard
      ? 'PASS opencode-guard: .env protected'
      : 'WARN opencode-guard: add permission.read deny for .env/*.env.*');
  }

  if (!opts.skipValidators) {
    const localCli = path.join(opts.root, 'scripts', 'repo-index.cjs');
    if (fs.existsSync(localCli)) {
      const r = runVerifyCmd('repo-index syntax', 'node', ['--check', 'scripts/repo-index.cjs'], opts.root);
      if (!r.ok) ok = false;
      lines.push(r.line);
    }
    if (opts.exec) {
      const r = runVerifyCmd('custom check', opts.exec, [], opts.root);
      if (!r.ok) ok = false;
      lines.push(r.line);
    }
  }

  console.log(capOutput(ok ? lines.join(' | ') : lines.join('\n')));
  if (!ok) process.exit(1);
}

const UPDATE_API_URL = 'https://api.github.com/repos/4anti/antis-optimizer/releases?per_page=15';
const RELEASES_PAGE_URL = 'https://github.com/4anti/antis-optimizer/releases';
const MAX_UPDATE_BYTES = 262144;
const UPDATE_TIMEOUT_MS = 2500;

function parseSemver(raw) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(raw || '').trim());
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '' } : null;
}

function compareSemver(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] > pb[k] ? 1 : -1;
  }
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && !pb.pre) return -1;
  return pa.pre === pb.pre ? 0 : (pa.pre > pb.pre ? 1 : -1);
}

function parseReleaseSeverity(release) {
  const body = String(release?.body || '');
  const metaMatch = /<!--\s*antis-release\s*:\s*(\{[^}]*\})\s*-->/i.exec(body);
  if (metaMatch) {
    try {
      const sev = String(JSON.parse(metaMatch[1]).severity || '').toLowerCase();
      if (sev === 'critical' || sev === 'security') return 'critical';
      if (sev === 'recommended' || sev === 'breaking') return 'recommended';
      if (sev === 'normal') return 'normal';
    } catch {}
  }
  const head = `${release?.name || ''}\n${body.slice(0, 600)}`;
  if (/\[(?:CRITICAL|SECURITY)\]|^#{1,3}\s*(?:CRITICAL|SECURITY)\b/im.test(head)) return 'critical';
  if (/\[(?:BREAKING|RECOMMENDED)\]|^#{1,3}\s*(?:BREAKING|RECOMMENDED)\b/im.test(head)) return 'recommended';
  return 'normal';
}

function summarizeReleases(releases, localVer) {
  const newer = (Array.isArray(releases) ? releases : [])
    .filter(r => r && !r.draft && !r.prerelease)
    .filter(r => {
      const sv = parseSemver(r.tag_name);
      return sv && !sv.pre && compareSemver(r.tag_name, localVer) > 0;
    })
    .sort((a, b) => compareSemver(b.tag_name, a.tag_name))
    .map(r => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      severity: parseReleaseSeverity(r),
      url: r.html_url || `${RELEASES_PAGE_URL}/tag/${r.tag_name}`
    }));
  const criticalReleases = newer.filter(r => r.severity === 'critical');
  return {
    localVersion: localVer,
    latestTag: newer[0]?.tag || null,
    newerReleases: newer,
    criticalReleases,
    hasCritical: criticalReleases.length > 0
  };
}

function detectInstallMode(installRoot = path.resolve(__dirname, '..')) {
  const root = path.resolve(installRoot);
  const norm = normalizePattern(root);
  const pkg = readJsonSafe(path.join(root, 'package.json'));
  const hasSkill = fs.existsSync(path.join(root, 'SKILL.md'));
  if (/(?:^|\/)node_modules\/antis-optimizer(?:$|\/)|\/\.npm\/_npx\//i.test(norm)) return { mode: 'npm-managed', root };
  if (pkg?.name !== 'antis-optimizer' || !hasSkill) return { mode: 'repo-local', root };
  if (fs.existsSync(path.join(root, '.git'))) return { mode: 'git-clone', root };
  return { mode: 'standalone-skill', root };
}

function getUpgradeCommand(modeInfo, targetTag) {
  if (modeInfo.mode === 'git-clone') return `git -C "${modeInfo.root}" fetch --tags && git -C "${modeInfo.root}" pull --ff-only`;
  if (modeInfo.mode === 'npm-managed') return `npm install -g git+https://github.com/4anti/antis-optimizer.git#${targetTag}`;
  if (modeInfo.mode === 'repo-local') return `Update global skill first, then copy scripts/repo-index.cjs into "${path.join(modeInfo.root, 'scripts', 'repo-index.cjs')}"`;
  return `Review release notes and re-sync "${modeInfo.root}" from ${RELEASES_PAGE_URL}/tag/${targetTag}`;
}

function formatUpdateReport(summary, modeInfo, opts = {}) {
  if (opts.criticalOnly && !summary.hasCritical) return '';
  if (!summary.newerReleases.length) return `antis-optimizer v${summary.localVersion} (${modeInfo.mode}): up to date.`;
  const head = summary.hasCritical
    ? `[!] CRITICAL UPDATE AVAILABLE: antis-optimizer v${summary.localVersion} -> ${summary.latestTag} (${modeInfo.mode})`
    : `Update available: antis-optimizer v${summary.localVersion} -> ${summary.latestTag} (${modeInfo.mode})`;
  const rows = summary.newerReleases.slice(0, 5).map(r => `  - ${r.tag} [${r.severity.toUpperCase()}] ${r.name}`);
  const focusUrl = summary.criticalReleases[0]?.url || `${RELEASES_PAGE_URL}/tag/${summary.latestTag}`;
  return [
    head,
    ...rows,
    `Upgrade manually (no auto-write): ${getUpgradeCommand(modeInfo, summary.latestTag)}`,
    `Release notes: ${focusUrl}`
  ].join('\n');
}

function httpsGetPinnedJson(urlStr, opts = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch { return reject(new Error('Invalid update URL')); }
    if (u.protocol !== 'https:' || u.hostname !== 'api.github.com') {
      return reject(new Error('Blocked unpinned update endpoint: only https://api.github.com is allowed'));
    }
    const req = https.request(u, {
      method: 'GET',
      timeout: opts.timeoutMs || UPDATE_TIMEOUT_MS,
      headers: {
        'User-Agent': `antis-optimizer/${getPkgVersion()}`,
        Accept: 'application/vnd.github+json'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (hops >= 2) return reject(new Error('Too many redirects'));
        let nextUrl;
        try { nextUrl = new URL(res.headers.location, u).toString(); } catch { return reject(new Error('Invalid redirect')); }
        return httpsGetPinnedJson(nextUrl, opts, hops + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_UPDATE_BYTES) {
          res.destroy();
          return reject(new Error(`Update payload exceeded ${MAX_UPDATE_BYTES} bytes`));
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error(`Invalid JSON from GitHub API: ${e.message}`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Update check timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function cmdCheckUpdate(opts) {
  try {
    const releases = await httpsGetPinnedJson(UPDATE_API_URL);
    const report = formatUpdateReport(summarizeReleases(releases, getPkgVersion()), detectInstallMode(), opts);
    if (report) console.log(capOutput(report));
  } catch (err) {
    console.error(`Update check failed: ${err.message} (check manually: ${RELEASES_PAGE_URL})`);
    process.exit(1);
  }
}

if (require.main === module) {
  const opts = parseCli(process.argv.slice(2));
  if (opts.cmd === '--audit') cmdAudit(opts);
  else if (opts.cmd === '--detect') cmdDetect(opts);
  else if (opts.cmd === '--sync-ignores') cmdSyncIgnores(opts);
  else if (opts.cmd === '--sync-landmarks') cmdSyncLandmarks(opts);
  else if (opts.cmd === '--map') cmdMap(opts);
  else if (opts.cmd === '--slice') cmdSlice(opts);
  else if (opts.cmd === '--outline') cmdOutline(opts);
  else if (opts.cmd === '--handoff') cmdHandoff(opts);
  else if (opts.cmd === '--verify') cmdVerify(opts);
  else if (opts.cmd === '--check-update') cmdCheckUpdate(opts);
  else if (opts.cmd === '--help') cmdHelp();
  else if (opts.cmd === '--version') console.log(`antis-optimizer v${getPkgVersion()}`);
  else { console.error(`Unknown subcommand: ${opts.cmd} (try --help)`); process.exit(1); }
} else {
  module.exports = {
    stripJsStringsAndComments,
    parseFileOutline,
    detectStack,
    globToRegExp,
    stripJsonc,
    updatePyTriple,
    loadIgnoreRules,
    isDirIgnored,
    isFileIgnored,
    compareSemver,
    parseReleaseSeverity,
    summarizeReleases,
    detectInstallMode,
    getUpgradeCommand,
    formatUpdateReport,
    httpsGetPinnedJson,
    readHead,
    detectHostTools
  };
}
