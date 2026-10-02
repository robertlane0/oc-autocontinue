import { Plugin } from "@opencode/plugin"
import { resolve, type Options } from "./options"
import { Monitor } from "./state"

const COMMAND = "autocontinue"
const TOGGLE = "enabled"
const SOURCE = "oc-autocontinue"

function report(message: string, error?: unknown) {
  const detail = error === undefined ? "" : `: ${error instanceof Error ? error.message : String(error)}`
  console.error(`[${SOURCE}] ${message}${detail}`)
}

/** Reports a line back to the session. `resume: false` keeps it from starting a turn. */
async function announce(ctx: Plugin.Context, sessionID: string, text: string, description: string) {
  try {
    await ctx.session.synthetic({ sessionID, text, description, metadata: { source: SOURCE }, resume: false })
  } catch (error) {
    report("status not shown", error)
  }
}

async function send(ctx: Plugin.Context, sessionID: string, message: string) {
  try {
    // A subagent is driven by its parent, which resumes on its own once the child reports
    // back. Continuing the child as well would duplicate that work and never settle.
    const session = await ctx.session.get({ sessionID })
    if (session.parentID) return
    await ctx.session.prompt({ sessionID, text: message, delivery: "steer" })
  } catch (error) {
    report("continue message not sent", error)
  }
}

export default Plugin.define({
  id: SOURCE,
  async setup(ctx) {
    const options: Options = resolve(ctx.options)

    // The command is the only control, so a stored choice outranks the configured default.
    let enabled = options.enabled
    try {
      const stored = await ctx.storage.get(TOGGLE)
      if (typeof stored === "boolean") enabled = stored
    } catch (error) {
      report("stored setting unreadable", error)
    }

    await ctx.command.transform((editor) =>
      editor.add({
        name: COMMAND,
        description: "Keep the model working until it replies Done. Usage: /autocontinue [on|off]",
        execute: async ({ sessionID, prompt }) => {
          const argument = prompt.text.trim().toLowerCase()
          const next =
            argument === "" ? !enabled : argument === "on" ? true : argument === "off" ? false : undefined
          if (next === undefined) {
            await announce(ctx, sessionID, "usage: /autocontinue [on|off]", "Autocontinue")
            return
          }
          enabled = next
          try {
            await ctx.storage.set(TOGGLE, enabled)
          } catch (error) {
            report("setting not saved", error)
          }
          const status = enabled ? "on" : "off"
          await announce(ctx, sessionID, `Autocontinue is ${status}.`, `Autocontinue ${status}`)
        },
      }),
    )

    const monitor = new Monitor()
    const pending = new Set<Promise<void>>()
    const controller = new AbortController()

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          const sessionID = monitor.observe(event)
          if (sessionID === undefined || !enabled) continue
          const task = send(ctx, sessionID, options.message)
          pending.add(task)
          void task.finally(() => pending.delete(task))
        }
      } catch (error) {
        if (!controller.signal.aborted) report("event stream ended", error)
      }
    })()

    // A one-shot `opencode run` tears down as soon as the turn ends; let an in-flight prompt
    // finish so the follow-up turn is admitted rather than lost.
    return async () => {
      controller.abort()
      await Promise.all(pending)
    }
  },
})
