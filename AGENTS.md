# antis-optimizer — Agent Guide

## Invariants
- Zero runtime dependencies; `typescript` stays optional. Node >= 18.
- CLI is one file: `scripts/repo-index.cjs`. Tests: `test/test-suite.cjs` (`npm test`).
- Never weaken secret redaction, `.env`/key refusals, path-traversal guards, or output caps.
- Bump the test count in `test/test-suite.cjs` (header, banner, `total`) when adding a test.

## Do Not Read Whole
- `scripts/repo-index.cjs`, `test/test-suite.cjs`, `index.html` — outline first, then slice.

## Off-Context CLI
- Symbols: `node scripts/repo-index.cjs --outline scripts/repo-index.cjs [filter]`
- Exact span: `node scripts/repo-index.cjs --slice scripts/repo-index.cjs <symbol>` or `<file>:Lstart-Lend`
- Before finishing: `npm test` and `node scripts/repo-index.cjs --verify`

## Routing
| Scope | Editable Source | Verify |
| :--- | :--- | :--- |
| CLI engine | `scripts/repo-index.cjs` | `npm test` |
| Agent skill text | `SKILL.md`, `references/` | `--verify` |
| Site | `index.html`, `assets/` | open in browser |
