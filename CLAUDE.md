# Risk and Contingency — project notes for Claude

Static site, no build step: plain HTML/CSS/vanilla JS. Hosted on GitHub
Pages (`CNAME` → riskandcontingency.com). Repo: `dataehora/riskandcontingency`.
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
- Hosting: GitHub Pages (branch `main`), custom domain via `CNAME`
  (`riskandcontingency.com`, registered on Cloudflare — DNS is managed
  there, outside this repo).

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

- `git push` to `main` publishes to GitHub Pages automatically — no
  build workflow.
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

## Setup still needed from the user's side

- **DNS**: add a CNAME (or Cloudflare "CNAME flattening" / A records
  per [GitHub's Pages docs](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site))
  pointing `riskandcontingency.com` at `dataehora.github.io` in the
  Cloudflare dashboard. GitHub Pages itself will be enabled from this
  session (branch `main`, root) once the placeholder is pushed, but
  Cloudflare DNS + SSL is only editable from the Cloudflare account.
- Nothing else — no API keys, no accounts, no local installs required
  to start coding (just Python 3, already used by the dev server).
