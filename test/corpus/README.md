# Lexer accuracy corpus

Unmodified source files from real open-source projects. `node test/accuracy.cjs` runs the built-in lexer over them and scores every symbol span against a real parser (TypeScript compiler AST for TS/JS, CPython `ast` for Python).

These files are **test data only**: they are not part of the npm package and are never executed. Each project folder carries that project's own license file; the files remain under those licenses.

| File | Project | Tag | Original path | License |
| :--- | :--- | :--- | :--- | :--- |
| `zod/parseUtil.ts` | [colinhacks/zod](https://github.com/colinhacks/zod) | `v3.23.8` | `src/helpers/parseUtil.ts` | MIT |
| `zod/ZodError.ts` | [colinhacks/zod](https://github.com/colinhacks/zod) | `v3.23.8` | `src/ZodError.ts` | MIT |
| `ky/Ky.ts` | [sindresorhus/ky](https://github.com/sindresorhus/ky) | `v1.7.2` | `source/core/Ky.ts` | MIT |
| `ky/merge.ts` | [sindresorhus/ky](https://github.com/sindresorhus/ky) | `v1.7.2` | `source/utils/merge.ts` | MIT |
| `zustand/vanilla.ts` | [pmndrs/zustand](https://github.com/pmndrs/zustand) | `v4.5.5` | `src/vanilla.ts` | MIT |
| `zustand/persist.ts` | [pmndrs/zustand](https://github.com/pmndrs/zustand) | `v4.5.5` | `src/middleware/persist.ts` | MIT |
| `tanstack-query/QueryClientProvider.tsx` | [TanStack/query](https://github.com/TanStack/query) | `v5.59.0` | `packages/react-query/src/QueryClientProvider.tsx` | MIT |
| `tanstack-query/HydrationBoundary.tsx` | [TanStack/query](https://github.com/TanStack/query) | `v5.59.0` | `packages/react-query/src/HydrationBoundary.tsx` | MIT |
| `tanstack-query/QueryErrorResetBoundary.tsx` | [TanStack/query](https://github.com/TanStack/query) | `v5.59.0` | `packages/react-query/src/QueryErrorResetBoundary.tsx` | MIT |
| `express/response.js` | [expressjs/express](https://github.com/expressjs/express) | `4.21.1` | `lib/response.js` | MIT |
| `express/application.js` | [expressjs/express](https://github.com/expressjs/express) | `4.21.1` | `lib/application.js` | MIT |
| `express/route.js` | [expressjs/express](https://github.com/expressjs/express) | `4.21.1` | `lib/router/route.js` | MIT |
| `chalk/index.js` | [chalk/chalk](https://github.com/chalk/chalk) | `v5.3.0` | `source/index.js` | MIT |
| `chalk/utilities.js` | [chalk/chalk](https://github.com/chalk/chalk) | `v5.3.0` | `source/utilities.js` | MIT |
| `requests/sessions.py` | [psf/requests](https://github.com/psf/requests) | `v2.32.3` | `src/requests/sessions.py` | Apache-2.0 |
| `requests/models.py` | [psf/requests](https://github.com/psf/requests) | `v2.32.3` | `src/requests/models.py` | Apache-2.0 |
| `requests/adapters.py` | [psf/requests](https://github.com/psf/requests) | `v2.32.3` | `src/requests/adapters.py` | Apache-2.0 |
| `click/decorators.py` | [pallets/click](https://github.com/pallets/click) | `8.1.7` | `src/click/decorators.py` | BSD-3-Clause |
| `click/types.py` | [pallets/click](https://github.com/pallets/click) | `8.1.7` | `src/click/types.py` | BSD-3-Clause |
| `flask/app.py` | [pallets/flask](https://github.com/pallets/flask) | `3.0.3` | `src/flask/app.py` | BSD-3-Clause |
| `flask/helpers.py` | [pallets/flask](https://github.com/pallets/flask) | `3.0.3` | `src/flask/helpers.py` | BSD-3-Clause |

## Adding a file

1. Copy the file unmodified into `test/corpus/<project>/` with the project's license file.
2. Add it to `manifest.json` (repo, tag, original path) and to the table above.
3. Run `node test/accuracy.cjs --verbose`, fix what it exposes or accept the score, then `node test/accuracy.cjs --update` to record the new baseline.

Only languages with a real-parser judge are scored. To add one, add a judge function in `test/accuracy.cjs`.
