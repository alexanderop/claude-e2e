import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadConfig } from './config.ts'
import { explore } from './explore.ts'
import { resetSite, runTests } from './runner.ts'

const USAGE = `usage:
  node src/cli.ts run [tests/*.e2e.ts ...] [--no-cache]
  node src/cli.ts explore "<goal>" [--url <url>] [--steps 25]`

async function findTestFiles(): Promise<string[]> {
  const entries = await readdir('tests', { recursive: true })
  return entries.filter((file) => file.endsWith('.e2e.ts')).map((file) => `tests/${file}`)
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      'no-cache': { type: 'boolean', default: false },
      url: { type: 'string' },
      steps: { type: 'string', default: '25' },
    },
  })
  const [command, ...rest] = positionals
  const config = await loadConfig()

  if (command === 'run') {
    const files = rest.length > 0 ? rest : await findTestFiles()
    if (files.length === 0) throw new Error('No test files found (expected tests/*.e2e.ts)')
    for (const file of files) {
      resetSite()
      await import(pathToFileURL(resolve(file)).href)
    }
    const ok = await runTests(config, { useCache: !values['no-cache'] })
    process.exit(ok ? 0 : 1)
  }

  if (command === 'explore') {
    const goal = rest.join(' ').trim()
    if (!goal) throw new Error(`Missing goal\n${USAGE}`)
    await explore(config, goal, { url: values.url ?? config.baseUrl, steps: Number(values.steps) })
    return
  }

  console.error(USAGE)
  process.exit(2)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
