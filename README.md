# ⚡ antis-optimizer

> **Find & quarantine 100+ MB of ghost context traps across Claude Code, Cursor, Codex, and Antigravity in 0.4s — with Compiler AST & Stateful Polyglot Slicing.**

[![npm version](https://img.shields.io/badge/npx-antis--optimizer-000000?style=flat-square&logo=npm)](https://github.com/4anti/antis-optimizer)
[![Hybrid AST](https://img.shields.io/badge/AST-TypeScript%20%2B%20Polyglot%20Lexer-3178C6?style=flat-square&logo=typescript)](./package.json)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js)](./package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

Every repository accumulates **ghost context traps** that silently blow up your token bill and degrade reasoning: forgotten `.claude/worktrees/` duplicates (120+ MB), `.playwright-mcp/` snapshots with nested `.git` trees, 1-line TopoJSON/minified bundles, inline `data:image/...;base64` blobs inside docs, and 60 KB HTML/JSON monoliths that trigger whole-file reads.

Worse, **every agent surface ignores different files**:
- **Ripgrep (`rg` / Grep)** reads `.ignore`, skips `.dot-dirs/` unless `--hidden` is passed, and crawls `.git/` internals when `--hidden` is used without `.git/` in `.ignore`.
- **Claude Code (`Token Optimizer` `read_cache.py`)** checks `.contextignore` only—never `.ignore`.
- **`jCodemunch` MCP** reads `.gitignore` + `.jcodemunch.jsonc` (`extra_ignore_patterns`)—ignoring both `.ignore` and `.contextignore`—and emits **0 AST symbols** for inline `<script>`/`<style>` in `.html`.

`antis-optimizer` fixes all of them in a single pass with a **Hybrid Compiler-AST + Stateful-Lexer Node CLI** and a **3-tier mathematical break-even router** (`AGENTS.md`, `INDEX.md`, triple-synced ignores, and sub-3.5 KB symbol/JSON slicing).

---

## 🚀 10-Second Quickstart (`npx`)

Run a zero-write audit on any repository right now:

```bash
npx antis-optimizer --audit
```

### Example `--audit` Scoreboard (Production Web Repo)

```text
=== ANTIS-OPTIMIZER AUDIT & TOKEN ROI MODEL ===
Repo: acme-web | Stack: node(build/check)
├─ Search noise filtered:  1,548 raw files ──► 166 active files (▼ 89.3% file noise)
├─ Total bloat quarantined: 157.4 MB (146.2 MB media/fonts + 11,035 KB text/JSON/bundles)
├─ Ghost text traps blocked: ~2,824,936 tokens across 926 non-source text/JSON/bundle files
├─ Top quarantined paths:   .claude/worktrees/ (119.9 MB), dist/ (18.6 MB), *.mp4 (media/fonts) (7.7 MB), .playwright-mcp/ (5.3 MB), *.png (media/fonts) (4.2 MB)
├─ Active source footprint: 166 files (~330,332 tokens total)
├─ Monoliths (>=15KB):      19 files (src/dashboard.tsx:86KB, public/theme.css:55KB, public/main.css:47KB, index.html:41KB, assets/catalog-snapshot.json:38KB)
├─ Mathematical ROI model:  Session doc tax = ~3,078 tok (1.5x compact) | Avg monolith slice save = ~7,686 tok/read
├─ Break-even threshold:    R* = 0.4 monolith reads/session (plus 100% protection against 2,824,936-tok trap reads)
└─ Optimal configuration:   TIER 2 (FULL 4-LAYER) — 19 monoliths (>=15KB) & 2824.9k trap tokens quarantined
```

---

## 📊 Concrete Token & Cost Math (And When *Not* to Use Full Mode)

Like [`ponytail-gain`](https://github.com/4anti), `antis-optimizer` is **100% honest about overhead**. Loading Tier-0 router docs (`AGENTS.md` + `INDEX.md`) costs ~**1,400 tokens per session** (`~5.6 KB`). Here is the exact math across real tasks:

| Workflow Operation | Without `antis-optimizer` | With `antis-optimizer` | Token Savings |
| :--- | ---: | ---: | ---: |
| **Broad repo search / explore** (`rg`, `repomap`, agent file walk) | Crawls `dist/`, `.playwright-mcp/`, `world.json`, lockfiles (`35,000 – 120,000+ tok`) | Quarantined via synced `.ignore` + `.contextignore` + `.jcodemunch.jsonc` (`~1,200 tok`) | **-96% to -99%** |
| **Inspecting a 31 KB JSON snapshot or 50 KB HTML monolith** | Raw whole-file `Read` (`8,000 – 15,000 tok`) or `read_cache` `soft_block` loop | `--slice catalog-snapshot metrics` (`~420 tok`) + targeted `Read(offset, limit)` (`~300 tok`) | **-91%** |
| **Scanning symbols in `.ts`, `.tsx`, `.py`, `.rs`, `.go`, `.c`, `.html`, `.css`** | Reading 3–5 full files (`12,000+ tok`) | `--outline <file> [filter]` prints Compiler AST / Polyglot signatures + `file:Lstart-Lend` in `<3,500 chars` (`~550 tok`) | **-95%** |
| **Build + test verification loop** | Raw test/bundler stdout (`2,500 – 9,000 tok` per run) | `--verify` collapses passing checks into **1 line** (`~35 tok`); prints full diff only on fail | **-98%** |
| **50% context auto-compaction reload** | Re-reads whole files after `PreCompact` clears `read_cache` (`15,000+ tok`) | `--handoff` (`<= 2,048 B` / `~500 tok`) + `<= 80L` Tier-0 docs | **-94%** |

### ⚖️ The 3-Tier Mathematical Break-Even Gate

Not every repository needs a 4-layer routing stack. `npx antis-optimizer --audit` calculates your exact break-even threshold $R^* = T_{\text{tax}} / \overline{\Delta T_{\text{read}}}$ and selects one of three tiers:
- **Tier 0 (`IGNORE-ONLY`, `< 25` active files & `0` monoliths):** Syncs `.ignore`, `.contextignore`, and `.jcodemunch.jsonc` only. Skips `AGENTS.md` and `INDEX.md` so doc overhead never exceeds read savings.
- **Tier 1 (`LEAN ZERO-COPY`, `< 50` active files & `<= 2` monoliths):** Keeps a single `<= 35`-line root `AGENTS.md` + synced ignores and uses `npx antis-optimizer` globally without copying `scripts/repo-index.cjs` or `INDEX.md`.
- **Tier 2 (`FULL 4-LAYER`, `>= 3` monoliths or heavy traps):** Installs `AGENTS.md` + `INDEX.md` + `scripts/repo-index.cjs` where break-even is achieved in `< 1` monolith read per session.

---

## 🛠️ Installing as an Agent Skill (Claude Code / Antigravity / Codex)

Clone into your global skills directory so your agent can audit and wire up any repository automatically:

```bash
# Claude Code
git clone https://github.com/4anti/antis-optimizer.git ~/.claude/skills/antis-optimizer

# Google Antigravity / Gemini CLI
git clone https://github.com/4anti/antis-optimizer.git ~/.gemini/config/skills/antis-optimizer

# ChatGPT / Codex CLI
git clone https://github.com/4anti/antis-optimizer.git ~/.agents/skills/antis-optimizer
```

---

## 🧭 Core CLI Commands & Auto-Healing Landmarks

Every command is hard-capped at **`< 3,500` characters** (`--handoff` at **`<= 2,048` bytes**) so outputs never trigger MCP truncation or `archive_result` hooks.

```bash
# 1. Audit ghost traps, 1-line minified bombs, base64 blobs & token ROI break-even
npx antis-optimizer --audit

# 2. Detect active agent surfaces, nested .git boundaries & model profile
npx antis-optimizer --detect

# 3. Triple-sync .ignore, .contextignore, and .jcodemunch.jsonc (preserves comments)
npx antis-optimizer --sync-ignores --write

# 4. Auto-heal stale file:Lstart-Lend line ranges in AGENTS.md & INDEX.md after edits
npx antis-optimizer --sync-landmarks --write

# 5. Print compact repo map & domain landmarks (< 3.5 KB)
npx antis-optimizer --map

# 6. Compiler AST + Polyglot symbol & section outline (TS/JS/JSX/TSX, Python, Rust, Go, C/C++, HTML, CSS)
npx antis-optimizer --outline src/client.ts
npx antis-optimizer --outline index.html hero

# 7. Slice logical JSON/monolith sections without passing ".json" in CLI args
npx antis-optimizer --slice catalog-snapshot metrics

# 8. 1-line PASS verification (doc budgets, symbol L-L bounds, nested .git, ignore parity)
npx antis-optimizer --verify --exec "npm run build"

# 9. Pre-compaction handoff state snapshot (<= 2 KB, guaranteed valid JSON)
npx antis-optimizer --handoff --goal "Ship API client" --files "src/client.ts,index.html"
```

### 🩹 Self-Healing `file:Lstart-Lend` Landmarks (`--sync-landmarks`)

Static line numbers in documentation usually rot the moment someone edits a file. `antis-optimizer` solves this with `--sync-landmarks`:
1. `--verify` checks every `file:Lstart-Lend` citation and `` `symbol` `Lstart-Lend` `` table entry in `AGENTS.md` and `INDEX.md` against the TypeScript Compiler AST (`ts.createSourceFile`) and polyglot structural parser.
2. Running `npx antis-optimizer --sync-landmarks --write` automatically re-anchors shifted functions, classes, HTML sections, CSS blocks, and file line counts to their exact updated `Lstart-Lend` coordinates in place.

---

## 🤝 Ecosystem Co-op (Works Standalone, Supercharges Your Stack)

`antis-optimizer` requires **nothing** else to work. However, if you use popular token-saving plugins, MCP servers, or hooks, they often step on each other's toes. `antis-optimizer` detects and harmonizes all 5 major tools out of the box:

| Tool / Plugin | The Hidden Conflict | How `antis-optimizer` Harmonizes It |
| :--- | :--- | :--- |
| **[`Caveman`](https://github.com/JuliusBrussee/caveman)** (`claude-code`) | `/caveman-compress` rewrites `.md` files in place, mangling markdown tables, glob patterns, and `file:L-L` line landmarks. Stacking prose rules in `AGENTS.md` wastes tokens. | Marks `AGENTS.md`, `INDEX.md`, and `SKILL.md` off-limits to `/caveman-compress` and omits duplicate prose-brevity rules when Caveman is active. |
| **[`Ponytail`](https://github.com/4anti)** (`claude` / `antigravity`) | Ponytail's `AGENTS.md` enforces minimal diffs and "grep every caller," which conflicts with AST call-graphs and causes a `+26–39%` token regression on GPT-5/Codex models. | Deduplicates Ponytail rules in repo `AGENTS.md`, switches GPT/Codex to a pointer-only `AGENTS.md`, and upgrades caller checks from regex `grep` to `jCodemunch` when indexed. |
| **`Token Optimizer` Hooks** (`read_cache`, `archive_result`, `bash_compress`) | Active on Claude Code (disabled on Windows Antigravity & Codex). `read_cache.py` checks `.contextignore` only; `archive_result.py` truncates outputs `>=4,096` chars; `pipeline_analyzer.py` triggers `bash_compress` if `node` args contain `.json`. | Mirrors `.ignore` -> `.contextignore`, caps CLI outputs at `<3,500` chars, uses logical slice names (no `.json` CLI args), and prints `file:L-L` so `Read(offset, limit)` bypasses whole-file `soft_block`. |
| **`TokenEconomizer`** (`toolprune`, `loopguard`, `repomap`) | `toolprune="auto"` permanently denies unused MCP tools in `.claude/settings.local.json` after 10 prompts, and `repomap_gen.py` ignores `.ignore`. | Sets `repomap="off"` in favor of `--map`, keeps `--verify` output deterministic for `loopguard`, and provides `toolprune_protect` templates for core `jCodemunch` tools. |
| **`jCodemunch` MCP** (`counter` 6-tool AST door) | Ignores `.ignore` and `.contextignore`; emits **0 AST symbols** for inline `<script>`/`<style>` in `.html` and `.md`; slower than native `Read` on `<15`-line known edits. | Syncs `.jcodemunch.jsonc` (`extra_ignore_patterns`), routes multi-file TS/JS/Py/Rs/Go call graphs to `jCodemunch`, and routes HTML/CSS/JSON monoliths to `antis-optimizer --outline` / `--slice`. |

---

## 🧱 Hard Budgets (Enforced by `--verify`)

| Artifact | Hard Budget | Why It Matters |
| :--- | :--- | :--- |
| Root / Scoped `AGENTS.md`, `INDEX.md` | `<= 80 lines` / `<= 4,500 B` | Keeps post-compaction reload tiny (`~1,100 tok` max). |
| `CLAUDE.md` *(optional)* | `1 line` / `<= 20 B` | `@./AGENTS.md` pointer only. Single source of truth; never create `GEMINI.md`. |
| `--map` / `--slice` / `--outline` / `--verify` | `< 3,500 chars` | Clears `Token Optimizer` `4,096`-char `archive_result` truncation ceiling with safety margin. |
| `--handoff` | `<= 2,048 B` | Compact pre-compaction state snapshot (`Context-Mode` pattern). |

---

## 📄 License

MIT © [4anti](https://github.com/4anti)
