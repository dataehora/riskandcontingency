# Risk and Contingency — project notes for Claude

Static site, no build step: plain HTML/CSS/vanilla JS. Hosted on
**Cloudflare Pages** (custom domain riskandcontingency.com, bound in the
Cloudflare dashboard — not via the repo's `CNAME` file, which is a
leftover from an earlier GitHub Pages setup and has no effect on
Cloudflare Pages). Repo: `dataehora/riskandcontingency`.
See [README.md](README.md) for the user-facing description and repo
layout — this file is developer/agent context that doesn't belong there.

## Status

Real build underway (started 2026-09-20). Landed so far: design system
(`css/tokens.css`, `base.css`, `components.css`, `shell.css`), the app
shell/navigation across the 4 pages, and the File System Access folder
connection (`js/storage/`). The three feature areas below are still
empty-state placeholders — Working Space, Reporting and Configuration
CRUD have not landed yet. Update this section as each area ships.

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
`index.html` (home/dashboard), `working-space.html`, `reporting.html`,
`configuration.html`. Each page repeats the same header/footer markup
(no templating available) and loads the same four stylesheets from
`css/` plus `js/shell.js` as a `type="module"` script.

**Design system** (`css/`): `tokens.css` (CSS custom properties — color,
spacing, type — with a `prefers-color-scheme: dark` override block),
`base.css` (reset + typography), `components.css` (buttons, cards,
tables, badges, forms, empty states), `shell.css` (header/nav layout).
Visual direction: professional risk/engineering-consulting aesthetic
(deep navy `--color-primary`, muted gold `--color-accent`, red/amber/
green for risk severity), loosely inspired by Oracle Primavera Cloud's
layout conventions — not a clone, no Oracle branding/colors reused.
Note: any element hosting both an author `display` rule (e.g. `.btn`,
`.notice`) and the `hidden` attribute needs the global
`[hidden] { display: none !important; }` rule in `base.css` to actually
hide — same-specificity author rules otherwise beat the UA stylesheet.

**Data storage** (`js/storage/`): the standing decision (confirmed with
the user 2026-09-20) is the **File System Access API** — the user picks
a folder once via `showDirectoryPicker`, and the app reads/writes an
Excel workbook in it directly. Pure client-side, no backend, consistent
with the no-build-step static site. Trade-off accepted: Chromium only
(Chrome/Edge/Opera) — no Firefox/Safari; `index.html` and every area
page show an explicit unsupported-browser notice via
`isFileSystemAccessSupported()` rather than failing silently.
- `idb-kv.js`: tiny IndexedDB key/value wrapper, used only to persist
  the chosen `FileSystemDirectoryHandle` across sessions (handles are
  structured-cloneable in Chromium).
- `folder-connection.js`: connect/reconnect/disconnect flow and
  connection state (`checking` / `unsupported` / `disconnected` /
  `reconnect` / `connected` / `error`), exposed via
  `onConnectionChange(listener)`. `reconnect` exists because the
  browser requires a fresh user gesture to re-grant permission each
  session even when the folder handle itself is remembered.
- `js/shell.js` wires this state to the DOM via data attributes any
  page can use: `[data-connection-pill]`/`[data-connection-label]`
  (status pill), `[data-connection-action]`/`[data-connection-disconnect]`
  (buttons — supports multiple per page), `[data-requires-connection]`/
  `[data-requires-no-connection]` (conditionally shown sections),
  `[data-unsupported-notice]`.
- **Not yet built**: actual `.xlsx` reading/writing. That needs a
  vendored copy of [SheetJS](https://sheetjs.com) (MIT-licensed, kept
  as a local file — no CDN dependency) plus the risk-record schema
  below, planned for the PR that builds Configuration (simplest CRUD:
  named lists) ahead of Working Space.

**Domain model** (per the spec gathered 2026-09-20, not yet
implemented): one Excel workbook per **Project**, each with its own
Risk Breakdown Structure (RBS). A risk record carries owner, cause,
description, effects, impact area, RBS category, and pre/post-mitigation
likelihood & impact assessments. Each assessment is 3 input cells
validated into exactly one of:
- **Single point** — Most Likely (ML) only.
- **Uniform** — Min and Max, with Max > Min.
- **Triangular** — Min, ML, Max, strictly increasing.
EMV is (re)calculated from the assessment on every change, pre- and
post-mitigation. Response plans (mitigating/contingency actions) carry
cost, action owner and due date. Reporting ranks records by EMV, max
cost impact, schedule exposure, and max schedule impact (top-N,
configurable N).

**Build sequencing** (small reviewable PRs per the workflow convention
below): 1) shell + design system + folder connection (done); 2)
Configuration CRUD (RBS, impact areas, owners) + SheetJS wiring; 3)
Working Space (risk record form, assessment validation, EMV, response
plans); 4) Reporting (list + top-N ranking).

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
