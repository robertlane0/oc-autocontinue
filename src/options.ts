export const MESSAGE =
  'Continue working unless the project is finished. If that is the case, reply with the word "Done." and nothing else.'

/** The reply that ends a run. Compared case- and punctuation-insensitively. */
export const DONE = "done"

export interface Options {
  /** Starting state. The `/autocontinue` command overrides it. */
  enabled: boolean
  /** Text sent after a turn ends. */
  message: string
}

export type RawOptions = Record<string, unknown>

export class OptionsError extends Error {}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function env(key: string): string | undefined {
  return text(process.env[key])
}

/** Only the usual affirmative spellings count, so a typo leaves the default in place. */
function flag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  const normalized = text(value)?.toLowerCase()
  if (normalized === undefined) return undefined
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return undefined
}

/** Options win over environment variables; environment fills the gaps. */
export function resolve(raw: RawOptions = {}): Options {
  const enabled = flag(raw.enabled) ?? flag(env("OC_AUTOCONTINUE_ENABLED")) ?? false
  const message = text(raw.message) ?? env("OC_AUTOCONTINUE_MESSAGE") ?? MESSAGE
  return { enabled, message }
}
