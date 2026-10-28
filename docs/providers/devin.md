# Devin

Tracks your Devin quota using the login from the Devin CLI or the Devin app. Ported from
OpenUsage's [Devin provider](https://github.com/robinebers/openusage/blob/main/docs/providers/devin.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Daily | on | Daily quota used (hidden when Devin hides the daily quota) |
| Weekly | on | Weekly quota used. Falls back to the daily figure when Devin reports neither a weekly percentage nor a weekly reset |
| Extra Balance | on, behind the caret | Overage balance in dollars (`$0.00` is a real zero) |

If Devin gives a weekly reset but no weekly percentage, the week is used up (100%). Your plan
name shows beside the provider name.

## Where credentials come from

Checked in this order; the first that works wins:

1. **Devin CLI credentials** (`devin auth login`), the first of these that exists:
   - `%APPDATA%\devin\credentials.toml`: **confirmed** as the Windows location by
     [Pane](https://github.com/ItsJazii/pane), another Windows port, which reads it there.
   - `%USERPROFILE%\.local\share\devin\credentials.toml`: upstream's macOS/Linux location.
   - `%LOCALAPPDATA%\devin\credentials.toml`: also checked by Pane.

   AgentMaxx reads `windsurf_api_key`, and `api_server_url` when it's an `https://` URL.
2. **The Devin app's state database**, `%APPDATA%\Devin\User\globalStorage\state.vscdb`
   (`ItemTable` key `windsurfAuthStatus`), opened read-only. **Unconfirmed on Windows**: this is
   the usual location for VS Code-based apps, but it hasn't been checked against a real install.

If the CLI key is rejected and the app is signed in with a different key, the app's key is tried.

## Troubleshooting

- **"Run devin auth login or sign in to Devin…"**: no key was found, or every key was rejected.
  Run `devin auth login`, then refresh.
- **"Devin quota data unavailable…"**: Devin answered without quota figures, or with an error.
  Try again later.
- **Weekly shows the daily figure**: Devin reported neither a weekly percentage nor a weekly
  reset, so the daily quota fills the Weekly row.

## Under the hood

Connect RPC `POST {api_server_url}/exa.seat_management_pb.SeatManagementService/GetUserStatus`
(default server `https://server.codeium.com`) with the key in the request metadata. Quotas arrive
as percent *remaining* and are shown as used. There's no token refresh: a 401/403 moves on to the
next credential source.

## Not ported

- the macOS app database path (`~/Library/Application Support/Devin/…`), replaced by the
  `%APPDATA%` one above
