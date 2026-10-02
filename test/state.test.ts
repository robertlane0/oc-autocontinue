import { describe, expect, test } from "bun:test"
import { Monitor, isDone, normalize } from "../src/state"

const started = (sessionID: string) => ({ type: "session.execution.started", data: { sessionID } })
const said = (sessionID: string, ordinal: number, text: string) => ({
  type: "session.text.ended",
  data: { sessionID, ordinal, text },
})
const succeeded = (sessionID: string) => ({ type: "session.execution.succeeded", data: { sessionID } })
const interrupted = (sessionID: string, reason: string) => ({
  type: "session.execution.interrupted",
  data: { sessionID, reason },
})
const failed = (sessionID: string) => ({ type: "session.execution.failed", data: { sessionID } })

/** Plays a whole turn and returns the sessions the monitor asked to continue. */
function turn(events: readonly unknown[]) {
  const monitor = new Monitor()
  const continued: string[] = []
  for (const event of events) {
    const sessionID = monitor.observe(event)
    if (sessionID !== undefined) continued.push(sessionID)
  }
  return continued
}

describe("normalize", () => {
  test("peels decoration off both ends", () => {
    expect(normalize("  Done.  ")).toBe("done")
    expect(normalize("**Done.**")).toBe("done")
    expect(normalize('"Done!"')).toBe("done")
    expect(normalize("`done`")).toBe("done")
    expect(normalize("_DONE_")).toBe("done")
  })

  test("collapses inner whitespace", () => {
    expect(normalize("  Done  \n")).toBe("done")
  })

  test("keeps interior punctuation and only drops the outermost one", () => {
    expect(normalize("Done. Tests pass.")).toBe("done. tests pass")
    expect(normalize("...")).toBe("")
  })
})

describe("isDone", () => {
  test("accepts the spellings a model actually produces", () => {
    for (const value of ["Done.", "done", "DONE", "**Done.**", '"Done."', "Done!", " Done. \n"])
      expect(isDone(value)).toBe(true)
  })

  test("rejects anything else", () => {
    for (const value of [
      "",
      ".",
      "Done. Tests pass.",
      "Done with the first half, continuing.",
      "Not done yet",
      "Finish the tests",
      "The user is done",
    ])
      expect(isDone(value)).toBe(false)
  })
})

describe("Monitor", () => {
  test("continues a turn that ended on ordinary text", () => {
    expect(turn([started("s"), said("s", 0, "Here is what I found."), succeeded("s")])).toEqual(["s"])
  })

  test("stays quiet when the model's only text is Done.", () => {
    expect(turn([started("s"), said("s", 0, "Fixed the parser."), succeeded("s")])).toEqual(["s"])
    expect(turn([started("s"), said("s", 0, "Done."), succeeded("s")])).toEqual([])
    expect(turn([started("s"), said("s", 0, "**Done.**"), succeeded("s")])).toEqual([])
  })

  test("a Done. next to other text does not stop the run", () => {
    expect(turn([started("s"), said("s", 0, "Fixed the parser."), said("s", 1, "Done."), succeeded("s")])).toEqual([
      "s",
    ])
    expect(turn([started("s"), said("s", 0, "Done."), said("s", 1, "Still going."), succeeded("s")])).toEqual(["s"])
  })

  test("keeps block order by ordinal rather than arrival", () => {
    expect(turn([started("s"), said("s", 1, "Done."), said("s", 0, "Fixed the parser."), succeeded("s")])).toEqual(
      ["s"],
    )
  })

  test("continues a turn that produced no text at all", () => {
    expect(turn([started("s"), succeeded("s")])).toEqual(["s"])
  })

  test("continues a turn whose text never arrived", () => {
    expect(turn([succeeded("s")])).toEqual(["s"])
  })

  test("a repeated success event prompts only once", () => {
    expect(turn([started("s"), said("s", 0, "Working."), succeeded("s"), succeeded("s")])).toEqual(["s"])
  })

  test("a manual pause is never continued", () => {
    expect(turn([started("s"), said("s", 0, "Long job"), interrupted("s", "user")])).toEqual([])
  })

  test("a failed turn is never continued", () => {
    expect(turn([started("s"), said("s", 0, "Long job"), failed("s")])).toEqual([])
  })

  test("a stopped turn leaves nothing for the next turn to read", () => {
    const monitor = new Monitor()
    monitor.observe(started("s"))
    monitor.observe(said("s", 0, "Done."))
    monitor.observe(interrupted("s", "user"))
    expect(monitor.observe(started("s"))).toBeUndefined()
    // The buffer is fresh, so the interrupted Done. cannot end this turn.
    expect(monitor.observe(succeeded("s"))).toBe("s")
  })

  test("text after the turn ended cannot change the decision", () => {
    const monitor = new Monitor()
    monitor.observe(started("s"))
    expect(monitor.observe(succeeded("s"))).toBe("s")
    monitor.observe(said("s", 0, "Done."))
    expect(monitor.observe(succeeded("s"))).toBeUndefined()
  })

  test("sessions do not share a turn", () => {
    const monitor = new Monitor()
    monitor.observe(started("a"))
    monitor.observe(started("b"))
    monitor.observe(said("a", 0, "Done."))
    expect(monitor.observe(succeeded("a"))).toBeUndefined()
    expect(monitor.observe(succeeded("b"))).toBe("b")
  })

  test("ignores events that are not turn lifecycle events", () => {
    expect(turn([undefined, null, "text", {}, { type: "session.updated" }, { type: "session.execution.succeeded" }])).toEqual(
      [],
    )
  })

  test("ignores malformed text events", () => {
    expect(turn([started("s"), { type: "session.text.ended", data: { sessionID: "s" } }, succeeded("s")])).toEqual(["s"])
    expect(turn([started("s"), { type: "session.text.ended" }, succeeded("s")])).toEqual(["s"])
  })
})
