import { site, test } from '../src/runner.ts'

site({
  baseUrl: 'https://alexop.dev',
  rules: ['This is a personal blog. Read only: do not subscribe, send email or submit any form.'],
})

test('alexop: posts page lists articles', async ({ agent, open }) => {
  await open('/')
  await agent.act('Open "Posts" from the main navigation')
  await agent.assert('The page lists several blog posts, each with a title link')
})

test('alexop: search finds vitest posts', async ({ agent, open }) => {
  await open('/')
  await agent.act('Open the site search and search for "vitest"')
  await agent.assert('Search results are shown and at least one result mentions Vitest')
})

test('alexop: vue category filters posts', async ({ agent, open }) => {
  await open('/')
  await agent.act('Open the "vue" category from the Categories section on the home page')
  await agent.assert('The page shows posts for the vue tag or category, with several post links')
})
