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
> keys, launch at login, read-only logins); CI that tests on Windows, builds the NSIS installer, and takes a
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
| UM8 | Providers: OpenRouter + Z.ai + encrypted API-key storage | Sonnet | auto | ✅ done |
| UM9 | Providers: Grok + Devin + OpenCode Go + Ollama Cloud | Opus | auto | ✅ done |
| UM10 | Settings view: providers, pins, API keys, launch at login, first-run welcome | Sonnet | auto | ✅ done |
| UM10.1 | Read-only logins: never refresh tokens; show the re-login hint | Opus | auto | ✅ done |
| UM11 | Windows packaging in CI: NSIS installer artifact + smoke screenshot on `windows-latest` | Sonnet | auto | ✅ done |
| UM11.1 | Windows on ARM (arm64): one x64 + arm64 installer, native ARM smoke screenshot in CI | Opus | auto | ✅ done |
| UM12 | README, user + developer docs, upstream/PR notes, final `CLAUDE.md` pass | Sonnet | checkpoint | ✅ done — human check passed 2026-10-16 |

**Overall status: v0.1 is complete. All steps UM0–UM12 (with UM10.1 and UM11.1, added mid-plan)
are done, the user's Windows check passed on 2026-10-16, and PRs #1–#4 were merged into `main` that
day, in order, with merge commits, at the user's request. The phase branches are kept. New work
starts from `main` (see Deferred follow-ups and Later).**

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
3. **UM8 → UM10.1** · Opus · branch `um/p3-providers-settings` → PR into `um/p2-dashboard` —
   review API-key handling (DPAPI, never plaintext), the settings screenshots, and the
   read-only logins switch (UM10.1, added mid-plan).
4. **UM11 → UM12** (with UM11.1, added mid-plan) · Sonnet · branch `um/p4-ship` → PR into
   `um/p3-providers-settings` —
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
| Windows on ARM | **you** — UM12 checkpoint | On Windows 11 on ARM (e.g. Parallels on an Apple Silicon Mac) the same installer installs and UsageMaxx runs natively: Task Manager → Details, add the Architecture column, and UsageMaxx reads ARM64 |

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

**Implementation notes (2026-10-15):**

- **The key catalog lives in `src/core/apiKeys.ts`**, which is renderer-safe: the providers, their
  environment fallbacks, the status, and key validation. UM10's API Keys screen imports it.
  `src/main/apiKeys.ts` (`ApiKeyVault`) takes the cipher as an injected `KeyCipher`, so it has no
  Electron import and is tested under Node. `src/main/index.ts` binds it to `safeStorage`.
- **Key status has a fourth state, `overrideActive`**, which upstream uses for a saved key that
  overrides an environment key ("Custom Key"; clearing it falls back to the environment).
- **`OPENROUTER_KEY` is a second OpenRouter fallback**, after `OPENROUTER_API_KEY`, as upstream
  does.
- **`ApiKeyStore` gained `has()`.** Key status and `hasLocalCredentials` check for a saved key
  without decrypting it, so first-run detection and the settings screen never call DPAPI (or the
  macOS Keychain in dev runs). A key that exists but won't decrypt (another account or PC) is a
  `credentialAccess` error telling the user to save it again.
- **Linux's `basic_text` safeStorage backend counts as unavailable**, because it's obfuscation, not
  encryption. Windows uses DPAPI.
- **Saving or clearing a key refreshes that provider** at once when it's enabled.
- **Metric descriptors gained `limitNoun`** (upstream `WidgetData.limitNoun`), so OpenRouter's
  Credits meter reads "$100 purchased". Ollama's Monthly meter (UM9) uses it too ("included").
- **Upstream's macOS config files** (`~/.config/openusage/<provider>.json`) aren't read. The
  encrypted store replaces them, and the product name mustn't appear in paths.
- **Z.ai with an empty `limits` array returns no lines**, so its meters read "No data" instead of
  upstream's separate "No usage data" status badge. "No active GLM Coding Plan" is a thrown
  `notAvailable` error with upstream's copy, matching upstream's error snapshot.
- **Not verified:** live calls (fixtures follow upstream's tests and captured payloads), and
  DPAPI itself, which only runs in the packaged app on Windows (UM12 human check).

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

**Implementation notes (2026-10-15):**

- **Registry order** is Claude, Codex, Cursor, then alphabetical: Copilot, Devin, Grok, Ollama,
  OpenCode, OpenRouter, Z.ai. Metric defaults follow upstream's `DefaultLayout` (Ollama Monthly is
  the only new default pin; Grok Extra Usage, Devin Extra Balance, and Ollama Purchased Credits sit
  behind the caret).
- **Grok** writes a rotated token back like Claude does: only that account's token fields, merged
  into the file as it is now, and never over a login the CLI changed meanwhile. A rotation that
  can't be written stays in memory, keyed by the login on disk, so the next refresh doesn't spend
  a refresh token the server already rotated. The team-account warning drops upstream's mention of
  spend tiles (Later). The refresh body is form-encoded like upstream (`%20`, RFC 3986), via a new
  `formEncode` helper.
- **Devin** checks `%APPDATA%\devin`, then `%USERPROFILE%\.local\share\devin`, then
  `%LOCALAPPDATA%\devin` (`credentials.toml`). Pane's source reads the `%APPDATA%` path first and
  `%LOCALAPPDATA%` too, so both are in. The Devin app's `state.vscdb` source is ported at
  `%APPDATA%\Devin\User\globalStorage\state.vscdb`, which is unconfirmed. Unlike upstream, a
  network failure on every source surfaces as a connection error instead of "quota data
  unavailable".
- **OpenCode reads only OpenCode 1's `auth.json`**, as the prompt names. OpenCode 2's credential
  tables in `opencode*.db` need a generic SQLite query and a directory listing that the context
  doesn't have yet (see Deferred follow-ups). Without spend tiles, a key with no Go subscription is
  an error rather than an empty card.
- **Ollama** parses `openssh-key-v1` itself, wraps the seed in a PKCS#8 DER, and signs with
  `crypto.sign(null, …)`. Tests build keys the way `ssh-keygen` does and verify signatures against
  the public half. `hasLocalCredentials` is always false and `autoEnable` is false; UM10's first-run
  probe must honor both.
- **Not verified:** live calls (fixtures follow upstream's tests and captured payloads), and the
  Windows paths beyond Pane's Devin path. These are UM12 human checks.

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

**Implementation notes (2026-10-15):**

- **Pure logic lives in `src/core/settingsView.ts`** (routes and tabs, `welcomeChoices`,
  `metricSettings` with the pin rule, `providerSummary`, key status text) and `src/core/detect.ts`
  (parallel `hasLocalCredentials` probes, 10 s timeout each, failures count as not found). Both are
  tested; the components only render them.
- **Settings is one screen with four tabs** (Providers, API Keys, General, About), and a provider's
  metrics open as a second level under Providers. The smoke script's `--view` takes `welcome`,
  `settings`, `providers`, `providers:<id>`, `keys`, `general`, and `about`; each screenshot gets
  its own name and fresh profile. Demo providers now report detection results (Devin and Grok
  "not found"), so the welcome screenshot shows both groups.
- **The welcome screen never preselects a provider with `autoEnable: false`** (Ollama), even if
  its probe says yes.
- **Launch at login works only in packaged builds.** In a development run on macOS it would
  register Electron.app in the developer's real login items, outside the repo, so the switch is
  disabled there with "Works in the installed app." On Windows, the packaged app uses
  `app.setLoginItemSettings`.
- **API key status names the environment variable in use** (`ApiKeyEntry.environmentVariable`).
  Screenshot runs strip real key variables from the environment and give the keys view an obvious
  fake one. No screenshot saves a key, because that would reach the macOS Keychain.
- **The tray already had "Settings"** (UM4), and its icon and tooltip already redraw on every
  published state, so pin changes show at once without new tray code.
- **Fixed the popup's auto-height.** It reported the rounded `scrollHeight`, so content with a
  fractional height (415.3 px on API Keys) overflowed by under a pixel and showed a scrollbar. It
  now rounds up the measured height.
- **New styles are in `src/renderer/controls.css` and `settings.css`**, because `styles.css` was
  already at 524 lines, past the ~500-line guide. Splitting `styles.css` itself is left alone.
- **Verified (macOS):** screenshots of the welcome screen, the provider list, Claude's and (dark)
  Codex's metrics with the pin-limit message, API Keys, General, and About, plus the dashboard
  regression. A throwaway Playwright run clicked through welcome → dashboard, a provider switch,
  unpin/pin up to the limit, a metric toggle, Esc levels, and Used/Left, and checked
  `settings.json`. **Not verified:** launch at login (packaged Windows only, UM12) and saving a key
  through DPAPI (UM12).

---

### UM10.1 — Read-only logins · Opus · auto

> **Added mid-plan 2026-10-15** — requested by the user after a terms-of-service review; reduces how much the app acts as the official clients.

**Verify:** `npm run verify` green with tests showing, for Claude, Codex, Cursor, and Grok with
`allowTokenRefresh: false`: an expired token throws `authExpired` with that provider's re-login
hint, sends no request to its refresh URL, and writes no file; an expiring-but-unexpired token is
tried once without refreshing; a 401/403 throws the hint without refreshing. The existing
refresh-on tests pass unchanged. Settings round-trip `readOnlyLogins` (default false, tolerant
parsing); a demo screenshot of Settings → General shows the "Read-only Logins" switch.
**Commit:** `um-step-10.1: read-only logins setting`

```text
Add a "Read-only Logins" setting: when it's on, UsageMaxx never renews a provider's login and
never writes a credential file; an expired login shows that provider's re-login hint instead.

- src/core/settings.ts: `readOnlyLogins: boolean`, default false (upstream behavior), parsed
  tolerantly like the other booleans. src/core/ipc.ts: a `readOnlyLogins` settings change,
  validated in parseSettingsChange and applied in applySettingsChange.
- src/core/runtime.ts: ProviderContext gains `allowTokenRefresh: boolean`. src/main/context.ts
  sets it from the setting (false in demo mode); tests/helpers/fakes.ts defaults it to true.
- Claude, Codex, Cursor, and Grok check it. With refresh off they never call the refresh
  endpoint and never write a credential file. An expired token, or a 401/403, throws
  ProviderError('authExpired', <hint>): Claude "Login expired. Run `claude` to sign in again,
  then refresh."; Codex "Login expired. Run `codex` to sign in again, then refresh."; Cursor
  "Login expired. Open Cursor to renew it, then refresh."; Grok "Login expired. Run `grok login`
  to sign in again, then refresh." A token that is expiring but not yet expired is still tried
  once without refreshing.
- Settings → General: a "Read-only Logins" switch described as "Never renew provider logins.
  When one expires, its card asks you to sign in again with the provider's own app or CLI."
- Tests: per affected provider with refresh off, no request to its refresh URL, no fs writes,
  and the hint message. Keep the refresh-on tests unchanged.

Update docs/settings.md, docs/providers/{claude-usage,codex,cursor,grok}.md ("Under the hood"
and troubleshooting), and CLAUDE.md → Conventions.

Run npm run verify and a demo screenshot of Settings → General. If green, flip UM10.1 to ✅ in
docs/BUILD_PLAN.md and commit everything as one commit: "um-step-10.1: read-only logins
setting". Paste the verify output and `git log -1 --stat`. If it is still red after two honest
fix attempts, stop and report — never commit red, never weaken a check to get green.
```

**Implementation notes (2026-10-15):**

- **Done as specified.** Each provider guards both places a login could be renewed: before
  refreshing an expiring token, and in the 401/403 retry callback. The refresh functions
  themselves (Claude `rotate`, Codex `rotate`, Cursor `refreshAccessToken`) check the flag again,
  so no future caller can renew a login by accident. Grok's refresh helper returns nothing when
  renewal is off, which reuses its existing loop: an expiring token is probed as is, and an expired
  one is skipped and reported with the hint.
- **"Expired" means a known expiry has passed.** Claude uses `expiresAt`; Codex, Cursor, and Grok
  use the JWT `exp`. A token whose expiry can't be read is tried once rather than refused.
- **The hints follow each provider's existing wording**: "Run `codex` …" (as Codex's other
  messages say), and Cursor's "Open Cursor to renew it, then refresh."
- **The tests are in one file, `src/core/providers/readOnlyLogins.test.ts`**: three cases (expired,
  expiring, 401) for each of the four providers. Each asserts no request to the refresh URL, no
  file write, and the hint. With the flag flipped to `true`, all 12 fail, so they catch a regression.
  The refresh-on tests are unchanged and still pass.
- **`allowTokenRefresh` reads the setting on every refresh**, so switching it applies to the next
  refresh. Until the store exists at startup, it reads as "no renewal". Demo mode always has it off.
- **Verified:** `npm run verify` (34 files, 311 tests) and a demo screenshot of Settings → General
  with the switch. **Not verified:** a real expired login on Windows (UM12 human check).

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

**Implementation notes (2026-10-15):**

- **The package job went green on the first attempt** (run 38780750298, commit `1bc87cd4`, pushed
  as "CI attempt 1" so CI could run before the tracker flipped). It built
  `UsageMaxx-Setup-0.1.0.exe` (about 111 MB as an artifact), launched
  `dist/win-unpacked/UsageMaxx.exe` under Playwright with demo data, and saved `popup-demo.png`.
  The screenshot, downloaded to `test-results/ci/`, shows the packaged app on Windows: Claude,
  Codex, and Cursor cards in Segoe UI at 360×600, with pace colors, reset countdowns, and the
  footer.
- **`actions/upload-artifact@v7`, not `@v4`**: v7 is the current major, matching the v7 checkout
  and setup-node from UM1.
- **The icon script loads the TypeScript encoders through Vite 8's `runnerImport`**, because a
  plain `.mjs` can't import `.ts` files. Vite is already a devDependency, so nothing was added. The
  PNG-in-ICO writer is `src/core/ico.ts`, with a test.
- **`CSC_IDENTITY_AUTO_DISCOVERY=false`** keeps electron-builder from looking for a signing
  certificate, since the build is unsigned by design.
- **The screenshot upload warns instead of failing when there's nothing to upload**, so a smoke
  failure isn't reported twice.
- **Not verified:** installing, launching at login, and uninstalling from the NSIS installer, the
  tray icon in the real notification area, and DPI scaling. Those are UM12 human checks.

---

### UM11.1 — Windows on ARM (arm64) build · Opus · auto

> **Added mid-plan 2026-10-15** — requested by the user, who tests on Parallels on an Apple
> Silicon Mac (Windows 11 on ARM), where an x64-only build would run only under emulation.

**Verify:** `npm run verify` green locally; on the pushed branch, `package (windows-latest)` is
green and its `usagemaxx-installer` artifact is one NSIS installer holding both x64 and arm64
builds (`UsageMaxx-Setup-<version>.exe`), with the x64 smoke screenshot as before; and
`package (windows-11-arm)` runs verify natively on ARM, builds the arm64 app, launches
`dist/win-arm64-unpacked/UsageMaxx.exe` with demo data, and uploads `popup-demo-arm64.png`. The
session downloads every screenshot artifact into `test-results/ci/` and describes each.
**Commit:** `um-step-11.1: Windows on ARM installer and smoke test`

```text
Ship Windows on ARM alongside x64.

- electron-builder.yml: the NSIS target builds `x64` and `arm64` as one combined installer
  (electron-builder's multi-arch NSIS installs the build that matches the PC), keeping the name
  `UsageMaxx-Setup-${version}.exe`. `npm run dist:win` takes the architectures from the yml, so
  the list lives in one place.
- .github/workflows/ci.yml: `package` (windows-latest) builds the combined installer, smoke-tests
  `dist/win-unpacked/UsageMaxx.exe` (x64), and uploads the installer and screenshot as before.
  Add `package-arm64` on `windows-11-arm`: npm ci, npm run verify, `electron-vite build &&
  electron-builder --win dir --arm64`, then `node scripts/smoke-launch.mjs --exe
  "dist/win-arm64-unpacked/UsageMaxx.exe" --screenshot --name popup-demo-arm64` with
  USAGEMAXX_DEMO=1, and upload the screenshot as `smoke-screenshots-arm64`. If that runner label
  isn't available, or the job fails for runner reasons that two attempts can't fix, keep the arm64
  build in `package`, drop only the ARM smoke job, and record it under Deferred follow-ups.
- Check that nothing assumes x64 (paths, the powershell.exe Credential Manager reader,
  node:sqlite, tray icons) and say so in the notes, or fix it.
- Docs: README Install (one installer for x64 and ARM PCs, including Snapdragon laptops and
  Parallels on Apple Silicon Macs), docs/architecture.md (build and packaging), CLAUDE.md (CI and
  the dist:win command), and a Windows-on-ARM item in "Who verifies what".

Push and watch the run with gh (always --repo memoliertorerr/OpenUsageMaxx). Download every
screenshot artifact into test-results/ci/ and look at each. If green, flip UM11.1 to ✅ and commit
everything as "um-step-11.1: Windows on ARM installer and smoke test" (CI-attempt commits with a
um-step-11.1 prefix are allowed before it). Never weaken a check to get green.
```

**Implementation notes (2026-10-15):**

- **Requested by the user** so the app runs natively on Windows 11 on ARM (Parallels on an Apple
  Silicon Mac). It arrived while UM12 was being written, so it was committed after UM12; the
  tracker lists it before UM12.
- **The architectures are passed on the command line** (`npm run dist:win` →
  `electron-builder --win nsis --x64 --arm64`). CI attempt 1 relied on an arch list in
  `electron-builder.yml`, but a target given on the command line overrides it, and the log showed
  `archs=x64`, an x64-only installer of the same size as before. Attempt 2 passes both flags.
  In run 38783236440 the log reads `archs=x64, arm64` for one `UsageMaxx-Setup-0.1.0.exe`, packaged
  from `dist\win-unpacked` and `dist\win-arm64-unpacked`. The `usagemaxx-installer` artifact grew
  from 111 MB to 216 MB, and the x64 smoke screenshot from that run looked right. The yml keeps
  `x64` only as a default, with a comment saying the command line decides.
- **`package (windows-11-arm)` works on GitHub's hosted Windows ARM runner.** In run 38782435117
  it ran `npm run verify` natively on ARM (all tests pass), packaged with `arch=arm64` into
  `dist/win-arm64-unpacked`, launched that `UsageMaxx.exe` under Playwright, and uploaded
  `popup-demo-arm64.png`. Downloaded and looked at: identical to the x64 screenshot (Claude, Codex,
  and Cursor cards, pace colors, countdowns, footer). Nothing needed deferring.
- **Nothing in the app assumed x64**: paths come from environment variables, the Credential
  Manager reader is PowerShell with pointer-sized `IntPtr` marshaling (Windows on ARM ships native
  ARM64 PowerShell), SQLite is Electron's built-in `node:sqlite`, and the tray icons are PNGs drawn
  in code. No code changed.
- **Not verified:** installing and running on a real Windows on ARM PC or Parallels (the UM12
  human check, Task Manager → Details → Architecture should read ARM64).

**Fix after the human check (2026-10-16):**

- **Found by the user:** installing on Windows 11 on ARM (Parallels) left
  `%LOCALAPPDATA%\Programs\UsageMaxx` without `UsageMaxx.exe` or any DLL. The Finish page's launch
  then reported a missing shortcut target. The data files (`.pak`, `.dat`, `locales`) were there.
- **Cause:** electron-builder's current 7-Zip packs ARM64 `.exe`/`.dll` files with its `ARM64`
  filter. The installer unpacks with the older `Nsis7z` plugin, which can't decode that filter, and
  `extractUsing7za` never checks its result, so the files were skipped without an error. x64 files
  use `BCJ2`, which the plugin reads. CI listed the packages inside the installer:
  `app-arm64.7z` used `ARM64 LZMA2:20`, `app-64.7z` used `BCJ2`.
- **Fix:** `electron-builder.yml` sets `nsis.useZip: true` (with `differentialPackage: false`, which
  `useZip` requires; there's no auto-update). Zip has no executable filters, and its unpacker
  (`nsisunz`) stops with an error if anything fails. The cost is size: the combined installer grew
  from 216 MB to 304 MB.
- **CI now installs the real installer** with `scripts/install-check.ps1`, silently, on both
  runners (the ARM job downloads the combined installer from `package`). The script fails unless
  every file of the matching unpacked build arrived and `UsageMaxx.exe`'s PE header has the
  expected architecture. Then it smoke-launches the installed app. The first version listed DLLs by
  hand and wrongly expected `libEGL.dll`/`libGLESv2.dll`, which Electron 44 doesn't ship; it now
  compares against the build output.
- **Shown to catch the bug:** on the throwaway branch `um/p4-arm-install-repro` (the check without
  the fix, run 38814352062), the ARM install check failed with 7 files missing: `UsageMaxx.exe`,
  `ffmpeg.dll`, `d3dcompiler_47.dll`, `dxcompiler.dll`, `dxil.dll`, and the Vulkan DLLs. With the fix
  (run 38814374954) every job passed. The ARM install reported "every file … is ARM64", and the
  installed apps' screenshots on both runners were looked at.

---

### UM12 — README, docs, upstream notes · Sonnet · checkpoint

**Verify:** `npm run verify` green; README has: what it is, unofficial-port notice + credit,
screenshot from the Windows CI run (`docs/assets/screenshot.png`, demo data), Install
(installer from the CI artifact or a release; SmartScreen "More info → Run anyway"; Windows 11
"show the icon on the taskbar" steps), Supported providers with Windows credential sources,
Privacy, Building from source, Relationship to OpenUsage, Risks and terms (unofficial,
undocumented endpoints per provider, the provider terms that may restrict this with linked
sources, what limits the risk, Read-only Logins, "use at your own risk; not legal advice"),
License. `docs/README.md` indexes every doc; `docs/upstream.md` explains the PR situation and holds a draft issue for the user.
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
  note, link upstream; other Windows ports exist — Pane, CrossUsage), Risks and terms (below),
  License.
- README.md "Risks and terms" (added mid-plan 2026-10-15 at the user's request), plain and
  factual: UsageMaxx is unofficial and not affiliated with OpenUsage or any provider. Claude,
  Codex, Cursor, Copilot, Z.ai, Grok, and Devin are read through undocumented internal endpoints
  with the login the provider's own CLI or app stored; UsageMaxx identifies itself as those
  clients do and, unless Read-only Logins is on, renews expired logins with their client IDs.
  OpenRouter, Ollama Cloud, and OpenCode Go use documented APIs. Provider terms may restrict
  this: Anthropic's Claude Code legal page said in February 2026 that subscription OAuth tokens
  are only for Claude Code and claude.ai; Cursor's terms forbid reverse engineering and its staff
  have said private endpoints are off-limits; no provider has approved this app, and the
  endpoints can change or be blocked at any time. What limits the risk: it only reads usage
  (never sends AI requests on your subscription), refreshes each provider about once every 5
  minutes, backs off when rate-limited, sends tokens only to the provider's own servers, and never
  writes Cursor's database; Read-only Logins removes token renewal entirely. Use at your own risk;
  this isn't legal advice. Link the sources:
  https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546 ,
  https://forum.cursor.com/t/does-using-oh-my-pi-s-cursor-provider-or-an-openai-compatible-proxy-to-the-same-endpoints-violate-cursor-s-tos/167778 ,
  and GitHub's Acceptable Use Policies
  (https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies).
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

**Implementation notes (2026-10-15):**

- **The README follows the prompt's sections**, with the screenshot from UM11's Windows CI run
  (`docs/assets/screenshot.png`, demo data). Install points at the CI artifact, because there are
  no releases yet; it also covers Windows 10's tray setting and what uninstalling leaves in
  `%APPDATA%\UsageMaxx`.
- **"Risks and terms" (added mid-plan) is as specified**, with one correction for accuracy: "backs
  off on rate limits" now says how. Claude waits out Anthropic's `Retry-After`; the other providers
  simply wait for the next 5-minute refresh. Also, "one request per provider every 5 minutes" became
  "one refresh … (a few small requests each)", because Cursor and Copilot make several calls per
  refresh. GitHub's Acceptable Use Policies are linked as the terms that govern GitHub's services,
  without claiming more than that.
- **`docs/upstream.md` was checked against upstream on 2026-10-15**: the owner's reply on #374, a
  collaborator's on #1064, #1043 declined, the six Windows PRs closed unmerged, and CONTRIBUTING's
  issue-first and no-AI-commit-message rules. Replies are paraphrased, not quoted. The draft issue
  says plainly that it's unposted and that #1043, a near-duplicate, was declined. Nothing was
  posted upstream.
- **`docs/README.md` indexes every doc**, and CLAUDE.md now lists the README, the index, the
  upstream notes, and when the README's provider table, Privacy, and Risks and terms must change.
- **Human check (the checkpoint):** the Windows checklist in the phase-4 PR.

**Human check result (2026-10-16):** the user installed the CI build on Windows 11 on ARM
(Parallels on an Apple Silicon Mac, VM on an external SSD) and, with live Claude and Codex logins,
reported that everything worked: install, the tray and popup, first run, and live numbers. The first
attempt found a real bug, ARM64 program files missing after install, fixed under UM11.1. Not checked
by hand, by the user's choice: API keys, Read-only Logins, and uninstalling; the user has no accounts
for the other eight providers. The README's Status section says so. The user then asked for the four
PRs to be merged into `main`, a one-time authorization: CLAUDE.md's rule that Claude never merges its
own PR stands for future work.

---

## Deferred follow-ups (cross-step, live tracker)

> Things a step noticed but were out of its own scope. Strike through when handled; don't
> delete.

- **Right-click menus on rows and provider headers** (surfaced by UM5). Upstream offers Hide,
  Star for menu bar, Refresh, and Customize on right-click. UM5 has hover refresh and click
  toggles but no context menus; UM10's settings view covers hide and pin. Adding them needs an
  IPC call that opens a native `Menu` from main at the cursor.
- **Hand-test the rest** (surfaced by the UM12 check). Saving, revealing, and clearing an API key
  (DPAPI), Read-only Logins with a real expired login, uninstalling, and the eight providers without a
  live account so far (Copilot, Cursor, Devin, Grok, Ollama, OpenCode Go, OpenRouter, Z.ai).
- **Smaller installers** (surfaced by the UM11.1 fix). Zip packaging makes the combined x64 + arm64
  installer 304 MB. Options: separate per-architecture installers, or 7z again once electron-builder's
  `Nsis7z` decodes the ARM64 filter (or lets the filter be turned off). `install-check.ps1` will show
  whether either works.
- **New providers in later versions** (surfaced by UM10). Upstream runs the first-run detection once
  for each provider an update adds (missing from both `enabledProviders` and `knownProviders`),
  turning it on only when its credentials are found and `autoEnable` allows it. v0.1 has no earlier
  version to upgrade from, so this isn't wired yet; it belongs in `AppStore.create` with a test.
- **Reset and Reset All Customization** (surfaced by UM10). Upstream's per-provider Reset and the
  Reset All button (which re-runs detection) aren't built; neither is undo.
- **OpenCode 2 credentials** (surfaced by UM9). OpenCode 2 keeps the `opencode-go` key in each
  `opencode*.db`'s `credential` table (after the `import_legacy_credentials` migration) and leaves
  OpenCode 1's `auth.json` behind, so a logout or new login made in OpenCode 2 isn't seen. Porting
  upstream's `OpenCodeAuthStore.goAPIKey` needs a generic read-only query on `SqliteReader` and a
  directory listing on `FileSystem` (to find every `opencode*.db`).
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
- **7z-packed NSIS installers silently drop ARM64 program files.** electron-builder's current 7-Zip
  compresses ARM64 `.exe`/`.dll` with the `ARM64` filter; the installer's `Nsis7z` decoder can't
  read it and doesn't report the failure. Keep `nsis.useZip: true`, and keep CI's
  `scripts/install-check.ps1`, which installs the real installer on x64 and ARM. Launching the
  unpacked build alone can't catch this.
- **A command-line target overrides electron-builder.yml's arch list** (`--win nsis` builds only the
  host architecture). `npm run dist:win` passes `--x64 --arm64` explicitly.

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
