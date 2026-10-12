import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export interface E2EConfig {
  baseUrl: string
  model: string
  rules: string[]
  maxTurns: { act: number; assert: number }
  cacheDir: string
}

export type UserConfig = Partial<Omit<E2EConfig, 'maxTurns'>> &
  Pick<E2EConfig, 'baseUrl'> & { maxTurns?: Partial<E2EConfig['maxTurns']> }

export function defineConfig(config: UserConfig): E2EConfig {
  return {
    baseUrl: config.baseUrl,
    model: config.model ?? 'sonnet',
    rules: config.rules ?? [],
    maxTurns: { act: 25, assert: 6, ...config.maxTurns },
    cacheDir: config.cacheDir ?? '.e2e-cache',
  }
}

export async function loadConfig(cwd = process.cwd()): Promise<E2EConfig> {
  const file = resolve(cwd, 'e2e.config.ts')
  try {
    const mod = await import(pathToFileURL(file).href)
    return mod.default as E2EConfig
  } catch (error) {
    throw new Error(`Could not load ${file}: ${error instanceof Error ? error.message : error}`)
  }
}
