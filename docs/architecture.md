# Architecture

How UsageMaxx is put together, for people working on the code. For what the app does, see the
[README](../README.md); for the build plan and what's deliberately not built, see
[BUILD_PLAN.md](BUILD_PLAN.md).

## The shape of the app

UsageMaxx is an Electron app with three parts, each built by electron-vite:

- **Main process** (`src/main/`, Node). Owns everything that touches the machine: the tray icon,
  the popup window, provider refreshes, files, the network, and settings.
- **Preload** (`src/preload/index.ts`). Exposes a fixed API as `window.usagemaxx`. It's the only
  bridge between the two sides.
- **Renderer** (`src/renderer/`, React). Draws the popup from the state it's sent and sends back
  user intents. It runs sandboxed with no Node access.

`src/core/` holds the platform-neutral logic both sides share: the metric vocabulary, the
provider contract, formatting and meter math, settings, the refresh engine, and the providers
themselves. Nothing in `src/core/` imports Electron, so it all runs under plain Node in tests.

```
 provider APIs ◄── http ──┐
 credential files ◄── fs ─┤
                          │
              ┌───────────┴────────────┐       state        ┌──────────────────┐
              │ main process            │ ─────────────────► │ renderer (popup) │
              │  RefreshEngine          │                    │  React dashboard │
              │  AppStore (+ settings,  │ ◄───────────────── │                  │
              │   snapshot cache)       │  intents (validated)└──────────────────┘
              │  TrayController ── icon + tooltip
              └─────────────────────────┘
```

## The provider pipeline

Each provider implements `ProviderRuntime` (`src/core/runtime.ts`), following upstream
OpenUsage's design:

1. **Credentials.** Read what the provider's own CLI or app already stored on the machine (or an
   API key the user saved). Tokens are only written back when refreshing an expired OAuth token,
   and then only the token fields change.
2. **Client.** Call the provider's usage API.
3. **Mapper.** Turn the response into `MetricLine`s: `progress` (a bounded meter), `values`
   (unbounded numbers), `badge` (a status pill), or `text`.

Every side effect comes in through `ProviderContext`: environment, paths, HTTP, filesystem, clock,
abort signal, the OS credential store, a command runner, and saved API keys. Tests pass fakes
(`tests/helpers/fakes.ts`), so no test can touch real credentials or the network.

`hasLocalCredentials()` is a cheap, local-only check used by first-run detection.

## Refreshing

`RefreshEngine` (`src/core/refresh.ts`) refreshes every enabled provider in parallel at launch
and every five minutes after the previous pass finishes. A provider that hangs is abandoned
after 120 seconds. A failure keeps the last good snapshot on screen and records the error beside
it. `AppStore` (`src/main/store.ts`) saves the last good snapshots to `snapshots.json`, so the
popup shows real numbers instantly at the next launch. Those cached values still refetch on the
first pass.

## State and settings

`buildAppState` (`src/core/state.ts`) joins each provider's metric descriptors, the user's
settings, and the latest snapshot into one `AppState`. The renderer and tray draw from that alone.
Settings (`src/core/settings.ts`) hold the enabled providers, per-metric overrides (enabled,
on-demand, pinned), and display preferences. They're stored in `settings.json` and parsed
tolerantly, so a corrupt file falls back to defaults.

## The tray and popup

- **Tray icon** (`src/main/trayIcon.ts`). Drawn in code into PNGs at 16, 24, and 32 px, for 100%,
  150%, and 200% scaling. It shows up to two pinned meters as bars, colored by pace, or the app
  mark when nothing is pinned. The tooltip lists every pinned reading (`trayModel.ts`).
- **Popup** (`src/main/popup.ts`). A frameless, always-on-top window kept out of the taskbar and
  Alt+Tab. It opens next to the tray icon on whichever edge the taskbar sits
  (`positioning.ts`), and hides when it loses focus, like the Windows clock and volume flyouts.
- **Dashboard** (`src/renderer/`). One card per enabled provider: its name, plan, spinner, and
  error, warning, or "Outdated" markers, then its always-visible metrics. On-demand metrics and
  quick links sit behind a caret. Rows are built from view models in `src/core/view.ts`, so the
  meter math is tested outside React. Clicking a headline flips Used/Left everywhere; clicking
  a reset label flips countdown/exact time. The footer shows the next update (click to refresh)
  and an options menu. The popup sizes itself to its content up to 600 px, then scrolls.
- **IPC** (`src/core/ipc.ts`). The channel names, the `window.usagemaxx` API, and the validation
  of every settings change. The main process rejects malformed payloads and opens only
  `http(s)` links.

## Where data lives

All under Electron's `userData` folder (`%APPDATA%\UsageMaxx` on Windows):

| File | Contents |
|---|---|
| `settings.json` | Settings |
| `snapshots.json` | Last good snapshot per provider |
| `logs/usagemaxx.log` | App log, rotated past 2 MB. Never contains secrets |

Development runs redirect `userData` into the repo's `.cache/` (`scripts/env.sh`). Demo mode
(`USAGEMAXX_DEMO=1`) uses a separate `demo` subfolder, so sample data never mixes with real data.

## Development hooks

| Variable | Effect |
|---|---|
| `USAGEMAXX_DEMO=1` | Demo providers covering every metric shape, all enabled |
| `USAGEMAXX_USER_DATA=<dir>` | Use `<dir>` as the user-data folder |
| `USAGEMAXX_SMOKE=1` | Print `usagemaxx:ready` once started; keep the popup open on blur |
| `USAGEMAXX_SMOKE_SHOW=1` | Open the popup at startup |
| `USAGEMAXX_THEME=light\|dark` | Force the theme |

`scripts/smoke-launch.mjs` uses these to launch the built or packaged app under Playwright and
screenshot the popup.
