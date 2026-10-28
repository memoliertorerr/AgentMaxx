# Codex

Tracks your ChatGPT / Codex subscription limits using the Codex CLI's login.
Ported from OpenUsage's [Codex provider](https://github.com/robinebers/openusage/blob/main/docs/providers/codex.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Session | on, pinned | 5-hour rolling window usage |
| Weekly | on, pinned | 7-day window usage |
| Spark / Spark Weekly | on, behind the caret | GPT-5.3-Codex-Spark limits, when your account has them |
| Extra Usage | on, behind the caret | Flex credits, as dollars and credits (`$31.84 · 796 credits`) |
| Rate Limit Resets | on, behind the caret | On-demand reset credits available (`2 available`) |

Your plan shows beside the name. Pro plans use their current names: `prolite` is **Pro 100**,
`pro` is **Pro 200**, and `promax` is **Pro 500**.

Session and Weekly are matched by each window's length, not its position, so an account that
temporarily has only a weekly limit shows just Weekly.

## Where credentials come from

Sign in once with the Codex CLI (`codex`). AgentMaxx reads `auth.json` from:

1. `%CODEX_HOME%`, when you set `CODEX_HOME`
2. otherwise `%USERPROFILE%\.config\codex`, then `%USERPROFILE%\.codex` (the usual place on
   Windows)

Tokens refresh automatically: shortly before the access token's expiry, and once after a
401/403. The rotated tokens and `last_refresh` are written back to the same `auth.json`, and
every other field is kept. If the Codex CLI rotated the login on disk in the meantime, AgentMaxx
leaves the CLI's newer login in place.

With **Read-only Logins** on (Settings → General), AgentMaxx never renews the login and never
writes the file. A token that's about to expire is still used as is; once it has expired, or the
API rejects it, the card shows "Login expired. Run `codex` to sign in again, then refresh." and the Codex CLI renews it the next time you run it.

## Troubleshooting

- **"Not logged in"**: run `codex` and sign in, then refresh.
- **"Usage not available for API key"**: `auth.json` only has an `OPENAI_API_KEY`. Subscription
  limits need a ChatGPT sign-in, so run `codex` and sign in with your ChatGPT account.
- **"Session expired" / "Token revoked" / "Token conflict"**: run `codex` again to renew the
  login, then refresh.
- **"Login expired. Run `codex`…"**: Read-only Logins is on and the login expired. Run `codex`,
  then refresh, or turn Read-only Logins off.

## Under the hood

- `GET https://chatgpt.com/backend-api/wham/usage` with the OAuth token and
  `ChatGPT-Account-Id` when the login names an account.
- `POST https://auth.openai.com/oauth/token` (form-encoded `refresh_token` grant) to refresh;
  never called with Read-only Logins on.
  `refresh_token_expired`, `refresh_token_reused`, and `refresh_token_invalidated` map to
  expired, conflicting, and revoked logins.
- Response headers `x-codex-primary-used-percent`, `x-codex-secondary-used-percent`, and
  `x-codex-credits-balance` fill values missing from the body.

## Not ported

These exist in OpenUsage for macOS but not here:

- the macOS Keychain login, plus Codex Swap (`xswap`), pi, and sibling `~/.codex-*` homes
  (multi-account cards)
- the per-credit expiry timeline and claiming a reset credit
- local spend tiles and the usage trend from Codex session logs (see the [roadmap](../roadmap.md))
- a Codex login kept in Windows Credential Manager (`cli_auth_credentials_store = keyring`)
