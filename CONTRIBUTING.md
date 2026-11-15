# Contributing to `antis-optimizer`

Thanks for helping make `antis-optimizer` faster, safer, and useful across more stacks and AI coding agents. The goal is simple: keep everything lightweight (`Node >= 18`, zero required runtime dependencies) so anyone can audit or slice a repo in seconds.

---

## 1. 30-Second Local Setup

No install or build step is required to run or test the core CLI:

```bash
git clone https://github.com/4anti/antis-optimizer.git
cd antis-optimizer
npm test
```

CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) verifies every PR across Ubuntu and Windows (Node 18 & 22) in **two** test modes — run both if you touch parser or AST code:

```bash
# 1. Zero-dependency stateful lexer mode (macOS / Linux)
ANTIS_FORCE_LEXER=1 npm test

# 1. Zero-dependency stateful lexer mode (Windows PowerShell)
$env:ANTIS_FORCE_LEXER="1"; npm test

# 2. Optional TypeScript Compiler AST mode
npm install --no-save --no-package-lock typescript
npm test
```

Smoke-test CLI changes safely against any repo without modifying files:

```bash
node ./scripts/repo-index.cjs --audit
node ./scripts/repo-index.cjs --root /path/to/test-repo --outline src/index.ts
```

---

## 2. Where Everything Lives

| Path | Responsibility |
| :--- | :--- |
| [`scripts/repo-index.cjs`](./scripts/repo-index.cjs) | Single-file CLI & engine: ROI audit, ignore sync, Compiler AST & polyglot lexer (`--outline`, `--slice`), secret redaction, `--sync-landmarks`, `--handoff`, and `--verify`. |
| [`test/test-suite.cjs`](./test/test-suite.cjs) | Self-contained test suite running inside isolated `os.tmpdir()` directories. |
| [`SKILL.md`](./SKILL.md) | Concise AI agent instructions & hard token budgets (loaded automatically by Claude Code, Antigravity, and Codex). |
| [`references/`](./references/tool-coop-matrix.md) | On-demand integration notes (`tool-coop-matrix.md`, `templates.md`) for MCP/plugin interoperability. |
| [`index.html`](./index.html) & `assets/` | Public site (`https://4anti.github.io/antis-optimizer/`) and README SVG diagrams. |
| [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) | Cross-OS CI matrix (`ANTIS_FORCE_LEXER=1` + TypeScript AST suite). |

---

## 3. High-Impact Ways to Help

- **Language & parser edge cases:** Improve symbol/brace/string span accuracy or add support for new languages (e.g. Swift, Kotlin, Elixir, Zig, Ruby, SQL, Svelte/Vue) inside `scripts/repo-index.cjs`.
- **Ignore & bloat accuracy:** Add common build/cache directories or false-positive exclusions for `--audit` and `--sync-ignores`.
- **Agent & OS compatibility:** Test `--detect`, hooks, and path handling across Windows, macOS, Linux, Claude Code, Antigravity / Gemini CLI, Codex CLI, Cursor, Caveman, Ponytail, and jCodemunch.
- **Minimal bug repros, docs & UX:** Clear reproduction snippets, README fixes, and tight examples are just as valuable as code PRs.

---

## 4. Guardrails (Read Before Writing Code)

1. **Keep runtime dependencies at zero:** `dependencies` in [`package.json`](./package.json) must remain empty (`typescript` stays `optionalDependencies`). Never introduce external test runners or build steps for the CLI.
2. **Think before adding a flag:** Before proposing a new CLI flag or config option, check whether a smarter default or existing subcommand handles it cleanly.
3. **Byte & secret safety comes first:** An optimization that silently mis-slices code or leaks sensitive files is worse than no optimization. Never weaken:
   - `.env` / `.pem` / `.key` refusals or secret redaction (`ghp_`, `sk-`, `AIza`, JWTs)
   - Path traversal guards
   - Output size caps (`< 3,500` chars on stdout, `<= 2,048` bytes on `--handoff`)
4. **Always add regression + negative tests:** Parser, ignore, or landmark changes must include isolated tests in [`test/test-suite.cjs`](./test/test-suite.cjs) proving both the fix and that valid edge cases aren't broken.
5. **Respect `SKILL.md` token discipline:** Human-facing guides belong in `README.md` or `CONTRIBUTING.md`. Keep `SKILL.md` ultra-lean and machine-actionable.

---

## 5. AI-Assisted Contributions

Using AI assistants to explore or draft code is fine; submitting unreviewed output is not:

- **Own your words:** Write your PR description and comments yourself explaining what changed, why, and what you verified.
- **Own your code:** Run `npm test` locally, inspect every line of your diff, and be ready to explain how it works during review. PRs with hallucinated tests or unexplained changes will be closed.

---

## 6. Opening a Clean Pull Request

1. Fork the repo and create a focused branch from `main` (e.g., `fix/python-decorator-span` or `feat/swift-outline`).
2. Keep PRs single-purpose and avoid unrelated reformatting.
3. Check `git diff` and `git status` before pushing to ensure **zero secrets, tokens, personal home paths, email addresses, or local scratch/ignore dotfiles** (`.claude/`, `.ignore`, etc.) are committed.
4. Open a PR against `main`. All contributions are licensed under the repository's [MIT License](./LICENSE) (inbound = outbound); adding a DCO sign-off (`git commit -s`) is optional and welcome.

> **Maintainer release tagging note:** Keep tags as standard SemVer (`vX.Y.Z` matching `package.json`). Prefix urgent security/bugfix GitHub Release titles or headers with `[CRITICAL]` / `[SECURITY]` (or `<!-- antis-release: {"severity":"critical"} -->`) so `--check-update --critical-only` flags them cleanly.
