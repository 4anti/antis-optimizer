# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/4anti/antis-optimizer/compare/v1.3.1...HEAD
[1.3.1]: https://github.com/4anti/antis-optimizer/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/4anti/antis-optimizer/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/4anti/antis-optimizer/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/4anti/antis-optimizer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/4anti/antis-optimizer/releases/tag/v1.0.0
