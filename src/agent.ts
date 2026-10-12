import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser, RecordedAction } from './browser.ts'
import { runClaude } from './claude.ts'
import type { E2EConfig } from './config.ts'
import { buildRules } from './prompts.ts'

export interface CacheEntry {
  goal: string
  testName: string
  createdAt: string
  startUrl: string
  endUrl: string
  actions: RecordedAction[]
}

export interface AgentStats {
  costUsd: number
  modelCalls: number
  replays: number
}

export interface Agent {
  act(goal: string): Promise<void>
  assert(statement: string): Promise<void>
  waitFor(statement: string, options?: { timeoutMs?: number }): Promise<void>
  stats: AgentStats
}

interface AgentOptions {
  testName: string
  session: string
  config: E2EConfig
  browser: Browser
  useCache?: boolean
}

interface ActOutput {
  explanation: string
  verdict: 'passed' | 'failed' | 'blocked'
  actions: RecordedAction[]
}

interface JudgeOutput {
  explanation: string
  verdict: 'holds' | 'fails' | 'inconclusive'
}

const ACT_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
    verdict: { enum: ['passed', 'failed', 'blocked'] },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { enum: ['click', 'fill', 'press'] },
          role: { type: 'string' },
          name: { type: 'string' },
          value: { type: 'string' },
          optional: { type: 'boolean' },
        },
        required: ['kind', 'role', 'name'],
      },
    },
  },
  required: ['explanation', 'verdict', 'actions'],
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
    verdict: { enum: ['holds', 'fails', 'inconclusive'] },
  },
  required: ['explanation', 'verdict'],
}

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex')
const pathOf = (url: string) => {
  const { origin, pathname } = new URL(url)
  return origin + pathname.replace(/\/+$/, '')
}
const sleep =(ms: number) => new Promise((done) => setTimeout(done, ms))

function normalizeSnapshot(snapshot: string): string {
  return snapshot.replace(/\[ref=[^\]]*\]/g, '').replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
}

export function createAgent({ testName, session, config, browser, useCache = true }: AgentOptions): Agent {
  const stats: AgentStats = { costUsd: 0, modelCalls: 0, replays: 0 }
  const pending: CacheEntry[] = []
  const rules = buildRules(config)

  const cachePath = (goal: string) => join(config.cacheDir, `${sha1(`${testName}\0${goal}`)}.json`)

  async function readCache(goal: string): Promise<CacheEntry | undefined> {
    if (!useCache) return undefined
    try {
      return JSON.parse(await readFile(cachePath(goal), 'utf8')) as CacheEntry
    } catch {
      return undefined
    }
  }

  async function replay(actions: RecordedAction[]): Promise<{ done: number; reason?: string }> {
    for (const [index, action] of actions.entries()) {
      try {
        await browser.replayAction(action)
      } catch (error) {
        if (action.optional) continue
        return { done: index, reason: error instanceof Error ? error.message : String(error) }
      }
    }
    return { done: actions.length }
  }

  async function judge(statement: string, snapshotHint: string): Promise<JudgeOutput> {
    const prompt = [
      'You are the judge of an end-to-end test. Decide whether the statement is true for what the browser CURRENTLY shows.',
      'Run ONLY `agent-browser snapshot` (and optionally `agent-browser get url` / `agent-browser get title`). Do NOT click, fill, press, scroll or navigate. One snapshot is usually enough: answer right after it.',
      snapshotHint,
      'Answer "holds" only if the snapshot proves the statement, "fails" if it contradicts it, "inconclusive" if the screen cannot tell (e.g. still loading). Put the explanation first.',
      `STATEMENT: ${statement}`,
    ].join('\n')
    const result = await runClaude<JudgeOutput>(prompt, JUDGE_SCHEMA, {
      maxTurns: config.maxTurns.assert,
      session,
      model: config.model,
    })
    stats.modelCalls += 1
    stats.costUsd += result.costUsd
    return result.output
  }

  async function commitPending() {
    if (pending.length === 0) return
    await mkdir(config.cacheDir, { recursive: true })
    for (const entry of pending) await writeFile(cachePath(entry.goal), JSON.stringify(entry, null, 2))
    pending.length = 0
  }

  return {
    stats,

    async act(goal) {
      const startUrl = await browser.url()
      let replayed: RecordedAction[] = []
      let handoff = ''

      const cached = await readCache(goal)
      if (cached) {
        const { done, reason: actionFailure } = await replay(cached.actions)
        const endPath = actionFailure ? '' : pathOf(await browser.url())
        const reason =
          actionFailure ??
          (endPath !== pathOf(cached.endUrl) ? `ended on ${endPath}, recording ended on ${pathOf(cached.endUrl)}` : undefined)
        if (!reason) {
          stats.replays += 1
          console.log('  ↻ replayed (0 model calls)')
          return
        }
        await rm(cachePath(goal), { force: true })
        replayed = cached.actions.slice(0, done)
        handoff = [
          `Cached replay already ran ${done} of ${cached.actions.length} actions: ${JSON.stringify(replayed)}.`,
          `Replay stopped because: ${reason}.`,
          'Continue from the CURRENT screen — do NOT redo them.',
        ].join(' ')
        console.log(`  ↯ replay stopped after ${done}/${cached.actions.length}, handing off to the model`)
      }

      const prompt = [handoff, rules, `GOAL: ${goal}`].filter(Boolean).join('\n\n')
      const result = await runClaude<ActOutput>(prompt, ACT_SCHEMA, {
        maxTurns: config.maxTurns.act,
        session,
        model: config.model,
      })
      stats.modelCalls += 1
      stats.costUsd += result.costUsd
      const { explanation, verdict, actions } = result.output
      if (verdict !== 'passed') throw new Error(`act "${goal}" ${verdict}: ${explanation}`)

      pending.push({
        goal,
        testName,
        createdAt: new Date().toISOString(),
        startUrl,
        endUrl: await browser.url(),
        actions: [...replayed, ...actions],
      })
    },

    async assert(statement) {
      const result = await judge(statement, 'Use the full `agent-browser snapshot` (not -i) so text and prices are visible.')
      if (result.verdict !== 'holds') throw new Error(`assert "${statement}" ${result.verdict}: ${result.explanation}`)
      await commitPending()
    },

    async waitFor(statement, { timeoutMs = 30_000 } = {}) {
      const deadline = Date.now() + timeoutMs
      let lastHash = ''
      let last: JudgeOutput | undefined
      while (Date.now() < deadline) {
        const hash = sha1(normalizeSnapshot(await browser.snapshot({ interactiveOnly: true })))
        if (hash !== lastHash) {
          lastHash = hash
          last = await judge(statement, 'Use the full `agent-browser snapshot` (not -i) so text and prices are visible.')
          if (last.verdict === 'holds') {
            await commitPending()
            return
          }
        }
        await sleep(500)
      }
      throw new Error(`waitFor "${statement}" timed out after ${timeoutMs}ms: ${last?.explanation ?? 'never judged'}`)
    },
  }
}
