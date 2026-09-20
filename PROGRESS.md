# Progress — Risk & Contingency

Status snapshot + session log, for picking the project back up quickly.
For *how things work* (architecture, data model, gotchas, decisions),
see [CLAUDE.md](CLAUDE.md) — that's the living technical reference and
is kept current; this file is the higher-level "where are we" summary.

**Last updated:** 2026-09-20, end of session. All work described below
is merged to `main` and deployed — `git status` is clean, local `main`
matches `origin/main` exactly (`d6ce211`), and `gh pr list` confirms all
10 PRs opened today are merged. Nothing is pending.

## What the app is

A static, server-less risk register tool (`riskandcontingency.com`,
Cloudflare Pages, no build step, no backend) that reads and writes a
real Excel workbook directly in a folder on the user's own machine via
the File System Access API (Chrome/Edge/Opera only). Full description
and FAQ are on the live [About page](https://riskandcontingency.com/about.html).

## What's working today

| Area | Status |
|---|---|
| Home | Folder connection, setup-sequence stepper (dismissible once complete), dark/light theme toggle |
| Risk Register | Full CRUD: Likelihood/Direct Cost/Knock On/Schedule/QHSE assessments (pre & post), response actions, sortable + highlighted list (EMV/Cost/Schedule/QHSE toggle), row-click-to-edit, Duplicate |
| Modelling | Monte Carlo simulation (1k/5k/10k trials) over Regular Pooled Record risks, Pre and/or Post mitigation, histogram + fitted bell curve chart |
| Contingency | Available budget vs. last Monte Carlo run, S-curve with budget reference line, confidence-coverage reading |
| Configuration | RBS, Impact Areas, Owners, QHSE Levels — all CRUD, starter template |
| About | Description + 6-question FAQ (data storage, browser support, concurrent-edit behavior, EMV methodology, Monte Carlo scope, account requirements) |
| **Risk Reporting** | **Not built** — still an empty state. The one remaining page. |

Cross-cutting, done today: real `.xlsx` persistence (vendored SheetJS),
save-conflict detection (blocks a save if the file changed on disk
since load, shows a banner — single-editor-at-a-time by design, not a
bug), stale-browser-cache fix (`_headers` + update-available banner),
dark mode, mobile-responsive header.

## Today's session (2026-09-20) — 10 PRs

1. **#1** Corrected CLAUDE.md/README: hosting is Cloudflare Pages, not GitHub Pages (a prior-session doc error).
2. **#2** App shell: design system, navigation, File System Access folder connection.
3. **#3** Dark mode, setup-sequence stepper, real `.xlsx` read/write, Configuration CRUD, first Risk Register form.
4. **#4** Assessment model v2: Likelihood as a %, Total Cost (computed) grouping with Direct Cost/Knock On indented under it, QHSE, declared Max fields, layout pass.
5. **#5** Monte Carlo engine, S-curve chart, percentile table.
6. **#6** Renamed "Reporting" → "Risk Reporting", added Contingency page.
7. **#7** Fixed a header-overflow bug that was hiding the theme toggle; setup sequence made Home-only + dismissible; Modelling made dual-phase (Pre/Post checkboxes) with a histogram/bell-curve chart replacing the S-curve there.
8. **#8** Fixed stale browser cache (`_headers`, version-check banner, deploy version bump).
9. **#9** Save-conflict detection + banner; new About page with FAQ.
10. **#10** Risk Register list: sortable + highlighted EMV/Cost/Schedule/QHSE toggle, row-click-to-edit, Duplicate (replacing Edit), Title half-width form row.

## Decisions made this session (don't re-litigate without reason)

- **Storage**: File System Access API, Chromium-only, accepted trade-off. See CLAUDE.md "Data storage".
- **Knock On**: treated as an indirect/downstream cost, distinct from Direct Cost (Primavera Risk Analysis convention) — `EMV = Likelihood% × (DirectCost + KnockOn)`. This was **not explicitly specified by the user**, just inferred — flag it again if anything about EMV looks off.
- **Concurrency**: explicitly single-editor-at-a-time, confirmed with the user. Conflict detection blocks + warns rather than merging.
- **Monte Carlo**: only "Regular Pooled Record" risks are simulated; Likelihood is itself sampled from its own distribution each trial (not collapsed to its expected value first).
- **Monte Carlo chart type**: Modelling uses a histogram + bell curve (per explicit request); Contingency kept the cumulative S-curve, since "what confidence does my budget give me" needs the cumulative view — these are deliberately different chart types for different questions.
- **Record Type "Pooled" → "Regular Pooled Record"** (renamed), fixed enum (not configurable, unlike RBS/Impact Areas/Owners/QHSE Levels).

## Known gaps / next steps

- **Risk Reporting** is the one unbuilt area: list all risk records, rank top-N by EMV / Max Total Cost / Schedule Exposure / Max Schedule. Natural next task.
- Multi-project support doesn't exist — one workbook per folder, no project switcher.
- QHSE Levels are configurable as a named list, but there's no severity *scoring* (e.g. a numeric weight per level) — only the label is used today.
- No automated test suite exists; verification this session was manual (in-browser, via a mocked `FileSystemDirectoryHandle` — see CLAUDE.md's "Testing this" notes under conflict detection) each time before shipping.

## Workflow reminder for tomorrow

Per CLAUDE.md: run `scripts/auto-deploy.sh "message"` at the end of
each unit of work — commit → push → PR → squash-merge → back to
`main`, no confirmation needed (standing instruction, confirmed by the
user this session). Verify UI changes in the Browser pane before
shipping (a hand-rolled fake `FileSystemDirectoryHandle` mock is
required for anything past the folder-connection step — real OS file
pickers can't be automated).
