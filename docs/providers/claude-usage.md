# Claude

Tracks your Claude subscription limits using the login Claude Code already has on your PC.
Ported from OpenUsage's [Claude provider](https://github.com/robinebers/openusage/blob/main/docs/providers/claude.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Session | on, pinned | 5-hour rolling window usage |
| Weekly | on, pinned | 7-day window usage |
| Fable | on | Separate weekly Fable limit, when your plan has one |
| Sonnet | off, behind the caret | Separate weekly Sonnet limit (plan-dependent) |
| Extra Usage | on | Extra-usage credits spent, against your monthly cap when you set one |

Your plan (for example **Max 5x**) shows beside the name. It comes from Anthropic's live account
profile, so an upgrade appears without signing in again. While the 5-hour window hasn't started,
Session reads **Not started**.

## Where credentials come from

Sign in with Claude Code (`claude`). UsageMaxx reads, in order:

1. `%USERPROFILE%\.claude\.credentials.json`, or `%CLAUDE_CONFIG_DIR%\.credentials.json` when you
   set `CLAUDE_CONFIG_DIR`
2. The `CLAUDE_CODE_OAUTH_TOKEN` environment variable, as a fallback only

A `CLAUDE_CODE_OAUTH_TOKEN` (usually from `claude setup-token`) can run the model but can't read
your limits, so a real login always wins. If that token is your only credential, the card
explains how to sign in instead of showing blank rows.

When the access token is about to expire, UsageMaxx refreshes it the way Claude Code does and
writes back only the token fields, keeping everything else in the file, such as MCP logins. If
Claude Code replaced the login in the meantime, the newer login is left alone.

With **Read-only Logins** on (Settings → General), UsageMaxx never renews the login and never
writes the file. A token that's about to expire is still used as is; once it has expired, or the
API rejects it, the card shows "Login expired. Run `claude` to sign in again, then refresh." and Claude Code renews it the next time you run it.

## Troubleshooting

- **"Not logged in"**: run `claude` and sign in, then refresh.
- **"Session expired" / "Token expired"**: run `claude` again so it renews the login, then refresh.
- **"Login expired. Run `claude`…"**: Read-only Logins is on and the login expired. Run `claude`
  (any command renews it), then refresh. Turn Read-only Logins off to let UsageMaxx renew it.
- **"Re-login for live usage"**: the saved login lacks the `user:profile` access needed to read
  limits (an inference-only token). Run `claude` and sign in again.
- **"Updates blocked by Anthropic"**: the usage API is rate-limiting requests. UsageMaxx keeps
  the last values, waits out the cooldown (honoring `Retry-After`, otherwise 5 minutes), and
  tries again. Manual refreshes don't help here.
- **"Couldn't read Claude Code's credentials file"**: the file exists but Windows refused access.
  Check its permissions.

## Under the hood

- `GET https://api.anthropic.com/api/oauth/usage` with the OAuth token and
  `anthropic-beta: oauth-2025-04-20`, the same request Claude Code makes.
- `GET https://api.anthropic.com/api/oauth/profile` for the plan, at most once per access token,
  and only after a usage request succeeded.
- `POST https://platform.claude.com/v1/oauth/token` to refresh an expiring token (and once after
  a 401/403). `invalid_grant` means the session ended. Never called with Read-only Logins on.
- `CLAUDE_CODE_CUSTOM_OAUTH_URL` and `CLAUDE_CODE_OAUTH_CLIENT_ID` are honored, as Claude Code
  honors them.

## Not ported

These exist in OpenUsage for macOS but not here:

- the macOS Keychain and Claude Desktop logins (neither applies on Windows)
- Claude Swap accounts and per-organization cards
- the Rate Limit Resets row
- local spend tiles (Today / Yesterday / Last 30 Days) and the usage trend, which come from
  Claude Code's session logs (see the build plan's **Later**)
