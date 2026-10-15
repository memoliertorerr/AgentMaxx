# Copilot

Tracks your GitHub Copilot quota using a GitHub token that Copilot tooling already left on your
PC. Ported from OpenUsage's [Copilot provider](https://github.com/robinebers/openusage/blob/main/docs/providers/copilot.md).

## What it tracks

| Metric | Default | Meaning |
|---|---|---|
| Credits | on, pinned | Share of your monthly AI-credit allotment used. On org-managed seats it's a plain count of your own credits used |
| Extra Usage | on | Premium interactions beyond your included credits, once extra spend is enabled |
| Org Credits | on, behind the caret | AI credits your whole organization used this month (org-managed seats; needs org owner or billing manager access) |
| Org Spend | on, behind the caret | Dollars your organization was billed for AI credits |
| Chat / Completions | on, behind the caret | Free-plan quotas (unlimited on paid plans, so they read "No data" there) |

## Where credentials come from

Checked in this order, cheapest first:

1. **Copilot editor plugins**: `%LOCALAPPDATA%\github-copilot\apps.json` (or `hosts.json`),
   written by the Copilot plugins for Neovim, JetBrains, and others.
2. **GitHub CLI config**: `%APPDATA%\GitHub CLI\hosts.yml` (or `%GH_CONFIG_DIR%\hosts.yml`),
   when `gh` stores its token in the file.
3. **`gh auth token`**, when the GitHub CLI is installed. It reads its token from Windows
   Credential Manager itself.
4. **Windows Credential Manager directly**: the `gh:github.com:<user>` entry that `gh` creates.
   The `user` from `hosts.yml` is preferred when there are several.

Only `github.com` entries are used; a GitHub Enterprise token is never sent to github.com.

### Setup

If nothing is found, sign in with the GitHub CLI:

```powershell
winget install GitHub.cli
gh auth login
```

## Troubleshooting

- **"Sign in to GitHub Copilot…"**: no token was found. Run `gh auth login`, or sign in to
  Copilot in a supported editor.
- **"GitHub token invalid or expired"**: GitHub rejected the token (401/403). Run
  `gh auth login` again.
- **Plan shown but no meters**: an org-managed Business/Enterprise seat. GitHub only exposes org
  totals, and only to org owners or billing managers. The token from `gh auth login` can list
  your orgs; some editor-plugin tokens can't.

## Under the hood

- `GET https://api.github.com/copilot_internal/user` with Copilot's client headers (API version
  `2025-04-01`). Buckets report percent remaining; the meters show percent used.
- For org-managed seats: `GET /user/orgs`, then
  `GET /orgs/{org}/settings/billing/usage/summary` until one reports Copilot AI-credit usage.
  That org is remembered while the app runs.

## Not ported

- the macOS Keychain lookup (Credential Manager replaces it)
- remembering the billing org across restarts (UsageMaxx re-discovers it once per launch)
