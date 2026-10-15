# Z.ai

Tracks [Z.ai](https://z.ai) (Zhipu AI) GLM Coding Plan quotas from an API key you give
UsageMaxx. Ported from OpenUsage's
[Z.ai provider](https://github.com/robinebers/openusage/blob/main/docs/providers/zai.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Session | on, pinned | Share of the 5-hour rolling window used |
| Weekly | on, pinned | Share of the 7-day rolling window used |
| Web Searches | on, behind the caret | Monthly web-search, web-reader, and Zread calls (used / limit) |

The plan name ("GLM Coding Pro") shows beside the name when Z.ai reports it.

## Where the key comes from

Z.ai has no CLI or app that leaves a credential on your PC, so you provide a key. Get one from
the [Z.ai console](https://z.ai/manage-apikey/apikey-list). UsageMaxx checks, in order:

1. **A key saved in Settings → API Keys** (recommended). It's encrypted with Windows DPAPI
   (Electron `safeStorage`) and stored in `%APPDATA%\UsageMaxx\api-keys.json`, readable only by
   your Windows account. The plain key is never written to disk, and nothing is saved if
   encryption isn't available.
2. **The `ZAI_API_KEY` environment variable**, then `GLM_API_KEY` (the older Zhipu name).

A saved key wins over an environment variable; clearing it falls back to the environment.

### Setting the environment variable

```powershell
setx ZAI_API_KEY "your-key"
```

`setx` only affects programs started afterwards: quit UsageMaxx from its tray menu and start it
again. `setx` keeps the key in plain text in your user environment; the Settings screen is the
safer place for it.

## Troubleshooting

- **"No Z.ai API key…"**: add a key in Settings → API Keys, or set `ZAI_API_KEY` and restart
  UsageMaxx.
- **"Z.ai API key invalid…"**: the key was rejected (401/403). Regenerate it in the
  [Z.ai console](https://z.ai/manage-apikey/apikey-list).
- **"No active GLM Coding Plan…"**: the key works, but the account has no GLM Coding Plan, so
  there's nothing to meter. [Subscribe](https://z.ai/subscribe); usage appears once the plan is
  active.
- **Meters show "No data"**: you have a plan, but the quota endpoint returned no usable limits
  yet. Check your [plan](https://z.ai/manage-apikey/coding-plan/personal/my-plan).
- **"Couldn't decrypt the saved Z.ai API key…"**: the key file came from another Windows account
  or PC. Save the key again.

## Under the hood

Two internal endpoints that Z.ai's own subscription page uses, with `Authorization: Bearer <key>`:

- `GET https://api.z.ai/api/monitor/usage/quota/limit`: the quotas (required). Each
  `CREDIT_LIMIT` entry (`TOKENS_LIMIT` in older responses) is a percentage window; its
  `unit`/`number` length decides the meter (under a day → Session, longer → Weekly). A
  `TIME_LIMIT` entry is the monthly web-search count. Resets are epoch milliseconds. Missing
  required values are an invalid response, never zero usage.
- `GET https://api.z.ai/api/biz/subscription/list`: the plan name, best-effort. Its failure never
  hides the meters.

A 2xx answer of `success: false` mentioning a "coding plan" means the account has no plan.

## Not ported

- the macOS config files (`~/.config/openusage/zai.json`, `~/.config/zai/key.json`). On Windows the
  saved key lives in UsageMaxx's encrypted store instead.
- upstream's "No usage data" status badge for an empty quota. UsageMaxx shows "No data" on each
  meter instead, as it does for every provider.
