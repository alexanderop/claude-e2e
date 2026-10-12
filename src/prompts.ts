import type { E2EConfig } from './config.ts'

export function buildRules(config: E2EConfig): string {
  const rules = [
    'Use ONLY the agent-browser CLI (via Bash). The browser is already open on the right page: never call `agent-browser open` or `agent-browser close`.',
    'Start with `agent-browser snapshot -i`; interact via @refs from the snapshot (click @e3, fill @e3 "text", press Enter).',
    'Conclude "passed" only when the screen actually shows the requested outcome. Never guess; if something is missing, say "failed" or "blocked" and explain.',
    'Report every action you performed by accessible role + EXACT name as it appears in the snapshot (e.g. role "button", name "Add to cart"). Set "optional": true on actions that only apply sometimes (e.g. dismissing a cookie banner that may not appear). Only list actions that were needed, in order; for a key press give the key in "value" and the focused element as role/name.',
    ...config.rules,
  ]
  return `RULES:\n${rules.map((rule) => `- ${rule}`).join('\n')}`
}
