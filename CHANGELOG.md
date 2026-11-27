# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- `.contextignore` is now written in the form Token Optimizer reads (fnmatch on the full path or the file name, which denies the whole Read):
  - Folder patterns become `*/dir/*`. A bare `dir/` never matched anything there.
  - Image and PDF patterns (`*.png`, `*.jpg`, `*.webp`, `*.pdf`, ...) are no longer written, so agents can open reference images again.
  - `!` lines, which Token Optimizer ignores, are not copied.
  - Lines an older sync wrote in the old form are replaced on the next `--sync-ignores --write`. Lines you added yourself are kept.
- **Keep-list:** a `!path` line in `.ignore` (e.g. `!_work/`, `!decompiled/`) now means "keep this on purpose":
  - It is never suggested as junk, and neither is anything under it.
  - It is left out of `.contextignore`.
  - `--verify` stops reporting it.
- Landmarks (`file:Lstart-Lend`):
  - Paths are resolved relative to the doc that holds them (nested `AGENTS.md` / `INDEX.md`), then to the root, and never outside the root.
  - Paths with spaces work inside a backtick code span.
  - A command written in a code span still checks its path argument.
  - `--sync-landmarks --write` now prints `FAIL` and exits 1 when some references need a manual fix (missing file, unknown symbol, out of range) instead of `PASS healed 0`.
- `--audit`:
  - Python virtual environments are found by `pyvenv.cfg` / `conda-meta` under any name (`.venv_re/`, `env/`), and their library files no longer count as active source.
  - Plain-text files over 1 MB (`.txt`, `.log`, `.csv`, ...) are flagged for review.
  - Subfolders with their own `AGENTS.md` + `.ignore` are listed as nested setups instead of being counted again.
  - `.exe` / `.dll` / `.bin` are labelled "binary/media" instead of "media/fonts".
- Private key files (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`) are now in the base ignore set, so search never surfaces them. Re-run `--sync-ignores --write` to add them.
- C# outline:
  - Methods with default parameter values (`RunAsync(int retries = 3)`) are listed.
  - Expression-bodied methods (`ToString() => ...`) are listed.
- `--outline` on a file whose full list exceeds the output cap now hides nested symbols first (the header says how many), so the top-level map is not cut off. A `[filter]` lists them.

### Security
- Secret redaction now catches four kinds of secret that used to pass through `--slice` / `--outline` / `--map` output unredacted:
  - AWS secret access keys (40-char base64) next to an AWS secret key name (`aws_secret_access_key = ...`, `AWS_SECRET_ACCESS_KEY=`, `secretAccessKey:`), quoted or not. The same 40-char shape elsewhere is left alone.
  - Quoted values of 8+ characters assigned to `password`, `passwd`, `secret`, `secret_key`, `api_key` / `apiKey` or `token` names, including prefixed names such as `DB_PASSWORD` or `access_token` (`:`, `=`, `:=` and `=>`). Only the value is redacted, so the key name stays readable. Code such as `const password = getPassword()`, `token = req.headers.x`, text with spaces and `${VAR}` placeholders is not redacted.
  - Hugging Face `hf_` tokens.
  - Azure `AccountKey=` and `SharedAccessKey=` values in connection strings.

## [1.5.0] - 2026-11-27

### Added
- `--outline` / `--slice` now find more symbols:
  - Go generic functions (`func Map[T any, U any](...)`).
  - Rust `impl<T: Into<String>> Point<T>` blocks written without a space before `<`, and `macro_rules!` macros.
  - TS/JS class properties that hold arrow functions (`static create = <U,>(v: U) => ...`, `handle = async (e) => {`).
  - Top-level object/array constants of 10+ lines (`const OL = Object.freeze({`, `const ROUTES = [`, `new Set([`).

  The TypeScript Compiler AST path applies the same rules. TS lexer accuracy baseline: 90.1% to 90.3% (141 to 145 judged symbols).

### Fixed
- `--slice <file> <symbol>` no longer silently returns a different symbol when the name is only a partial match. A partial name that fits several symbols is refused with the candidate list (for example `OL` used to print `collectAuditStats`); a partial name that fits exactly one symbol still works but prints a `note: partial match` line. An exact name shared by several symbols (two `__init__` methods, for example) still returns the first one, with a `note: N symbols named "X"` line.
- Python one-line `def`/`class` bodies (`def f(self): return 1`, `class B(A): pass`) now end on their own line instead of swallowing the code that follows. Signature scanning also skips `:`, `#` and brackets inside string defaults.

## [1.4.0] - 2026-11-16

### Security
- All repository writes (`--sync-ignores --write`, `--sync-landmarks --write`, `--handoff --out`) now refuse symlinks and paths that resolve outside the repository root. Previously a repository shipping `.ignore` as a symlink could make `--sync-ignores --write` overwrite a file outside the repo.

### Fixed
- `--sync-ignores --write` no longer deletes patterns that exist only in `.contextignore` or in the user's own `extra_ignore_patterns` in `.jcodemunch.jsonc`; they are merged, as already done for the other tool ignore files.

### Changed
- `typescript` is no longer an optional dependency: installs are truly zero-dependency (no ~20 MB download on `npx`). Compiler-AST mode is opt-in via a global `typescript` install, now also detected in the macOS/Linux global npm directory.
- CI: macOS added, Node 18/20/22/24 matrix, least-privilege token permissions, superseded PR runs cancelled, Actions bumped to v5, Dependabot for workflow actions.

## [1.3.1] - 2026-11-15

### Added
- Lexer accuracy corpus: 21 unmodified real-world files scored against real parsers (`npm run accuracy`); CI fails when a language drops below its recorded baseline.

### Fixed
- Lexer (TS): type aliases without braces no longer run on to a later block; class methods indented with tabs or with parameters wrapped across lines are now listed; arrow functions whose expression body starts on the next line get the right end line. Measured TypeScript exact-span accuracy went from 66.0% to 90.1%.

### Changed
- Install instructions, site, demo, and the `--check-update` upgrade hint now use the npm package (`npx antis-optimizer`, `npm install -g antis-optimizer`).
- Release workflow stages the npm publish for maintainer 2FA approval.

## [1.3.0] - 2026-11-15

### Added
- Release automation: pushing a `vX.Y.Z` tag tests, creates the GitHub Release from this file, and publishes to npm with provenance.
- `SECURITY.md`, `CODE_OF_CONDUCT.md`, and this changelog.

### Changed
- `--audit` slice savings are now measured from each monolith's real symbol spans instead of a fixed 450-token constant; the line is labelled as an estimate and states its basis. Break-even shows two decimals.
- `--help` groups commands by purpose, leading with `--outline` / `--slice`.
- README: real output examples, supported-languages table, Safety & Limits section.

## [1.2.0] - 2026-11-15

### Added
- OpenCode first-class support and multi-host / RTK detection in `--detect`.
- Conditional (anti-bloat) ignore sync: only tool ignore files that already exist are updated.
- Expanded language and config outlines/slices (Java, C# namespaces, YAML list items, JSON arrays) and stack detection.
- `AGENTS.md` and synced ignore files for this repo; CI runs `--verify` on itself.

### Security
- Secret redaction covers Slack, GitHub fine-grained (`github_pat_`), Stripe, npm and GitLab tokens, PEM private-key blocks, passwords in `scheme://user:pass@host` URLs, and `_authToken=` values.
- `.npmrc`, `.netrc`, `.pypirc`, `.git-credentials` and non-RSA SSH keys are refused.
- TypeScript is no longer resolved from the script's own directory when that directory is inside the scanned root (`ANTIS_TRUST_LOCAL_TS=1` opts out).

### Changed
- Narrowed over-broad `.gitignore` globs.
- Site savings figures labelled as modeled.

## [1.1.0] - 2026-11-15

### Added
- `--check-update` (read-only GitHub Releases check, `--critical-only`).
- AST-backed `--slice` symbol spans and `<file>:Lstart-Lend` range syntax.

### Fixed
- Tier classification alignment between `--audit` and `--verify`.
- `.gitignore` `!negation` handling in ignore sync.

## [1.0.0] - 2026-11-14

### Added
- Initial release: `--audit`, `--detect`, `--sync-ignores`, `--sync-landmarks`, `--map`, `--slice`, `--outline`, `--handoff`, `--verify`.

[Unreleased]: https://github.com/4anti/antis-optimizer/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/4anti/antis-optimizer/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/4anti/antis-optimizer/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/4anti/antis-optimizer/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/4anti/antis-optimizer/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/4anti/antis-optimizer/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/4anti/antis-optimizer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/4anti/antis-optimizer/releases/tag/v1.0.0
