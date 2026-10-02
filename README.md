# oc-autocontinue

An OpenCode plugin that keeps a model working until it says it is finished.

When it is on, every time the model stops producing output the plugin sends it:

> Continue working unless the project is finished. If that is the case, reply with the
> word "Done." and nothing else.

When the model's reply is just `Done.`, nothing is sent.

## Install

Point OpenCode at the package directory:

```jsonc
// opencode.json  (or ~/.config/opencode/opencode.json to load it everywhere)
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [{ "package": "/path/to/oc-autocontinue" }]
}
```

It is off once installed. Turn it on from a session with `/autocontinue`.

## The command

| Input            | Effect                                  |
| ---------------- | --------------------------------------- |
| `/autocontinue`  | Toggles, then reports the new status     |
| `/autocontinue on`  | Turns on, then reports the status     |
| `/autocontinue off` | Turns off, then reports the status    |

Status appears in the transcript as a one-line notice. The choice is remembered, so it
survives a restart of OpenCode.

## When it sends the message

A turn ends at `session.execution.succeeded`. A turn you stop yourself (`Esc`) ends at
`session.execution.interrupted` and never continues, and a failed turn never continues
either, so an error cannot start a loop.

`Done.` is read from the model's text for that turn, so a `Done.` left over from earlier in
the session cannot end a later turn. The comparison ignores case, surrounding quotes,
markdown emphasis and trailing punctuation, so `Done.`, `**done!**` and `"Done."` all stop
the run while `Done. Tests pass.` does not. Matching is strict on purpose: an extra prompt
is cheap, stopping early is not.

## Options

| Option    | Default   | Meaning                                   |
| --------- | --------- | ----------------------------------------- |
| `enabled` | `false`   | Starting state. The command overrides it. |
| `message` | see above | Text sent after a turn ends.              |

Environment variables work as fallbacks when no option is set:
`OC_AUTOCONTINUE_ENABLED`, `OC_AUTOCONTINUE_MESSAGE`.

## Development

```sh
bun install
bun test
bunx tsc --noEmit
```

Requires OpenCode 2 (`@opencode/plugin` >= 2.0.0). `PLAN.md` holds the design notes.
