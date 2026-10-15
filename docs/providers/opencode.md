# OpenCode

Tracks your OpenCode Go subscription's usage windows from OpenCode's official usage API. Ported
from OpenUsage's [OpenCode provider](https://github.com/robinebers/openusage/blob/main/docs/providers/opencode.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Session | on | Go usage in the rolling 5-hour window, with the reset countdown |
| Weekly | on | Go usage this week |
| Monthly | on | Go usage this billing cycle |

The meters are account-wide: the same percentages OpenCode's dashboard shows, including use from
other machines. "Go" shows beside the name when the key has a Go subscription.

While the rolling session has nothing in it, Session reads **Not started**; the API reports a
"if you started now" reset then, which UsageMaxx drops. Once the window is running, the countdown
shows, even while the whole-percent figure still reads 0%.

## Where credentials come from

Use OpenCode as usual and log into OpenCode Go. UsageMaxx reads the `opencode-go` key from
OpenCode's `auth.json` in its data directory:

1. `%OPENCODE_DATA_DIR%\auth.json`, when set
2. `%XDG_DATA_HOME%\opencode\auth.json`, when set
3. `%USERPROFILE%\.local\share\opencode\auth.json` (OpenCode uses this XDG layout on Windows too)

The key is sent only to OpenCode's usage API, as a Bearer token. Nothing to paste.

## Troubleshooting

- **"OpenCode Go not detected…"**: no `opencode-go` entry in `auth.json`. Log into OpenCode Go.
- **"OpenCode Go key was rejected…"** (HTTP 401): log into OpenCode Go again.
- **"No OpenCode Go subscription on this key."** (HTTP 403 `EntitlementError`): the key is valid
  but the account isn't on Go.
- **"Couldn't read OpenCode's auth.json…"**: the file exists but can't be read or isn't valid
  JSON. Check its permissions, or log into OpenCode Go again to rewrite it.

## Under the hood

`GET https://opencode.ai/zen/go/v1/usage` with `Authorization: Bearer <opencode-go key>`. The
answer is `{ usage: { rolling, weekly, monthly } }`, each with `percent` and `resetsAt`. The
session placeholder is judged against the response's `Date` header, so the PC's clock doesn't
matter.

## Not ported

- the Today / Yesterday / Last 30 Days spend tiles and usage trend from OpenCode's SQLite logs, and
  the Codex attribution of OpenCode's ChatGPT logins (Later: local spend tiles)
- OpenCode 2's credential tables in `opencode*.db`. UsageMaxx reads OpenCode 1's `auth.json`
  only. OpenCode 2 imports that file and keeps it, so it still holds the key; but a logout or new
  login made in OpenCode 2 isn't seen until this is ported (see Deferred follow-ups in
  `docs/BUILD_PLAN.md`)
