# Cursor

Tracks your Cursor plan usage using the login from the Cursor app.
Ported from OpenUsage's [Cursor provider](https://github.com/robinebers/openusage/blob/main/docs/providers/cursor.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Total Usage | on | Plan usage for the billing cycle: a percent, dollars on older team accounts, or a request count on request-based Enterprise accounts |
| Cursor Models | on, pinned | Usage percent for Cursor's own models (Auto, Composer, Cursor Grok) |
| Other Models | on, pinned | Usage percent for other models |
| Grok Bot | on, behind the caret | Grok Bot's separate weekly allowance |
| Extra Usage | on, behind the caret | On-demand spend, as a meter when Cursor returns a limit |
| Requests | off, behind the caret | Included requests against the cap, on request-based plans |
| Credits | off, behind the caret | Credit left from grants and prepaid balance |

Your plan shows beside the name. Teams seats with model pools show the two pool percentages,
and Total Usage only when Cursor reports one. Older team accounts show a dollar meter.

## Where credentials come from

Just be signed in to the Cursor app. UsageMaxx reads the session tokens from Cursor's local
state database, `%APPDATA%\Cursor\User\globalStorage\state.vscdb` (the `ItemTable` keys
`cursorAuth/accessToken` and `cursorAuth/refreshToken`).

The database is opened **read-only** and closed right away. When the access token is about to
expire, UsageMaxx refreshes it but keeps the new token in memory instead of writing it into the
database of an app that may be running. Upstream does write it back. Cursor renews its own token
the next time it runs.

With **Read-only Logins** on (Settings → General), UsageMaxx doesn't renew the token at all. A
token that's about to expire is still used as is; once it has expired, or the API rejects it, the
card shows "Login expired. Open Cursor to renew it, then refresh."

## Troubleshooting

- **"Not logged in"**: open Cursor and sign in, then refresh.
- **"Session expired" / "Token expired"**: sign in to Cursor again.
- **"Login expired. Open Cursor…"**: Read-only Logins is on and the token expired. Opening Cursor
  renews it; then refresh. Or turn Read-only Logins off.
- **"Couldn't read Cursor's login database"**: the file is locked or unreadable, usually during
  a Cursor update. Wait a moment and refresh.
- **Some metrics show "No data"**: Cursor leaves out fields depending on the plan. Missing ones
  simply read "No data".
- **"No active Cursor subscription"**: Cursor reports the account as having no active plan.

## Under the hood

- Connect RPC on `https://api2.cursor.sh/aiserver.v1.DashboardService/`: `GetCurrentPeriodUsage`
  (required), plus `GetPlanInfo`, `GetCreditGrantsBalance`, and `GetSandUsageStatus` (Grok Bot),
  all optional.
- `POST https://api2.cursor.sh/oauth/token` to refresh the access token; `shouldLogout` means the
  session ended. Never called with Read-only Logins on.
- With the web session cookie (`WorkosCursorSessionToken`, derived from the token):
  `https://cursor.com/api/auth/stripe` (prepaid balance) and, for Team/Enterprise accounts
  without usable plan data, `https://cursor.com/api/usage-summary` plus
  `https://cursor.com/api/usage`.

Optional lookups never fail the card. Failures are logged with fixed, credential-free messages.

## Not ported

- Spend history, the usage trend, and Today / Yesterday / Last 30 Days (from Cursor's usage
  events; see the [roadmap](../roadmap.md))
- writing a refreshed token back into Cursor's database (deliberate, see above)
- the macOS Keychain fallback (doesn't apply on Windows)
