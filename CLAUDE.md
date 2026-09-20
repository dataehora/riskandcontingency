# Risk and Contingency — project notes for Claude

Static site, no build step: plain HTML/CSS/vanilla JS. Hosted on
**Cloudflare Pages** (custom domain riskandcontingency.com, bound in the
Cloudflare dashboard — not via the repo's `CNAME` file, which is a
leftover from an earlier GitHub Pages setup and has no effect on
Cloudflare Pages). Repo: `dataehora/riskandcontingency`.
See [README.md](README.md) for the user-facing description and repo
layout — this file is developer/agent context that doesn't belong there.

## Status

Greenfield. Only a placeholder landing page (`index.html` /
`styles.css`) exists so far — the actual risk/contingency management
tool hasn't been designed yet. Treat any architecture notes below as
provisional until real features land; update this file as the shape of
the project becomes clear.

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
