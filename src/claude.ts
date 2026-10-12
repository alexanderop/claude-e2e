import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ClaudeOptions {
  maxTurns: number
  session: string
  model?: string
  timeoutMs?: number
}

export interface ClaudeResult<T> {
  output: T
  costUsd: number
  turns: number
  ms: number
}

interface ClaudeEnvelope {
  is_error?: boolean
  subtype?: string
  result?: string
  structured_output?: unknown
  total_cost_usd?: number
  num_turns?: number
}

export async function runClaude<T>(
  prompt: string,
  schema: object,
  { maxTurns, session, model = 'sonnet', timeoutMs = 300_000 }: ClaudeOptions,
): Promise<ClaudeResult<T>> {
  const args = [
    '-p', prompt,
    '--model', model,
    '--max-turns', String(maxTurns),
    '--allowedTools', 'Bash(agent-browser:*)',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--no-session-persistence',
    '--disable-slash-commands',
    '--strict-mcp-config',
  ]
  const started = Date.now()
  const pending = execFileAsync('claude', args, {
    env: { ...process.env, AGENT_BROWSER_SESSION: session },
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  })
  pending.child.stdin?.end()

  let stdout: string
  try {
    stdout = (await pending).stdout
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; killed?: boolean; message: string }
    if (e.killed) throw new Error(`claude timed out after ${timeoutMs / 1000}s`)
    stdout = e.stdout ?? ''
    if (!stdout.trim()) throw new Error(`claude CLI failed: ${e.stderr?.trim() || e.message}`)
  }

  let envelope: ClaudeEnvelope
  try {
    envelope = JSON.parse(stdout)
  } catch {
    throw new Error(`claude returned non-JSON output: ${stdout.slice(0, 300)}`)
  }
  if (envelope.is_error || envelope.subtype !== 'success' || envelope.structured_output == null) {
    const why = envelope.subtype === 'error_max_turns' ? `ran out of turns (max ${maxTurns})` : envelope.result || envelope.subtype
    throw new Error(`claude run failed: ${why ?? 'no structured output'}`)
  }
  return {
    output: envelope.structured_output as T,
    costUsd: envelope.total_cost_usd ?? 0,
    turns: envelope.num_turns ?? 0,
    ms: Date.now() - started,
  }
}
