# Security Policy

## Supported Versions

Only the latest release receives security fixes.

| Version | Supported |
| :--- | :---: |
| 1.2.x | Yes |
| < 1.2 | No |

## Reporting a Vulnerability

Please do **not** open a public issue for security problems.

Report privately through GitHub: **[Security → Report a vulnerability](https://github.com/4anti/antis-optimizer/security/advisories/new)**.

Include:
- Affected version (`antis-optimizer --version`) and OS / Node version
- A minimal reproduction (fixture files and the exact command)
- What you expected and what happened

You should get a first response within 7 days. Fixes ship as a new release whose title is prefixed `[SECURITY]` or `[CRITICAL]`, so `antis-optimizer --check-update --critical-only` flags it.

## Scope

`antis-optimizer` is run by AI coding agents inside repositories that may be untrusted, and its output is fed into model context. In scope:

- Secret leakage: tokens or credential files reaching CLI output despite redaction / refusal
- Path traversal: reading or writing outside `--root`
- Code execution triggered by a scanned repository's contents
- Ignore-sync or landmark-sync writes that destroy user content

Out of scope:

- Commands the user passes explicitly to `--verify --exec` (they run in a shell by design)
- Prompt-injection text inside files the user asks to slice (output is file content; treat it as data)
- Secret formats not yet covered by redaction — report these as normal issues or PRs
