# OpenRouter

Tracks your [OpenRouter](https://openrouter.ai) credit balance and spend from an API key you
give UsageMaxx. Ported from OpenUsage's
[OpenRouter provider](https://github.com/robinebers/openusage/blob/main/docs/providers/openrouter.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Credits | on, pinned | Lifetime spend against the credits you've bought (a dollar meter, "$X purchased") |
| Balance | on | Prepaid credits left |
| Today / This Week / This Month | on, behind the caret | Spend in each period. `$0.00` is a real, measured zero, not missing data |
| Key Limit | on, behind the caret | Spend in the key's current limit window against its cap. Only shown when the key has a cap |

The tier ("Pay as you go" or "Free tier") shows beside the name.

## Where the key comes from

OpenRouter has no CLI or app that leaves a credential on your PC, so you provide a key. Create
one at [openrouter.ai/keys](https://openrouter.ai/keys). UsageMaxx checks, in order:

1. **A key saved in Settings → API Keys** (recommended). It's encrypted with Windows DPAPI
   (Electron `safeStorage`) and stored in `%APPDATA%\UsageMaxx\api-keys.json`, readable only by
   your Windows account. The plain key is never written to disk. If encryption isn't available,
   UsageMaxx refuses to save the key rather than store it in plain text.
2. **The `OPENROUTER_API_KEY` environment variable**, then `OPENROUTER_KEY`.

A saved key wins over an environment variable. Clearing the saved key falls back to the
environment variable, if there is one.

### Setting the environment variable

In PowerShell or Command Prompt:

```powershell
setx OPENROUTER_API_KEY "sk-or-v1-..."
```

`setx` only affects programs started afterwards: quit UsageMaxx from its tray menu and start it
again. Note that `setx` stores the key in plain text in your user environment; the Settings
screen is the safer place for it.

## Troubleshooting

- **"No OpenRouter API key…"**: add a key in Settings → API Keys, or set `OPENROUTER_API_KEY`
  and restart UsageMaxx.
- **"OpenRouter API key invalid…"**: both endpoints rejected the key (401/403). Check or
  recreate it at [openrouter.ai/keys](https://openrouter.ai/keys).
- **"Couldn't decrypt the saved OpenRouter API key…"**: the key file came from another Windows
  account or PC, where DPAPI can't decrypt it. Save the key again.
- **Only Credits and Balance show**: the key can't read `/key` (OpenRouter gates some
  endpoints by key type). The balance still comes from `/credits`.

## Under the hood

Two `GET` calls with `Authorization: Bearer <key>`:

- `https://openrouter.ai/api/v1/credits`: account-wide `total_credits` and `total_usage`, for
  the Credits meter and Balance.
- `https://openrouter.ai/api/v1/key`: the tier, `usage_daily` / `usage_weekly` /
  `usage_monthly`, and the optional cap (`limit` − `limit_remaining`).

Each call maps on its own, so either one failing still leaves the other's rows. The key is
called invalid only when both reject it. OpenRouter's credit figures can lag by about a minute.

## Not ported

- the macOS config files (`~/.config/openusage/openrouter.json`, `~/.config/openrouter/key.json`).
  On Windows the saved key lives in UsageMaxx's encrypted store instead.
- reading the login shell's environment at launch (a macOS concern; Windows apps inherit the
  user environment)
