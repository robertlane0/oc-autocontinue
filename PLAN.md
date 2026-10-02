# oc-autocontinue

An OpenCode plugin that keeps an agent working until it says it is finished.

## Goal

When enabled, every time the model stops producing output, send it a short prompt telling
it to keep working, and to reply with the word `Done.` when the project is finished. The
plugin is off by default and is toggled from a slash command.

## Approach

### Trigger

`session.execution.succeeded` is the finished-turn signal: the run coordinator publishes it
once per busy period, after the final drain, for a turn that ended normally.

- `session.execution.interrupted` is ignored, so a manual pause (`Esc`) never continues.
- `session.execution.failed` is ignored, so a provider or tool failure never loops.

The event is published while the session's execution is still registered, so the follow-up
prompt is admitted first and the doorbell the prompt rings starts the successor drain. No
explicit wait for idle is needed.

### Detecting `Done.`

`session.text.ended` carries each completed assistant text block, keyed by assistant
message ID and ordinal. The plugin buffers the blocks seen since
`session.execution.started` and compares their concatenation with `Done.` when the turn
succeeds.

Comparison strips surrounding whitespace, quotes, markdown emphasis and trailing
punctuation, collapses inner whitespace and lowercases, so `Done.`, `**Done.**` and `done`
all match while `Done. Tests pass.` does not. A turn that produced no text is not `Done.`.

Matching is deliberately strict: a false negative costs one extra prompt, a false positive
ends the loop early.

### Sending the prompt

`ctx.session.prompt` with the fixed message and `delivery: "steer"`. It returns as soon as
the message is admitted, so the event loop is never blocked on a model turn.

### Command

`/autocontinue` is registered with `ctx.command.transform`. Arguments arrive as the command
invocation's prompt text:

| Input          | Effect                                    |
| -------------- | ----------------------------------------- |
| `/autocontinue`| Toggles and reports the resulting status   |
| `/autocontinue on` | Turns on and reports                  |
| `/autocontinue off`| Turns off and reports                 |
| anything else  | Reports usage and changes nothing          |

Status is reported as a synthetic session message with `resume: false`, the mechanism
OpenCode already uses for plugin-authored notices. Clients render its `description` as a
one-line notice, and it reaches the model on the next turn.

### State

One flag for the whole plugin, not per session: turning it on in one session should mean
it is on everywhere.

- Default comes from the `enabled` option, which is `false`.
- `/autocontinue` writes the flag to plugin storage, so the choice survives a plugin reload
  or a server restart. A stored value wins over the option default.

## Configuration

| Option    | Default                                   | Meaning                                |
| --------- | ----------------------------------------- | -------------------------------------- |
| `enabled` | `false`                                   | Starting state. The command overrides. |
| `message` | the fixed continue prompt                 | Text sent when a turn ends             |

Environment variables work as fallbacks when no option is set: `OC_AUTOCONTINUE_ENABLED`,
`OC_AUTOCONTINUE_MESSAGE`.

## Layout

```
index.ts          package entrypoint, re-exports src
src/index.ts      plugin wiring: command, event loop, sends
src/options.ts    option and environment resolution
src/state.ts      turn tracking, Done. matching, monitor state machine
test/             bun tests
```

## Verification

1. `bun install`, `bun test`, `bunx tsc --noEmit`.
2. Load the plugin from a scratch project and confirm `opencode plugin list` resolves it.
3. Drive a child `opencode serve` over its HTTP API: toggle the command and read back the
   synthetic notice, confirm a turn whose reply is `Done.` adds no continue message, and
   confirm a turn whose reply is anything else does.
