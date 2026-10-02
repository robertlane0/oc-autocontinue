import { describe, expect, test } from "bun:test"
import { MESSAGE, resolve } from "../src/options"

function clearEnv() {
  for (const key of ["OC_AUTOCONTINUE_ENABLED", "OC_AUTOCONTINUE_MESSAGE"]) delete process.env[key]
}

describe("resolve", () => {
  test("off by default with the fixed message", () => {
    clearEnv()
    const options = resolve()
    expect(options.enabled).toBe(false)
    expect(options.message).toBe(MESSAGE)
    expect(MESSAGE).toBe(
      'Continue working unless the project is finished. If that is the case, reply with the word "Done." and nothing else.',
    )
  })

  test("enabled accepts affirmative and negative spellings", () => {
    for (const value of [true, "true", "on", "yes", "1", "ON"])
      expect(resolve({ enabled: value }).enabled).toBe(true)
    for (const value of [false, "false", "off", "no", "0", "OFF"])
      expect(resolve({ enabled: value }).enabled).toBe(false)
  })

  test("an unrecognized enabled value stays off", () => {
    expect(resolve({ enabled: "maybe" }).enabled).toBe(false)
    expect(resolve({ enabled: 1 }).enabled).toBe(false)
  })

  test("options beat environment", () => {
    process.env.OC_AUTOCONTINUE_ENABLED = "on"
    process.env.OC_AUTOCONTINUE_MESSAGE = "from-env"
    try {
      const options = resolve({ enabled: false, message: "explicit" })
      expect(options.enabled).toBe(false)
      expect(options.message).toBe("explicit")
    } finally {
      clearEnv()
    }
  })

  test("environment supplies a missing option", () => {
    process.env.OC_AUTOCONTINUE_ENABLED = "yes"
    process.env.OC_AUTOCONTINUE_MESSAGE = "from-env"
    try {
      const options = resolve()
      expect(options.enabled).toBe(true)
      expect(options.message).toBe("from-env")
    } finally {
      clearEnv()
    }
  })

  test("blank strings fall through to defaults", () => {
    clearEnv()
    const options = resolve({ message: "   " })
    expect(options.message).toBe(MESSAGE)
  })
})
