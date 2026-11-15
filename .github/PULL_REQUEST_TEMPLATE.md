## Summary
<!-- Explain what changed and why in your own words. -->

## Test Plan
<!-- Paste the test command(s) and result you ran locally. -->
- [ ] `npm test` passed (also tested `ANTIS_FORCE_LEXER=1 npm test` if touching `scripts/repo-index.cjs`)
- [ ] Smoke-tested CLI manually (`node ./scripts/repo-index.cjs --audit`)

## Sanity Checks
- [ ] Zero required runtime dependencies added to `package.json`
- [ ] Diff reviewed for secrets, personal paths, or untracked local dotfiles
- [ ] Reviewed and can explain every changed line
