# Ollama

Tracks [Ollama Cloud](https://ollama.com) plan usage, the credits and limits Ollama shows on its
own settings page. Ported from OpenUsage's
[Ollama provider](https://github.com/robinebers/openusage/blob/main/docs/providers/ollama.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Session | on | Legacy plans: 5-hour window usage, with a reset countdown |
| Weekly | on | Legacy plans: 7-day window usage, with a reset countdown |
| Monthly | on, pinned | Current plans: dollars of your monthly included credits used ("$100 included") |
| Purchased Credits | on, behind the caret | Dollars left of extra credits you bought |

Each account reports either the legacy limits or the monthly allowance; the other rows read "No
data". Your plan (Free, Pro, Max) shows beside the name. Local models don't count toward these
limits; only cloud models do.

## Turning it on

**Ollama never switches itself on.** Ollama creates its key the first time it runs, whether or
not you ever sign in to Ollama Cloud, so the key can't tell UsageMaxx that Cloud is set up. Turn
Ollama on in Settings → Providers when you use Ollama Cloud.

## Where credentials come from

Nothing to paste. Ollama writes a signing key to `%USERPROFILE%\.ollama\id_ed25519` on first run,
and `ollama signin` links it to your ollama.com account. UsageMaxx reads the key and signs each
request with it exactly as the Ollama CLI does. The key never leaves your PC; only the signature
does.

```powershell
ollama signin
```

## Troubleshooting

- **"No Ollama key found…"**: Ollama has never run on this PC. Install it and run `ollama signin`.
- **"Not signed in to Ollama Cloud…"**: the key isn't linked to an account. Run `ollama signin`.
- **"Couldn't read %USERPROFILE%\.ollama\id_ed25519…"**: the file exists but can't be read.
  Check its permissions.
- **"…isn't a usable Ollama signing key."**: the file isn't an unencrypted OpenSSH ed25519 key,
  or its public and private halves don't match. Remove it and let Ollama create a new one, then
  run `ollama signin`.
- **"Couldn't read your Ollama plan…"** (amber notice by the name): the plan lookup failed or
  answered with something unreadable. The meters are unaffected.

## Under the hood

- `GET https://ollama.com/api/balance`: the included allowance (`balance_usd` of
  `allowance_usd` with a billing `period`) or, on legacy plans, `session`/`weekly` as
  `remaining_percent` with `resets_at`; plus `purchased.balance_usd`.
- `POST https://ollama.com/api/me`: the plan name (best-effort).

Each request carries `Authorization: <base64 SSH public key>:<base64 signature>`, signing
`<METHOD>,<request-uri>` where the URI includes a `ts` unix-seconds parameter, so a captured header
can't be replayed later. Node can't load OpenSSH keys, so UsageMaxx parses the `openssh-key-v1`
container itself, checks that the public half matches the private seed, and signs with Node's
built-in ed25519. Ollama allows 10 balance requests a minute.

## Not ported

Nothing beyond paths: `~/.ollama` becomes `%USERPROFILE%\.ollama`.
