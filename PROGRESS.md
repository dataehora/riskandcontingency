# Progress — Risk & Contingency

Status snapshot + session log, for picking the project back up quickly.
For *how things work* (architecture, data model, gotchas, decisions),
see [CLAUDE.md](CLAUDE.md) — that's the living technical reference and
is kept current; this file is the higher-level "where are we" summary.

**Last updated:** 2026-09-27 (see "Session 2026-09-27" below). Previously: 2026-09-20, end of session. All work described below
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
| Configuration | RBS, Impact Areas, Owners, QHSE Levels — all CRUD, starter template; Risk Assessment Matrix bins |
| About | Description + 6-question FAQ (data storage, browser support, concurrent-edit behavior, EMV methodology, Monte Carlo scope, account requirements) |
| Risk Reporting | Automated register summary (2026-10-03) + 5x5 Risk Assessment Matrix with Impact Area / Record Type / phase filters. **Top-N ranking not built yet.** |

Cross-cutting, done today: real `.xlsx` persistence (vendored SheetJS),
save-conflict detection (blocks a save if the file changed on disk
since load, shows a banner — single-editor-at-a-time by design, not a
bug), stale-browser-cache fix (`_headers` + update-available banner),
dark mode, mobile-responsive header.

## Session 2026-10-03

- **Languages**: whole site in English / Português / Español — flag switch in the header (SVG flags, so they show on Windows too), choice remembered, defaults to the browser language. Every string lives in `js/i18n/en.js`, `pt.js`, `es.js`; new copy must be added to all three (see CLAUDE.md "Internationalisation").
- **Logo**: the R&C logo now in the header, home page, footer, favicon and social preview image.
- **Risk Register**: new **Status** field (Open, Draft, Proposed, Closed – Rejected/Impacted/Mitigated/Expired); existing records read as Open; templates are Open. Filters (search, status, type, record type, impact area) with the record-count summary above and below the table.
- **Modelling**: only **Open + Regular Pooled Record** risks are simulated; a "Risks in this run" table (threats/opportunities included and excluded, by reason) sits before the chart, with an explicit note when High Impact risks were left out.
- **Risk Reporting**: automated written summary before the RAM — totals by type and status (open / under review / closed), mitigation effect on open risks, response actions, top residual threat.
- Same day, 2nd PR: header logo without repeated brand text; footer likewise; big logo removed from Home; beatconfused-style language switch; labelled Light/Dark theme switch; Portuguese uses "Formulário de Risco" for Risk Record; required fields configurable in Configuration (default ID, Title, Status, Owner) and shown in red on the form; Total Cost visibly read-only; save failures now show a banner instead of failing silently; template buttons confirm with a toast. Cloudflare Browser Cache TTL fixed by the user (verified `no-cache`).
- Same day, 3rd PR: pre/post cards tinted red/green; Monte Carlo Pre + Post by default; "Risk Register Executive Summary" (the empty summary the user saw was stale cached JS from before the Cloudflare fix — files cached under the old 4h header stay up to 4h); Contingency table P05–P95 + Max; PMI/ISO terms in pt/es (VME, EAR, Cronograma, QSMS…); required fields as list + dropdown (default adds Record Type); threats only accept positive cost/schedule values, opportunities only negative.
- Same day, 4th PR: Modelling and Contingency both show a summary table (Min, P10–P90, Max) and the full distribution (Min, P01–P99, Max) at the end of the page; Confidence Covered now to 1% resolution.
- Same day, 5th PR: Contingency chart = Pre/Post histograms + S-curves overlaid with an options panel (phase toggles, histograms/S-curves on-off, bin size, plotted percentiles — default P20/P50/P80, add/remove); "Gap to P50" (negative = budget below P50) replaces "Headroom at P50"; Modelling now stores a 500-point curve.
- Same day, 6th PR: histogram's tallest bar = 75% height; percentile values on the plotted P's (toggle); Modelling gets the same chart + options panel as Contingency; Risk Register baselines (save named / view read-only / restore / delete); saved modellings (save named / reload / delete); Contingency can compare against any saved modelling.
- Open question for the user: post-mitigation EMV of an open risk without a post assessment is taken as its pre-mitigation EMV in the summary.

## Session 2026-09-27

- Both example risk templates are now Regular Pooled Record.
- Risk Register: Save button at the top of the form too; saving stays on the record and shows a "Saved R-000x" confirmation toast.
- Contingency S-curve now runs from 0% at the left edge to 100% at the right edge (previously stopped at the modelled max when the budget was higher), with round-number x ticks.
- Configuration: 5x5 Risk Assessment Matrix bins (Likelihood 0–100%, Cost Impact 0 → highest cost in the register, equal bins by default and auto-tracking).
- Risk Reporting: RAM plot with Impact Area / Record Type (and Pre/Post) filters, plus a table of plotted risks. List + top-N ranking still not built.
- Dev server switched to a threaded server (single-threaded one stalled).
- Later the same day: Modelling chart = histogram (left axis, iterations) + S-curve (right axis, 0–100%), x-axis from 0; Configuration RAM preview now plots the risks; EMV totals row; editable, validated, unique Risk ID (never-reused auto numbers, load-time repair of bad IDs); hierarchical action IDs `R-0006-A-001`.
- ~~Open: Cloudflare Browser Cache TTL overrode `_headers` for JS/CSS (4h)~~ — fixed by the user 2026-10-03.

## Session 2026-09-20 — 10 PRs

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

- **Risk Reporting** list/ranking is the one unbuilt area (the RAM exists): list all risk records, rank top-N by EMV / Max Total Cost / Schedule Exposure / Max Schedule. Natural next task.
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
