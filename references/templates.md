# Config & Sync Templates (Apply Only on User Request)

Keep experimental configs local to the repository unless the user explicitly asks to update user-level `~/.claude/`, `~/.config/opencode/`, or `~/.tokeneconomizer/`.

## 1. Conditional Ignore Targets (Generated via `--sync-ignores --write`)

Always syncs `.ignore`, and conditionally syncs only tools detected in the host/repo (`--all-ignores` also initializes `.contextignore` and `.jcodemunch.jsonc`, while keeping editor dotfiles conditional):

- **`.ignore`** (always synced for `rg` across OpenCode, Codex, Claude Code, Antigravity)
- **`.contextignore`** (when `Token Optimizer` detected or `--all-ignores`)
- **`.jcodemunch.jsonc`** (when `jcodemunch` detected or `--all-ignores`):

```jsonc
{
  // Mirrors .ignore traps so AST indexing skips heavy vendor/build outputs and base64 blobs
  "extra_ignore_patterns": [
    "**/node_modules/**",
    "**/.venv/**",
    "**/__pycache__/**",
    "**/target/**",
    "*.original.md",
    ".claude/settings.local.json"
  ]
}
```

- **Repo-present tool ignores only** (synced ONLY when the file or tool config dir already exists in the repo): `.cursorignore` / `.cursorindexingignore` (`.cursor/`), `.geminiignore` / `.aiexclude` (`.gemini/`), `.codeiumignore` (`.windsurf/`), `.rooignore` (`.roo/`), `.clineignore` (`.cline/`), `.claudeignore` (`.claude/`), and `.aiderignore`. (`opencode.json[c]` stays read-only: use `opencode-ignore` plugin to inherit `.ignore`/`.gitignore`, or configure `watcher.ignore` manually.)

## 2. Optional OpenCode Config (`opencode.jsonc` or `.opencode/opencode.jsonc`)

OpenCode auto-loads `AGENTS.md` (and skills in `~/.config/opencode/skills/` or `.opencode/skills/`). Note that OpenCode uses root `"mcp"` (not `"mcpServers"`) with `"type": "local"` and a `"command": [...]` array (or `"type": "remote"` + `"url"`).

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  // Optional: opencode.json[c] stays read-only; prefer "opencode-ignore" plugin over duplicating patterns
  "watcher": {
    "ignore": [
      ".git/",
      "node_modules/",
      ".venv/",
      "__pycache__/",
      "target/",
      "dist/"
    ]
  },
  // Blocks model reads on secrets (last matching rule wins); checked by --verify (opencode-guard)
  "permission": {
    "read": {
      "*": "allow",
      "*.env": "deny",
      "*.env.*": "deny",
      ".env": "deny",
      ".env.*": "deny",
      "*.env.example": "allow"
    }
  },
  // Root key is "mcp" (not "mcpServers")
  "mcp": {
    "jcodemunch": {
      "type": "local",
      "command": ["uvx", "jcodemunch-mcp"],
      "enabled": true
    }
  },
  // Optional token/ignore plugins detected by --detect:
  "plugin": [
    "opencode-ignore",
    "@tarquinen/opencode-dcp",
    "openrtk"
  ]
}
```

> `--sync-ignores --write` never creates or modifies `opencode.json[c]` (advisory only). `--verify` checks `watcher.ignore` parity only if you configured `watcher.ignore` (otherwise recommends `opencode-ignore`) and emits `PASS`/`WARN opencode-guard` for `.env` read protection (last matching rule wins).

## 3. Optional Claude `TokenEconomizer` Protection (`.tokeneconomizer/repos/<key>/config.json`)

Prevents `toolprune="auto"` from denying `jcodemunch` call-graph tools in repos where `repo-index` handles normal exploration:

```json
{
  "toolprune_protect": [
    "mcp__jcodemunch__order",
    "mcp__jcodemunch__route",
    "mcp__jcodemunch__get_blast_radius",
    "mcp__jcodemunch__get_call_hierarchy",
    "mcp__jcodemunch__check_edit_safe"
  ],
  "repomap": "off"
}
```

## 4. Optional `Token Optimizer` MCP Exempt Env (Only If Large Capsules Truncate)

`TOKEN_OPTIMIZER_ARCHIVE_EXEMPT_TOOLS=mcp__jcodemunch__assemble_task_context,mcp__jcodemunch__get_context_bundle,mcp__jcodemunch__get_symbol_source`

## 5. Lean Model-Adaptive Root `AGENTS.md` Skeleton (`<= 80` lines)

> Loaded automatically by OpenCode, Codex (`AGENTS.md` / `AGENTS.override.md`), and Antigravity; symlink/point `CLAUDE.md` via `@./AGENTS.md`.

```markdown
# <Repo> — Agent Guide

## Invariants
- <Origin / port / storage / publish constraints>

## Do Not Read (Excluded in .ignore / .contextignore / .jcodemunch.jsonc)
- <generated bundles, base64 notes, binaries, archives>

## Artifact Router & Off-Context CLI
- Domain IDs / JSON & HTML monoliths: run `node scripts/repo-index.cjs --map` and `--slice <scope> [id]`, then `Read(file, offset, limit)` using printed line landmarks.
- Code callers / impact (when `jcodemunch` active): `route("who calls <sym>")` / `get_blast_radius`; without MCP use `--outline <rel-path>`. Small known edits (<15 lines): native `Grep`/`Read`.
- Verify before finishing: `node scripts/repo-index.cjs --verify` (passes 1-line; failures detailed).
- Pre-compaction / handoff snapshot (`<=2 KB`): `node scripts/repo-index.cjs --handoff --goal "<task>"`.

## Routing
| Scope | Editable Source | Verify | Scoped Docs |
| :--- | :--- | :--- | :--- |
```
