# Risk and Contingency — project notes for Claude

Static site, no build step: plain HTML/CSS/vanilla JS. Hosted on
**Cloudflare Pages** (custom domain riskandcontingency.com, bound in the
Cloudflare dashboard — not via the repo's `CNAME` file, which is a
leftover from an earlier GitHub Pages setup and has no effect on
Cloudflare Pages). Repo: `dataehora/riskandcontingency`.
See [README.md](README.md) for the user-facing description and repo
layout — this file is developer/agent context that doesn't belong there.

## Status

Real build underway (started 2026-09-20). Landed so far:
- Design system + app shell/navigation across 5 pages, dark/light theme
  toggle (top-right, defaults to OS preference, choice persisted).
- File System Access folder connection (`js/storage/folder-connection.js`).
- Real `.xlsx` read/write via vendored SheetJS (`js/storage/workbook.js`,
  `js/storage/register-store.js`) — RBS/Impact Areas/Owners and full risk
  records with pre/post assessments and response actions all persist to
  `risk-register.xlsx` in the connected folder.
- **Configuration**: real CRUD for RBS, Impact Areas, Owners, plus
  "load starter template".
- **Risk Register** (renamed from Working Space): full create/edit/list/
  delete for risk records — all fields, 8 distribution groups (4
  dimensions x pre/post) with live validation and EMV, response actions
  sub-form, 2 loadable example templates.
- **Setup sequence**: 4-step stepper (`js/setup-sequence.js`) shown on
  every page, gates each area behind its prerequisite and explains what's
  missing rather than failing silently.

Still empty-state placeholders: **Modelling** (new page — no simulation
engine exists yet, only the gated tab) and **Reporting** (list + top-N
ranking not built). Update this section as each ships.

## Stack

- HTML + CSS + vanilla JavaScript. No framework, no bundler, no build
  step.
- No `package.json`, no Node dependencies. Nothing to install.
- Hosting: **Cloudflare Pages**, connected to this repo's `main` branch
  (root as the output directory, no build command — it's plain static
  files). Custom domain `riskandcontingency.com` is bound to the Pages
  project from the Cloudflare dashboard (Workers & Pages → project →
  Custom domains). Because the DNS zone and the Pages project are in
  the same Cloudflare account, Cloudflare manages the DNS record for
  the custom domain automatically — no manual DNS records needed in
  the Cloudflare DNS tab for this.

## Architecture

The app is a set of static, server-less pages sharing one design system
and one storage layer — no SPA framework, no router, no bundler.

**Pages** (flat, root-level, no build step so no pretty-URL routing):
`index.html` (home/dashboard), `risk-register.html` (renamed from
working-space.html 2026-09-20), `modelling.html`, `reporting.html`
(nav label "Risk Reporting" since 2026-09-20, filename unchanged),
`contingency.html`, `configuration.html`. Nav order: Home, Risk
Register, Modelling, Risk Reporting, Contingency, Configuration. Each
page repeats the same header/footer markup (no templating available)
and loads the same four stylesheets from `css/`, plus a small inline
no-flash theme script in `<head>`, `js/vendor/xlsx.full.min.js`, and its
`type="module"` scripts.

**Design system** (`css/`): `tokens.css` (CSS custom properties — color,
spacing, type), `base.css` (reset + typography), `components.css`
(buttons, cards, tables, badges, forms, empty states, setup-sequence
stepper, distribution-input groups), `shell.css` (header/nav/theme-
toggle layout). Visual direction: professional risk/engineering-
consulting aesthetic (deep navy `--color-primary`, muted gold
`--color-accent`, red/amber/green for risk severity), loosely inspired
by Oracle Primavera Cloud's layout conventions — not a clone, no Oracle
branding/colors reused.
Notes:
- Any element hosting both an author `display` rule (e.g. `.btn`,
  `.notice`) and the `hidden` attribute needs the global
  `[hidden] { display: none !important; }` rule in `base.css` to
  actually hide — same-specificity author rules otherwise beat the UA
  stylesheet.
- **Theme**: defaults to OS `prefers-color-scheme`; the toggle switch
  (top-right of the header, `js/theme.js`) sets an explicit
  `data-theme="light"|"dark"` on `<html>`, stored in `localStorage`
  (`theme-preference`) and applied synchronously by an inline
  head script (avoids a flash) before `theme.js` (a module, so
  deferred) wires the switch itself. `tokens.css` defines dark tokens
  twice — once under `@media (prefers-color-scheme: dark)` guarded by
  `:root:not([data-theme="light"])`, once under `:root[data-theme="dark"]`
  — so an explicit choice always wins over the OS setting.

**Data storage** (`js/storage/`): **File System Access API** — the user
picks a folder once via `showDirectoryPicker`, the app reads/writes a
real `risk-register.xlsx` workbook in it directly via vendored
[SheetJS](https://sheetjs.com) (`js/vendor/xlsx.full.min.js`,
MIT-licensed, loaded as a plain global-exposing `<script>`, not a CDN
dependency). Pure client-side, no backend. Trade-off accepted: Chromium
only (Chrome/Edge/Opera) — no Firefox/Safari; every page shows an
explicit unsupported-browser notice via `isFileSystemAccessSupported()`
rather than failing silently.
- `idb-kv.js`: tiny IndexedDB key/value wrapper, used to persist the
  chosen `FileSystemDirectoryHandle` across sessions (handles are
  structured-cloneable in Chromium).
- `folder-connection.js`: connect/reconnect/disconnect flow and
  connection state (`checking`/`unsupported`/`disconnected`/
  `reconnect`/`connected`/`error`), exposed via `onConnectionChange`.
  `reconnect` exists because the browser requires a fresh user gesture
  to re-grant permission each session even when the handle is remembered.
- `workbook.js`: the `.xlsx` schema and pure logic — sheet layout
  (`RBS`, `ImpactAreas`, `Owners`, `RiskRegister`, `Actions`),
  `loadWorkbook`/`saveWorkbook` (via `window.XLSX`), `configTemplate()`,
  `riskRecordTemplates()` (the 2 generic examples), distribution
  validation (`validateDistribution`) and EMV math (`calculateAssessment`).
  All pure/testable — no DOM, no File System Access calls.
- `register-store.js`: in-memory register state backed by the workbook.
  Loads on `folder-connection` reaching `connected`, re-saves the whole
  workbook on every mutation (registers are small — whole-file rewrites
  are simpler than incremental sheet patching). Converts between the
  flat xlsx row shape and the nested `{pre:{...}, post:{...}, actions:[]}`
  shape pages work with. Exposes `getRegisterState`/`onRegisterChange`
  plus mutators (`applyConfigTemplate`, `rbsList`/`impactAreaList`/
  `ownerList` add/remove, `saveRiskRecord`, `deleteRiskRecord`,
  `loadRiskRecordTemplate`).
- `js/shell.js` wires connection state to the DOM via data attributes:
  `[data-connection-pill]`/`[data-connection-label]` (status pill),
  `[data-connection-action]`/`[data-connection-disconnect]` (buttons —
  supports multiple per page), `[data-requires-connection]`/
  `[data-requires-no-connection]`, `[data-unsupported-notice]`.
- `js/setup-sequence.js` renders the 4-step stepper into any
  `[data-setup-sequence]` container and gates content via
  `[data-requires-step="N"]` (shown once step N is done) /
  `[data-step-locked-notice="N"]` (shown while locked, names the actual
  missing prerequisite and links to it) — see "Setup sequence" below.

**Domain model**: currently a single workbook (one active project) in
the connected folder — no multi-project switcher yet, despite RBS being
conceptually "per project"; add that if/when it's actually needed. A
risk record: Risk Title, Risk Type (Threat/Opportunity), Record Type
(fixed enum in `RECORD_TYPES`, `workbook.js` — "Regular Pooled Record"
[renamed from "Pooled" 2026-09-20] / High Impact / Benchmark — not
configurable, unlike RBS/Impact Areas/Owners/QHSE Levels), Description,
Cause, Effect, Risk Owner, Impact Area, RBS Category.

**Pre- and post-mitigation assessment**, 6 groups in this order —
Likelihood, Total Cost, Direct Cost, Knock On, Schedule, QHSE — and
this UI grouping, not just a flat list (`js/pages/risk-register.js`):
Likelihood on its own; Total Cost in its own accent-highlighted block
since it's the only one EMV is calculated from; Direct Cost and Knock
On indented inside that block (they're its components); Schedule and
QHSE together in a separate grey box below, visually distinct because
neither feeds EMV.
- **Likelihood**: a %, 1–100 (changed from a 0–1 probability
  2026-09-20) — `DIMENSION_BOUNDS` in `risk-register.js`, enforced by
  `validateDistribution`'s optional `bounds` param in `workbook.js`.
  Divided by 100 in `calculateAssessment` wherever it's used as a
  probability weight.
- **Direct Cost**, **Knock On** (currency), **Schedule** (days): each a
  3-cell Min/ML/Max input validated into exactly one of:
  - **Single point** — Most Likely (ML) only.
  - **Uniform** — Min and Max only, with Max > Min.
  - **Triangular** — Min, ML, Max, strictly increasing (min < ml < max).
  Pre-mitigation Likelihood/Direct Cost/Schedule are required; Knock On
  and every post-mitigation dimension are optional.
- **Total Cost**: *not* a user input — computed live from Direct Cost +
  Knock On (`totalCostRange()` in `workbook.js`), shown as read-only
  Min/Expected/Max tiles plus the EMV.
- **QHSE**: qualitative, a single select from the configurable
  `qhseLevels` named list (Configuration page; same CRUD pattern as
  RBS/Impact Areas/Owners), seeded from `QHSE_LEVEL_NAMES` — Negligible,
  Minor, Medium, Major, Catastrophic. Stored as a plain string
  (`pre_qhse`/`post_qhse` columns), no calculation feeds off it (yet).

**Knock On + EMV — documented assumption** (2026-09-20, not explicitly
specified by the user, follow up if it's wrong): Knock On is treated as
an *indirect/downstream* cost impact, distinct from Direct Cost — the
"knock-on cost" convention from Primavera Risk Analysis (the user's own
visual/domain reference). Per assessment phase, in `calculateAssessment()`:
`EMV = (Likelihood/100) x (DirectCost_EV + KnockOn_EV)`,
`MaxTotalCost = MaxDirectCost + MaxKnockOn`,
`ScheduleExposure = (Likelihood/100) x Schedule_EV`,
`MaxSchedule = Schedule_max`.
`_EV` = the distribution's expected value (ML for single point,
(min+max)/2 for uniform, (min+ml+max)/3 for triangular). `MaxDirectCost`/
`MaxKnockOn`/`MaxTotalCost`/`MaxSchedule` are explicitly declared,
computed fields on every assessment (per the user's request 2026-09-20
that they not be implicit) — stored as their own xlsx columns
(`{phase}_maxDirectCost` etc.) and available for Reporting/Contingency
to read without recomputing.

Response actions (0+ per risk record, `Actions` sheet, FK `riskId`):
Action Title, Action Owner, Strategy, Due Date, Cost. Strategy options
depend on the parent record's Risk Type: Threat →
Eliminate/Mitigate/Transfer/Monitor-Accept; Opportunity →
Exploit/Enhance/Share/Monitor-Accept (`STRATEGIES` in
`js/pages/risk-register.js`).

**Setup sequence**: 1) select folder, 2) create config file (RBS/Impact
Areas/Owners/QHSE Levels — "done" once any has at least one entry,
whether hand-added or from the template), 3) create risk record (at
least one row in `RiskRegister`), 4) run modelling — done once
`settings.lastModelledAt` is set (written by every simulation run, see
below). Each step's UI is gated behind the previous one via
`[data-requires-step]`/`[data-step-locked-notice]` (see
`setup-sequence.js` above) — never silently hidden without explanation.

**Monte Carlo modelling** (`js/storage/monte-carlo.js`, pure/testable;
UI in `js/pages/modelling.js`): simulates only **Regular Pooled Record**
risks (`pooledRecords()` filters by `recordType`), for a chosen phase
(pre/post, user-selected — no strong default convention exists for
this, so both are offered rather than guessing) and trial count
(1,000/5,000/10,000). Per trial, per pooled record: Likelihood is
*itself sampled* from its own Min/ML/Max distribution (not collapsed to
its expected value first) and compared against a fresh uniform draw to
decide whether the risk "occurs" that trial; if it occurs, Direct Cost
and Knock On are independently sampled (`sampleDistribution` — inverse-
CDF for triangular, linear for uniform, constant for single-point) and
summed into that trial's portfolio total. Verified against deterministic
cases (always-occurs, never-occurs) and statistical ones (50% likelihood
→ ~50% nonzero trials; triangular sample mean converges to
(min+ml+max)/3) — see test transcript in this session if it needs
re-deriving.
Output: `summarize()` returns Min, P05–P50 in steps of 5, Max (exactly
the table the user asked for — deliberately stops at P50/median, not
P100). `curvePoints()` subsamples to ≤200 points for the S-curve so a
10k-trial run doesn't render 10k SVG points. The S-curve is a single-
series line chart (no legend needed per the dataviz skill's rule for
single series), using `--color-primary-alt` (already dark-mode-themed
in `tokens.css`) for the line, with a hover crosshair+tooltip and the
percentile table always shown alongside as the accessible/tabular
fallback. Every run persists `lastModelledAt`/`lastModelledTrials`/
`lastModelledResultsJson` to the workbook's `Settings` sheet via
`updateSettings()` — this marks setup-sequence step 4 done, and is what
the Contingency page reads rather than re-running the simulation.
`lastModelledResultsJson` holds `{ phase, summary, curve }`: `curve` is
`curvePoints(sorted, 200).map(p => p.value)` — the **subsampled** ≤200
values, not the raw trials array. This matters: an xlsx cell caps out
around 32,767 characters, and 10,000 raw trial numbers as JSON would
exceed that. `js/charts/s-curve.js` (shared by Modelling and
Contingency) re-derives cumulative % from array *position*, so feeding
it these 200 already-sorted, evenly-spaced values reproduces the same
curve shape without needing the full trial data.

**Contingency page** (`contingency.html`, `js/pages/contingency.js`):
gated behind setup-sequence step 4 (reuses
`[data-requires-step="4"]`/`[data-step-locked-notice="4"]` — a Monte
Carlo run must exist). A single "Available Budget" number input,
persisted to `settings.availableBudget` on `change` (blur/Enter, not
per-keystroke). Once both a budget and a stored Monte Carlo run exist,
shows: the S-curve with the budget as a second (red,
`--color-danger`) reference line distinct from the median crosshair;
a "Confidence Covered" reading — the highest of P05–P50 the budget
meets or exceeds, walking `PERCENTILE_STEPS` ascending (there's no
percentile above P50 to report against, by the user's own spec, so a
budget above the modelled max just says "covers full modelled range"
rather than inventing a number); and a comparison table (modelled cost
/ covered? / headroom) for Min, each P05–P50, and Max.

**Testing note**: the whole connected-state flow (Configuration CRUD,
Risk Register save/edit/delete, EMV) was verified end-to-end in-browser
using a hand-rolled fake `FileSystemDirectoryHandle` (methods on a
class prototype so `structuredClone`/IndexedDB can clone the instance
without hitting a `DataCloneError` on its own functions) that
`window.showDirectoryPicker` was monkey-patched to return — real
OS-level folder-picker UI can't be driven by browser automation. This
caught two real bugs: the `[hidden]`/`display:flex` CSS specificity
issue (see above) and a form-error box queried with
`form.querySelector` when it was actually a DOM sibling of `<form>`,
not a child (fixed to `document.querySelector`). Worth reusing this
mock approach for any future change to the storage layer.

**Build sequencing**: 1) shell + design system + folder connection
(done); 2) Configuration CRUD + SheetJS wiring (done); 3) Risk Register
form + validation + EMV + response actions (done); 4) dark mode + setup
sequence + Modelling tab scaffold (done); 5) assessment model v2 —
Likelihood as %, Total Cost/Direct Cost/Knock On grouping, QHSE,
declared Max fields, layout (done, 2026-09-20); 6) Monte Carlo modelling
engine + S-curve + percentile table (done, 2026-09-20); 7) Contingency
page + Risk Reporting nav rename (done, 2026-09-20); 8) Risk Reporting
itself (list + top-N ranking of EMV/Max Total Cost/Schedule Exposure/
Max Schedule) — not started, still the one empty-state page left.

## Local dev server

`.claude/launch.json` runs `.claude/nocache_server.py` (not
`python -m http.server`) on port **5850** — a tiny wrapper that adds
`Cache-Control: no-store` to every response, so local edits are always
reflected without a manual hard-refresh. Plain `http.server` sends no
caching headers at all, which lets the *browser* heuristically cache
scripts and makes edits look like they aren't applying — if that ever
happens, suspect the browser's cache before the code.

Port 5850 is deliberately different from beatconfused's 5849, so both
repos' dev servers can run at the same time without colliding.

## Deploy / workflow conventions (same as dataehora-site and beatconfused)

- `git push` to `main` publishes to Cloudflare Pages automatically — no
  build workflow (Cloudflare's own Git integration watches `main` and
  deploys on push).
- **Autonomous commit → PR → merge**: after finishing a unit of work,
  run `scripts/auto-deploy.sh ["commit message"]` without asking for
  confirmation first. It does, end to end:

  ```
  branch  ->  commit  ->  push  ->  gh pr create  ->  gh pr merge --squash --admin  ->  checkout main  ->  git pull
  ```

  - Idempotent: does nothing on a clean working tree.
  - Run it once at the **end** of a task, not after every file edit, so
    partial work never gets published.
  - Requires `gh` authenticated (already set up: account `dataehora`).
- Prefer several small, reviewable PRs over one giant one, mirroring how
  beatconfused was worked (7 PRs in one session rather than a mega-PR).
- Commits/PRs end with the Claude Code attribution lines currently in
  use for this session (check a recent commit/PR, or the system prompt,
  for the exact wording — it's supplied per-session and may change).

## Setup status

- Confirmed working as of 2026-09-20: `riskandcontingency.com` and
  `www.riskandcontingency.com` resolve to Cloudflare anycast IPs, and
  the live site serves the current `index.html` over HTTPS. Custom
  domain binding + DNS + SSL is fully handled from the Cloudflare
  dashboard (Pages project's Custom domains tab) — nothing to set up
  from this repo's side.
- Nothing else needed — no API keys, no accounts, no local installs
  required to code here (just Python 3, used by the dev server).
