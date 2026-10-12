import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const REPLAY_BACKOFF_MS = [100, 300, 600, 1000, 3000]
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

export interface RecordedAction {
  kind: 'click' | 'fill' | 'press'
  role: string
  name: string
  value?: string
  optional?: boolean
}

export interface Browser {
  open(url: string): Promise<void>
  snapshot(options?: { interactiveOnly?: boolean }): Promise<string>
  url(): Promise<string>
  close(): Promise<void>
  replayAction(action: RecordedAction): Promise<void>
}

export function createBrowser(session: string): Browser {
  async function run(args: string[], timeoutMs = 60_000): Promise<string> {
    try {
      const { stdout } = await execFileAsync('agent-browser', args, {
        env: { ...process.env, AGENT_BROWSER_SESSION: session },
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      })
      return stdout.trim()
    } catch (error) {
      const e = error as { stderr?: string; stdout?: string; message: string }
      throw new Error(`agent-browser ${args.join(' ')} failed: ${(e.stderr || e.stdout || e.message).trim()}`)
    }
  }

  return {
    async open(url) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await run(['open', url])
        if ((await run(['get', 'url'])) !== 'about:blank') return
      }
      throw new Error(`agent-browser could not open ${url}`)
    },
    snapshot: ({ interactiveOnly = false } = {}) => run(interactiveOnly ? ['snapshot', '-i'] : ['snapshot']),
    url: () => run(['get', 'url']),
    async close() {
      await run(['close']).catch(() => undefined)
    },
    async replayAction(action) {
      const target = ['--name', action.name, '--exact']
      const args =
        action.kind === 'click'
          ? ['find', 'role', action.role, 'click', ...target]
          : action.kind === 'fill'
            ? ['find', 'role', action.role, 'fill', action.value ?? '', ...target]
            : ['press', action.value || 'Enter']
      const backoff = action.optional ? [] : REPLAY_BACKOFF_MS
      for (const delay of [...backoff, undefined]) {
        try {
          await run(args)
          break
        } catch (error) {
          if (delay === undefined) throw error
          await sleep(delay)
        }
      }
      await run(['wait', '600'])
    },
  }
}
