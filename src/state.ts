import { DONE } from "./options"

type Unknown = Record<string, unknown>

const LEADING = /^[\s"'“”‘’`*_~([{<]+/
const TRAILING = /[\s"'“”‘’`*_~.!?…:;)\]}>]+$/

/**
 * Reduces a model reply to its bare word: surrounding quotes, markdown emphasis and
 * trailing punctuation are peeled off, inner whitespace collapses, and case is dropped.
 */
export function normalize(text: string): string {
  let value = text.trim()
  let previous: string
  do {
    previous = value
    value = value.replace(LEADING, "").replace(TRAILING, "")
  } while (value !== previous)
  return value.replace(/\s+/g, " ").toLowerCase()
}

/** True only when the whole reply is `Done.`, so a sentence containing it does not stop a run. */
export function isDone(text: string): boolean {
  return normalize(text) === DONE
}

function isRecord(value: unknown): value is Unknown {
  return typeof value === "object" && value !== null
}

function eventType(event: unknown): string | undefined {
  if (!isRecord(event) || typeof event.type !== "string") return undefined
  return event.type
}

function sessionID(event: unknown): string | undefined {
  if (!isRecord(event) || !isRecord(event.data)) return undefined
  return typeof event.data.sessionID === "string" ? event.data.sessionID : undefined
}

/**
 * Watches the event stream for the end of a turn and reports which sessions need a
 * follow-up prompt. One buffer per in-flight turn holds the assistant text blocks seen so
 * far; `Done.` is read from that buffer, so a stale reply can never end a later turn.
 */
export class Monitor {
  readonly #turns = new Map<string, Map<number, string>>()
  readonly #settled = new Set<string>()

  /** Feeds one event; returns the session to continue, or undefined to do nothing. */
  observe(event: unknown): string | undefined {
    const id = sessionID(event)
    if (id === undefined) return undefined
    switch (eventType(event)) {
      case "session.execution.started":
        this.#turns.set(id, new Map())
        this.#settled.delete(id)
        return undefined
      case "session.text.ended":
        this.#text(event, id)
        return undefined
      case "session.execution.succeeded": {
        // One terminal per busy period; a repeat of the same event must not prompt twice.
        if (this.#settled.has(id)) return undefined
        this.#settled.add(id)
        const turn = this.#turns.get(id)
        this.#turns.delete(id)
        return isDone(join(turn)) ? undefined : id
      }
      case "session.execution.interrupted":
      case "session.execution.failed":
        // A stopped or failed turn is never continued, so its text is no longer of interest.
        this.#turns.delete(id)
        return undefined
      default:
        return undefined
    }
  }

  #text(event: unknown, id: string) {
    const turn = this.#turns.get(id)
    if (turn === undefined || !isRecord(event) || !isRecord(event.data)) return
    const { ordinal, text } = event.data
    if (typeof text !== "string" || !Number.isSafeInteger(ordinal)) return
    turn.set(ordinal as number, text)
  }
}

function join(turn: Map<number, string> | undefined): string {
  if (turn === undefined) return ""
  return [...turn.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, text]) => text)
    .filter((text) => text.trim().length > 0)
    .join("\n")
}
