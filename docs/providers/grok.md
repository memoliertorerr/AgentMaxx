# Grok

Tracks Grok Build's weekly credit pool using the Grok CLI's login. Ported from OpenUsage's
[Grok provider](https://github.com/robinebers/openusage/blob/main/docs/providers/grok.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Weekly | on | The shared weekly pool's usage, the limit Grok's unified billing enforces, with the weekly reset countdown |
| Extra Usage | on, behind the caret | The pay-as-you-go cap as a status (`2500 cap` or `Disabled`) |

Your subscription tier (for example "SuperGrok Heavy") shows beside the name.

Accounts not yet moved to unified billing have no weekly pool, so Weekly reads "No data" there
rather than showing a monthly figure under a weekly label.

## Where credentials come from

Sign in once with the Grok CLI (`grok login`). AgentMaxx reads the same file:
`%USERPROFILE%\.grok\auth.json`. Each account in it is tried in order.

Access tokens are refreshed before they expire (within five minutes), and the rotated token is
written back to `auth.json`, changing only that account's `key`, `refresh_token`, `id_token`, and
`expires_at`. Every other field and account is kept. If the Grok CLI logs in again while
AgentMaxx is refreshing, the CLI's newer login wins and nothing is written.

With **Read-only Logins** on (Settings → General), AgentMaxx never renews the login and never
writes the file. A token that's about to expire is still used as is; once it has expired, or the
API rejects it, the card shows "Login expired. Run `grok login` to sign in again, then refresh." and the Grok CLI renews it when you sign in again.

## Troubleshooting

- **"Grok not logged in…"**: no `auth.json`. Run `grok login`.
- **"Grok auth invalid…"**: `auth.json` has no account with a token. Run `grok login` again.
- **"Grok auth expired…"**: the token expired and couldn't be refreshed, or the API still
  rejected it after a refresh. Run `grok login` again.
- **"Login expired. Run `grok login`…"**: Read-only Logins is on and the login expired. Run
  `grok login`, then refresh, or turn Read-only Logins off.
- **Weekly shows "No data"**: your account still reports a monthly period; it hasn't moved to
  Grok's unified weekly billing yet.
- **"Team accounts have no personal quota…"** (amber notice by the name): Grok's credits endpoint
  answers `HTTP 412 No personal team` for a team or business login. That's the account's shape,
  not a failed login; the plan name still shows.

## Under the hood

- `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`, the call the Grok CLI itself
  makes, with `Authorization: Bearer …` and `X-XAI-Token-Auth: xai-grok-cli`. The answer is
  proto3 JSON, so a missing percent or cap means 0. A 401/403 refreshes the token and retries
  once.
- `GET https://cli-chat-proxy.grok.com/v1/settings` for `subscription_tier_display`
  (best-effort).
- Token refresh: `POST https://auth.x.ai/oauth2/token` (form-encoded `refresh_token` grant) with
  the account's OIDC client id. Never called with Read-only Logins on.

## Not ported

- the Today / Yesterday / Last 30 Days spend tiles and usage trend from `~\.grok\sessions\`
  (Later: local spend tiles)
