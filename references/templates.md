# Config & Sync Templates (Apply Only on User Request)

Keep experimental configs local to the repository unless the user explicitly asks to update user-level `~/.claude/` or `~/.tokeneconomizer/`.

## 1. Triple-Ignore Targets (Generated via `--sync-ignores --write`)

- **`.ignore`** (for `rg` across Codex, Claude Code, Antigravity)
- **`.contextignore`** (same glob/path patterns for Claude `Token Optimizer` `read_cache.py`)
- **`.jcodemunch.jsonc`**:

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

## 2. Optional Claude `TokenEconomizer` Protection (`.tokeneconomizer/repos/<key>/config.json`)

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

## 3. Optional `Token Optimizer` MCP Exempt Env (Only If Large Capsules Truncate)

`TOKEN_OPTIMIZER_ARCHIVE_EXEMPT_TOOLS=mcp__jcodemunch__assemble_task_context,mcp__jcodemunch__get_context_bundle,mcp__jcodemunch__get_symbol_source`

## 4. Lean Model-Adaptive Root `AGENTS.md` Skeleton (`<= 80` lines)

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
