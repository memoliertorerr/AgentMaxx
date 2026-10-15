# UsageMaxx and Upstream OpenUsage

Why UsageMaxx is a standalone project instead of a pull request to
[robinebers/openusage](https://github.com/robinebers/openusage), what a contribution back could
realistically look like, and a draft issue you could post. Checked on 2026-10-15.

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
  to the PR's author are closed automatically, without review. It also forbids AI-generated commit
  messages, and the codebase is Swift; UsageMaxx shares no code with it.
- **The name.** "OpenUsage" is a trademark; forks may not use the name or logo
  ([TRADEMARK.md](https://github.com/robinebers/openusage/blob/main/TRADEMARK.md)). This project is
  UsageMaxx. Its repository is still named `OpenUsageMaxx`, which contains the mark; renaming the
  repository is the owner's call.

## What a contribution could realistically be

Porting surfaces provider facts that apply to both apps: a field that's sometimes a string, a
payload shape upstream doesn't handle, a doc that's out of date. Those are worth sending upstream
the way its rules ask:

1. Open an issue describing the provider bug or doc fix, with the evidence (a captured, anonymized
   payload or the exact error), and say you'd like to fix it.
2. Wait for a maintainer to label it `approved` and assign it to you.
3. Make only that change, in Swift, with your own commit message, and link the issue.

Windows support itself isn't on the table.

## Draft issue (for you to send, or not)

> **Draft only.** Nothing has been posted upstream; whether to post this is your decision. Note
> that a very similar request, #1043, was declined in July 2026, so it may well be declined again.
> If you post it, write the final wording yourself.

**Title:** Docs: a short "community ports" note for Windows and Linux users

**Body:**

> Windows users keep arriving at OpenUsage (#374, #1064, #1043) and leaving without an answer in
> the README. In #374 you already pointed people to community efforts, which helped.
>
> Would you accept a short, clearly-unofficial note in the README or the docs, for example:
> "OpenUsage is macOS-only. Community projects for other systems exist; they aren't affiliated
> with or supported by OpenUsage", with links to the ports you're comfortable listing (Pane,
> CrossUsage, UsageMaxx)? Each uses its own name, per TRADEMARK.md.
>
> Happy to open the PR myself if you approve and assign this issue, or to leave it with you.

## Where things stand

| Item | Status |
|---|---|
| Upstream PR | Not planned |
| Draft issue above | Not posted |
| Provider fixes to send upstream | None identified yet |
