---
name: antis-optimizer
description: >-
  Audit any repository and install a low-token 4-layer agent stack (triple-synced
  ignores, model/tool-aware AGENTS.md & INDEX.md, scoped rules, MCP/AST routing,
  and a Hybrid Compiler-AST + Stateful-Lexer CLI for --audit, --detect,
  --sync-ignores, --sync-landmarks, --map, --slice, --outline, --handoff, and
  compact --verify) across ChatGPT/Codex, Claude Code, and Gemini/Antigravity,
  cooperating with jcodemunch, ponytail, caveman, and hooks.
---

# Antis-Optimizer

Cut context, tool-output, and compaction tokens across **ChatGPT/Codex**, **Claude Code**, and **Gemini/Antigravity** while cooperating with installed MCPs, plugins, and hooks.

## Hard Budgets

| Artifact | Cap | Purpose |
| :--- | :--- | :--- |
| Root / Scoped `AGENTS.md`, `INDEX.md` | `<= 80L / <= 4,500B` | Invariants, excludes, router, maps, landmarks. |
| `CLAUDE.md` *(optional)* | `1L / <= 20B` | `@./AGENTS.md` pointer only. Never add `GEMINI.md`. |
| CLI `--audit`/`--map`/`--slice`/`--outline`/`--verify` | `< 3,500 chars` | Clears `Token Optimizer` `4,096`-char `archive_result` cap. |
| CLI `--handoff` | `<= 2,048B` | Pre-compaction snapshot (`Context-Mode` pattern). |

## Workflow

### 1. Detect Tooling & Run Mathematical Token ROI Audit
Run `node <skill-dir>/scripts/repo-index.cjs --root . --detect` and `--audit`:
- **Mathematical Break-Even Tiering (`--audit`):**
  - *Tier 0 (`IGNORE-ONLY`):* `0` monoliths (`>= 15KB`), `< 5k` trap tokens, and (`< 25` active files or `< 5k` active tokens) -> sync ignores only (skip `AGENTS.md`/`INDEX.md`; `--verify` passes with `0` docs).
  - *Tier 1 (`LEAN ZERO-COPY`):* `<= 2` monoliths and `< 25k` trap tokens (outside Tier 0) -> root `AGENTS.md` (`<= 35L`) + synced ignores; run `<skill-dir>/scripts/repo-index.cjs` globally without copying `scripts/repo-index.cjs` or `INDEX.md`.
  - *Tier 2 (`FULL 4-LAYER`):* `>= 3` monoliths or `>= 25k` trap tokens -> full `AGENTS.md` + `INDEX.md` + local/global CLI (`R* < 1` monolith read break-even).
- **Model/tool profile:**
  - *Claude / Gemini:* omit prose-brevity/style rules in repo `AGENTS.md` when `Ponytail` or `Caveman` is active (avoid stacking). Load `references/tool-coop-matrix.md` only for MCP/hook setup.
  - *ChatGPT / Codex (GPT reasoning):* keep root `AGENTS.md` pointer-only (invariants, excludes, CLI commands); skip verbose rules (`+26–39%` GPT-5 regression in Ponytail benchmarks).
- **Boundaries & dot-dirs:** Antigravity stops at nearest `.git` (add `AGENTS.md` per nested `.git`). If source lives in a `.dot-dir/`, note `rg`/`Grep` needs `--hidden` or explicit path (Windows `rg` prints `\` paths).

### 2. Decision Gate
Before editing repo files, present the `--audit` scoreboard and confirm: (1) Tier 0 vs Tier 1 (Zero-Copy) vs Tier 2 (Full 4-Layer); (2) keep monoliths with `file:L-L` landmarks + `--slice` vs split; (3) apply triple-ignore sync + optional host configs (`references/templates.md`).

### 3. Build the Co-op Layers
- **Triple Ignore Sync (`--sync-ignores --write`):** mirror patterns across `.ignore` (`rg`), `.contextignore` (`Token Optimizer` `read_cache.py`), and `.jcodemunch.jsonc` (`extra_ignore_patterns`), preserving user `#` and `//` comments and `.gitignore` rules.
- **Tier 0/1/2 + Artifact Router:** put invariants, Do-Not-Read paths, CLI commands, and symbol-anchored landmarks (`` `sym` `Lstart-Lend` ``) in `AGENTS.md` + `INDEX.md`:
  - *IDs, JSON/HTML monoliths, docs* -> CLI `--map`/`--slice`/`--outline` + `Read(file, offset, limit)`.
  - *Code callers / blast radius* -> `jcodemunch` (`route`/`order` on `counter` door) when indexed; else `--outline <file> [filter]` + `Read(offset, limit)`. Small known `<15`-line targets -> native `Grep`/`Read`.
  - Never run `/caveman-compress` on `AGENTS.md`, `INDEX.md`, or `SKILL.md` (breaks tables, globs, and line landmarks).
- **Self-Healing Off-Context CLI (`scripts/repo-index.cjs`):**
  1. Cap outputs `< 3,500 chars` and auto-redact secrets (`ghp_`, `sk-`, `AIza`, JWTs; refuse `.env`/`.pem`/`.key`).
  2. Print `file:Lstart-Lend` landmarks on `--slice`/`--outline` via Compiler AST (`ts.createSourceFile`) + Polyglot Stateful Lexer (TS/JS/JSX/TSX, Python, Rust, Go, C/C++ `#ifdef`-balanced, C#, HTML closing-tag spans, CSS).
  3. Pass logical IDs or `<file>:Lstart-Lend` to `--slice` (avoid raw `.json` CLI args when Token Optimizer is active, as `pipeline_analyzer.py` enables `bash_compress`).
  4. Auto-heal drifted symbol/section line ranges in `AGENTS.md` and `INDEX.md` via `--sync-landmarks --write`.

### 4. Verify & Measure
Run `--sync-landmarks --write`, `--verify`, `--audit`, and `--handoff`. Report measured bytes (`bytes / 4` est. tokens), break-even $R^*$, skipped checks, and any remaining risks.
