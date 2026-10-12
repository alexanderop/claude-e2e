import { mkdir, writeFile } from 'node:fs/promises'
import { createBrowser } from './browser.ts'
import { runClaude } from './claude.ts'
import type { E2EConfig } from './config.ts'
import { buildRules } from './prompts.ts'

export interface Finding {
  kind: 'issue' | 'warning'
  severity: 'trivial' | 'minor' | 'major' | 'critical'
  title: string
  location: string
  expected: string
  observed: string
  reproSteps: string[]
}

interface ExploreOutput {
  summary: string
  findings: Finding[]
}

const EXPLORE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { enum: ['issue', 'warning'] },
          severity: { enum: ['trivial', 'minor', 'major', 'critical'] },
          title: { type: 'string' },
          location: { type: 'string' },
          expected: { type: 'string' },
          observed: { type: 'string' },
          reproSteps: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'severity', 'title', 'location', 'expected', 'observed', 'reproSteps'],
      },
    },
  },
  required: ['summary', 'findings'],
}

function toMarkdown(goal: string, url: string, { summary, findings }: ExploreOutput): string {
  const items = findings.map((f, i) =>
    [
      `### ${i + 1}. [${f.severity}] ${f.title} (${f.kind})`,
      `- Location: ${f.location}`,
      `- Expected: ${f.expected}`,
      `- Observed: ${f.observed}`,
      '- Repro:',
      ...f.reproSteps.map((step, n) => `  ${n + 1}. ${step}`),
    ].join('\n'),
  )
  return [`# Exploration: ${goal}`, `Start: ${url}`, '', summary, '', `## Findings (${findings.length})`, ...items, ''].join('\n')
}

export async function explore(config: E2EConfig, goal: string, { url, steps }: { url: string; steps: number }) {
  const session = 'claude-e2e-explore'
  const browser = createBrowser(session)
  const prompt = [
    'You are an exploratory tester. Explore the site like a real user pursuing the goal below, looking for bugs, broken UI, confusing UX, missing content and accessibility problems.',
    `Budget: about ${steps} browser steps, then stop and report. Only report problems you actually observed; an empty findings list is fine.`,
    buildRules(config),
    `GOAL: ${goal}`,
    'Return a short summary of what you covered first, then the findings.',
  ].join('\n\n')

  await browser.close()
  try {
    await browser.open(new URL(url, config.baseUrl).href)
    const result = await runClaude<ExploreOutput>(prompt, EXPLORE_SCHEMA, {
      maxTurns: steps + 3,
      session,
      model: config.model,
      timeoutMs: 900_000,
    })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await mkdir('.e2e', { recursive: true })
    await writeFile(`.e2e/explore-${stamp}.json`, JSON.stringify({ goal, url, ...result }, null, 2))
    await writeFile(`.e2e/explore-${stamp}.md`, toMarkdown(goal, url, result.output))

    console.log(`\n${result.output.summary}\n`)
    for (const f of result.output.findings) console.log(`[${f.severity}] ${f.title}\n    ${f.location}\n    expected: ${f.expected}\n    observed: ${f.observed}`)
    console.log(
      `\n${result.output.findings.length} findings · ${(result.ms / 1000).toFixed(1)}s · ${result.turns} turns · $${result.costUsd.toFixed(2)}\nReport: .e2e/explore-${stamp}.md`,
    )
  } finally {
    await browser.close()
  }
}
