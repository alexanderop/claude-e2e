import { mkdir, writeFile } from 'node:fs/promises'
import { createAgent, type Agent } from './agent.ts'
import { createBrowser } from './browser.ts'
import type { E2EConfig } from './config.ts'

export interface Fixtures {
  agent: Agent
  open(pathOrUrl: string): Promise<void>
}

interface TestCase {
  name: string
  fn: (fixtures: Fixtures) => Promise<void>
}

export interface TestResult {
  name: string
  ok: boolean
  ms: number
  modelCalls: number
  replays: number
  costUsd: number
  error?: string
}

const registry: TestCase[] = []

export function test(name: string, fn: TestCase['fn']): void {
  registry.push({ name, fn })
}

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

async function runOne({ name, fn }: TestCase, config: E2EConfig, useCache: boolean): Promise<TestResult> {
  const session = `claude-e2e-${slugify(name)}`
  const browser = createBrowser(session)
  const agent = createAgent({ testName: name, session, config, browser, useCache })
  const started = Date.now()
  let error: string | undefined
  try {
    await fn({
      agent,
      open: (pathOrUrl) => browser.open(new URL(pathOrUrl, config.baseUrl).href),
    })
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    await browser.close()
  }
  const result: TestResult = { name, ok: !error, ms: Date.now() - started, ...agent.stats, error }
  const detail = `${(result.ms / 1000).toFixed(1)}s · ${result.modelCalls} model calls · ${result.replays} replayed · $${result.costUsd.toFixed(2)}`
  console.log(`${result.ok ? '✓' : '✗'} ${name}  ${detail}`)
  if (error) console.log(`    ${error}`)
  return result
}

export async function runTests(config: E2EConfig, { useCache = true } = {}): Promise<boolean> {
  const results: TestResult[] = []
  for (const testCase of registry) {
    console.log(`\n● ${testCase.name}`)
    results.push(await runOne(testCase, config, useCache))
  }
  const failed = results.filter((r) => !r.ok).length
  const totals = {
    ms: results.reduce((sum, r) => sum + r.ms, 0),
    modelCalls: results.reduce((sum, r) => sum + r.modelCalls, 0),
    replays: results.reduce((sum, r) => sum + r.replays, 0),
    costUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
  }
  console.log(
    `\n${results.length - failed} passed, ${failed} failed · ${(totals.ms / 1000).toFixed(1)}s · ${totals.modelCalls} model calls · ${totals.replays} replayed · $${totals.costUsd.toFixed(2)}`,
  )
  await mkdir('.e2e', { recursive: true })
  await writeFile('.e2e/report.json', JSON.stringify({ finishedAt: new Date().toISOString(), totals, results }, null, 2))
  return failed === 0
}
