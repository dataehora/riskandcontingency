# Progress — Risk & Contingency

Status snapshot + session log, for picking the project back up quickly.
For *how things work* (architecture, data model, gotchas, decisions),
see [CLAUDE.md](CLAUDE.md) — that's the living technical reference and
is kept current; this file is the higher-level "where are we" summary.

**Last updated:** 2026-10-04 (PRs #17–#24, all merged to `main` and
live on riskandcontingency.com). Nothing is pending: `git status`
clean, local `main` = `origin/main`.

## What the app is

A static, server-less risk register tool (`riskandcontingency.com`,
Cloudflare Pages, no build step, no backend) that reads and writes a
real Excel workbook directly in a folder on the user's own machine via
the File System Access API (Chrome/Edge/Opera only). Available in
English, Portuguese (pt-BR) and Spanish. Full description and FAQ are on
the live [About page](https://riskandcontingency.com/about.html).

## What's working today

| Area | Status |
|---|---|
| Shell | Two-row header: R&C logo + connection + language/theme switches on top, page tabs below (active tab flows into the page); R&C logo (header, footer, favicon, og-image); EN/PT/ES flag switch; labelled Light/Dark theme switch; folder connection pill; update / conflict / save-error banners |
| Home | Folder connection, setup-sequence stepper (dismissible once complete), area cards |
| Risk Register | Full CRUD of risk records ("Formulário de Risco" in PT): Status, Risk/Record Type, owner, RBS, pre & post assessments (Likelihood, Direct Cost, Knock On, Schedule, QHSE) with sign rule by risk type, read-only Total Cost, response actions; configurable required fields shown in red; filters + record-count summary above/below the table; sortable EMV/Cost/Schedule/QHSE views; Duplicate; **baselines** (save named, view read-only, restore, delete) |
| Modelling | Monte Carlo (1k/5k/10k) over **Open + Regular Pooled** risks, Pre + Post by default; "Risks in this run" table + High Impact warning; histograms + S-curves + normal curve with options panel (phases, layers, bin size, plotted percentiles with values); summary table (Min, P10–P90, Max) + full P01–P99 distribution; **saved modellings** (save named, reload, delete) |
| Executive Summary (`reporting.html`, was "Risk Reporting"; nav after Contingency) | Risk Register Executive Summary (KPIs + generated text) + 5x5 Risk Assessment Matrix with Impact Area / Record Type / phase filters. **Top-N ranking table not built yet.** |
| Contingency | Budget vs. latest **or any saved** modelling; same chart + options panel as Modelling with the budget line; Confidence Covered (to 1%); Gap to P50; summary + full percentile tables with covered?/headroom |
| Configuration | RBS, Impact Areas, Owners, QHSE Levels (CRUD + starter template in the current language); required form fields (list + dropdown); Risk Assessment Matrix bins |
| About | Description + 7-question FAQ (data storage, browsers, concurrency, EMV, Monte Carlo scope, languages, accounts) |

## Session 2026-10-03 — final log (6 PRs)

1. **#17** Site-wide **EN/PT/ES** translation (`js/i18n/`: engine + 3 dictionaries, no-flash loading, values stored in English); **R&C logo** (header, home, footer, favicons, og-image); risk record **Status** (Open/Draft/Proposed/Closed ×4, legacy rows = Open); Monte Carlo limited to **Open + Regular Pooled**; Risk Register **filters + summary** above and below the table; Modelling **"Risks in this run"** table with High Impact warning; Risk Reporting **automated summary**.
2. **#18** Logo shown alone in the header and without the repeated brand text in the footer (big Home logo removed); **beatconfused-style language switch**; **labelled theme switch** (Theme: ☀ Light | ☾ Dark); store hardening (no saves before the workbook loads; failed writes show a "Couldn't save" banner and are undone); template buttons confirm with a toast; **required fields** configurable with red highlighting; Total Cost styled read-only; PT terminology **"Formulário de Risco"**.
3. **#19** Pre/post assessment cards tinted soft red / soft green; Monte Carlo Pre + Post by default; "Risk Register Executive Summary"; Contingency P05–P95; **PMI / ISO 31000 terms** in PT/ES (VME, EAR, Cronograma, QSMS/CSSMA, Referência, Prevenir/Evitar…); required fields as list + dropdown (default ID, Title, Record Type, Status, Owner); **sign rule** (threat ≥ 0, opportunity ≤ 0 for cost/schedule).
4. **#20** Modelling and Contingency: summary table (Min, P10–P90, Max) + full **P01–P99** distribution at the end of the page.
5. **#21** Contingency chart: overlaid Pre/Post **histograms + S-curves** with an options panel (phases, layers, bin size, plotted percentiles P20/P50/P80 by default); **Gap to P50** (negative = budget below P50) replaces Headroom; 500-point stored curve.
6. **#22** Histogram tallest bar at **75%** height; **percentile values** on the chart (toggle); Modelling gets the same chart + panel (shared `js/charts/run-chart.js`); **Risk Register baselines**; **saved modellings**; Contingency "Modelling to compare".

7. **#23** Final review + session log.
8. **#24** (2026-10-04) Answers to the open questions applied: PT "Registro de Risco" / "Tipo de Registro" / **"Pool de Riscos Regulares"** (ES "Pool de riesgos regulares"); inline name field instead of the browser prompt; "Risk Reporting" → **Executive Summary / Sumário Executivo**, moved after Contingency in the nav and on the home cards; **two-row header** with tab-style nav whose active tab continues into the page.

Final review (2026-10-03): every page scanned in PT and ES for leftover
English (only proper names remain: "Risk & Contingency", "Monte Carlo",
"Primavera Risk Analysis", CAPEX/OPEX) — 558 keys in each dictionary,
none missing; no console errors on any page; CLAUDE.md / README brought
up to date.

Infrastructure: Cloudflare zone **Browser Cache TTL** set by the user to
"Respect Existing Headers" (verified: JS/CSS/images now `no-cache`).
Files cached by a browser *before* that change could stay stale up to
4h — the cause of the "empty summary / empty required-fields list"
reports; resolved by itself / Ctrl+F5.

## Session 2026-09-27

- Both example risk templates are now Regular Pooled Record.
- Risk Register: Save button at the top of the form too; saving stays on the record and shows a "Saved R-000x" confirmation toast.
- Contingency S-curve ran 0%→100% edge to edge (superseded on 2026-10-03 by the shared histogram + S-curve chart).
- Configuration: 5x5 Risk Assessment Matrix bins (Likelihood 0–100%, Cost Impact 0 → highest cost in the register, equal bins by default and auto-tracking).
- Risk Reporting: RAM plot with Impact Area / Record Type (and Pre/Post) filters, plus a table of plotted risks.
- Dev server switched to a threaded server (single-threaded one stalled).
- Later the same day: Modelling chart = histogram + S-curve; Configuration RAM preview plots the risks; EMV totals row; editable, validated, unique Risk ID; hierarchical action IDs `R-0006-A-001`.

## Session 2026-09-20 — 10 PRs

1. **#1** Corrected CLAUDE.md/README: hosting is Cloudflare Pages, not GitHub Pages.
2. **#2** App shell: design system, navigation, File System Access folder connection.
3. **#3** Dark mode, setup-sequence stepper, real `.xlsx` read/write, Configuration CRUD, first Risk Register form.
4. **#4** Assessment model v2: Likelihood as a %, Total Cost (computed) grouping with Direct Cost/Knock On, QHSE, declared Max fields.
5. **#5** Monte Carlo engine, S-curve chart, percentile table.
6. **#6** "Reporting" → "Risk Reporting", Contingency page.
7. **#7** Header-overflow fix; setup sequence Home-only + dismissible; Modelling dual-phase with histogram/bell chart.
8. **#8** Stale browser cache fix (`_headers`, version-check banner, deploy version bump).
9. **#9** Save-conflict detection + banner; About page with FAQ.
10. **#10** Risk Register list: sortable + highlighted view toggle, row-click-to-edit, Duplicate.

## Decisions (don't re-litigate without reason)

- **Storage**: File System Access API, Chromium-only, accepted trade-off.
- **Concurrency**: single-editor-at-a-time; conflicts are blocked + explained, never merged.
- **Knock On**: indirect/downstream cost, `EMV = Likelihood% × (DirectCost + KnockOn)` — inferred, not specified; flag if EMV looks off.
- **Monte Carlo scope**: Open + Regular Pooled Record only; Likelihood itself sampled each trial.
- **Stored data stays English** (risk type, record type, status, strategy); only the display is translated. Templates are created in the current language.
- **PT terms (user's choice)**: Registro de Riscos (register), Registro de Risco (record), Tipo de Registro, Pool de Riscos Regulares; PMI/ISO terms elsewhere (VME, EAR, Cronograma, QSMS). "Risk Reporting" is now **Sumário Executivo**.
- **Sign rule**: threat cost/schedule ≥ 0, opportunity ≤ 0 (zero allowed).
- **Required fields** come from Configuration (default ID, Title, Record Type, Status, Owner); new records start with Risk Type / Record Type / Status blank.

## Answered questions (2026-10-04)

- Open risk with no post-mitigation assessment → its pre-mitigation EMV is used as post: **confirmed**.
- QSMS (PT) / CSSMA (ES) for QHSE: **confirmed**.
- Risk Record = "Registro de Risco", Record Type = "Tipo de Registro", Regular Pooled Record = "Pool de Riscos Regulares": **user's choice, applied**.
- Names via an inline field instead of `prompt()`: **applied**.

## Next steps (suggested)

- **Executive Summary top-N ranking** table (EMV / Max Total Cost / Schedule Exposure / Max Schedule) — the last originally planned area.
- Compare a baseline with the current register (differences per risk, EMV delta) — baselines can be viewed and restored, not yet diffed.
- Compare two saved modellings side by side on Modelling (today: one at a time; Contingency compares one against the budget).
- Multi-project support (one workbook per folder today).
- QHSE severity scoring (levels are labels only).
- No automated test suite; verification is manual in the Browser pane with the mocked `FileSystemDirectoryHandle` (CLAUDE.md "Testing note").

## Workflow reminder

Per CLAUDE.md: run `scripts/auto-deploy.sh "message"` at the end of
each unit of work — commit → push → PR → squash-merge → back to
`main`, no confirmation needed. Verify UI changes in the Browser pane
first (mock folder handle required past the connection step). Every new
user-facing string needs a key in `js/i18n/en.js`, `pt.js` **and**
`es.js`.
