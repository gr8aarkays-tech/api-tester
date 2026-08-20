import type { Environment, EnvironmentVariable } from '../types'

// Matches {{word}}, {{word-with-hyphens}}, {{word_underscore}}, etc.
const VAR_PATTERN = /\{\{([\w-]+)\}\}/g

export const environmentService = {
  resolve(text: string, env: Environment | null): string {
    if (!env) return text
    const vars: Record<string, string> = {}
    for (const v of env.variables) {
      if (v.enabled) vars[v.key] = v.value
    }
    return text.replace(VAR_PATTERN, (_, key) => vars[key] ?? `{{${key}}}`)
  },

  getVarNames(env: Environment | null): string[] {
    if (!env) return []
    return env.variables.filter((v) => v.enabled).map((v) => v.key)
  },

  extractVariables(text: string): string[] {
    const matches = text.match(VAR_PATTERN)
    if (!matches) return []
    return [...new Set(matches.map((m) => m.slice(2, -2)))]
  },
}
