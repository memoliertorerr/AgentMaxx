# UsageMaxx and Upstream OpenUsage

Why UsageMaxx is a standalone project instead of a pull request to
[robinebers/openusage](https://github.com/robinebers/openusage), and how provider fixes found here
could still go back upstream. Checked in October 2026.

## Why this isn't an upstream PR

- **Upstream has decided against other operating systems.** On
  [#374](https://github.com/robinebers/openusage/issues/374) (Windows support), the owner replied
  in April 2026 that they decided against supporting other OSes because the maintainers are all on
  macOS, and pointed Windows users to community efforts such as CrossUsage. On
  [#1064](https://github.com/robinebers/openusage/issues/1064) (port to Windows), a collaborator
  replied in August 2026 that the maintainers have no Windows computer to test on, and that the app
  had recently moved from Tauri to Swift.
- **Every Windows PR was closed unmerged:**
  [#435](https://github.com/robinebers/openusage/pull/435),
  [#457](https://github.com/robinebers/openusage/pull/457),
  [#458](https://github.com/robinebers/openusage/pull/458),
  [#459](https://github.com/robinebers/openusage/pull/459),
  [#532](https://github.com/robinebers/openusage/pull/532), and
  [#957](https://github.com/robinebers/openusage/pull/957).
- **A README link to a Windows port was declined** on
  [#1043](https://github.com/robinebers/openusage/issues/1043) (July 2026): upstream doesn't
  officially support ports.
- **The contribution rules rule it out anyway.** Upstream's
  [CONTRIBUTING.md](https://github.com/robinebers/openusage/blob/main/CONTRIBUTING.md) is
  issue-first: external PRs without a linked issue that a maintainer labeled `approved` and assigned
  to the PR's author are closed automatically, without review. The codebase is Swift; UsageMaxx
  shares no code with it.
- **The name.** "OpenUsage" is a trademark, and forks may not use the name or logo
  ([TRADEMARK.md](https://github.com/robinebers/openusage/blob/main/TRADEMARK.md)), so this project
  is called UsageMaxx and has its own icon.

## Sending provider fixes back

Porting surfaces provider facts that apply to both apps: a field that's sometimes a string, a
payload shape upstream doesn't handle, a doc that's out of date. Those are worth sending upstream
the way its rules ask:

1. Open an issue describing the provider bug or doc fix, with the evidence (a captured, anonymized
   payload or the exact error), and say you'd like to fix it.
2. Wait for a maintainer to label it `approved` and assign it to you.
3. Make only that change, in Swift, and link the issue.

Windows support itself isn't on the table.
