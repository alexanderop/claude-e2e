---
name: write-e2e-test
description: Write a new end-to-end test file for this project (tests/*.e2e.ts). Use when asked to add, write or extend an e2e test for the configured site.
---

# Write an e2e test

Tests live in `tests/<area>.e2e.ts` and import `test` from `../src/runner.ts`.

```ts
import { test } from '../src/runner.ts'

test('search shows results', async ({ agent, open }) => {
  await open('/')                                   // path relative to baseUrl, or a full URL
  await agent.act('Search for "coffee" and submit') // one user-visible goal
  await agent.assert('A list of products with prices is visible')
})
```

## Rules

- `act(goal)` performs one goal. Keep goals small and phrased as what a user does. The model's actions are cached only after a later `assert` or `waitFor` passes.
- `assert(statement)` is a read-only check of the current screen. State one concrete, observable outcome (text, count, button) that will stay true on a live site; avoid exact product names or prices.
- `waitFor(statement, { timeoutMs })` is `assert` for async UI (spinners, redirects); it polls the page and only asks the model when the page changed.
- Every test starts on a fresh browser session. Always `open(...)` first.
- Test names are part of the cache key; renaming a test or changing a goal re-runs the model once.
- Site safety rules (never buy, cookie banners, blocked pages) belong in `e2e.config.ts` under `rules`, not in tests.
- Only erasable TypeScript syntax (no enums, namespaces or parameter properties); import with `.ts` extensions.

## Check your work

1. `pnpm typecheck`
2. `node src/cli.ts run tests/<file>.e2e.ts --no-cache` for a real first run.
3. Run it again without `--no-cache`: acts should print `↻ replayed (0 model calls)`.
