import { defineConfig } from './src/config.ts'

export default defineConfig({
  baseUrl: 'https://www.otto.de',
  model: 'sonnet',
  maxTurns: { act: 25, assert: 8 },
  cacheDir: '.e2e-cache',
  rules: [
    'This is the live production shop otto.de. NEVER place an order: never click "zahlungspflichtig bestellen" or any final purchase button, and stop before checkout.',
    'The cookie banner can appear a second or two after load. If it is shown (button "Einwilligung ablehnen"), dismiss it with that button before any other action; if it is not there after one `agent-browser wait 2000`, move on.',
    'Do not log in, register or enter personal data.',
    'Product detail pages (/p/...) are blocked for automated browsers and render blank. Do NOT try to bypass this; work with search results, categories and the cart instead.',
  ],
})
