# UsageMaxx Docs

Everything in `docs/`, by audience. The project's front page is the [README](../README.md).

## Using UsageMaxx

| Doc | What's in it |
|---|---|
| [settings.md](settings.md) | First run, every Settings screen (Providers, API Keys, General, About), Read-only Logins, where settings live |
| [providers/claude-usage.md](providers/claude-usage.md) | Claude: metrics, Claude Code's login on Windows, token renewal, troubleshooting |
| [providers/codex.md](providers/codex.md) | Codex: metrics, the Codex CLI's `auth.json`, token renewal, troubleshooting |
| [providers/cursor.md](providers/cursor.md) | Cursor: metrics, the read-only `state.vscdb` login, troubleshooting |
| [providers/copilot.md](providers/copilot.md) | Copilot: metrics, editor plugins, GitHub CLI, and Credential Manager tokens |
| [providers/devin.md](providers/devin.md) | Devin: metrics, `credentials.toml` and the Devin app |
| [providers/grok.md](providers/grok.md) | Grok: the weekly pool, the Grok CLI's login, token renewal |
| [providers/ollama.md](providers/ollama.md) | Ollama Cloud: the signing key, why it never turns itself on |
| [providers/opencode.md](providers/opencode.md) | OpenCode Go: the Go key and usage windows |
| [providers/openrouter.md](providers/openrouter.md) | OpenRouter: the API key (encrypted or `OPENROUTER_API_KEY`) |
| [providers/zai.md](providers/zai.md) | Z.ai: the API key and GLM Coding Plan quotas |

The [README](../README.md) also covers installing, privacy, and **Risks and terms**.

## Working on UsageMaxx

| Doc | What's in it |
|---|---|
| [architecture.md](architecture.md) | Process model, provider pipeline, API keys, refreshing, state, first run and Settings, tray and popup, data locations, dev hooks, build and packaging |
| [BUILD_PLAN.md](BUILD_PLAN.md) | The step-by-step build plan, progress tracker, implementation notes, deferred follow-ups, landmines, and what's planned for later |
| [upstream.md](upstream.md) | Why this isn't an upstream PR, how to contribute provider fixes back, and a draft issue |
| [../CLAUDE.md](../CLAUDE.md) | Standing instructions for coding agents: rules, commands, file map, conventions |

## Assets

- [assets/screenshot.png](assets/screenshot.png): the popup with demo data, from the packaged app on
  a Windows CI runner (UM11). Safe to publish; it contains no real account data.
