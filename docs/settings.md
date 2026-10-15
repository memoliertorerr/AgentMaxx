# Settings and First Run

How UsageMaxx decides which providers are on, and what each Settings screen does. Behavior
follows OpenUsage's [settings](https://github.com/robinebers/openusage/blob/main/docs/settings.md)
and [provider enablement](https://github.com/robinebers/openusage/blob/main/docs/provider-enablement.md)
docs, adapted to a Windows tray popup.

## First run

A fresh install turns nothing on by itself. The popup opens on a welcome screen that looks for
sign-ins already on this PC: each provider's `hasLocalCredentials()` checks the same files,
Credential Manager entries, saved API keys, and environment variables its refresh reads. It never
contacts a provider. A check that fails or takes over 10 seconds counts as "not found".

- Providers found are listed under **Signed in on this PC** and preselected.
- **Show all providers** lists the rest, unselected.
- **Continue** turns the selection on. **Choose Later** turns nothing on; the dashboard then
  offers **Choose Providers**, which opens Settings → Providers.

Ollama is never found or preselected: its key exists as soon as Ollama runs, whether or not you
use Ollama Cloud, so you turn it on yourself (see [providers/ollama.md](providers/ollama.md)).

Answering the welcome screen records every provider as known (`knownProviders` in
`settings.json`), so it doesn't come back.

## Opening Settings

From the footer's options menu (**Settings**), the tray icon's right-click menu (**Settings**), or
the dashboard's **Choose Providers** button. The back arrow, or **Esc**, goes back one level: a
provider's metrics → the provider list → the dashboard. **Esc** on the dashboard hides the popup.

## Providers

Every provider in registry order, each with a switch and a count of the metrics it shows. Turning a
provider off hides its card and its tray pins but keeps its setup. Click a provider to open its
metrics:

| Column | What it does |
|---|---|
| Pin (★) | Shows the metric in the tray icon (up to two bars) and the tooltip. **Up to 2 pins per provider**; once a provider has two, the other stars are disabled and the limit is shown under the table |
| On demand | Puts the metric behind the card's caret instead of always showing it |
| Show | Shows or hides the metric on the dashboard |

Changes apply at once; the tray icon and tooltip redraw as soon as a pin changes. Defaults follow
upstream's default layout. Providers can't be reordered (drag-to-reorder is Later).

## API Keys

OpenRouter and Z.ai need a key you supply (see [providers/openrouter.md](providers/openrouter.md)
and [providers/zai.md](providers/zai.md)). For each:

- **Status**: Not set, from an environment variable (named), saved in UsageMaxx, or saved and
  used instead of an environment variable.
- **Save** encrypts the pasted key with Windows DPAPI (Electron `safeStorage`) and stores it in
  `%APPDATA%\UsageMaxx\api-keys.json`. If encryption isn't available, nothing is saved; there's no
  plaintext fallback. The provider refreshes at once if it's on.
- **Reveal** shows the key in use (saved, else the environment's) until you hide it or leave the
  screen. It's the only time a key reaches the popup.
- **Clear** deletes the saved key; an environment key, if any, takes over.
- **Get a key** opens the provider's key page.

## General

| Setting | Options | What it does |
|---|---|---|
| Launch at Login | on/off | Registers UsageMaxx with Windows to start when you sign in. Windows' own list is the source of truth, so nothing is stored in settings. Disabled in development runs, which must not register themselves |
| Show Usage As | Used / Left | "48% used" or "52% left"; same as clicking a meter's headline |
| Reset Times | Countdown / Exact Time | "Resets in 3h 25m" or the clock time; same as clicking a reset label |
| Time Format | Auto / 12-Hour / 24-Hour | How exact times read; Auto follows Windows |
| Always Show Pacing | on/off | Shows the projection and even-pace tick on every meter, not only near a limit |
| Theme | System / Light / Dark | The popup's appearance |

## About

The version, links to this repository, its issues, and the original project, and the notice:
"Unofficial Windows port of OpenUsage by Robin Ebers. Not affiliated."

## Where settings live

`%APPDATA%\UsageMaxx\settings.json`, parsed tolerantly: unknown keys are dropped, missing ones get
defaults, and a corrupt file is replaced by defaults instead of crashing the app.

## Not built

- re-detecting providers that a later version adds (upstream's "when an update adds a provider")
- Reset / Reset All Customization, undo, and drag-to-reorder
- upstream's density, transparency, notifications, global shortcut, log level, and update settings
