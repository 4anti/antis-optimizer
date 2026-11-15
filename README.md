<div align="center">

<img src="./assets/logo.svg" alt="antis-optimizer Cleaved A logo" width="68" height="68" />

# antis-optimizer

**Give AI coding agents the exact lines, not the whole file.**

One command lists every symbol with its line range; one more prints just that function. Around that core: scan repo bloat and sync ignore rules across every AI tool so agents stop wasting tokens on junk folders and oversized files.

[![GitHub Release](https://img.shields.io/github/v/release/4anti/antis-optimizer?style=flat-square&label=release&color=2563eb)](https://github.com/4anti/antis-optimizer/releases)
[![npm](https://img.shields.io/npm/v/antis-optimizer?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/antis-optimizer)
[![CI](https://img.shields.io/github/actions/workflow/status/4anti/antis-optimizer/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/4anti/antis-optimizer/actions)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js)](./package.json)
[![Zero Required Deps](https://img.shields.io/badge/dependencies-0%20required-2ea043?style=flat-square)](./package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

<br/>

**[Interactive Website & Diff Simulator](https://4anti.github.io/antis-optimizer/)** · **[v1.3.1 Release](https://github.com/4anti/antis-optimizer/releases/tag/v1.3.1)** · **[Changelog](./CHANGELOG.md)** · **[Contributing Guide](./CONTRIBUTING.md)** · **[Security](./SECURITY.md)**

<br/>

<img src="./assets/hero-banner.svg" alt="Obsidian token funnel showing 157.4 MB of junk directories blocked and an exact 37-line slice loaded into context" width="100%" />

</div>

<div align="center">

[Why](#why-use-this) · [Quick start](#-try-it-in-10-seconds) · [How it works](#-how-it-works) · [Languages](#-supported-languages) · [Commands](#-command-cheat-sheet) · [Agent skill](#-install-as-an-ai-agent-skill) · [Safety](#-safety--limits) · [Works with](#-works-standalone-or-with-your-existing-token-plugins)

</div>

---

## Why Use This?

When you ask an AI assistant (**OpenCode**, **Claude Code**, **Cursor**, **Codex**, **Gemini CLI**, **Antigravity**, **VS Code / Copilot**, or **Windsurf**) to explore or edit a project, two things silently burn your context window and slow it down:

1. **Junk files sneaking into searches:** build folders (`dist/`, `build/`), forgotten git worktrees, massive JSON dumps, and lockfiles get scanned over and over—and every AI tool checks a *different* ignore file (`.ignore`, `.contextignore`, `.jcodemunch.jsonc`, `.cursorignore`, `.geminiignore`, etc.).
2. **Reading huge files top-to-bottom:** to edit one 30-line function or JSON section, the AI reads an entire 800-line file into memory—and stale line numbers in docs break after the next edit.

`antis-optimizer` fixes both in seconds with a fast Node CLI and tiny, auto-updating repo docs.

---

## 🚀 Try It in 10 Seconds

Run a read-only audit on any repo — nothing is written to your project:

```bash
npx antis-optimizer --audit
```

Or install globally so `antis-optimizer` is always available. The install has **zero dependencies** and uses the built-in lexer; add `typescript` globally (`npm install -g typescript`) only if you want exact Compiler-AST spans for TS/JS:

```bash
npm install -g antis-optimizer
antis-optimizer --audit
```

<div align="center">
  <img src="./assets/terminal-demo.svg" alt="Animated terminal walkthrough showing --audit, --outline, and --verify" width="100%" />
</div>

### The 4 commands you will actually use

```bash
antis-optimizer --audit                      # 1. what is bloating this repo? (read-only)
antis-optimizer --sync-ignores               # 2. preview ignore changes (add --write to apply)
antis-optimizer --outline src/app.ts         # 3. list symbols with exact line ranges
antis-optimizer --slice src/app.ts loadUser  # 4. print just that one function
```

Real output from this repository:

```text
$ antis-optimizer --outline scripts/repo-index.cjs redact
=== OUTLINE scripts/repo-index.cjs (2942L, 139715B, imports=5, filter="redact") ===
L77-L81: function redactSecrets(text)

$ antis-optimizer --slice scripts/repo-index.cjs isInsideRoot
landmark: scripts/repo-index.cjs:L101-L104
function isInsideRoot(root, fullPath) {
  const rel = path.relative(path.resolve(root), path.resolve(fullPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

$ antis-optimizer --verify
PASS doc-budgets: 1<=80L | PASS landmarks: verified | PASS nested-git: 1 | PASS ignore-parity: 3(69) | PASS repo-index syntax: ok
```

A 2,942-line file answered in 5 lines — that is the whole idea.

> Nothing is modified unless you pass `--write`. To undo an ignore sync, delete or `git checkout` the ignore files it touched.

---

## 🔄 How It Works

<div align="center">
  <img src="./assets/workflow-steps.svg" alt="Four steps: Find Bloat, Block Everywhere, Slice Exact Lines, Stay Verified" width="100%" />
</div>

1. **Audit your repo (`--audit`):** Counts real source files vs. junk, flags large files (`>= 15 KB`), detects common stacks (`Node`, `Python`, `Rust`, `Go`, `Java Maven/Gradle`, `Swift`, `Ruby`, `PHP`, `Elixir`, `.NET`), and recommends a right-sized setup (for tiny repos, it skips extra docs completely so setup never costs more tokens than it saves).
2. **Sync ignore rules everywhere (`--sync-ignores --write`):**
   - Always syncs `.ignore`.
   - Mirrors exclusions into `.contextignore`, `.jcodemunch.jsonc`, and repo-present tool ignore files (`.cursorignore`, `.cursorindexingignore`, `.geminiignore`, `.aiexclude`, `.codeiumignore`, `.rooignore`, `.clineignore`, `.aiderignore`, `.claudeignore`) **only** when that tool or config already exists in your repo.
   - Anti-bloat: never creates unwanted dotfiles or modifies `opencode.json[c]`, which stays read-only with an `opencode-ignore` / `watcher.ignore` check.
   - Preserves your `#` comments (grouped in the file header), JSONC `//` comments, and `.gitignore` `!` negations.
   - Guessed backup/large directories are flagged for review rather than auto-ignored.
3. **Jump straight to exact lines (`--outline`, `--slice`):** Lists functions, classes, headings, keys, blocks, and sections with exact `file:Lstart-Lend` ranges (see [Supported Languages](#-supported-languages)), and slices exact AST/lexer symbol spans or `:Lstart-Lend` line ranges. Uses the TypeScript Compiler when installed, with a fast built-in parser fallback.
4. **Keep docs fresh automatically (`--sync-landmarks --write`, `--verify`):** Re-anchors shifted line numbers after you edit code and confirms everything passes in a single line (including `0`-doc Tier 0 repos and `AGENTS.override.md`).

---

## 🌐 Supported Languages

| Kind | `--outline` / `--slice` support |
| :--- | :--- |
| **Code** | TS / JS / JSX / TSX, Python, Rust, Go, C / C++, C#, Java, Kotlin (`.kt` / `.kts`), Swift, PHP, Ruby, Elixir (`.ex` / `.exs`), SQL, Shell / Bash (`.sh` / `.bash`) |
| **Markup & components** | HTML, Svelte, Vue, Astro, CSS |
| **Config & docs** | JSON / JSONC, YAML, TOML, Markdown |

TS/JS use the real TypeScript Compiler AST when `typescript` is installed; everything else (and TS/JS without it) uses the built-in lexer.

---

## 📊 Modeled Impact

> **These are modeled estimates, not benchmark measurements.** They compare typical full-file reads and verbose logs against capped CLI output at ~4 chars/token. Your numbers depend on repo size and how your agent reads files — run `--audit` on your own repo for real byte counts.

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
| `antis-optimizer --detect` | Detects AI hosts (OpenCode, Claude, Cursor, Gemini CLI, Codex, Copilot, Windsurf, Cline/Roo/Aider, RTK), MCPs, stacks, and nested `.git` folders |
| `antis-optimizer --sync-ignores --write` | Syncs `.ignore` plus active repo tool ignores (`.contextignore`, `.jcodemunch.jsonc`, `.cursorignore`, `.geminiignore`, etc.) without bloating unused repos or editing `opencode.json[c]` |
| `antis-optimizer --outline <file> [filter]` | Shows symbols, SFC blocks, config keys, or Markdown headings and exact `Lstart-Lend` line numbers |
| `antis-optimizer --slice <scope> [symbol]` / `<file>:Lstart-Lend` | Extracts one JSON/JSONC section, AST/lexer symbol span, or explicit line range |
| `antis-optimizer --map` | Prints a compact overview map, `.opencode/skills/`, and project landmarks |
| `antis-optimizer --sync-landmarks --write` | Updates shifted `file:Lstart-Lend` references in `AGENTS.md` / `AGENTS.override.md` / `INDEX.md` |
| `antis-optimizer --verify [--exec "<cmd>"]` | Verifies doc size caps, line numbers, conditional ignore parity, and OpenCode `.env` read guards in one line |
| `antis-optimizer --handoff --goal "..."` | Creates a compact `<= 2 KB` JSON checkpoint before context resets |
| `antis-optimizer --check-update [--critical-only]` | Checks GitHub Releases (read-only; warns on `[CRITICAL]` fixes without modifying files) |

---

## 🔒 Safety & Limits

**Built-in guards**

- **Read-only by default:** files change only with `--write` (ignore/landmark sync) or `--out` (handoff).
- **Secret redaction on all output:** GitHub, OpenAI/Anthropic-style `sk-`, Google `AIza`, AWS `AKIA`, Slack, Stripe, npm and GitLab tokens, JWTs, PEM private-key blocks, and passwords inside `scheme://user:pass@host` URLs.
- **Refused files:** `.env*`, `*.pem` / `*.key` / `*.p12` / `*.pfx`, SSH keys, `.npmrc`, `.netrc`, `.pypirc`, `.git-credentials`, and secret/credential data files.
- **Stays inside `--root`:** paths that escape the repository are refused.
- **Never runs code from the scanned repo:** `typescript` is loaded only from the tool's own install or the global npm dir, never from the repo being scanned. If you copied the script *into* your own repo and want it to use that repo's `typescript`, set `ANTIS_TRUST_LOCAL_TS=1`. Set `ANTIS_FORCE_LEXER=1` to skip the compiler entirely.
- **Network:** only `--check-update` goes online, and only to `api.github.com`.

**Measured lexer accuracy**

Scored on unmodified real-world files ([`test/corpus/`](./test/corpus/README.md)) against real parsers; CI fails if a score drops. Reproduce with `npm run accuracy`.

| Language | Real files | Symbols | Exact `Lstart-Lend` | Judge |
| :--- | :---: | :---: | :---: | :--- |
| Python | 7 | 267 | **100%** | CPython `ast` |
| JavaScript | 5 | 24 | **100%** | TypeScript compiler |
| TypeScript / TSX | 9 | 141 | **90.1%** | TypeScript compiler |

Every other language in the table above is covered by unit tests only and has **no measured accuracy yet**. With `typescript` installed, TS/JS use the compiler itself instead of the lexer.

**Known limits**

- The built-in lexer is pattern-based, not a full parser. Known TypeScript gaps: arrow functions nested inside functions, overload signatures, and `declare module` blocks. Unusual formatting, heavy macros, or generated code can produce a wrong or missing span — check the printed `Lstart-Lend` before a large edit.
- Redaction is pattern-based. It is a safety net, not a guarantee; keep real secrets out of source files.
- Symbol slices are capped at 120 lines and all output at ~3,500 characters; narrow with a `[filter]` or an explicit `:Lstart-Lend` range.
- Very large repos are scanned up to a visit/depth cap; `--audit` prints a `partial scan` warning when the cap is hit.

Found a security problem? See **[SECURITY.md](./SECURITY.md)**.

---

## 🤖 Install as an AI Agent Skill

Want your AI assistant to run `--audit` and wire up projects for you automatically? Clone into your agent's global (or project-local) skills folder:

```bash
# OpenCode (global / project-local)
git clone https://github.com/4anti/antis-optimizer.git ~/.config/opencode/skills/antis-optimizer
# or project-local: .opencode/skills/antis-optimizer

# Claude Code
git clone https://github.com/4anti/antis-optimizer.git ~/.claude/skills/antis-optimizer

# Gemini CLI
git clone https://github.com/4anti/antis-optimizer.git ~/.gemini/skills/antis-optimizer

# Google Antigravity
git clone https://github.com/4anti/antis-optimizer.git ~/.gemini/config/skills/antis-optimizer

# Cursor (global / project-local)
git clone https://github.com/4anti/antis-optimizer.git ~/.cursor/skills/antis-optimizer
# or project-local: .cursor/skills/antis-optimizer

# GitHub Copilot / VS Code (project-local)
git clone https://github.com/4anti/antis-optimizer.git .github/skills/antis-optimizer

# ChatGPT / Codex CLI
git clone https://github.com/4anti/antis-optimizer.git ~/.agents/skills/antis-optimizer
```

> **OpenCode first-class support:** OpenCode automatically loads `AGENTS.md` and `.opencode/skills/`, and reads `opencode.json` / `opencode.jsonc` (plus `$OPENCODE_CONFIG`, `$OPENCODE_CONFIG_DIR`, and `$XDG_CONFIG_HOME/opencode`). `antis-optimizer` keeps `opencode.json[c]` read-only: use the `opencode-ignore` plugin to inherit `.ignore`/`.gitignore` automatically, and see [`references/templates.md`](./references/templates.md) for a ready-to-paste `opencode.jsonc` (`.env` `permission.read` deny, `"mcp"` schema, and `opencode-ignore` / `opencode-dcp` / `openrtk` plugins).

---

## 🤝 Works Standalone (or With Your Existing Token Plugins)

No extra plugins are needed. If you already use other AI workflow or token-saving tools, `antis-optimizer` detects them automatically so they don't overwrite or fight each other (see [`references/tool-coop-matrix.md`](./references/tool-coop-matrix.md) for full host/plugin rules):

<details>
<summary>See how it avoids conflicts with OpenCode, RTK, Caveman, Ponytail, Token Optimizer, TokenEconomizer, and jCodemunch</summary>

<br/>

| Tool / Plugin | What Usually Goes Wrong | How `antis-optimizer` Handles It |
| :--- | :--- | :--- |
| **`OpenCode`** (`opencode-dcp`, `opencode-ignore`, `openrtk`) | Ignores `.ignore` without `opencode-ignore` or `watcher.ignore`; uses root `"mcp"` (not `"mcpServers"`). | Keeps `opencode.json[c]` read-only, checks `opencode-ignore` / existing `watcher.ignore` + `.env` `permission.read` deny, and avoids duplicating `opencode-dcp` / `openrtk` rules. |
| **`RTK`** (`~/.config/rtk/`, `openrtk`, Claude hooks) | Extra lossy shell pipes can strip line ranges printed by `--outline` / `--slice`. | Keeps `--verify` (1-line `PASS`) and `--outline` RTK-compact out of the box without mangling `Lstart-Lend` landmarks. |
| **[`Caveman`](https://github.com/JuliusBrussee/caveman)** | Compressing `.md` files breaks markdown tables, globs, and line landmarks. | Keeps `AGENTS.md`, `INDEX.md`, and `SKILL.md` out of compression and avoids duplicate brevity rules. |
| **`Ponytail`** | Extra verbosity or regex-grep rules add unnecessary overhead on GPT/Codex models. | Keeps `AGENTS.md` / `AGENTS.override.md` pointer-only on Codex/GPT and avoids repeating already-loaded rules. |
| **`Token Optimizer` / `TokenEconomizer`** | Output truncation at `4,096` chars or mismatched ignore files cause repeated re-reads. | Keeps CLI output under `3,500` chars, syncs `.contextignore` when active, and avoids noisy CLI argument patterns. |
| **`jCodemunch` MCP** | Ignores `.ignore`/`.contextignore` and skips inline HTML/CSS/SFC `<script>`/`<style>` blocks. | Syncs `.jcodemunch.jsonc` when detected and handles HTML/Svelte/Vue/Astro/CSS/config outlines cleanly alongside it. |

</details>

---

## 🙌 Contributing

Contributions are welcome — especially new language lexers, framework ignore rules, OS/agent fixes, and minimal bug repros.

Setup takes 30 seconds with zero dependencies (`git clone`, then `npm test`). See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the repo map, guardrails, and PR checklist, and the **[Code of Conduct](./CODE_OF_CONDUCT.md)**. Release history lives in **[CHANGELOG.md](./CHANGELOG.md)**.

---

## 📄 License

MIT © [4anti](https://github.com/4anti)
