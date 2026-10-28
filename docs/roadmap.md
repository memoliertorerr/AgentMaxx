# Roadmap

What version 0.1 includes, what's known to be missing, and what could come next. Nothing below
is promised or scheduled.

## In 0.1

- A tray icon with up to two pinned meters, and a popup dashboard: meters, reset countdowns,
  pace warnings, and an "Outdated" tag.
- Ten providers: Claude, Codex, Cursor, Copilot, Devin, Grok, Ollama Cloud, OpenCode Go,
  OpenRouter, and Z.ai.
- A 5-minute refresh that keeps the last good numbers when a provider fails.
- First-run detection, Settings in the popup, API keys encrypted with Windows DPAPI, launch at
  login, and Read-only Logins.
- One installer for Intel/AMD and Windows on ARM, built and install-tested in CI on both.

## Known gaps

- **Not checked by hand yet:** saving, revealing, and clearing an API key; Read-only Logins with a
  real expired login; uninstalling; and eight providers with live accounts (Copilot, Cursor,
  Devin, Grok, Ollama, OpenCode Go, OpenRouter, Z.ai). Reports are welcome in Issues.
- **The installer is large** (about 300 MB) because it carries both the x64 and ARM builds,
  packed as zip. Separate per-architecture installers would roughly halve that.
- **No right-click menus** on rows and provider headers. Hiding and pinning are in Settings
  instead.
- **No Reset or Reset All** for customization, and no undo.
- **OpenCode 2 logins** kept in OpenCode's own databases aren't read yet; only OpenCode 1's
  `auth.json` is.
- **Providers added in a future version** won't turn themselves on for existing installs yet.
  First-run detection only runs once, on a fresh install.

## Possible next steps

| Feature | What it involves |
|---|---|
| **Spend tiles and Total Spend** (Today, Yesterday, Last 30 Days) | Reading Claude, Codex, Grok, and OpenCode session logs locally, plus model pricing data. This is the largest feature OpenUsage has that AgentMaxx doesn't. |
| **Logins kept in Windows Credential Manager** | For example, Codex with `cli_auth_credentials_store = keyring`. |
| **Signed installer and auto-update** | A code-signing certificate and GitHub Releases. Needed before wider distribution. |
| **Multiple accounts per provider** | One card per account (Claude Swap, Codex Swap, several Codex homes). |
| **Antigravity** | Reading Google's Antigravity IDE quotas. |
| **Local HTTP API and a command-line tool** | Other programs reading the same numbers, as OpenUsage offers. |
| **Notifications** | A Windows notification when a quota runs low or is projected to run out. |
| **Smaller features** | Global shortcut, reordering by drag, sharing a card as an image, proxy support, hiding usage while screen sharing. |

Suggested order: spend tiles first, then Credential Manager logins, then signing and
auto-update.
