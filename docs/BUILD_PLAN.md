# UsageMaxx — Windows Port Build Plan (autopilot)

> UsageMaxx is a Windows tray app that shows how much of your AI coding subscriptions you've
> used (Claude, Codex, Cursor, Copilot, …). It is an independent port of
> [robinebers/openusage](https://github.com/robinebers/openusage), a native Swift macOS menu-bar
> app (MIT). The macOS app lives in the menu bar; on Windows the equivalent home is the
> **notification area at the right-hand end of the taskbar** (the system tray), with a popup
> panel that opens above the icon.
>
> **In scope for v0.1:** an Electron + TypeScript (strict) tray app; a dynamic tray icon and
> tooltip for pinned metrics; a popup dashboard with provider cards, progress meters, reset
> countdowns, pace colors, error and stale states; a 5-minute refresh loop with an on-disk
> cache; live quota providers for Claude, Codex, Cursor, Copilot, OpenRouter, Z.ai, Grok,
> Devin, OpenCode Go, and Ollama Cloud; a settings view (providers on/off, pinned metrics, API
> keys, launch at login); CI that tests on Windows, builds the NSIS installer, and takes a
> smoke screenshot on a real Windows runner; README and docs.
>
> **Explicitly NOT in scope** (designed, deferred — see **Later**): local spend tiles (Today /
> Yesterday / 30 Days from CLI logs + the pricing engine), Total Spend card, usage-trend charts,
> Antigravity, multi-account cards (Claude Swap, Codex Swap, pi), Claude Desktop credentials,
> local HTTP API, CLI, auto-update, code signing, notifications, proxy support, global
> shortcut, drag-to-reorder, share screenshots, sync, macOS/Linux release builds.
>
> **The name is never "OpenUsage".** Upstream's
> [TRADEMARK.md](https://github.com/robinebers/openusage/blob/main/TRADEMARK.md) forbids using
> "OpenUsage" as the name of a fork or derivative and forbids its logo. The product is
> **UsageMaxx**, with its own icon, and says plainly that it is an unofficial port.
>
> **Autopilot:** one step = one commit, made by Claude only when verify is green. One phase =
> one pull request into the previous phase's branch (phase 1 into `main`), reviewed and merged
> by the human. Claude stops at checkpoints and at any stop condition. In the session that
> wrote this plan, the user authorized running every phase back to back; later sessions stop
> at each phase end unless told otherwise.

---

## Progress Tracker

> Each session flips its own row to ✅ in the same commit as the step's change. Read this table
> at the start of a session to know where to resume. `auto` steps run back to back;
> `checkpoint` steps end with a stop for a human check.

| Step | Scope | Model | Gate | Status |
|------|-------|-------|------|--------|
| UM0 | Scope docs: this plan, `CLAUDE.md` standing instructions, `LICENSE` + `NOTICE` | Opus | auto | ✅ done |
| UM1 | Scaffold Electron + electron-vite + React + TS strict; CI running verify on Ubuntu + Windows | Opus | auto | ✅ done |
| UM2 | Core contract: metric types, provider runtime, errors, HTTP, Windows paths, formatting | Opus | auto | ✅ done |
| UM3 | Refresh engine, snapshot cache, settings store | Opus | auto | ✅ done |
| UM4 | Tray + popup window + positioning + dynamic tray icon + demo provider (first runnable) | Opus | auto | ✅ done |
| UM5 | Dashboard UI: provider cards, meters, pace colors, resets, errors, footer | Opus | auto | ✅ done |
| UM6 | Providers: Claude + Codex | Opus | auto | ✅ done |
| UM7 | Providers: Cursor + Copilot (incl. Windows Credential Manager reader) | Opus | auto | ✅ done |
| UM8 | Providers: OpenRouter + Z.ai + encrypted API-key storage | Sonnet | auto | ⬜ todo |
| UM9 | Providers: Grok + Devin + OpenCode Go + Ollama Cloud | Opus | auto | ⬜ todo |
| UM10 | Settings view: providers, pins, API keys, launch at login, first-run welcome | Sonnet | auto | ⬜ todo |
| UM11 | Windows packaging in CI: NSIS installer artifact + smoke screenshot on `windows-latest` | Sonnet | auto | ⬜ todo |
| UM12 | README, user + developer docs, upstream/PR notes, final `CLAUDE.md` pass | Sonnet | checkpoint | ⬜ todo |

**Overall status: Phases 1–2 (UM0–UM7) done; PR #1 (phase 1 → main) and the phase-2 PR (→ um/p1-foundation) are open. Next is phase 3 from UM8 (OpenRouter + Z.ai). The sequence goes
foundation → first runnable tray app with demo data at UM4 → dashboard and real providers →
settings → Windows installer → docs, ending at a human checkpoint on a real Windows PC.**

**Model note:** phases 1 and 2 need the stronger model: UM2 (contract) and UM3 (refresh
engine) shape every later step, UM4 is the likeliest spike (tray rendering and popup
positioning differ by taskbar edge and DPI), and Claude/Codex/Cursor carry the most upstream
nuance (token refresh, window classification, Connect RPC). Phase 3 mixes UM9 (Ollama's
OpenSSH key parsing and signing) with mechanical work, so it also runs on Opus; phase 4 is
mechanical (CI packaging, docs) and fits Sonnet.

**Phases** — one pull request each, stacked:
1. **UM0 → UM4** · Opus · branch `um/p1-foundation` → PR into `main` — review the contract
   shapes (`src/core/types.ts`), the refresh rules, and the demo screenshot.
2. **UM5 → UM7** · Opus · branch `um/p2-dashboard` → PR into `um/p1-foundation` — review the
   dashboard screenshots and the Claude/Codex/Cursor/Copilot mapper fixtures.
3. **UM8 → UM10** · Opus · branch `um/p3-providers-settings` → PR into `um/p2-dashboard` —
   review API-key handling (DPAPI, never plaintext) and the settings screenshots.
4. **UM11 → UM12** · Sonnet · branch `um/p4-ship` → PR into `um/p3-providers-settings` —
   review the Windows CI screenshot, the installer artifact, and the README. Ends in the human
   Windows checks.

**Merging stacked PRs:** merge them in order (phase 1 first) with **Create a merge commit**,
not squash. When phase 1's branch is deleted on merge, GitHub retargets phase 2's PR to
`main` automatically; then merge that, and so on.

Never start a phase with uncommitted changes in the tree.

---

## How To Run This

1. Open a **new session** in `/Users/memoli/Storage/CS/OpenUsageMaxx` on the model the next
   phase names. `CLAUDE.md` auto-loads.
2. **Paste the Opening prompt.** It reports which phase is next and waits.
3. **Paste the Phase prompt** with that phase's step range, and say go.
4. The session runs each step: does the work, runs `npm run verify`, ticks its tracker row,
   and commits — one commit per step, only when green. It stops at a checkpoint, at the end of
   the phase, or at any stop condition, and reports.
5. At the end of the phase it pushes and opens the PR. You review it, do the checks under
   **Needs human check**, and merge — or reply with fixes.

### Opening prompt — every session

```text
You are building UsageMaxx, a Windows system-tray app that shows AI coding subscription usage
(an unofficial Electron + TypeScript port of the macOS app robinebers/openusage), in
/Users/memoli/Storage/CS/OpenUsageMaxx.
Before any work:
1. Read CLAUDE.md and docs/BUILD_PLAN.md in this repo, in full.
2. Run `git status`, `git branch --show-current`, and `git log -1 --oneline`. Confirm the tree
   is clean. Find the next phase in the tracker; if its branch doesn't exist yet, create it
   from the previous phase's branch (phase 1: from main) as "0. Before Starting" shows, and
   push it with -u. Paste the output.
3. Run `node --version` (needs 22+) and `gh auth status`. If node_modules/ is missing, run the
   install command from CLAUDE.md → Commands (it keeps every cache inside the repo).
4. Restate, in one line each, the rules you will not break this session:
   (a) you commit only when `npm run verify` is green, one commit per step, never on main;
   (b) you never force-push, rewrite pushed history, or merge your own PR;
   (c) you stop at checkpoints, at the end of the phase, and at every stop condition in
       Ground Rules — list them;
   (d) you never read, write, or install anything outside this repo directory;
   (e) the product name is UsageMaxx, never "OpenUsage", and no upstream logo is used.
5. Read the Progress Tracker and tell me which phase is next and which steps it covers.
Then wait for me to say go.
```

### Phase prompt

```text
Execute steps UM<a> → UM<b> from docs/BUILD_PLAN.md, in order, on the phase's branch.

For each step:
1. Read the step's prompt in the plan and follow it exactly. Do not start work the prompt
   doesn't ask for; record anything out of scope under "Deferred follow-ups".
2. Run its verify. If green: flip its tracker row to ✅, add implementation notes under the
   step if anything differed from the prompt, and commit everything as one commit with the
   step's commit message.
3. Paste a short report: the verify output and `git log -1 --stat`.
4. If the step's gate is `checkpoint`, push, update the PR, tell me exactly what to check,
   and stop. If it is `auto`, continue to the next step.

Stop immediately at any stop condition in Ground Rules and tell me which one.
After the last step of the range: push the branch, open the PR into the previous phase's
branch (phase 1: main) using the PR description template, wait for CI with
`gh pr checks --watch`, report the result, then stop.
```

### PR description template

```markdown
## UsageMaxx — phase <n>: <phase name>

Steps: UM<a> → UM<b> (plan: docs/BUILD_PLAN.md) · Stacked on: <base branch / PR link>

| Step | Commit | Verify evidence |
|---|---|---|
| UM<a> | <short sha> <message> | <command → result, one line> |

### Implementation notes
- <what differed from the prompts, and why>

### Added to Deferred follow-ups
- <item, or "none">

### Needs human check
- [ ] <exactly what to look at, and where — or "nothing beyond the diff">
- [ ] Nothing regressed: <the specific features to re-check>
```

### Who verifies what

| Check | Who | "Green" looks like |
|---|---|---|
| `npm run verify` (typecheck + unit tests) | Claude | No errors, every test passes |
| Provider mappers | Claude | Fixture responses shaped like upstream's produce the exact metric lines asserted in tests |
| Popup renders with demo data (macOS dev run) | Claude | A Playwright screenshot of the popup window, looked at by the session |
| CI on every PR | CI | `verify (ubuntu-latest)` and `verify (windows-latest)` green; from UM11 also `package (windows-latest)` with installer + screenshot artifacts |
| Windows smoke screenshot | Claude (via CI) | Downloaded from the run and looked at: the popup rendered by the packaged `.exe` on Windows |
| **Nothing regressed** | Claude, then you in each PR | Demo-mode screenshot still shows every metric shape (percent / dollars / count progress, values, badge, error, outdated) |
| Tray icon position, overflow, DPI | **you** — UM12 checkpoint | On your Windows PC the icon sits in the notification area (bottom right); pinned bars are legible at 100% and 150% scaling; the popup opens above the icon and hides on click-away |
| Live provider data | **you** — UM12 checkpoint | With your own logins on Windows, each provider you use shows the same numbers as its own dashboard |
| Installer UX | **you** — UM12 checkpoint | SmartScreen warning is expected (unsigned); install, launch at login, and uninstall all work |

Claude self-verifies everything that runs headlessly: types, tests, the macOS dev build, and
the Windows CI build and screenshot. Anything needing a Windows desktop, real logins, or a
physical display is the human's, collected at the UM12 checkpoint.

---

## Ground Rules

1. **Branches:** one per phase (`um/p1-foundation`, `um/p2-dashboard`,
   `um/p3-providers-settings`, `um/p4-ship`), each cut from the previous phase's branch;
   phase 1 from `main`. Tag `pre-windows-port` marks `85f1b20`, the `main` commit before this
   plan. Claude never commits to `main`.
2. **One step = one commit**, message prefixed `um-step-N:`, made **only when
   `npm run verify` is green.** Never commit red. Plain `git` commands, `git status` review
   before staging, no AI attribution anywhere.
3. **Push and PR:** Claude pushes the phase branch at checkpoints and phase ends and opens the
   phase PR with `gh pr create`. It never force-pushes, never rewrites pushed history, and
   never merges its own PR.
4. **Never weaken verification** to get green — no skipped tests, loosened assertions, new
   `@ts-ignore`/`eslint-disable`, or swallowed errors.
5. **Stay inside the repo.** Every install, cache, download, and build output lives under this
   directory (`.cache/`, `node_modules/`, `out/`, `dist/`, `test-results/`). Never read the
   user's real credential files during development — tests use fixtures.
6. **Port behavior, not code.** Upstream is Swift; read it with
   `git show upstream/main:<path>` and its docs to learn endpoints, headers, field names, and
   edge cases, then write idiomatic TypeScript. Protocol facts (URLs, headers, OAuth client IDs,
   field names) are copied exactly. Credit upstream in `NOTICE`. Pane (ItsJazii/pane, MIT) may
   be consulted for Windows facts such as credential paths; don't copy its code.
7. **Providers never wipe good data.** A failed refresh keeps the last good snapshot and adds
   an error flag; "No data" is shown instead of invented zeros (upstream `docs/refreshing.md`).
8. **Credentials are read-only, except token refresh.** Providers write back a refreshed OAuth
   token only where upstream does (Claude Code, Codex, Grok), preserving every other field,
   atomically (temp file + rename).
9. **Fail loudly, show friendly errors.** Log the technical reason (never a secret) to the app
   log; show the user a short message. No silent fallbacks that hide real problems.
10. **Dependencies are the ones the step prompt names.** Anything else is a stop condition.
11. **Files under ~500 lines**, TypeScript `strict`, no `any` without a comment saying why.
12. **Every step:** update `CLAUDE.md`, this tracker, and any doc under `docs/` the step made
    stale, in the same commit.

### Stop conditions

Claude stops, reports which condition fired, and waits:

- Verify is still red after two honest fix attempts.
- Getting green would mean weakening verification (Ground Rule 4).
- The step needs something outside its prompt — a file it didn't name that belongs to another
  step, a dependency it didn't name, a design decision listed under Design Decisions.
- The diff is much larger than the step implies (rough guide: over ~2,500 added lines
  excluding lockfiles and fixtures).
- The prompt contradicts the code (a named file or interface doesn't exist as described).
- Anything destructive or irreversible, or any CI change beyond what the step prompt asks for.
- Windows CI fails in a way that can't be reproduced or reasoned about from the log after two
  attempts.
- A checkpoint step, or the end of the phase (unless the session was told to run on).

### Rollback

| Situation | Command |
|---|---|
| Step wrong, not yet committed | `git status`, then `git restore . && git clean -fd` |
| A committed step is bad | `git revert <sha>` (each step is one green commit, so this is clean) |
| A whole phase is bad, PR not merged | Close the PR; `git reset --hard <phase-start-sha>` locally, then push with `--force-with-lease` — **the human runs this**, never Claude |
| Abandon the whole thing | Close the PRs, delete the `um/*` branches; `pre-windows-port` (`85f1b20`) marks where it started |

---

## 0. Before Starting

Ran once while writing this plan:

```bash
cd /Users/memoli/Storage/CS/OpenUsageMaxx
git remote add upstream https://github.com/robinebers/openusage.git   # read-only reference
git fetch upstream
git tag pre-windows-port 85f1b20
git switch -c um/p1-foundation && git push -u origin um/p1-foundation
```

Each later phase, from the finished previous phase branch:

```bash
git switch um/p<n-1>-<name> && git pull --ff-only
git switch -c um/p<n>-<name> && git push -u origin um/p<n>-<name>
```

---

## Design Decisions Already Made

Do not redesign these mid-plan; a step that seems to require it is a stop condition.

- **Electron + TypeScript, not Tauri/Rust or .NET.** The user prefers TypeScript; Electron runs
  the same UI on macOS for local development and screenshots, has a first-class Windows `Tray`
  API, and packages with electron-builder. Tauri would be lighter but needs a Rust toolchain
  (installed outside the repo, multi-GB build dirs on a nearly full disk).
- **Standalone project, not an upstream PR.** Upstream maintainers have declined Windows
  support repeatedly (issues #374, #1064, #1043; PRs #435, #457, #458, #459, #532, #957 all
  closed), and their policy auto-closes PRs without an approved, assigned issue. See
  `docs/upstream.md` (UM12).
- **Main process owns all I/O.** Providers, file reads, HTTP, and the cache run in the Electron
  main process. The renderer only renders state pushed over IPC and sends user intents.
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **`src/core/` is platform-neutral and Electron-free.** Types, formatting, providers, and pure
  helpers import nothing from `electron`, so vitest runs them under plain Node. Path resolution
  takes an injected `{ env, homedir, platform }`, so Windows paths are unit-tested on macOS.
- **The metric vocabulary mirrors upstream's `MetricLine`:** `progress` (used/limit/format
  percent|dollars|count, resetsAt, periodDurationMs), `values`, `badge`, `text`. (`chart` is
  deferred with the spend tiles.)
- **Tray icon is rendered in code.** A pure function draws up to two pinned meters as bars and
  encodes a PNG at 16/24/32 px, so it's unit-testable and DPI-aware. No image dependencies.
- **API keys are stored encrypted** with Electron `safeStorage` (DPAPI on Windows) in the app's
  user-data folder, with env vars as fallback. No plaintext fallback.
- **SQLite via `node:sqlite`** (read-only) when the bundled Electron provides it; otherwise
  `sql.js`. Decided in UM7 by checking the installed Electron.
- **Stacked phase PRs** merged in order with merge commits (see Phases).

---

## Steps

### UM0 — Scope docs · Opus · auto

**Verify:** `docs/BUILD_PLAN.md`, updated `CLAUDE.md`, `LICENSE`, and `NOTICE` exist; tag
`pre-windows-port` points at `85f1b20`; branch `um/p1-foundation` exists on origin.
**Commit:** `um-step-0: add Windows port build plan, standing instructions, license`

```text
(Executed while writing the plan.) Write docs/BUILD_PLAN.md, extend CLAUDE.md with the
project description, stack, structure, commands, and conventions, add an MIT LICENSE with the
user's copyright, and a NOTICE crediting robinebers/openusage (MIT) and stating the trademark
position. Tag pre-windows-port at 85f1b20 and create um/p1-foundation from main.

There is no npm project yet, so verify is the file check in the Verify line. Flip UM0 to ✅
and commit everything as one commit: "um-step-0: add Windows port build plan, standing
instructions, license". Paste `git log -1 --stat`.
```

---

### UM1 — Scaffold + CI · Opus · auto

**Verify:** `npm run verify` green (typecheck + a passing test); `npm run build` produces
`out/main/index.js`, `out/preload/index.mjs` or `.js`, `out/renderer/index.html`;
`node scripts/smoke-launch.mjs` prints `launched` (Electron starts, the tray exists, the app
quits cleanly); `.github/workflows/ci.yml` exists with `verify` on `ubuntu-latest` and
`windows-latest`.
**Commit:** `um-step-1: scaffold Electron + TypeScript tray app with CI`

```text
Scaffold UsageMaxx in /Users/memoli/Storage/CS/OpenUsageMaxx. Read CLAUDE.md first; every
npm/electron command must use the cache env vars it lists so nothing is written outside the
repo.

Create:
- package.json: name "usagemaxx", productName "UsageMaxx", version 0.1.0, private, MIT,
  main "out/main/index.js", engines node >=22. Scripts: dev (electron-vite dev), build
  (electron-vite build), typecheck (tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p
  tsconfig.web.json), test (vitest run), verify (npm run typecheck && npm run test),
  dist:win (electron-vite build && electron-builder --win nsis --x64 --publish never).
- Dependencies (exactly these): react, react-dom. Dev: electron, electron-vite, vite,
  @vitejs/plugin-react, typescript, vitest, @types/node, @types/react, @types/react-dom,
  electron-builder, playwright-core (drives Electron directly; never download browsers).
  Pin the exact versions npm resolves today.
- electron.vite.config.ts with main (src/main/index.ts), preload (src/preload/index.ts), and
  renderer (src/renderer/index.html) entries.
- tsconfig.json (references), tsconfig.node.json (src/main, src/preload, src/core, tests),
  tsconfig.web.json (src/renderer + src/core, jsx react-jsx, DOM lib). strict,
  noUncheckedIndexedAccess, noImplicitOverride.
- vitest.config.ts covering src/**/*.test.ts and tests/**/*.test.ts, environment node.
- src/main/index.ts: single-instance lock; app.whenReady → Tray with a placeholder 16x16
  icon generated in code, tooltip "UsageMaxx", context menu with Quit. Hide the dock icon on
  macOS (app.dock?.hide()) so the dev run behaves like a tray app. When USAGEMAXX_SMOKE=1,
  log "usagemaxx:ready" once the tray exists. No window yet — UM4 owns windows so its
  positioning diff stays reviewable.
- src/preload/index.ts: empty contextBridge placeholder. src/renderer/index.html + main.tsx.
- electron-builder.yml: appId "dev.usagemaxx.app", productName UsageMaxx, win target nsis
  x64, nsis oneClick false, perMachine false, allowToChangeInstallationDirectory true,
  directories.output "dist", files limited to out/** and package.json.
- .gitignore: node_modules, out, dist, .cache, *.log, coverage, test-results.
- tests/smoke.test.ts: a trivial unit test.
- scripts/smoke-launch.mjs: playwright-core `_electron.launch({ args: ['.'], env: {...,
  USAGEMAXX_SMOKE: '1'} })`, waits for "usagemaxx:ready" on stdout (30 s timeout), prints
  "launched", closes. Needs a display; not part of verify.
- .github/workflows/ci.yml: on push to main, push to um/**, and pull_request. Job `verify`
  with matrix os [ubuntu-latest, windows-latest]: actions/checkout@v4,
  actions/setup-node@v4 (node 22, cache npm), npm ci, npm run verify. No packaging yet (UM11).

Do NOT add providers, windows, IPC, or UI beyond the placeholder — later steps own those. If
electron's postinstall can't download its binary, that is a stop condition: report the exact
error rather than switching tools.

Run npm run verify, npm run build, and node scripts/smoke-launch.mjs. Update CLAUDE.md
(Commands, File structure). If green, flip UM1 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-1: scaffold Electron + TypeScript tray app with CI". Paste
the verify output and `git log -1 --stat`. If it is still red after two honest fix attempts,
stop and report — never commit red, never weaken a check to get green.
```

**Implementation notes (2026-10-15):**

- **Electron 44 has no postinstall.** It downloads its binary on first use, so `npm install`
  alone leaves no `dist/`. `node node_modules/electron/install.js` with `scripts/env.sh`
  sourced fetches it into `.cache/electron`. In CI, the first `electron` invocation downloads it.
- **Electron 44.7.2 bundles Node 24.21.0, and `node:sqlite` loads under it.** That settles the
  UM7 SQLite decision in favor of `node:sqlite`; `sql.js` won't be needed.
- **TypeScript is pinned to 6.0.3, not 7.x.** 7.x is the new native compiler; 6.x is the safer
  gate for a strict typecheck.
- **React is a devDependency, not a dependency.** Vite bundles it into the renderer, so the
  packaged app ships no `node_modules`.
- **Configs are `.mts`, and `package.json` stays CommonJS.** Vite warned about ESM syntax in a
  `.ts` config loaded as CommonJS. Adding `"type": "module"` would make preload ESM, which
  sandboxed preloads can't load.
- **The PNG encoder (`src/core/png.ts`) landed here instead of UM4**, because the placeholder
  tray icon needed one. It has real tests, which replace the trivial `tests/smoke.test.ts`.
- **CI uses `actions/checkout@v7` and `actions/setup-node@v7`** (current majors), on Node 24.
- **The dev app writes user data under `.cache/user-data`** via `USAGEMAXX_USER_DATA`. macOS
  itself may still record standard app state for Electron.app under `~/Library`; that's outside
  the app's control.

---

### UM2 — Core contract · Opus · auto

**Verify:** `npm run verify` green with unit tests for: Windows path resolution (USERPROFILE,
APPDATA, LOCALAPPDATA, CLAUDE_CONFIG_DIR, CODEX_HOME overrides, using an injected env on
macOS); formatting (percent, dollars incl. `$2.06K`, counts with suffix, `Resets in 3h 25m`,
`Resets in 2d 4h`); progress math (used/left, clamp 0–100) and the pace verdict
(ok / warn / over per upstream `docs/dashboard.md` "Rows"); the error-snapshot factory.
**Commit:** `um-step-2: core metric contract, provider runtime, paths, formatting`

```text
Build the platform-neutral core under src/core/. No `electron` imports anywhere in
src/core — vitest runs it under plain Node.

Read upstream first (git show upstream/main:<path>):
- Sources/OpenUsage/Models/MetricLine.swift, MetricValue.swift, ProviderSnapshot.swift,
  Provider.swift, MetricKind.swift
- Sources/OpenUsage/Providers/ProviderRuntime.swift, ErrorCategory.swift,
  ProviderAuthRetry.swift
- docs/adding-a-provider.md, docs/refreshing.md, docs/dashboard.md ("Rows")

Create:
- src/core/types.ts — discriminated unions mirroring upstream: ProgressFormat
  ({kind:'percent'}|{kind:'dollars'}|{kind:'count',suffix}), MetricValue
  ({number, kind:'percent'|'dollars'|'count', label?, estimated?}), MetricLine
  (progress | values | badge | text, each with `label`; progress has used, limit, format,
  resetsAt? ISO string, periodDurationMs?), ProviderSnapshot (providerId, displayName, plan?,
  lines, refreshedAt ISO, warning?), ProviderInfo (id, displayName, brandColor, links ≤2),
  MetricDescriptor (id = the line label, label, defaultEnabled, defaultOnDemand,
  defaultPinned), and ProviderRuntime { info; metrics; refresh(ctx); hasLocalCredentials(ctx) }.
  ProviderContext = { env, paths, http, fs, log, now, signal, secrets, exec } — every side
  effect injected so providers test with fakes.
- src/core/errors.ts — ProviderError(category, userMessage, detail?) with categories
  'notLoggedIn' | 'authExpired' | 'network' | 'rateLimited' | 'invalidResponse' | 'noApiKey'
  | 'timeout' | 'other'; toProviderError(unknown).
- src/core/paths.ts — resolvePaths({ env, homedir, platform }) → { home, appData,
  localAppData, join } using path.win32 or path.posix based on the injected platform. On
  win32: appData = env.APPDATA ?? <home>\AppData\Roaming, localAppData = env.LOCALAPPDATA ??
  <home>\AppData\Local. On other platforms appData = ~/Library/Application Support (darwin)
  or ~/.config, so the macOS dev run still resolves something sensible.
- src/core/http.ts — HttpClient interface + nodeHttpClient over global fetch with
  AbortSignal.any([signal, AbortSignal.timeout(ms)]); returns {status, headers, text, json()}.
  Network failures → ProviderError('network'); timeouts → 'timeout'.
- src/core/fs.ts — FileSystem interface (readText, writeTextAtomic, exists, stat) + Node impl.
- src/core/format.ts — formatPercent, formatDollars (compact K/M at ≥1,000), formatCount,
  formatCountdown(resetsAt, now) ("Resets in 3h 25m", "Resets in 2d 4h", "Resets in 5m",
  "Resetting…"), formatAbsoluteReset, formatAge ("3m ago").
- src/core/progress.ts — usedPercent, leftPercent, clamp, paceVerdict(line, now): with a
  reset and periodDurationMs, project usage at reset from the elapsed share of the window
  (only once ≥5% of the window has elapsed and something is used) → 'ok' (≥10% spare),
  'warn' (<10% spare but >0), 'over' (projected ≥ limit); without that, color by level
  ('warn' at ≥80% used, 'over' at ≤10% left or exhausted).
- Tests next to each file (*.test.ts) covering the Verify line.

Do NOT build the refresh loop, cache, or any provider — UM3 and later. Keep files small;
this is the contract every step builds on, so prefer clarity over cleverness. Where an
upstream concept doesn't map cleanly, choose the TypeScript shape and record it in
CLAUDE.md → Conventions.

Run npm run verify. Update CLAUDE.md. If green, flip UM2 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-2: core metric contract, provider runtime, paths,
formatting". Paste the verify output and `git log -1 --stat`. If it is still red after two
honest fix attempts, stop and report — never commit red, never weaken a check to get green.
```

**Implementation notes (2026-10-15):**

- **Error categories use upstream's names** (`notLoggedIn`, `authExpired`, `authInvalid`,
  `credentialAccess`, `network`, `decoding`, `http4xx`, `http5xx`, `rateLimited`,
  `notAvailable`, `other`) plus `timeout`, instead of the prompt's shorter list. A missing API
  key maps to `notLoggedIn`, as upstream does.
- **Providers throw instead of returning an error snapshot.** Upstream encodes failures as an
  "Error" badge snapshot; here `refresh()` throws `ProviderError` and the engine (UM3) keeps the
  last good snapshot beside the error. So there's no error-snapshot factory; `toErrorInfo`
  normalizes anything thrown, and `makeSnapshot` builds successes.
- **The contract file is `src/core/runtime.ts`** (ProviderRuntime + ProviderContext), separate
  from `types.ts`. Types and errors stay Node-free so the renderer can import them.
- **Compact dollars keep one decimal (`$2.1K`), not two.** That follows upstream's actual
  `MetricFormatter` code (`fractionLength(0...1)`). The `$2.06K` example in upstream's
  dashboard doc doesn't match its code.
- **`progress.ts` ports upstream's full meter state machine** (`WidgetData.meterState`): spent →
  pace verdict (healthy / closeToLimit / runningOut with a run-out time) → absolute bands at
  80% / 90% used. It also ports the "Not started" session rule (`SessionStartSignal`). This is
  more than the prompt's ok/warn/over sketch, so the UI matches upstream exactly.
- **Added `src/core/parse.ts`** (upstream `ProviderParse` + ISO date normalization) and
  `tests/helpers/fakes.ts` (`MemoryFileSystem`, `FakeHttp`, `fakeContext()`) for the provider
  steps.
- **`gh` defaulted to `upstream`.** With the `upstream` remote present, `gh run list` listed
  robinebers/openusage runs. Fixed with `gh repo set-default memoliertorerr/OpenUsageMaxx`;
  commands also pass `--repo`. Added to Landmines.

---

### UM3 — Refresh engine, cache, settings · Opus · auto

**Verify:** `npm run verify` green with tests proving: providers refresh in parallel; one
hanging provider times out at 120 s (fake timers) without blocking the others; a failed refresh
keeps the previous good lines and records the error; cached snapshots load at start and are
marked as from a previous session so the first pass refetches; enabling a provider refreshes it
immediately; settings round-trip through a JSON file, defaulting missing keys and surviving a
corrupt file.
**Commit:** `um-step-3: refresh engine, snapshot cache, settings store`

```text
Build the state layer the tray and UI read. Pure logic goes in src/core/; Electron glue in
src/main/.

Read upstream: docs/refreshing.md (whole file), docs/provider-enablement.md, docs/settings.md.

Create:
- src/core/refresh.ts — RefreshEngine(registry, deps): per-provider state { snapshot?,
  lastSuccessAt?, refreshing, error?: {message, category}, fromPreviousSession }.
  refreshAll({force}) runs enabled providers in parallel, each wrapped in a 120 s timeout
  (error 'timeout', message "Refresh timed out after 120s"); refreshOne(id). A failure keeps
  the last good lines (Ground Rule 7). start() schedules every 5 minutes via an injected
  scheduler; nextRefreshAt exposed. Emits 'change' with an immutable snapshot of state.
- src/core/cache.ts — SnapshotCache: load/save last good snapshots per provider to a JSON
  file (path injected, writes atomic). Never cache errors.
- src/core/settings.ts — Settings + defaults: enabledProviders (string[] | null = not chosen
  yet), metricPrefs per provider { enabled?: string[], onDemand?: string[], pinned?: string[] }
  (null-ish = use descriptor defaults), expandedProviders, displayMode 'used'|'left',
  resetMode 'countdown'|'absolute', launchAtLogin, version. loadSettings/saveSettings with
  tolerant parsing (unknown keys dropped, missing keys defaulted, corrupt file logged and
  replaced by defaults — never crash). Pin rule helper: ≤2 per provider, ≤4 overall for the
  tray, in provider order.
- src/core/state.ts — AppState for the renderer: providers[] (info, metrics with resolved
  enabled/onDemand/pinned, snapshot, refreshing, error, stale = last success older than
  2 refresh intervals or fromPreviousSession with no success yet), settings, nextRefreshAt,
  version. buildAppState(engine, settings, now) is pure.
- src/main/store.ts — wires engine, cache, settings to app.getPath('userData'); saves the
  cache after each batch (debounced 1 s); exposes getState() and subscribe().
- Tests with fake timers and fake providers for every Verify behavior.

Do NOT create windows, tray changes, or IPC (UM4), or real providers.

Run npm run verify. Update CLAUDE.md. If green, flip UM3 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-3: refresh engine, snapshot cache, settings store". Paste
the verify output and `git log -1 --stat`. If it is still red after two honest fix attempts,
stop and report — never commit red, never weaken a check to get green.
```

**Implementation notes (2026-10-15):**

- **Settings follow upstream's enablement model.** That means `enabledProviders` (null until
  the first-run answer) plus `knownProviders`, so a provider added in a later version can be
  told apart from one the user switched off.
- **More display preferences than the prompt listed.** Settings also hold `timeFormat`,
  `alwaysShowPacing`, and `theme`; each is cheap and documented in upstream `settings.md`.
  Launch at login is not stored: the OS login-item registry is the source of truth, as upstream.
- **Pin rules live as pure helpers in `settings.ts`** (`togglePin`, `setMetricFlag`,
  `setProviderEnabled`), so UM10's UI only calls them. The tray draws at most two bars; the
  tooltip lists every pin (UM4).
- **Without `force`, a pass skips providers refreshed within 90% of the interval.** That way a
  provider enabled a minute before the timer doesn't double-fetch. Manual refreshes force.
- **Staleness is the snapshot's age (over two intervals, about ten minutes)**, matching upstream's
  "Outdated" rule. It isn't a separate "from previous session" flag. The flag still exists and
  forces the first pass to refetch cached providers.
- **Added `src/main/log.ts` (file logger) and `src/main/context.ts` (the real ProviderContext)**,
  which the store needs. Credential Manager secrets and API keys are empty stubs until UM7 and UM8.
- **Fixed before commit:** an operator-precedence slip in the log rotation check
  (`size ?? 0 > MAX`) that would have rotated the log on every launch.

---

### UM4 — Tray, popup, positioning, demo provider (first runnable) · Opus · auto

**Verify:** `npm run verify` green, including tests for `computePopupPosition` (taskbar at
bottom/top/left/right, a secondary monitor with negative coordinates, popup clamped inside the
work area, auto-hide taskbar) and `renderTrayIcon` (PNG signature, requested size, bar length
proportional to usage). With demo data, `node scripts/smoke-launch.mjs --screenshot` saves
`test-results/popup-demo.png`, which the session opens and describes.
**Commit:** `um-step-4: tray icon, popup window, demo provider`

```text
Make the app runnable end to end with fake data.

Create:
- src/main/positioning.ts — pure computePopupPosition({ trayBounds, display: {bounds,
  workArea}, size, margin }) → {x, y}. Taskbar edge = the side where workArea is inset from
  bounds; if none (auto-hide), infer the edge from where the tray icon sits. Anchor the popup
  next to the tray icon on that edge, clamp fully inside the workArea. When trayBounds is
  empty (Linux/some macOS cases) use the cursor point.
- src/main/trayIcon.ts — pure renderTrayIcon({ meters: Array<{fraction 0..1, tone
  'ok'|'warn'|'over'}>, size }) → PNG Buffer, with a minimal PNG encoder (zlib deflate +
  CRC32, RGBA, no dependencies). Up to 2 horizontal bars with a track; with no pinned data
  draw the app mark (a simple geometric "U" gauge). buildTrayImage() → nativeImage with
  16/24/32 px representations (scaleFactor 1, 1.5, 2).
- src/main/popup.ts — frameless BrowserWindow (360 wide, height 560), show:false,
  skipTaskbar, alwaysOnTop, resizable false, fullscreenable false, hides on blur, toggled by
  tray click; webPreferences: preload, contextIsolation, sandbox, no nodeIntegration.
- src/main/tray.ts — Tray with the rendered icon; tooltip with pinned metrics as text, one
  provider per line ("Claude: Session 42% · Weekly 18%"), truncated to 127 chars (Windows
  limit); left click toggles the popup; right click menu: Refresh Now, Quit UsageMaxx.
- src/core/ipc.ts (channel names + payload types) + src/main/ipc.ts + src/preload/index.ts:
  state push (main→renderer), and invoke channels refresh, refreshProvider, setSettings
  (partial, validated), openExternal (https only), hidePopup, quit. Validate every renderer
  payload in main; reject anything malformed with a logged error.
- src/core/providers/demo/index.ts — demo providers (only when USAGEMAXX_DEMO=1) returning
  fixed snapshots that cover every shape: percent progress with reset + period, dollars
  progress, count progress, values, badge, an erroring provider, and one marked stale.
- Minimal renderer listing providers and lines as plain text (UM5 makes it look right).
- scripts/smoke-launch.mjs: --screenshot opens the popup at startup (USAGEMAXX_SMOKE_SHOW=1)
  and saves the popup window to test-results/popup-demo.png; --exe <path> launches a packaged
  executable instead of '.' (used by UM11).
- docs/architecture.md: process model, data flow, file map.

Do NOT style the dashboard (UM5) or add real providers (UM6+). If tray behavior on macOS
differs from Windows docs, keep Windows correct and note the macOS difference in
CLAUDE.md → Landmines rather than special-casing it.

Run npm run verify, then node scripts/smoke-launch.mjs --screenshot, and look at the
screenshot. Update CLAUDE.md. If green, flip UM4 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-4: tray icon, popup window, demo provider". Paste the
verify output and `git log -1 --stat`. If it is still red after two honest fix attempts, stop
and report — never commit red, never weaken a check to get green.
This ends phase 1: push the branch, open the PR into main using the PR description template,
wait for CI, then stop (unless told to run on).
```

**Implementation notes (2026-10-15):**

- **The tray's pure parts live in `src/main/trayModel.ts`.** `trayMeters` and `trayTooltip`
  sit there, separate from `tray.ts`, because `tray.ts` imports Electron and so can't be unit
  tested under Node.
- **`ProviderState` moved from `refresh.ts` to `state.ts`, and `ProviderEntry` was added to
  `types.ts`.** `tsc` follows type-only imports, so `state.ts` → `refresh.ts` → `runtime.ts` →
  `fs.ts` pulled `node:fs` into the renderer typecheck, which has no Node types.
- **Added a `navigate` IPC event** (tray menu → Settings) instead of overloading the state
  message. `View` is `'dashboard' | 'settings'`.
- **Demo mode stores data in `<userData>/demo` and pre-enables every demo provider.** Demo ids
  are `demo-*`. Each smoke run uses a fresh profile under `test-results/`, so screenshots are
  reproducible.
- **The renderer ships a CSP** (`script-src 'self'`), and the main process blocks navigation and
  `window.open`.
- **Popup height comes from the renderer** (`resizePopup`), clamped to 160–600 px; content
  beyond that scrolls (UM5).
- **Verified:** `npm run verify` (113 tests) and a macOS Playwright screenshot of the demo
  popup, which shows every provider, formatting, the "Outdated" flag, and the error message.
  It's unstyled (dark-on-dark text); UM5 styles it. **Not verified:** the Windows tray click
  and positioning (UM11 runs it on Windows; the human checks at UM12).

---

### UM5 — Dashboard UI · Opus · auto

**Verify:** `npm run verify` green; demo screenshots (light and dark) show: provider header
with name, plan pill, refreshing spinner, warning triangle with message, "Outdated" tag;
progress rows with `52% left`/`48% used` headline, a bar colored by pace verdict, and
`Resets in 3h 25m`; values and badge rows; "No data" for an enabled metric without data; a
caret revealing on-demand rows and quick links; footer with "Next update in Nm" and a menu.
The session opens both screenshots and describes them.
**Commit:** `um-step-5: dashboard UI with meters, pace colors, and footer`

```text
Turn the plain-text renderer into the real dashboard. Read upstream docs/dashboard.md
("Rows", "Footer", "Customize" for the on-demand caret) and docs/menu-bar.md. Match the
behavior; the look is ours (Windows 11 Fluent-like: system-ui / Segoe UI Variable, 8px radius,
subtle borders, accent fills) — do not copy upstream screenshots or assets.

Create under src/renderer/: App.tsx, components/ProviderCard.tsx, ProgressRow.tsx,
ValuesRow.tsx, BadgeRow.tsx, Footer.tsx, ProviderIcon.tsx (letter monogram on the brand color
— no third-party logos), hooks/useAppState.ts, hooks/useNow.ts (30 s tick), styles.css with
CSS variables for light/dark via prefers-color-scheme. All math and formatting come from
src/core/format.ts and src/core/progress.ts — no duplicated logic in components.

Behaviors: clicking a progress headline flips used/left everywhere and clicking the reset
label flips countdown/absolute (both persisted via setSettings); on-demand metrics and quick
links sit behind a per-card caret (expanded state persisted); enabled metrics without data
show "No data"; the error triangle shows the message on hover (title attribute); "Outdated"
when stale with "Last updated 3h ago" on hover; empty state "Choose Providers" switches to a
placeholder Settings view (UM10 builds it). Keyboard: Esc hides the popup; F5 refreshes.
Popup height follows content up to 560 px (resize from the renderer via an IPC call that
main clamps).

Extract any non-trivial view logic into src/core/ helpers with tests; visual checks come from
the screenshots. USAGEMAXX_THEME=dark forces nativeTheme.themeSource for the smoke run.

Do NOT build the Settings view (UM10) or any provider.

Run npm run verify and the smoke script (light and dark), look at both screenshots. Update
docs/architecture.md and CLAUDE.md. If green, flip UM5 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-5: dashboard UI with meters, pace colors, and footer".
Paste the verify output and `git log -1 --stat`. If it is still red after two honest fix
attempts, stop and report — never commit red, never weaken a check to get green.
```

**Implementation notes (2026-10-15):**

- **View logic lives in `src/core/view.ts`** (`progressRow`, `valuesText`, `cardSections`,
  `nextUpdateText`), with tests, so the components hold no math. That includes upstream's rule
  that a provider keeps at least one always-visible row.
- **Pace notes match upstream.** Amber shows "~N% spare", red shows a flame with "Limit in …"
  or "Limit reached", and "Always Show Pacing" adds the cushion note and tick on healthy bars.
- **A provider that has never loaded shows its error message in place of rows.** That avoids a
  column of "No data". A provider with data shows a red error icon beside its name, with the
  message on hover.
- **The footer menu adds "Report an Issue…"** (opens this repo's issues) alongside Settings,
  Refresh Now, and Quit. The Settings screen is a placeholder until UM10.
- **The smoke script gained `--theme`, `--scroll-bottom`, and `--expand`.** Playwright emulates
  a light color scheme by default, so `--theme dark` passes `colorScheme` through.
- **TypeScript 6 checks side-effect imports**, so `src/renderer/assets.d.ts` declares `*.css`.
- **Verified by screenshots (macOS):** light, dark, end of the list (dollar meter, values,
  warning, Outdated, error card), and an expanded card (divider, on-demand rows, quick links).
  Right-click row menus from upstream were not built (see Deferred follow-ups).

---

### UM6 — Providers: Claude + Codex · Opus · auto

**Verify:** `npm run verify` green with fixture tests for: Claude usage → Session, Weekly,
model-scoped weekly rows when present, Extra Usage dollars, plan from profile, inference-only
token warning; Session has no reset → no countdown ("Not started"); token refresh rewrites only
token fields. Codex usage → Session/Weekly classified by window duration (including a
weekly-only payload in the primary slot), credits, plan display names (prolite → Pro 100,
pro → Pro 200, promax → Pro 500); a 401 triggers one refresh + retry. Credential discovery
with a fake filesystem for `%USERPROFILE%\.claude\.credentials.json`, `CLAUDE_CONFIG_DIR`,
`CLAUDE_CODE_OAUTH_TOKEN`, `%USERPROFILE%\.codex\auth.json`, `CODEX_HOME`.
**Commit:** `um-step-6: Claude and Codex providers`

```text
Port the Claude and Codex live-quota providers to src/core/providers/claude/ and codex/
(auth.ts, client.ts, mapper.ts, index.ts each, plus *.test.ts and fixtures under
tests/fixtures/<provider>/). Register them in src/core/providers/registry.ts in upstream's
default order (Claude, Codex, Cursor, then alphabetical by display name).

Read upstream (git show upstream/main:<path>):
- docs/providers/claude.md, docs/providers/codex.md
- Sources/OpenUsage/Providers/Claude/ClaudeAuthStore.swift, ClaudeCredentials.swift,
  ClaudeUsageClient.swift, ClaudeUsageMapper.swift, ClaudeProvider.swift
- Sources/OpenUsage/Providers/Codex/CodexAuthStore.swift, CodexUsageClient.swift,
  CodexUsageMapper.swift, CodexProvider.swift
- The matching Tests/OpenUsageTests/*Claude*/*Codex* files for response shapes
- Sources/OpenUsage/Stores/ for DefaultLayout (metric defaults)
Copy endpoints, headers, OAuth client IDs, and token-refresh request bodies exactly.

Windows credential sources only (Keychain and Claude Desktop are Later): Claude reads
$CLAUDE_CONFIG_DIR/.credentials.json or %USERPROFILE%\.claude\.credentials.json, then
CLAUDE_CODE_OAUTH_TOKEN as an inference-only fallback with upstream's "Re-login for live
usage" warning. Codex reads $CODEX_HOME/auth.json or %USERPROFILE%\.codex\auth.json. Token
refresh writes back only access/refresh/expiry fields, atomically (Ground Rule 8).

Metric defaults (enabled, on-demand, pinned) follow upstream's DefaultLayout. Create
docs/providers/claude-usage.md (not claude.md — see Landmines) and codex.md: what it tracks, credential sources on Windows,
endpoints, troubleshooting, and a "Not ported" list.

Do NOT implement spend tiles, reset-credit claiming, Swap/pi accounts, or the reset-grants
row — all Later. Skip any macOS-only behavior and list it under "Not ported".

Run npm run verify. Update CLAUDE.md. If green, flip UM6 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-6: Claude and Codex providers". Paste the verify output and
`git log -1 --stat`. If it is still red after two honest fix attempts, stop and report —
never commit red, never weaken a check to get green.
```

**Implementation notes (2026-10-15):**

- **Metric descriptors gained `title` and `valueWord`.** Upstream separates the tile title from
  the line label (Claude "Extra Usage" reads the line "Extra usage spent") and gives an
  unbounded dollar row a word ("$12.34 spent"). `MetricView.title` is what the UI and tooltip show.
- **Claude, with an environment token as the only credential, shows a warning instead of
  nothing.** Upstream shows no warning there because its spend tiles still load, but without
  spend tiles (Later) the card would be silently empty.
- **A Claude 429 serves the last good usage with upstream's "Updates blocked by Anthropic"
  warning.** When there's nothing to show yet, it throws `rateLimited`, so the engine keeps the
  disk-cached snapshot and shows the message. This replaces upstream's status-badge snapshot.
- **Token write-back merges into the file's original JSON** (`writeMergedJson`), keeping unknown
  fields. Upstream's Codex re-encodes its own model, which would drop unknown fields. A login the
  tool rotated mid-refresh is never overwritten: Claude skips the write, and Codex throws
  `tokenConflict` as upstream does.
- **Codex's User-Agent is "UsageMaxx"** (upstream sends "OpenUsage"). Claude keeps upstream's
  `claude-cli/…` User-Agent, because Anthropic checks the client surface.
- **The Codex Rate Limit Resets row uses only the count in the usage body.** The per-credit
  expiry endpoint isn't called (see the provider doc's "Not ported").
- **The Claude doc is `docs/providers/claude-usage.md`.** Claude Code loaded `claude.md` as a
  `CLAUDE.md` on macOS's case-insensitive filesystem. Added to Landmines and CLAUDE.md.
- **Not verified:** live calls against real accounts. Fixtures follow upstream's test payloads.
  This is the human check at UM12.

---

### UM7 — Providers: Cursor + Copilot · Opus · auto

**Verify:** `npm run verify` green with tests for: reading Cursor tokens from a fixture SQLite
`state.vscdb` (`ItemTable` keys `cursorAuth/accessToken`, `cursorAuth/refreshToken`) resolved
at `%APPDATA%\Cursor\User\globalStorage\state.vscdb`; Cursor usage mapping (Total Usage,
Cursor Models, Other Models, Extra Usage, plan) from fixtures; Copilot token discovery order
(`%LOCALAPPDATA%\github-copilot\apps.json` / `hosts.json`, `%APPDATA%\GitHub CLI\hosts.yml`,
`gh auth token`, Credential Manager `gh:github.com:*`) using fakes; Copilot mapping (percent
remaining → used; Credits, Chat, Completions, plan).
**Commit:** `um-step-7: Cursor and Copilot providers`

```text
Port Cursor and Copilot to src/core/providers/cursor/ and copilot/.

First decide SQLite access: run `ELECTRON_RUN_AS_NODE=1 npx electron -e
"require('node:sqlite')"` and the same under plain node. If node:sqlite works in both, use it
(DatabaseSync with readOnly: true). Otherwise add sql.js (the one allowed extra dependency for
this step) and mark its wasm asarUnpack. Put the choice behind src/core/sqlite.ts
(readKeyValues(dbPath, keys)) and record it in CLAUDE.md. state.vscdb can be large and locked
while Cursor runs: open read-only, never load the whole file into memory.

Read upstream: docs/providers/cursor.md, copilot.md; Sources/OpenUsage/Providers/Cursor/*
(skip CursorSpendHistoryFetcher, CursorUsageEvents, CursorUsageHistoryStore — spend is Later)
and Sources/OpenUsage/Providers/Copilot/*. Copy endpoints, Connect RPC paths, headers, and
field names exactly.

Windows Credential Manager: src/main/windowsCredentials.ts runs powershell.exe -NoProfile
-NonInteractive with an inline C# P/Invoke (CredEnumerate/CredRead, filter by target prefix),
returning decoded secrets; it spawns a process, so it lives in src/main and reaches providers
through ctx.secrets. Also try `gh auth token --hostname github.com` via ctx.exec when gh is on
PATH. 10 s timeout; log failures, never the secret. Unit-test the PowerShell output parser;
the PowerShell itself only runs on Windows (UM12 human check).

Create docs/providers/cursor.md and copilot.md (Windows sources, endpoints, troubleshooting,
"Not ported").

Do NOT implement Cursor spend history or usage events (Later).

Run npm run verify. Update CLAUDE.md. If green, flip UM7 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-7: Cursor and Copilot providers". Paste the verify output
and `git log -1 --stat`. If it is still red after two honest fix attempts, stop and report —
never commit red, never weaken a check to get green.
This ends phase 2: push the branch, open the PR into um/p1-foundation using the PR
description template, wait for CI, then stop (unless told to run on).
```

**Implementation notes (2026-10-15):**

- **SQLite uses `node:sqlite`, read-only.** It's available in Electron 44's Node 24.21 (verified
  in UM1) and in plain Node 24 for tests. It sits behind `ctx.sqlite` (`SqliteReader`), with
  `FakeSqlite` for tests and a real-file test of the reader itself. `sql.js` was not added.
- **Cursor never writes to `state.vscdb`.** Upstream writes the refreshed access token back. Here
  it's kept in memory, keyed by the refresh token, and reused until it nears expiry, because
  writing into a running app's database risks lock contention and corruption.
- **Copilot's token order on Windows:** `%LOCALAPPDATA%\github-copilot\apps.json`/`hosts.json`,
  then `%APPDATA%\GitHub CLI\hosts.yml` (or `GH_CONFIG_DIR`), then `gh auth token`, then
  Credential Manager `gh:github.com:<user>` (preferring the hosts.yml user, unwrapping
  go-keyring's base64).
- **The Credential Manager reader is PowerShell with an inline C# `CredEnumerateW`**, sent as
  `-EncodedCommand`. The prefix goes through an environment variable, not the command line. The
  output, which contains secrets, is parsed in `src/core/credentialManager.ts` and never logged.
  **Not verified:** it only runs on Windows. Its parsing is unit-tested, and the PowerShell
  itself is a UM12 human check.
- **The Copilot billing org is remembered in memory only** (upstream uses UserDefaults), so it's
  re-discovered once per launch.
- **Cursor and Copilot User-Agents:** Copilot keeps its `GitHubCopilotChat/…` editor headers
  (protocol). The GitHub billing calls send "UsageMaxx".
- **Not verified:** live calls (fixtures follow upstream's test payloads).

---

### UM8 — Providers: OpenRouter + Z.ai + API keys · Sonnet · auto

**Verify:** `npm run verify` green with tests for: key precedence (saved key → env vars);
OpenRouter `/credits` + `/key` mapping (Credits dollars meter, Balance, Today / This Week /
This Month, Key Limit only when the key has one, `$0.00` as a real zero); Z.ai limits mapping
(CREDIT_LIMIT/TOKENS_LIMIT by window length → Session/Weekly, TIME_LIMIT → Web Searches,
epoch-ms resets, "No active GLM Coding Plan" warning); the key store encrypts through an
injected cipher and never writes the plaintext key to disk.
**Commit:** `um-step-8: OpenRouter and Z.ai providers with encrypted API keys`

```text
Port OpenRouter and Z.ai (src/core/providers/openrouter/, zai/) and add API-key storage.

Read upstream: docs/providers/openrouter.md, zai.md; Sources/OpenUsage/Providers/OpenRouter/*,
ZAI/*, APIKeyManagement.swift, UserAPIKeyStore.swift.

src/main/apiKeys.ts stores keys in <userData>/api-keys.json as base64 of
safeStorage.encryptString (DPAPI on Windows). If safeStorage.isEncryptionAvailable() is
false, refuse to save and say so (no plaintext fallback). Precedence: saved key, then
OPENROUTER_API_KEY / ZAI_API_KEY / GLM_API_KEY. Expose key status (notSet | fromEnvironment
| saved) over IPC; the key itself only through an explicit reveal call. IPC: getKeyStatus,
saveKey, clearKey, revealKey. (UM10 builds the UI.)

Create docs/providers/openrouter.md and zai.md (where keys are stored on Windows, setting env
vars with `setx`, troubleshooting).

Run npm run verify. Update CLAUDE.md. If green, flip UM8 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-8: OpenRouter and Z.ai providers with encrypted API keys".
Paste the verify output and `git log -1 --stat`. If it is still red after two honest fix
attempts, stop and report — never commit red, never weaken a check to get green.
```

---

### UM9 — Providers: Grok + Devin + OpenCode Go + Ollama Cloud · Opus · auto

**Verify:** `npm run verify` green with fixture tests for each provider's credential source and
mapper: Grok `%USERPROFILE%\.grok\auth.json` + billing/settings mapping + token refresh
write-back; Devin `%APPDATA%\devin\credentials.toml` (+ `api_server_url`) and GetUserStatus
mapping (remaining → used, weekly falls back to daily); OpenCode
`%USERPROFILE%\.local\share\opencode\auth.json` `opencode-go` key (+ `OPENCODE_DATA_DIR`,
`XDG_DATA_HOME`) and usage mapping (rolling / weekly / monthly; 401 vs 403 EntitlementError);
Ollama OpenSSH ed25519 key parsing from `%USERPROFILE%\.ollama\id_ed25519` and a request
signature that verifies against the public key.
**Commit:** `um-step-9: Grok, Devin, OpenCode Go, and Ollama providers`

```text
Port four smaller providers to src/core/providers/{grok,devin,opencode,ollama}/.

Read upstream for each: docs/providers/<name>.md and Sources/OpenUsage/Providers/<Name>/*
(skip *LogUsageScanner*, *UsageScanner*, OpenCodeCodexUsageScanner — spend is Later). For
Ollama read OpenSSHEd25519Key.swift and its tests closely: Node's crypto can't import OpenSSH
private keys directly, so parse the openssh-key-v1 container, build a PKCS#8 DER around the
32-byte seed, and sign with crypto.sign(null, data, key). Ollama never auto-enables
(hasLocalCredentials returns false — upstream behavior).

Devin's TOML is tiny: parse only the keys needed with a minimal line parser (no TOML
dependency). Check %APPDATA%\devin\credentials.toml first, then
%USERPROFILE%\.local\share\devin\credentials.toml; say in the doc which one is confirmed
(Pane documents the %APPDATA% path).

Create docs/providers/grok.md, devin.md, opencode.md, ollama.md.

Run npm run verify. Update CLAUDE.md. If green, flip UM9 to ✅ in docs/BUILD_PLAN.md and commit
everything as one commit: "um-step-9: Grok, Devin, OpenCode Go, and Ollama providers". Paste
the verify output and `git log -1 --stat`. If it is still red after two honest fix attempts,
stop and report — never commit red, never weaken a check to get green.
```

---

### UM10 — Settings view + first run · Sonnet · auto

**Verify:** `npm run verify` green, including tests for the first-run selection and pin-limit
logic; demo screenshots of: the welcome screen listing detected providers; Settings → Providers
(switches, per-provider metric list with enabled / on-demand / pin toggles and the inline
"Up to 2 pins per provider" message); Settings → API Keys (OpenRouter, Z.ai with status, save,
reveal, clear); General (launch at login, used/left, countdown/absolute); About (version,
GitHub link, unofficial-port notice). The session opens and describes each screenshot.
**Commit:** `um-step-10: settings view, pins, API keys, launch at login, first run`

```text
Build the Settings view and first-run flow. Read upstream docs/settings.md,
docs/provider-enablement.md, docs/dashboard.md ("First launch", "Customize").

- First run (settings.enabledProviders === null): probe every provider's
  hasLocalCredentials() (local only, never network) and show a welcome screen with found
  providers preselected; Continue saves the choice; "Choose later" enables none.
- Settings view inside the popup (back arrow to the dashboard): Providers (switch per
  provider; click into its metrics: enabled, on-demand, pinned ★ with the ≤2-per-provider
  rule shown inline), API Keys (UM8 IPC), General (launch at login via
  app.setLoginItemSettings, used/left, countdown/absolute), About (version, GitHub repo link,
  "Unofficial Windows port of OpenUsage by Robin Ebers. Not affiliated.").
- The tray tooltip and icon update as soon as pins change. The tray menu gains "Settings".
- scripts/smoke-launch.mjs accepts --view settings|welcome|providers|keys to screenshot each.

Do NOT add drag-to-reorder (Later); order is the registry order.

Run npm run verify and the smoke screenshots. Create docs/settings.md; update CLAUDE.md. If
green, flip UM10 to ✅ in docs/BUILD_PLAN.md and commit everything as one commit:
"um-step-10: settings view, pins, API keys, launch at login, first run". Paste the verify
output and `git log -1 --stat`. If it is still red after two honest fix attempts, stop and
report — never commit red, never weaken a check to get green.
This ends phase 3: push the branch, open the PR into um/p2-dashboard using the PR description
template, wait for CI, then stop (unless told to run on).
```

---

### UM11 — Windows packaging in CI · Sonnet · auto

**Verify:** `npm run verify` green locally; on the pushed branch, the `package (windows-latest)`
job is green (`gh run watch` / `gh run view`): it builds the NSIS installer, launches the
unpacked `UsageMaxx.exe` with demo data via `scripts/smoke-launch.mjs --exe … --screenshot`,
and uploads `UsageMaxx-Setup-*.exe` and `popup-demo.png` as artifacts. The session downloads
the screenshot with `gh run download` into `test-results/ci/` and describes it.
**Commit:** `um-step-11: Windows installer and smoke screenshot in CI`

```text
Extend .github/workflows/ci.yml with a `package` job on windows-latest (needs: verify):
npm ci, npm run dist:win, then
`node scripts/smoke-launch.mjs --exe "dist/win-unpacked/UsageMaxx.exe" --screenshot` with
USAGEMAXX_DEMO=1, then actions/upload-artifact@v4 for dist/*.exe (name usagemaxx-installer)
and test-results/*.png (name smoke-screenshots). No secrets: the build is unsigned.

App icon: scripts/make-icons.mjs renders build/icon.png (256x256) and build/icon.ico
(16/24/32/48/64/256 PNG-in-ICO) from the same mark as the tray icon, using the encoder from
src/main/trayIcon.ts; commit the generated files. electron-builder picks them up from build/.
No upstream artwork.

Push and watch the run with gh. If the Windows job fails, read `gh run view --log-failed`,
fix, re-run verify locally, and push again; after two failed attempts that is a stop
condition. Download the screenshot artifact into test-results/ci/ (gitignored) and describe
it.

Update CLAUDE.md (CI section) and docs/architecture.md (build & packaging). If green, flip
UM11 to ✅ in docs/BUILD_PLAN.md and commit everything as one commit: "um-step-11: Windows
installer and smoke screenshot in CI" (fix-up commits from failed CI attempts are allowed
before it, each with a um-step-11 prefix and a description). Paste the verify output,
`git log -1 --stat`, and the CI run URL. Never weaken a check to get green.
```

---

### UM12 — README, docs, upstream notes · Sonnet · checkpoint

**Verify:** `npm run verify` green; README has: what it is, unofficial-port notice + credit,
screenshot from the Windows CI run (`docs/assets/screenshot.png`, demo data), Install
(installer from the CI artifact or a release; SmartScreen "More info → Run anyway"; Windows 11
"show the icon on the taskbar" steps), Supported providers with Windows credential sources,
Privacy, Building from source, Relationship to OpenUsage, License. `docs/README.md` indexes
every doc; `docs/upstream.md` explains the PR situation and holds a draft issue for the user.
**Human check:** install the CI artifact on a Windows PC and walk the checklist in the PR.
**Commit:** `um-step-12: README, user docs, and upstream notes`

```text
Write the user-facing docs.

- README.md: "UsageMaxx — your AI coding limits in the Windows tray". Sections: screenshot
  (copy test-results/ci/popup-demo.png to docs/assets/screenshot.png — demo data, safe to
  publish), Features, Install (unsigned NSIS installer from the latest CI run's
  usagemaxx-installer artifact; SmartScreen "More info → Run anyway"; Windows 11: Settings →
  Personalization → Taskbar → Other system tray icons → UsageMaxx On, or drag it out of the
  ^ overflow), Supported providers (table: provider, what it shows, where credentials come
  from on Windows), Privacy (credentials stay local, only provider APIs are called, no
  telemetry, API keys encrypted with Windows DPAPI), Building from source (npm ci, npm run
  dev, npm run dist:win), Relationship to OpenUsage (unofficial port, MIT credit, trademark
  note, link upstream; other Windows ports exist — Pane, CrossUsage), License.
- docs/README.md: index of every doc. docs/upstream.md: why this isn't an upstream PR
  (maintainer replies on #374 and #1064, closed Windows PRs, issue-first policy, the rule
  against AI-generated commit messages), what a contribution could realistically be (a
  provider fix that applies to both, via an approved issue), and a draft issue the user could
  post asking for a community-ports link — marked as a draft for the user to send.
- Final CLAUDE.md pass so a cold session knows the structure, commands, conventions, and
  where every doc lives.

Do NOT post anything to upstream issues or PRs — that's the user's call.

Run npm run verify. If green, flip UM12 to ✅ in docs/BUILD_PLAN.md and commit everything as one
commit: "um-step-12: README, user docs, and upstream notes". Paste the verify output and
`git log -1 --stat`. If it is still red after two honest fix attempts, stop and report.
This is a checkpoint and ends phase 4: push the branch, open the PR into
um/p3-providers-settings using the PR description template with the Windows checklist from
"Who verifies what" under Needs human check, wait for CI, then stop.
```

---

## Deferred follow-ups (cross-step, live tracker)

> Things a step noticed but were out of its own scope. Strike through when handled; don't
> delete.

- **Right-click menus on rows and provider headers** (surfaced by UM5). Upstream offers Hide,
  Star for menu bar, Refresh, and Customize on right-click. UM5 has hover refresh and click
  toggles but no context menus; UM10's settings view covers hide and pin. Adding them needs an
  IPC call that opens a native `Menu` from main at the cursor.
- *(Steps add to this list as they surface out-of-scope friction.)*

---

## Landmines

Populated from real friction, not speculation:

- **Upstream won't take a Windows PR.** Maintainers replied on #374 that they decided against
  supporting other OSes because they're all on macOS, and on #1064 that they have no Windows
  machine to test on; every Windows PR (#435, #457, #458, #459, #532, #957) was closed, and a
  README link to a Windows port (#1043) was declined. CONTRIBUTING.md auto-closes PRs without
  an approved, assigned issue and forbids AI-generated commit messages.
- **"OpenUsage" is trademarked.** Forks may not use the name or logo. Keep "UsageMaxx" in code,
  installer, window titles, and the tray tooltip. The repo name `OpenUsageMaxx` itself contains
  the mark — flagged to the user; renaming the repo is their call.
- **Other Windows ports exist.** Pane (ItsJazii/pane — Tauri/Rust, MIT, actively maintained,
  praised by the upstream author on #374) and CrossUsage. UsageMaxx's angle is a TypeScript
  codebase that mirrors upstream's provider architecture closely.
- **This Mac has ~15 GB free disk.** Electron binaries, electron-builder's caches, and
  node_modules all land inside the repo (`.cache/`, gitignored). Don't download Playwright
  browsers — `playwright-core` drives Electron directly.
- **No Windows machine here.** The only Windows execution is GitHub Actions. Tray placement,
  DPI scaling, Credential Manager reads, and real credentials are the user's checks (UM12).
- **`gh` targets upstream by default in this checkout.** With both `origin` and `upstream`
  remotes, `gh` resolved robinebers/openusage — `gh pr create` would have opened a PR there.
  `gh repo set-default memoliertorerr/OpenUsageMaxx` is set; always pass
  `--repo memoliertorerr/OpenUsageMaxx` too.
- **A provider doc named `claude.md` is read as a `CLAUDE.md`.** On a case-insensitive filesystem
  (macOS default), Claude Code loaded `docs/providers/claude.md` as standing instructions for that
  folder. The Claude provider's doc is `docs/providers/claude-usage.md` instead. Never create a
  file named `claude.md` or `agents.md` in any letter case anywhere in the repo, except the root
  `CLAUDE.md`.
- **Windows 11 hides new tray icons in the overflow (^) menu** and has no API to pin them. The
  README must tell users how to show it on the taskbar.

---

## Later — designed, NOT built in v0.1

| Item | Design | What it needs |
|---|---|---|
| **Local spend tiles + Total Spend** | Port upstream's JSONL scanners (Claude `~\.claude\projects`, Codex `~\.codex\sessions`, Grok, OpenCode SQLite) and the pricing engine (`Sources/OpenUsage/Pricing/`, LiteLLM/models.dev snapshots) into `src/core/spend/`; add `chart` lines | Streaming JSONL reader with an incremental cache, pricing snapshot bundling + refresh, Today/Yesterday/30 Days rows, Total Spend card |
| **Antigravity** | Language-server discovery via a Windows process scan, Cloud Code fallback with the `gemini:antigravity` Credential Manager token | Process discovery, CSRF token extraction, protobuf decoding |
| **Multi-account cards** | Claude Swap, Codex Swap (`xswap`), pi logins, sibling `~\.codex-*` homes → one card per account | Account identity matching, per-card cache stamps |
| **Keyring-stored CLI logins** | Codex `cli_auth_credentials_store = keyring` and other Credential Manager entries via `windowsCredentials.ts` | Target names confirmed on a real Windows install |
| **Local HTTP API + CLI** | `127.0.0.1:6736` `/v1/limits` with upstream's `openusage.limits.v1` schema; a `usagemaxx` CLI reading the cache | node:http server, schema port, CLI entry in the installer |
| **Auto-update + signing** | electron-updater against GitHub Releases; Authenticode signing | A code-signing certificate, a release workflow on tags |
| **Notifications** | Quota-threshold toasts via Electron `Notification` | Threshold settings, de-duplication per window |
| **Global shortcut, drag reorder, share screenshot, proxy, hide from screen share** | As upstream docs describe | One step each |

**When Later work starts:** spend tiles first (the most-used upstream feature missing here),
then keyring logins (they unblock users whose tokens aren't in files), then auto-update +
signing (needed before wider distribution).
