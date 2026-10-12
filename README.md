# claude-e2e

> Inspired by [tester-army/e2e](https://github.com/tester-army/e2e) — the original idea: describe a goal in natural language, an agent drives the app, verified actions are cached and replayed without model calls. This is a tiny no-login remake that uses the `claude -p` CLI on your Claude subscription instead of an API key.

A template for AI end-to-end tests. You write goals and checks in plain language; the local Claude Code CLI drives a real browser through [`agent-browser`](https://www.npmjs.com/package/agent-browser). No Playwright, no API key, zero runtime dependencies. The repo ships with [otto.de](https://www.otto.de) as a working example.

## Requirements

- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) (`claude`), logged in
- `agent-browser` on your PATH
- Node 24 (runs TypeScript natively)
- pnpm

## Quick start

```bash
pnpm install
pnpm test:e2e                                  # run tests/*.e2e.ts
node src/cli.ts run tests/otto.e2e.ts --no-cache
pnpm explore "browse like a first-time buyer looking for a coffee machine; stop before checkout" --steps 15
pnpm typecheck
```

## Use this template

1. Click "Use this template" on GitHub, or `gh repo create my-e2e --template alexanderop/claude-e2e`.
2. Edit `e2e.config.ts`: set `baseUrl` and the safety `rules` for your site (never buy, cookie banner name, blocked pages).
3. Replace `tests/otto.e2e.ts` with your own `tests/*.e2e.ts` (the bundled `.claude/skills/write-e2e-test` skill teaches Claude Code how).
4. `pnpm test:e2e`.

```ts
// e2e.config.ts
import { defineConfig } from './src/config.ts'

export default defineConfig({
  baseUrl: 'https://example.com',
  model: 'sonnet',                       // default
  maxTurns: { act: 25, assert: 6 },      // defaults
  cacheDir: '.e2e-cache',                // default
  rules: ['Never submit the payment form.'],
})
```

```ts
// tests/search.e2e.ts
import { test } from '../src/runner.ts'

test('search shows priced products', async ({ agent, open }) => {
  await open('/')                        // path relative to baseUrl, or a full URL
  await agent.act('Search for "Kaffeevollautomat" and submit the search')
  await agent.assert('Several product links with prices in euros are visible')
})
```

## How it works

Each test gets its own isolated browser session (`AGENT_BROWSER_SESSION=claude-e2e-<slug>`), opened fresh and closed afterwards. Tests run serially.

- `act(goal)` — checks the cache first. A cached recording is replayed with plain `agent-browser find role ... click|fill` commands, no model involved. If there is no cache entry, Claude (`claude -p --model sonnet --allowedTools "Bash(agent-browser:*)"` with a JSON schema) does the goal and reports the actions it took as `{kind, role, name, value?, optional?}`.
- `assert(statement)` — a separate read-only Claude call that may only run `agent-browser snapshot`/`get url`/`get title`. Verdicts are `holds`, `fails` or `inconclusive`; only `holds` passes.
- `waitFor(statement, {timeoutMs})` — polls `snapshot -i` every 500 ms, hashes it (refs and clock-like text stripped) and calls the judge only when the hash changes.
- Cache gating — a fresh `act` recording is kept pending and written to `.e2e-cache/<sha1(testName + NUL + goal)>.json` only after a later `assert`/`waitFor` passes. A run that did something wrong never poisons the cache.
- Fail-closed replay with handoff — the first replayed action that errors stops the replay and deletes the entry. Claude then gets a prefix like "Cached replay already ran 1 of 2 actions: [...]. Replay stopped because: .... Continue from the CURRENT screen — do NOT redo them." and finishes the goal. The new entry is stored as replayed actions plus the new ones. Actions marked `optional` (a cookie banner that may not show) are skipped on failure instead of stopping the replay.
- `explore "<goal>"` — one long Claude call that browses like a user and returns structured findings (kind, severity, location, expected, observed, repro steps). Written to `.e2e/explore-<timestamp>.json` and `.md`.

Every run also writes `.e2e/report.json`.

### Cache and git

`.e2e-cache/` is gitignored. On a live site, content such as product order changes, so a committed cache would mostly be stale and the replay would fall back to the model anyway. If you test a stable staging app, remove `.e2e-cache/` from `.gitignore` and commit it so CI starts with a warm cache.

## Sample run

First run (`rm -rf .e2e-cache && pnpm test:e2e`):

```
● search shows priced products
✓ search shows priced products  27.6s · 2 model calls · 0 replayed · $0.27

● open the Sale category
✓ open the Sale category  27.2s · 2 model calls · 0 replayed · $0.20

● cart is empty for a fresh visitor
✓ cart is empty for a fresh visitor  24.8s · 2 model calls · 0 replayed · $0.19

3 passed, 0 failed · 79.5s · 6 model calls · 0 replayed · $0.66
```

Second run (the `act` steps are replayed; the remaining model call per test is the `assert` judge):

```
● search shows priced products
  ↻ replayed (0 model calls)
✓ search shows priced products  17.7s · 1 model calls · 1 replayed · $0.03

● open the Sale category
  ↻ replayed (0 model calls)
✓ open the Sale category  13.5s · 1 model calls · 1 replayed · $0.02

● cart is empty for a fresh visitor
  ↻ replayed (0 model calls)
✓ cart is empty for a fresh visitor  12.0s · 1 model calls · 1 replayed · $0.02

3 passed, 0 failed · 43.1s · 3 model calls · 3 replayed · $0.08
```

After renaming a link in a cached recording, replay fails closed and hands off:

```
● open the Sale category
  ↯ replay stopped after 1/2, handing off to the model
✓ open the Sale category  24.9s · 2 model calls · 0 replayed · $0.09
```

Explore (`--steps 15`): 4 findings, 33.5 s, $0.25, for example `[minor] Same product listed twice in the results`.

## Safety

- The otto.de example never orders: its rules forbid clicking any final purchase button and require stopping before checkout. Put equivalent rules into your own `e2e.config.ts`; they are added to every act and explore prompt.
- otto.de is a live production site. Keep volume low, run it manually, do not put it on a tight schedule.
- This project is not affiliated with OTTO. Check a site's terms before automating it.

## Limitations

- Product detail pages on otto.de (`/p/...`) are protected by bot detection and render blank in agent-browser (headless, headed and system Chrome all returned HTTP 400). The example tests therefore cover search, category and cart pages, and the rules tell the model not to try to bypass the protection.
- Replay matches elements by role and exact accessible name, so dynamic names (product titles) fall back to the model. That is the intended fail-closed behaviour, but it costs tokens.
- Assertions are judged by a model and can in principle be wrong; phrase them as concrete, observable outcomes.
- Needs a logged-in `claude` CLI and its usage limits apply. Each model call costs a few cents on the API-equivalent meter.
- One test at a time, no parallel runs, no screenshots or video.

## License

MIT, see [LICENSE](LICENSE).
