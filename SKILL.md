---
name: antis-optimizer
description: >-
  Audit any repo and install a low-token 4-layer stack (conditional multi-tool
  ignores, model-aware AGENTS.md/INDEX.md, MCP/AST routing, and zero-dep CLI for
  --audit, --detect, --sync-ignores, --sync-landmarks, --map, --slice, --outline,
  --handoff, --verify) across OpenCode, Claude Code, Codex, Cursor,
  Gemini/Antigravity, Copilot, and Windsurf with jcodemunch/ponytail/caveman/RTK.
---

# Antis-Optimizer

Cut context, tool-output, and compaction tokens across AI coding agents while cooperating with installed MCPs, plugins, and hooks.

## Hard Budgets

| Artifact | Cap | Purpose |
| :--- | :--- | :--- |
| `AGENTS.md`, `AGENTS.override.md`, `INDEX.md` | `<= 80L / <= 4,500B` | Invariants, excludes, router, landmarks. |
| `CLAUDE.md` *(opt)* | `1L / <= 20B` | `@./AGENTS.md` pointer; never add `GEMINI.md`. |
| `--audit`/`--map`/`--slice`/`--outline`/`--verify` | `< 3,500 chars` | Clears `Token Optimizer` `4,096`-char cap. |
| `--handoff` | `<= 2,048B` | Pre-compaction snapshot (`Context-Mode`). |

## Workflow

### 1. Detect & Audit
Run `node <skill-dir>/scripts/repo-index.cjs --root . --detect` and `--audit`:
- **Tiering (`--audit`):**
  - *Tier 0 (`IGNORE-ONLY`):* `0` monoliths (`>=15KB`), `<5k` trap tokens, and (`<25` active files or `<5k` active tokens) -> ignores only (`--verify` passes at `0` docs).
  - *Tier 1 (`LEAN ZERO-COPY`):* `<=2` monoliths & `<25k` trap tokens -> root `AGENTS.md` (target `<=35L`, cap `80L`) + ignores; run global `<skill-dir>/scripts/repo-index.cjs` (no copied CLI/`INDEX.md`).
  - *Tier 2 (`FULL 4-LAYER`):* `>=3` monoliths or `>=25k` trap tokens -> `AGENTS.md` + `INDEX.md` + CLI (`R*<1` break-even).
- **Profile:** omit prose-brevity rules in `AGENTS.md` when `Ponytail`/`Caveman`/`opencode-dcp`/`RTK`/`openrtk` active; keep Codex/GPT `AGENTS.md` (`AGENTS.override.md`) pointer-only (`+26–39%` GPT-5 regression). Load `references/tool-coop-matrix.md` only for MCP/hook/plugin setup.
- **Scope:** Antigravity stops at nearest `.git` (add `AGENTS.md` per nested `.git`); OpenCode auto-loads `AGENTS.md` & `.opencode/skills/`. `.dot-dir/` search needs `rg --hidden` (Windows `rg` prints `\`).

### 2. Decision Gate
Present `--audit` scoreboard; confirm: (1) Tier 0 vs 1 vs 2; (2) `file:L-L` + `--slice` vs split monoliths; (3) conditional ignore sync + optional host configs (`references/templates.md`).

### 3. Build Co-op Layers
- **Conditional Ignore Sync (`--sync-ignores --write`):** writes `.ignore`; syncs `.contextignore`/`.jcodemunch.jsonc` when detected (or `--all-ignores`), plus repo-present `.cursorignore`, `.cursorindexingignore`, `.geminiignore`, `.aiexclude`, `.codeiumignore`, `.rooignore`, `.clineignore`, `.aiderignore`, `.claudeignore` ONLY when active (`opencode.json[c]` stays read-only; `--verify` checks `opencode-ignore`/existing `watcher.ignore` + `.env` deny). Preserves `#` headers, JSONC `//` comments, and `!negations`. `.contextignore` gets Token Optimizer's fnmatch form (`dir/` -> `*/dir/*`, no image/PDF blocks); a `!path` in `.ignore` is the keep-list for folders the user wants searchable (RE `decompiled/`, `_work/`).
- **Router (`AGENTS.md` / `INDEX.md`):** invariants, Do-Not-Read paths, CLI commands, and `` `sym` `Lstart-Lend` `` landmarks:
  - IDs, JSON/config/doc monoliths -> `--map`/`--slice`/`--outline` + `Read(file, offset, limit)`.
  - Callers / impact -> `jcodemunch` when indexed; else `--outline <file> [filter]` + `Read(offset, limit)`. `<15L` targets -> `Grep`/`Read`.
  - Never run `/caveman-compress` on `AGENTS.md`, `INDEX.md`, or `SKILL.md`.
- **Off-Context CLI (`scripts/repo-index.cjs`):**
  1. Caps stdout `<3,500 chars`; redacts secrets (`ghp_`, `sk-`, `AIza`, `AKIA`, JWTs; refuses `.env`/`.pem`/`.key`).
  2. Prints `file:Lstart-Lend` via optional `typescript` Compiler AST + built-in Polyglot Lexer: TS/JS/JSX/TSX, Python, Rust, Go, C/C++, C#, Java, Kotlin, Swift, PHP, Ruby, Elixir, SQL, Shell/Bash, HTML/Svelte/Vue/Astro, CSS, JSON/JSONC, YAML, TOML, Markdown.
  3. Pass logical IDs or `<file>:Lstart-Lend` to `--slice` (avoid raw `.json` args under `Token Optimizer`).
  4. Auto-heals drifted line ranges via `--sync-landmarks --write`.

### 4. Verify & Measure
Run `--sync-landmarks --write`, `--verify`, `--audit`, `--handoff`. Report bytes (`bytes/4` est. tokens), $R^*$, skipped checks, and risks.
