<div align="center">

<img src="./assets/logo.svg" alt="antis-optimizer Cleaved A logo" width="68" height="68" />

# antis-optimizer

**Stop AI coding agents from wasting tokens on junk folders and oversized files.**

Scan bloat, sync ignore rules across every AI tool, and jump straight to the exact lines of code you need.

[![GitHub Release](https://img.shields.io/github/v/release/4anti/antis-optimizer?style=flat-square&label=release&color=2563eb)](https://github.com/4anti/antis-optimizer/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/4anti/antis-optimizer/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/4anti/antis-optimizer/actions)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js)](./package.json)
[![Zero Required Deps](https://img.shields.io/badge/dependencies-0%20required-2ea043?style=flat-square)](./package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

<br/>

**[Interactive Website & Diff Simulator](https://4anti.github.io/antis-optimizer/)** · **[v1.0.0 Release](https://github.com/4anti/antis-optimizer/releases/tag/v1.0.0)** · **[Contributing Guide](./CONTRIBUTING.md)**

<br/>

<img src="./assets/hero-banner.svg" alt="Obsidian token funnel showing 157.4 MB of junk directories blocked and an exact 37-line slice loaded into context" width="100%" />

</div>

---

## Why Use This?

When you ask an AI assistant (**Claude Code**, **Cursor**, **Codex**, or **Antigravity**) to explore or edit a project, two things silently burn your context window and slow it down:

1. **Junk files sneaking into searches:** build folders (`dist/`, `build/`), forgotten git worktrees, massive JSON dumps, and lockfiles get scanned over and over—and every AI tool checks a *different* ignore file (`.ignore`, `.contextignore`, `.jcodemunch.jsonc`).
2. **Reading huge files top-to-bottom:** to edit one 30-line function or JSON section, the AI reads an entire 800-line file into memory—and stale line numbers in docs break after the next edit.

`antis-optimizer` fixes both in seconds with a fast Node CLI and tiny, auto-updating repo docs.

---

## 🚀 Try It in 10 Seconds

Run an audit on any repo without cloning or installing anything:

```bash
npx github:4anti/antis-optimizer --audit
```

Or install globally so `antis-optimizer` is always available:

```bash
npm install -g git+https://github.com/4anti/antis-optimizer.git
antis-optimizer --audit
```

<div align="center">
  <img src="./assets/terminal-demo.svg" alt="Animated terminal walkthrough showing --audit, --outline, and --verify" width="100%" />
</div>

---

## 🔄 How It Works

<div align="center">
  <img src="./assets/workflow-steps.svg" alt="Four steps: Find Bloat, Block Everywhere, Slice Exact Lines, Stay Verified" width="100%" />
</div>

1. **Audit your repo (`--audit`):** Counts real source files vs. junk, flags large files (`>= 15 KB`), and recommends a right-sized setup (for tiny repos, it skips extra docs completely so setup never costs more tokens than it saves).
2. **Sync ignore rules everywhere (`--sync-ignores --write`):** Mirrors your exclusions across `.ignore`, `.contextignore`, and `.jcodemunch.jsonc` while keeping your own comments untouched.
3. **Jump straight to exact lines (`--outline`, `--slice`):** Lists every function, class, HTML section, CSS block, or JSON section with exact `file:Lstart-Lend` ranges across TS/JS/JSX/TSX, Python, Rust, Go, C/C++, C#, HTML, CSS, and JSON, and slices exact AST/lexer symbol spans or `:Lstart-Lend` line ranges. Uses the TypeScript Compiler when installed, with a fast built-in parser fallback.
4. **Keep docs fresh automatically (`--sync-landmarks --write`, `--verify`):** Re-anchors shifted line numbers after you edit code and confirms everything passes in a single line (including `0`-doc Tier 0 repos).

---

## 📊 Modeled Impact

*Representative scenario comparisons (~4 chars/token) contrasting full-file reads and verbose logs against capped CLI outputs:*

| Common Task | Without `antis-optimizer` | With `antis-optimizer` | Saved |
| :--- | :--- | :--- | :---: |
| **Searching a repo** | Scans `dist/`, caches, media, worktrees (`35k–120k+` tokens) | Junk blocked across all tools (`~1.2k` tokens) | **~96–99%** |
| **Checking a huge JSON / HTML file** | Reads the whole file into context (`8k–15k` tokens) | `--slice` pulls just the section you need (`~700` tokens) | **~91%** |
| **Finding a function in big files** | Opens multiple full files (`12k+` tokens) | `--outline` shows exact `file:Lstart-Lend` lines (`~550` tokens) | **~95%** |
| **Running checks after edits** | Dumps pages of build logs (`2.5k–9k` tokens) | `--verify` prints one `PASS` line (`~35` tokens; logs only on fail) | **~98%** |
| **Resuming after context compaction** | Re-reads files from scratch (`15k+` tokens) | `--handoff` saves a `<= 2 KB` state summary (`~500` tokens) | **~94%** |

---

## 🧭 Command Cheat Sheet

Every command caps its output below `3,500` characters (and `--handoff` below `2 KB`), automatically redacts API keys/tokens, and refuses `.env` / private key files.

| Command | What It Does |
| :--- | :--- |
| `antis-optimizer --audit` | Scans junk/large files and recommends the lightest setup tier for your repo |
| `antis-optimizer --detect` | Detects which AI tools, MCP servers, and nested `.git` folders are present |
| `antis-optimizer --sync-ignores --write` | Syncs ignore patterns across `.ignore`, `.contextignore`, and `.jcodemunch.jsonc` |
| `antis-optimizer --outline <file> [filter]` | Shows symbols/sections and exact `Lstart-Lend` line numbers |
| `antis-optimizer --slice <scope> [symbol]` / `<file>:Lstart-Lend` | Extracts one JSON section, AST/lexer symbol span, or explicit line range |
| `antis-optimizer --map` | Prints a compact overview map and landmarks of the project |
| `antis-optimizer --sync-landmarks --write` | Updates shifted `file:Lstart-Lend` references in `AGENTS.md` / `INDEX.md` |
| `antis-optimizer --verify [--exec "<cmd>"]` | Verifies doc size caps, line numbers, and ignore sync in one line |
| `antis-optimizer --handoff --goal "..."` | Creates a compact `<= 2 KB` JSON checkpoint before context resets |
| `antis-optimizer --check-update [--critical-only]` | Checks GitHub Releases (read-only; warns on `[CRITICAL]` fixes without modifying files) |

---

## 🤖 Install as an AI Agent Skill

Want your AI assistant to run `--audit` and wire up projects for you automatically? Clone into your agent's global skills folder:

```bash
# Claude Code
git clone https://github.com/4anti/antis-optimizer.git ~/.claude/skills/antis-optimizer

# Google Antigravity / Gemini CLI
git clone https://github.com/4anti/antis-optimizer.git ~/.gemini/config/skills/antis-optimizer

# ChatGPT / Codex CLI
git clone https://github.com/4anti/antis-optimizer.git ~/.agents/skills/antis-optimizer
```

---

## 🤝 Works Standalone (or With Your Existing Token Plugins)

No extra plugins are needed. If you already use other AI workflow or token-saving tools, `antis-optimizer` detects them automatically so they don't overwrite or fight each other:

<details>
<summary>See how it avoids conflicts with Caveman, Ponytail, Token Optimizer, TokenEconomizer, and jCodemunch</summary>

<br/>

| Tool / Plugin | What Usually Goes Wrong | How `antis-optimizer` Handles It |
| :--- | :--- | :--- |
| **[`Caveman`](https://github.com/JuliusBrussee/caveman)** | Compressing `.md` files breaks markdown tables, globs, and line landmarks. | Keeps `AGENTS.md`, `INDEX.md`, and `SKILL.md` out of compression and avoids duplicate brevity rules. |
| **`Ponytail`** | Extra verbosity or regex-grep rules add unnecessary overhead on GPT/Codex models. | Keeps `AGENTS.md` pointer-only on Codex/GPT and avoids repeating already-loaded rules. |
| **`Token Optimizer` / `TokenEconomizer`** | Output truncation at `4,096` chars or mismatched ignore files cause repeated re-reads. | Keeps CLI output under `3,500` chars, syncs `.contextignore`, and avoids noisy CLI argument patterns. |
| **`jCodemunch` MCP** | Ignores `.ignore`/`.contextignore` and skips inline HTML/CSS `<script>`/`<style>` blocks. | Syncs `.jcodemunch.jsonc` automatically and handles HTML/CSS/JSON outlines cleanly alongside it. |

</details>

---

## 🙌 Contributing

Contributions are welcome — especially new language lexers, framework ignore rules, OS/agent fixes, and minimal bug repros.

Setup takes 30 seconds with zero dependencies (`git clone`, then `npm test`). See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the repo map, guardrails, and PR checklist.

---

## 📄 License

MIT © [4anti](https://github.com/4anti)
