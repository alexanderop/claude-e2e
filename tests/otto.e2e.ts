import { test } from '../src/runner.ts'

test('search shows priced products', async ({ agent, open }) => {
  await open('/')
  await agent.act('Search for "Kaffeevollautomat" using the search box and submit the search')
  await agent.assert('The page is a search results list for coffee machines: several product links with names containing "Kaffeevollautomat" and prices in euros are visible')
})

test('open the Sale category', async ({ agent, open }) => {
  await open('/')
  await agent.act('Open the "Sale" category from the main navigation')
  await agent.assert('The page is the Sale page and offers sale products or sale categories to browse (reduced prices, percentage discounts or sale category links)')
})

test('cart is empty for a fresh visitor', async ({ agent, open }) => {
  await open('/')
  await agent.act('Open the shopping cart ("Warenkorb") from the header')
  await agent.assert('The shopping cart page is shown and contains no products (it says the cart is empty)')
})
