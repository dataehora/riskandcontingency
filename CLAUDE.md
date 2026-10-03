# Risk and Contingency — project notes for Claude

Static site, no build step: plain HTML/CSS/vanilla JS. Hosted on
**Cloudflare Pages** (custom domain riskandcontingency.com, bound in the
Cloudflare dashboard — not via the repo's `CNAME` file, which is a
leftover from an earlier GitHub Pages setup and has no effect on
Cloudflare Pages). Repo: `dataehora/riskandcontingency`.
See [README.md](README.md) for the user-facing description and repo
layout — this file is developer/agent context that doesn't belong there.
See [PROGRESS.md](PROGRESS.md) for the session-by-session status log
(what's built, what's not, decisions made) — start there to pick the
project back up; come here for the technical "how things work" detail.

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

- **Risk Assessment Matrix** (2026-09-27): 5x5 bins configured on
  Configuration, plotted on Risk Reporting — see "Risk Assessment
  Matrix" below.

- **2026-10-03**: site-wide EN/PT/ES translation (see "Internationalisation"
  below), the R&C logo across the site, risk record **Status**, Risk
  Register filters + record-count summary, Modelling "Risks in this run"
  table, Risk Reporting automated register summary.

- **2026-10-03 (2nd PR)**: header/footer show the logo without the
  repeated "Risk & Contingency" text, labelled Light/Dark theme switch,
  beatconfused-style language switch, configurable required fields with
  red highlighting, read-only styling for Total Cost, visible save
  errors, "Formulário de Risco" terminology in Portuguese.

- **2026-10-03 (4th–6th PRs)**: P10–P90 summary + P01–P99 tables on
  Modelling and Contingency; shared histogram + S-curve chart with an
  options panel on both pages (75% bar height, percentile values);
  Risk Register baselines and saved modellings (see "Saved snapshots").
  Final session log + open questions: PROGRESS.md.

- **2026-10-03 (3rd PR)**: pre/post assessment cards tinted soft red /
  soft green, Monte Carlo runs Pre + Post by default, Risk Reporting card
  renamed "Risk Register Executive Summary", Contingency table P05–P95 +
  Max (one row per level), PMI/ISO terminology in pt/es, required-fields
  config as list + dropdown, sign rule for cost/schedule impacts.

- **2026-10-04**: "Risk Reporting" renamed **Executive Summary** and
  moved after Contingency (nav + home cards); two-row header with
  tab-style nav; inline name field for baselines/modellings (no
  `prompt()`); PT terms "Registro de Risco" / "Pool de Riscos Regulares".

Still not built: Executive Summary's top-N ranking table (the summary and
the RAM are on that page). Update this section as it ships.

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

## Caching & live updates

No build step means no content-hashed filenames (`app.a3f8c9.js`), so
the browser has no natural signal that `shell.js`/`workbook.js`/etc.
changed between deploys — it just keeps serving whatever it cached until
told otherwise. Two layers fix this (added 2026-09-20, after the user
hit a stale-cache deploy):
- **`_headers`** (repo root): a Cloudflare Pages-specific file (not a
  regular served asset — Pages reads it to set response headers) with
  `/* \n  Cache-Control: no-cache` — applies to every response site-wide.
  `no-cache` (not `no-store`) means the browser still revalidates with
  the origin via ETag before using a cached copy, so unchanged files
  still get a cheap 304 rather than a full re-download, but a changed
  file is never silently served stale.
  **Caveat found 2026-09-27:** on the custom domain, JS/CSS responses
  came back with `Cache-Control: max-age=14400` (HTML correctly
  `no-cache`) — the zone's Caching → Configuration → **Browser Cache
  TTL** overrides `_headers` for static assets unless it's set to
  "Respect Existing Headers". Symptom: new HTML running with old JS
  (e.g. the Configuration RAM preview rendering empty). Check with
  `curl -sI https://riskandcontingency.com/js/pages/configuration.js`. This has no effect locally — the
  dev server has its own `no-store` headers via `nocache_server.py`,
  unrelated to this file.
- **`js/version-check.js`** (loaded on every page): covers the
  narrower case of a tab left open *across* a deploy, where `_headers`
  alone doesn't help since no new request happens until the user
  navigates. Polls `/version.json` every 30s (`cache: "no-store"`) plus
  immediately on `visibilitychange` back to visible, and shows a
  persistent (reappears if dismissed and still stale next check) banner
  with a "Refresh now" button — deliberately *not* a forced auto-reload,
  since that could silently discard an in-progress Risk Register form
  edit that hasn't been saved yet.
  `version.json`'s `{"version": "<UTC timestamp>"}` is regenerated by
  `scripts/auto-deploy.sh` on every real deploy (inserted after the
  "anything to publish?" idempotency check, so an empty deploy still
  correctly no-ops rather than bumping the version for nothing).

## Security headers, 404, SEO (2026-09-27)

- **`_headers`** also sets `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` site-wide, and `X-Robots-Tag: noindex` on
  `https://:project.pages.dev/*` (`:project` is Cloudflare's literal
  placeholder syntax) so preview/`*.pages.dev` URLs don't compete with
  the real domain in search.
- **CSP is `Content-Security-Policy-Report-Only`** (logs violations to
  the console, blocks nothing). The only third-party code is **Google
  Analytics** (GA4, `G-2DF5MS2G7H`, added 2026-10-02) — no ads, fonts,
  CDNs or external APIs (SheetJS is vendored) — so the policy is
  `'self'` plus Google's documented GA4 hosts (`*.googletagmanager.com`
  in script/img/connect-src, `*.google-analytics.com` and
  `*.analytics.google.com` in img/connect-src), plus:
  - **Google tag**: first thing after `<head>` on every page (incl.
    `404.html`), as Google instructs. Its inline config script is kept
    on **one line** on purpose — the working tree is CRLF on Windows but
    git/Cloudflare serve LF, and a multi-line inline script would hash
    differently in each. It has its own `'sha256-…'` in `script-src`;
    same recompute rule as the theme script below. `about.html`'s
    "Where is my data stored?" FAQ discloses GA — keep that in sync if
    analytics changes.
  - `script-src` has a `'sha256-…'` hash for the inline no-flash theme
    script in every page's `<head>`. **If that inline script changes by
    even one character, recompute the hash** (sha256 of the text between
    `<script>` and `</script>`, base64) or the theme script will be
    reported (and blocked once enforced).
  - `style-src 'unsafe-inline'` is needed for the many `style="…"`
    attributes in pages and in JS-generated markup (charts,
    conflict banner). Removing it means moving those into classes.
  - Verified 2026-09-27 by serving the policy as *enforcing* from a
    throwaway local server: every page, theme script and the
    `/version.json` poll worked with zero violations. To enforce it,
    rename the header to `Content-Security-Policy`. No `report-uri`
    endpoint exists (no backend).
- **`404.html`**: Cloudflare Pages serves it with a real 404 status for
  any unknown path (without it, Pages falls back to SPA-style serving
  `index.html` with 200). `noindex`, not in the sitemap, uses root-
  absolute asset paths so it renders at any nested URL.
- **SEO**: each page has exactly one `<h1>`, a ≤~60-char `<title>`, a
  140–160-char meta description, and `og:*` + `twitter:card` tags with
  `og:image` → `images/og-image.png` (1200x630, generated with PIL —
  PNG, since most social platforms don't render SVG og:images).
  `sitemap.xml` has `<lastmod>` per URL, **set by hand** — bump it when a
  page's content meaningfully changes.
- **JSON-LD** (`index.html` only): one `@graph` with a `WebSite` and a
  `SoftwareApplication` (BusinessApplication, operatingSystem "Web").
  Only facts stated on the site — **no `offers`/price**, because no page
  says the tool is free (only the README's MIT license does). Add
  `"offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}`
  if/when the site says so. `application/ld+json` is a non-executed data
  block, so it needs no CSP hash.

## Internationalisation (2026-10-03)

Every page is available in English, Portuguese (pt-BR) and Spanish, via
a flag switch built into the header next to the theme toggle.
- **Engine**: `js/i18n/i18n.js` (ES module, imported by `shell.js` and
  every page script). Static HTML carries `data-i18n="key"` (textContent),
  `data-i18n-html="key"` (innerHTML — only for dictionary copy with
  `<strong>`/`<code>`) or `data-i18n-attr="attr:key;attr:key"`. Dynamic
  text uses `t(key, vars)`, `tn(key, count, vars)` (plural: `key.one` /
  `key.other`, `{count}` pre-formatted) and `tv(group, value)` for stored
  enum values. Pages re-render on `onLangChange()`; the Risk Register
  form re-renders without losing unsaved input (`relabelForm`).
- **Dictionaries**: `js/i18n/en.js` (reference), `pt.js`, `es.js` — flat
  `"area.thing": "text"` maps. **Every new user-facing string needs a key
  in all three files.** On localhost `i18n.js` console-warns any key
  missing from pt/es, and `t()` warns on a key missing everywhere.
  Keep the English text in the HTML equal to `en.js` (it's what crawlers
  and no-JS readers see).
- **Stored data stays English**: Risk Type, Record Type, Status and
  Strategy are saved in English in the workbook and only *displayed*
  translated (`value.<group>.<English value>` keys), so a file behaves
  the same whichever language opens it. User-typed names (RBS, owners,
  QHSE levels…) are never translated. The Configuration starter template
  and the two example risk records are created **in the language selected
  at the time** (`tpl.*` keys) — they're ordinary data afterwards.
- **Language choice**: `localStorage['lang-preference']`, else the
  browser language if it's pt/es, else English. Numbers/dates format with
  the site language's locale (`locale()`: en-US / pt-BR / es-ES), not the
  browser's, so a page never mixes conventions.
- **No flash of English**: the inline `<head>` script (same one that
  applies the theme) sets `data-i18n-pending` when the language isn't
  English; `base.css` hides `body` until `i18n.js` removes it, with a
  1.5s CSS-animation failsafe in case the script never runs. To keep
  that window short, every page loads `/js/i18n/i18n.js` as a module in
  `<head>` (first in deferred-script order) and the 1 MB SheetJS script
  is `defer` — before, the blocking SheetJS download held the whole
  translation pass back. That inline
  script's CSP hash in `_headers` was recomputed for this — recompute
  again if it changes.
- **Flags are inline SVG, never emoji** — Windows ships no flag emoji, so
  Chrome/Edge there render "🇺🇸" as the letters "US" (the user hit this on
  beatconfused.com, whose switch this one is otherwise modelled on).
- Not localised: URLs (one URL per page, client-side switch), JSON-LD,
  `og:*` tags (English).

- **PMI / ISO 31000 terminology** (2026-10-03, user request — no English
  left in pt/es tables and forms): pt VME (Valor Monetário Esperado), EAR
  (Estrutura Analítica dos Riscos), Cronograma (schedule; due date =
  Data-limite), QSMS (QHSE), Custo Indireto (Knock On), Referência
  (Benchmark), Prevenir (Eliminate, = PMI "avoid"); es VME, RBS,
  Cronograma, CSSMA, Costo indirecto, Referencia, Evitar. English keeps
  EMV / RBS / QHSE / Knock On. The QHSE section heading is `dim.qhse`.
- **Portuguese terminology (user's choice, final 2026-10-04)**: Risk
  Register = "Registro de Riscos", Risk Record = "Registro de Risco",
  Record Type = "Tipo de Registro", Regular Pooled Record = **"Pool de
  Riscos Regulares"** ("pool" kept as the international term; ES uses
  "Pool de riesgos regulares" for consistency). "Formulário" now only
  means the form UI itself.
- **"Risk Reporting" → "Executive Summary"** (2026-10-04): nav label
  `nav.reporting` = Executive Summary / Sumário Executivo / Resumen
  Ejecutivo; the file is still `reporting.html` and the i18n keys keep
  the `rep.*` / `reporting` names.

**Header layout** (2026-10-04, `shell.css`): two rows via CSS grid areas
(markup order unchanged): top row = logo (left) + connection pill /
buttons / language / theme switches (right); bottom row = the page tabs.
Tabs have rounded tops; the **active tab** takes `--color-bg` (the page
background), a gold top edge, and `margin-bottom: -2px` so it covers the
header's gold bottom border — visually continuous with the page below.
Under 860px the tabs become the hamburger drop-down (active item marked
with a gold left edge) and the actions take a full second row.

**Header switches** (2026-10-03): language (`i18n.js`) and theme
(`js/theme.js`, builds `[data-theme-switch]`: caption "Theme" + "☀ Light
| ☾ Dark" buttons, the active one a raised gold chip, tooltip says
whether it's following the OS) share one look copied from the
beatconfused.com switcher (light pill on the navy header, `shell.css`).
Under 860px only icons/flags show and `.app-header-actions` takes a full
row so they wrap instead of overflowing.

**Logo** (2026-10-03): the user's R&C logo (dark "R"/"C", green→gold
ampersand). `images/logo.png` = original colours on transparent (light
backgrounds); `images/logo-light.png` = off-white letters + lightened
ampersand (navy header, dark mode). `[data-logo-for="light-bg"|"dark-bg"]`
+ `shell.css` pick the right one per theme. The header shows the logo
**alone** and the footer shows logo + sentence without "Risk &
Contingency —": the user read the brand text right after the R&C logo
as a duplicated "&". (Earlier "duplicate logos" reports were the stale
4h CSS cache showing both theme variants at once — fixed in the
Cloudflare dashboard on 2026-10-03, `curl -sI` now shows `no-cache` for
JS/CSS/images.) Favicons and `og-image.png`
were regenerated from it with PIL (source image isn't in the repo — the
transparent `logo.png` is the master now).

## Architecture

The app is a set of static, server-less pages sharing one design system
and one storage layer — no SPA framework, no router, no bundler.

**Pages** (flat, root-level, no build step so no pretty-URL routing):
`index.html` (home/dashboard), `risk-register.html` (renamed from
working-space.html 2026-09-20), `modelling.html`, `reporting.html`
(nav label "Risk Reporting" since 2026-09-20, filename unchanged),
`contingency.html`, `configuration.html`, `about.html`. Nav order (2026-10-04): Home,
Risk Register, Modelling, Contingency, Executive Summary
(`reporting.html`), Configuration, About. `about.html` is the only page with no connection-gated content —
it's a static description + FAQ, always fully visible regardless of
folder-connection state (still shares the same header/footer/theme
shell for consistency, and still loads `shell.js`/`theme.js`/
`version-check.js`/`conflict-banner.js`, just not `setup-sequence.js` —
nothing on the page needs step-gating). Each page repeats the same
header/footer markup (no templating available) and loads the same four
stylesheets from `css/`, plus a small inline no-flash theme script in
`<head>`, `js/vendor/xlsx.full.min.js`, and its `type="module"` scripts.

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
- Same trap, different rule: the global `input, select, textarea { width:
  100%; padding: 8px 10px; }` in `components.css` also matches
  `input[type=checkbox|radio]` unless overridden — any real (visible)
  checkbox needs `input[type="checkbox"] { width: auto; padding: 0; }`
  (already added) or it renders as a giant padded box, not a checkbox.
  The theme-toggle's checkbox never hit this because it's
  `.visually-hidden`, which happened to mask the bug until the Modelling
  phase checkboxes (2026-09-20) made it visible.
- **Theme**: defaults to OS `prefers-color-scheme`; the toggle switch
  (top-right of the header, `js/theme.js`) sets an explicit
  `data-theme="light"|"dark"` on `<html>`, stored in `localStorage`
  (`theme-preference`) and applied synchronously by an inline
  head script (avoids a flash) before `theme.js` (a module, so
  deferred) wires the switch itself. `tokens.css` defines dark tokens
  twice — once under `@media (prefers-color-scheme: dark)` guarded by
  `:root:not([data-theme="light"])`, once under `:root[data-theme="dark"]`
  — so an explicit choice always wins over the OS setting.
- **Header layout** (2026-09-20 fix): with 6 nav items plus the
  connection pill/buttons/theme toggle, the header row no longer
  reliably fits on one line at common desktop widths (was the actual
  cause of the toggle seeming to not exist — it was overflowing/getting
  clipped, not missing). Fixed by giving `.app-header` `min-height`
  instead of a fixed `height`, and `.app-header-inner`
  `flex-wrap: wrap` with `.app-nav`/`.app-header-actions` both
  `flex: none` (so each wraps as a whole unit rather than squeezing) and
  `.app-header-actions { margin-left: auto }` (stays right-aligned
  whichever line it lands on). Verified at 1280px (one line) and 1000px
  (wraps to two, toggle still fully visible) — if the header ever looks
  broken again, check this before assuming an element vanished.

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
  `loadRiskRecordTemplate`) — **every mutator now returns `true`/`false`**
  (2026-09-20; previously returned nothing) so callers know whether the
  save actually happened.
- **Concurrency / conflict detection** (2026-09-20 — this app is
  explicitly a single-editor-at-a-time tool, documented on `about.html`;
  this doesn't add multi-editor support, it only turns *silent* data
  loss into a *visible, blocked* conflict): File System Access has no
  real locking, so `register-store.js` tracks `knownFileModifiedAt`
  (the file's `lastModified`, via `getFileLastModified()` in
  `workbook.js`) from its last successful load or save. Every mutator
  calls `checkConflict()` **first, before touching `state`** — if the
  file's current mtime doesn't match what we last saw, the mutation is
  abandoned (never applied optimistically, so the in-memory state never
  shows a change that isn't actually on disk), `state.conflict` is set,
  and `checkConflict()` returns `true` so the caller can react (e.g.
  `risk-register.js`'s `submitForm` stays on the form — the draft isn't
  lost — and shows an inline error instead of navigating away as if it
  saved). `js/conflict-banner.js` listens for `state.conflict` and
  injects a banner as the first child of `.app-main` on every page, with
  a "Reload latest" button that does a full `location.reload()` — no
  attempt at merging, since none is possible without real collaboration
  infrastructure this app doesn't have. This is a check-then-act race
  like any lock-free approach (the file can still change in the gap
  between the check and the write) — acceptable given the alternative
  (no check at all) is unconditionally worse, not because the race is
  eliminated.
  **Testing this**: the plain mock `FileSystemDirectoryHandle` used
  elsewhere in this file's testing notes isn't sufficient here — its
  `getFile()` must return a **stable** `lastModified` per stored buffer
  (only bumped on an actual write), not `Date.now()` freshly computed on
  every read, or every legitimate re-read looks like an external change.
  Store `{buffer, lastModified}` pairs and pass `lastModified` into the
  `File` constructor explicitly.
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
configurable, unlike RBS/Impact Areas/Owners/QHSE Levels), **Status**
(fixed enum `RISK_STATUSES`, 2026-10-03: Open / Draft / Proposed /
Closed - Rejected / Closed - Impacted / Closed - Mitigated / Closed -
Expired; `status` column after `recordType`; blank or unknown values —
i.e. every row saved before Status existed — load as **Open**, so old
registers model exactly as before; new records and both templates
are Open; a **new** record starts with Status blank (see "Required
fields"); "under review" = Draft + Proposed, `REVIEW_STATUSES`),
Description, Cause, Effect, Risk Owner, Impact Area, RBS Category.

**Pre- and post-mitigation assessment**, 6 groups in this order —
Likelihood, Total Cost, Direct Cost, Knock On, Schedule, QHSE — and
this UI grouping, not just a flat list (`js/pages/risk-register.js`):
Likelihood on its own; Total Cost in its own accent-highlighted block
since it's the only one EMV is calculated from; Direct Cost and Knock
On indented inside that block (they're its components); Schedule and
QHSE together in a separate grey box below, visually distinct because
neither feeds EMV.
- **Likelihood**: a %, 1–100 (changed from a 0–1 probability
  2026-09-20) — `boundsFor()` in `risk-register.js`, enforced by
  `validateDistribution`'s optional `bounds` param in `workbook.js`.
  Divided by 100 in `calculateAssessment` wherever it's used as a
  probability weight.
- **Direct Cost**, **Knock On** (currency), **Schedule** (days): each a
  3-cell Min/ML/Max input validated into exactly one of:
  - **Single point** — Most Likely (ML) only.
  - **Uniform** — Min and Max only, with Max > Min.
  - **Triangular** — Min, ML, Max, strictly increasing (min < ml < max).
  Which groups are mandatory is configured (see "Required fields"); by
  default none are. Cost/schedule values follow the sign rule.
- **Total Cost**: *not* a user input — computed live from Direct Cost +
  Knock On (`totalCostRange()` in `workbook.js`), shown as read-only
  Min/Expected/Max tiles plus the EMV.
- **QHSE**: qualitative, a single select from the configurable
  `qhseLevels` named list (Configuration page; same CRUD pattern as
  RBS/Impact Areas/Owners), seeded by the starter template (`tpl.qhse.*`
  keys, in the current language) — Negligible, Minor, Medium, Major,
  Catastrophic. Stored as a plain string
  (`pre_qhse`/`post_qhse` columns), no calculation feeds off it (yet).

**Risk Assessment Matrix** (2026-09-27; logic `js/storage/ram.js`, pure;
renderer `js/charts/risk-matrix.js`; editor in `js/pages/configuration.js`;
plot + filters in `js/pages/reporting.js`). Stored as `settings.ramJson`
(a `Settings` sheet column): `{ likelihood: [t1..t4], cost: {mode:
"equal"} | {mode: "custom", thresholds: [t1..t4]} }` — only the 4 inner
boundaries per axis; 0 and the axis max are implied. Likelihood spans a
fixed 0–100 (default 20/40/60/80). Cost Impact spans 0 to
`costAxisMax()` = the largest |Total Cost range min/max| across every
record's pre and post assessment, so it tracks the register. Default
cost mode is **"equal"**, which re-splits that span on every render (so
the equal default keeps following the register); editing any cost
boundary switches to **"custom"** absolute amounts, where only the top
edge follows the register — if the max drops below a custom boundary,
Configuration shows a warning (`costOutOfRange`) and Reporting says so.
**Assumptions (not specified by the user — follow up if wrong):** "Cost
Impact" = **Total Cost** (Direct Cost + Knock On EV, the same quantity
as EMV), not Direct Cost alone; each risk is placed by its *expected*
Likelihood and expected Total Cost; opportunities (negative costs) are
placed by magnitude and drawn with a dashed chip. Reporting adds a
Pre/Post selector (default Pre = inherent risk) alongside the requested
Impact Area and Record Type filters; bins are always resolved against the
whole register, not the filtered subset, so filtering never changes what
a cell means. Cell colour = L x I score band (1–4 low, 5–12 medium,
15–25 high). Risks with no Likelihood/Direct Cost in the chosen phase are
counted as "not shown", not silently dropped.
**Cross-tab refresh** (added with the RAM so Reporting follows config
edits made in another tab): `register-store.js` re-reads the workbook
silently on `focus`/`visibilitychange` when the file's mtime moved and
no conflict is flagged. The Risk Register form calls
`holdAutoRefresh(true)` while a draft is open so this can't turn a
would-be conflict into a silent overwrite of someone else's edit.

**Risk & action IDs** (2026-09-27, `workbook.js` "Risk & action IDs" +
`register-store.js` `saveRiskRecord`/`normalizeIds`/`finalizeActions`):
- Risk ID is an editable form field, prefilled for new records with
  `suggestRiskId()` (next `R-NNNN`). Must match `RISK_ID_PATTERN`
  (starts with a letter/digit — so a hand-edited `=…`/`+…`/`@…` can't act
  as a spreadsheet formula — then `[A-Za-z0-9._-]`, ≤32 chars) and be
  unique case-insensitively (`riskIdError`). Checked live in the form
  **and** again inside `saveRiskRecord` after the conflict check (so
  against state that matches disk), which throws `RiskIdError`.
- `saveRiskRecord(record, { originalId })`: `originalId` = the id when
  the form opened, so editing the ID field renames that record instead
  of creating a second one; its actions are re-prefixed.
- Auto numbers are never reissued: `settings.lastRiskNumber` is a
  high-water mark (a deleted R-0002 is not handed out again).
- Action IDs are hierarchical: `<riskId>-A-NNN` (3-digit, per risk,
  high-water mark in the record's `lastActionNumber` column). The old
  global `A-0001` ids are migrated on load.
- On load, `normalizeIds` gives any blank, duplicate or invalid risk id
  a fresh auto id and reports it in `state.idRepairs` (warning notice on
  the Risk Register list); the fix reaches disk with the next save — load
  never writes. A renamed duplicate gets no actions (they stay with the
  first record using that id — the Actions sheet can't disambiguate).
- EMV view of the list has a `<tfoot>` total row (net: opportunities
  are negative EMV).

**Required fields** (2026-10-03): `settings.requiredFieldsJson` (Settings
sheet column) lists the mandatory form fields, edited on Configuration
("Risk record form — required fields"); `parseRequiredFields()` /
`REQUIRED_FIELD_GROUPS` in `workbook.js`. Default **ID, Title, Record Type,
Status, Owner** (ID always, can't be removed). Keys are Details field names,
`<phase>.<dimension>` (a distribution counts as filled when any cell is)
or `<phase>.qhse`. The form marks required labels with a red asterisk
and paints every still-empty required field red **live** (`.is-missing`,
`updateMissingRequired()` on every input), and on save lists the missing
ones in the error box. The old hard-coded rule (pre Likelihood / Direct
Cost / Schedule required) is gone — tick them in Configuration to get it
back. Native `required` attributes were removed from the form (they
blocked the submit event, so the app's own message never showed). New
records start with a **blank Status** (placeholder option) so it's a
real choice; a blank Status that isn't required saves as Open.
Since the 3rd PR the default also includes **Record Type**, and Risk Type
/ Record Type can be required too: new records start with Risk Type,
Record Type and Status blank (placeholders); left blank and not required
they save as Threat / Regular Pooled Record / Open. The Configuration UI
is a list of the required fields with Remove buttons (ID shows "always
required") plus a dropdown of the remaining form fields to add — same
pattern as the RBS/owner lists, but a fixed choice, not free text.

**Sign rule** (2026-10-03): Direct Cost, Knock On and Schedule must match
the Risk Type — threats >= 0, opportunities <= 0 (zero allowed both
ways; a 0 knock-on is common). `boundsFor()` in `risk-register.js` passes
one-sided bounds to `validateDistribution()` (which now accepts `{min}` or
`{max}` alone plus a custom `message`); changing Risk Type re-validates
every group and updates the "values >= 0 / <= 0" hint in each header.
No rule while Risk Type is blank. Stored records aren't migrated — a
record that breaks the rule shows the error when opened.

Pre-mitigation card is tinted soft red, post-mitigation soft green
(`.card[data-assessment-phase]` in `components.css`).

Total Cost tiles are styled read-only (`.computed-tiles`: striped,
dashed gold border, muted values, lock note).

**Store hardening** (2026-10-03, `register-store.js` `mutate()`): every
mutator refuses while the workbook isn't loaded (`status !== "ready"` —
a template click right after connecting used to be applied to the empty
pre-load state and then wiped by the load), and a failed write (file open
in Excel, OneDrive lock…) sets `state.saveError`, re-reads the file so
the UI never shows an unsaved change, and `conflict-banner.js` shows a
"Couldn't save" banner. Template buttons confirm with a toast ("Example
added as R-000x") or say the workbook is still loading.

**Risk Register save** (2026-09-27): Save buttons at the top
(`.form-toolbar`, `form="record-form"`) and bottom; a successful save
**stays on the record** (draft replaced by the saved copy, so a new
record picks up its real id and a second save updates rather than
duplicates) and shows a fixed-position `.toast` confirmation.
`saveRiskRecord` now returns the saved record (still truthy) instead of
`true`. Both example templates are "Regular Pooled Record" (the Threat
one used to be High Impact).

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

**Risk Register list** (2026-09-20): columns are ID, Title, Type,
Status (added 2026-10-03), Record Type, Impact Area, Owner (Impact Area
before Owner), then an **EMV/Cost/Schedule/QHSE toggle** (`viewMode` in
`js/pages/risk-register.js`, defaults to EMV) swaps in a different set
of trailing columns, all marked `highlight: true` and rendered with the
`.col-highlight` CSS class (both `<th>` and `<td>`) so it's visually
obvious which part of the table matches the toggle:
- EMV: Pre EMV, Post EMV (from the record's stored `.computed`).
- Cost: Pre/Post Likelihood (`expectedValue()`, shown as a %) + Pre/Post
  Total Cost Min/ML/Max (`totalCostRange()` — "ML" here is that
  function's `ev`, a naming choice for consistency with the toggle's
  labels, not a literal triangular-distribution ML since Total Cost is
  derived, not a direct input).
- Schedule: same Likelihood columns + Pre/Post Schedule Min/ML/Max —
  these ARE the raw `scheduleImpact` input cells, shown as "—" when
  null (e.g. a single-point distribution genuinely has no Min/Max),
  unlike Cost's fallback-to-ML summing in `totalCostRange()`.
- QHSE: same Likelihood columns + Pre/Post QHSE level (plain string).
Every column (base and mode-specific) is independently sortable — click
a `<th data-sort-key>` to sort ascending, click again for descending
(▲/▼ shown on the active column); **switching the toggle resets the
sort** since the old sort column's key may not exist in the new column
set. Clicking anywhere on a row opens it for editing — the old "Edit"
button is gone, replaced with **"Duplicate"** (`duplicateRecord()`:
clones the record, clears `id`/`createdAt`/`updatedAt`, appends " (Copy)"
to the title, and — important — reassigns every response action a fresh
`local-` id via `createLocalAction()` so `saveRiskRecord` mints new
unique Action ids rather than colliding with the original record's rows
in the `Actions` sheet). Duplicate/Delete buttons and the row-click
handler share one delegated listener on `tbody`; button clicks are
checked and `return`ed on first, so they never also fire the row-click
(no `stopPropagation()` needed).
**Filters + summary** (2026-10-03): a filter bar (search over ID/title/
owner/RBS/impact area/description, Status, Risk Type, Record Type,
Impact Area, "Clear filters") sits above the table; the record-count
summary ("Showing X of Y risk records · n threats, m opportunities ·
k open") is rendered **above and below** the table and recomputed on
every filter change, and the EMV `<tfoot>` total covers the filtered
rows. The form shows a hint under Status/Record Type saying whether the
record will be in Monte Carlo.
The Details form's Title/Risk Type/Record Type row uses
`.title-row-grid` (`grid-template-columns: 2fr 1fr 1fr`, collapsing to
one column under 640px) — Title is exactly half the row width, by
request; Owner/Impact Area/RBS Category stay in the regular
auto-fit `.form-grid` below it.

**Setup sequence**: 1) select folder, 2) create config file (RBS/Impact
Areas/Owners/QHSE Levels — "done" once any has at least one entry,
whether hand-added or from the template), 3) create risk record (at
least one row in `RiskRegister`), 4) run modelling — done once
`settings.lastModelledAt` is set (written by every simulation run, see
below). Each step's UI is gated behind the previous one via
`[data-requires-step]`/`[data-step-locked-notice]` (see
`setup-sequence.js` above) — never silently hidden without explanation.
The **stepper widget itself** (not the gating) only renders on
`index.html` (2026-09-20) — every other page still has the gating
attributes but no `[data-setup-sequence]` container. Once all 4 steps
are done, a "Dismiss" button appears; dismissing sets
`localStorage['setup-sequence-dismissed']`, which hides the widget going
forward — but the moment any step becomes un-done again (e.g. a
different, emptier folder gets connected), the flag is cleared
automatically so the guidance reappears rather than staying silently
gone.

**Monte Carlo modelling** (`js/storage/monte-carlo.js`, pure/testable;
UI in `js/pages/modelling.js`): simulates only **Regular Pooled Record**
risks with Status **Open** (`pooledRecords()` filters by both,
2026-10-03). Each run's results start with a **"Risks in this run"**
table (threats / opportunities / total) — included, then each excluded
group (High Impact, Benchmark, not Open with the statuses listed; a
partition of the whole register, record type checked before status) —
plus an explicit warning whenever High Impact risks were left out. Phase is chosen via
two checkboxes, not a single-select — **both are checked by default**
(2026-10-03; was Post only), at least one must stay checked
(enforced by re-checking the box if an uncheck would leave zero
selected), and **both can be selected at once**, running two independent
simulations that render as two overlaid series. Trial count: 1,000/
5,000/10,000. Per trial, per pooled record: Likelihood is *itself
sampled* from its own Min/ML/Max distribution (not collapsed to its
expected value first) and compared against a fresh uniform draw to
decide whether the risk "occurs" that trial; if it occurs, Direct Cost
and Knock On are independently sampled (`sampleDistribution` — inverse-
CDF for triangular, linear for uniform, constant for single-point) and
summed into that trial's portfolio total. Verified against deterministic
cases (always-occurs, never-occurs) and statistical ones (50% likelihood
→ ~50% nonzero trials; triangular sample mean converges to
(min+ml+max)/3) — see test transcript in this session if it needs
re-deriving.
Output (2026-10-03, 4th PR): **Modelling and Contingency both show the
same two percentile tables** (`js/charts/percentile-tables.js`, one row
per level, P50 highlighted): a **summary** — Min, P10…P90 in steps of
10, Max — under the chart, and the **full distribution** — Min,
P01…P99, Max — in its own card at the end of the page (scrolls inside
the card, sticky header). Modelling: one column per phase, computed
exactly from the run's sorted trials. Contingency: modelled cost /
covered by budget? / headroom for the chosen phase, from the stored run.
`summarize()` stores every 1% step (`FULL_PERCENTILE_STEPS` = 1…99);
older stored runs (only P05–P50, or every 5%) get the missing steps read
off the stored 200-point curve (`fullPercentiles()` in contingency.js).
"Confidence Covered" walks P01…P99. Both phases are checked by
default (2026-10-03; was Post only).

**Modelling's chart (2026-09-27 v2): histogram (iterations, left
y-axis) + S-curve per phase (0–100% cumulative, right y-axis) on one
shared Total Cost x-axis that starts at 0** — it only extends below 0
when opportunities make some trial totals negative (clamping those
would misstate the result). The bell curve remains as a thin reference
line; hover shows cumulative % per phase at the cursor. The rest of this
paragraph describes the histogram/bell part, which is unchanged:
**Modelling's chart is a histogram + fitted normal ("bell") curve**
(`js/charts/distribution-chart.js`), not cumulative (changed from an
S-curve 2026-09-20 — the user explicitly wants a normal-shaped
distribution here). `histogram()` bins onto a **shared** domain/bin-edge
set (`monte-carlo.js`, `BIN_COUNT = 30` in `modelling.js`) computed
across *all* selected phases together, so Pre and Post bars/curves align
on the same x-axis for a meaningful overlay — binning each series to its
own range independently would misalign them. The bell curve is a
literal Gaussian fit (`normalPdf()` using the trial sample's own
mean/stdev), scaled by `trials * binWidth` to match the histogram's
count scale — it's a rough reference line, not a claim the underlying
distribution is actually normal (a zero-inflated/skewed pooled-risk
portfolio often won't look bell-shaped, and that's expected, not a bug).
Colors are the user's explicit choice — red (`--color-risk-high`) for
Pre, green (`--color-risk-low`) for Post — which is a real accessibility
concern (red/green is the classic color-blind-unsafe pairing per the
dataviz skill), mitigated with a secondary encoding: Post is always
dashed (bars and curve), Pre always solid, plus a legend whenever both
are shown.

**Shared run chart** (2026-10-03, 6th PR): `js/charts/run-chart.js`
(`createRunChart({chartEl, panelEl, storageKey, defaults})`) owns the
chart *and* its options panel, so **Modelling and Contingency have the
same chart and options**: phase toggles, histograms / S-curves / normal
curve on-off, bin size, plotted percentiles (add/remove) and "show
percentile values" (labels read "P50 · 45,000"; on by default). Options
persist per page (`modelling-chart-options` / `contingency-chart-options`
in localStorage); the normal curve defaults on in Modelling, off in
Contingency. Histogram scale: the tallest bar (or bell peak) reaches
**75% of the plot height** — level with 75% on the cumulative axis —
`maxY = tallest / 0.75`.

**Saved snapshots** (2026-10-03, 6th PR), stored in the workbook:
- **Risk register baselines** — sheets `Baselines` (id `BL-0001`, name,
  createdAt, recordCount), `BaselineRecords` / `BaselineActions` (same
  columns as RiskRegister / Actions plus `baselineId`). Risk Register
  "Save baseline" asks a name in an inline field (`js/inline-name.js`
  `askName()`, prefilled suggestion, Save / Cancel / Esc — no
  `window.prompt`); the "Showing" select switches
  the list to a baseline **read-only** (no row click / duplicate /
  delete, New + templates disabled, notice explains), with "Restore this
  baseline" (confirm; replaces the current records, keeps the risk-number
  high-water mark, baseline stays saved) and "Delete baseline".
  Store: `saveBaseline` / `restoreBaseline` / `deleteBaseline`.
- **Saved modellings** — sheet `SavedModels` (id `MC-0001`, name,
  createdAt, trials, phases, `resultsJson` = per phase {summary, curve
  (500-point stored curve), mean, stdev}, `scopeJson` = the "Risks in
  this run" counts). Modelling: "Save modelling" (inline name field)
  appears on an unsaved run; "Saved modellings" select reloads one
  (scope, chart, tables), with Delete. A fresh run draws from its full
  sorted trials; saved/stored runs from the stored curve. If a run's
  JSON would exceed ~32k chars (one xlsx cell) `savedModelToRow` thins
  the curves until it fits. Store: `saveModel` / `deleteModel`.
- **Contingency** "Modelling to compare": the latest run (Settings) or
  any saved modelling; budget, confidence, gap, chart and tables all
  follow the choice.

**Contingency uses the same chart** (2026-10-03, 5th PR — the old
single-series `s-curve.js` was deleted): Pre and Post histograms + S-curves
overlaid, the budget as a red reference line, and marked percentiles
(dotted line up to each phase's S-curve + "P50" label). A panel on the
right (`[data-chart-controls]`, `contingency.js`) toggles each phase,
histograms and S-curves, sets the bin size (currency per bin; blank =
auto, 30 bins; capped at 200 bins) and edits the plotted percentiles
(default P20, P50, P80; chips with ×, add 1–99). Options persist per
browser in `localStorage['contingency-chart-options']` — a viewing
preference, not register data. `renderDistributionChart(container,
series, options)` takes `showHistogram` / `showSCurve` / `showBell` /
`markers` / `referenceLine`; Modelling passes none (defaults). The
histograms are rebuilt from the stored quantile curve: each curve point
is an equal share of the trials, so a bin's count = points in bin ÷
points × trials. The stat tile is **"Gap to P50"** = budget − P50,
red when negative (budget below the median), green otherwise.

`curvePoints()` subsamples the sorted trials for drawing. Every run persists `lastModelledAt`/`lastModelledTrials`/
`lastModelledResultsJson` to the workbook's `Settings` sheet via
`updateSettings()` — this marks setup-sequence step 4 done, and is what
the Contingency page reads rather than re-running the simulation.
`lastModelledResultsJson` holds `{ phases: ["pre"|"post", ...],
results: { pre?: {summary, curve, mean, stdev}, post?: {...} } }` (v2
schema, 2026-09-20). `curve` is `curvePoints(sorted, 500)` values per
phase, rounded to cents (500 since 2026-10-03, was 200 — enough to
re-bin the Contingency histograms) — the **subsampled** evenly spaced
quantiles, not the raw trials: an xlsx cell caps out around 32,767
characters, and 10,000 raw numbers as JSON would exceed that (2 x 500
values + 2 x 99 percentiles stays well under). Charts read cumulative %
from array *position*, so these quantiles reproduce the curve shape.

**Risk Reporting summary** (2026-10-03, `js/pages/reporting.js`
`registerFacts()`/`narrative()`): above the RAM, KPI tiles + generated
prose over the **whole register** (not the RAM filters): counts by type,
record type and status (open / under review = Draft+Proposed / closed by
kind), how many are in Monte Carlo, then — **open risks only** — threat
EMV pre → post and % reduction, opportunity saving, net exposure,
response actions (count, cost, by strategy, EMV-reduction-to-cost
ratio, open threats with no action) and the highest residual threat.
**Assumption (flag if wrong):** an open risk with no post-mitigation
assessment keeps its pre-mitigation EMV as its post value (an empty
assessment computes to EMV 0, which would read as "fully mitigated");
the text says when this happens.

**Contingency page** (`contingency.html`, `js/pages/contingency.js`):
gated behind setup-sequence step 4 (reuses
`[data-requires-step="4"]`/`[data-step-locked-notice="4"]` — a Monte
Carlo run must exist). A single "Available Budget" number input,
persisted to `settings.availableBudget` on `change` (blur/Enter, not
per-keystroke). When the last run has both phases, a "Compare against"
select appears (`resolveComparePhase()` — defaults to Post-mitigation,
the residual risk left after response actions, which is what a
budget more typically needs to cover; falls back to whichever single
phase exists). Once both a budget and a stored Monte Carlo run exist,
shows: the chart described under Modelling's chart above (both phases,
options panel, budget line); "Gap to P50"; a "Confidence Covered" reading — the highest of P01–P99 the
budget meets or exceeds (a budget above the modelled max says "covers
full modelled range"); and the two percentile tables described under
Monte Carlo above (modelled cost / covered? / headroom per level).

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
page + Risk Reporting nav rename (done, 2026-09-20); 8) header
overflow/theme-toggle-visibility fix, checkbox styling fix,
setup-sequence Home-only + dismissible, Modelling dual-phase (Pre/Post
checkboxes, Post default) + histogram/bell-curve chart, "Connected to
Folder:" label (done, 2026-09-20); 9) stale-cache fix (`_headers` +
version-check banner + deploy version bump), invalid `<svg height="auto">`
fix (done, 2026-09-20); 10) save-conflict detection + banner, About page
+ FAQ (done, 2026-09-20); 11) Risk Register list: sortable columns,
EMV/Cost/Schedule/QHSE highlighted toggle, row-click-to-edit,
Duplicate, Title half-width form row (done, 2026-09-20); 12) Risk
Reporting itself (list + top-N ranking of EMV/Max Total Cost/Schedule
Exposure/Max Schedule) — not started; 13) Risk Assessment Matrix
(Configuration bins + Reporting plot with filters), save confirmation +
top Save button, S-curve 0→100% edge fix, templates both Pooled (done,
2026-09-27); 14) EN/PT/ES i18n, logo, Status, filters, summaries,
required fields, PMI/ISO terms, sign rule, percentile tables, shared
run chart, baselines, saved modellings (done, 2026-10-03, PRs #17–#22).
Item 12's top-N ranking is still open.

## Local dev server

`.claude/launch.json` runs `.claude/nocache_server.py` (not
`python -m http.server`) on port **5850** — a tiny wrapper that adds
`Cache-Control: no-store` to every response, so local edits are always
reflected without a manual hard-refresh. Plain `http.server` sends no
caching headers at all, which lets the *browser* heuristically cache
scripts and makes edits look like they aren't applying — if that ever
happens, suspect the browser's cache before the code.

The server is a `ThreadingHTTPServer` (2026-09-27): the old single-
threaded `HTTPServer` let one browser keep-alive connection stall every
other request, which looked like the Browser pane "refusing" localhost.
If the Browser pane can't reach it anyway, headless Chrome driven over
the DevTools protocol (with the mock handle injected via
`Page.addScriptToEvaluateOnNewDocument`) works for verification.

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
