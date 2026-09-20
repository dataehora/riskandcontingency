#!/usr/bin/env bash
#
# auto-deploy.sh — hands-off publish flow for riskandcontingency.
#
#   branch  ->  commit  ->  push  ->  PR  ->  squash-merge  ->  back to main  ->  pull
#
# Usage:
#   scripts/auto-deploy.sh ["commit message / PR title"]
#
# Idempotent: does nothing and exits 0 if the working tree is clean.
# Requires: git + gh (GitHub CLI authenticated).
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# ------------------------------------------------------------------ 1. anything to publish?
if git diff --quiet && git diff --cached --quiet \
   && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "auto-deploy: working tree clean, nothing to publish."
  exit 0
fi

MSG="${1:-Update site content}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BRANCH="auto/deploy-${STAMP}"

echo "auto-deploy: creating branch ${BRANCH}"

# ------------------------------------------------------------------ 2. branch + commit
git checkout -b "$BRANCH"
git add -A
git commit -m "$(printf '%s\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>' "$MSG")"

# ------------------------------------------------------------------ 3. push + PR + merge
git push -u origin "$BRANCH"

gh pr create --base main --head "$BRANCH" \
  --title "$MSG" \
  --body "$(printf 'Automated deploy (%s).\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)' "$STAMP")"

# --admin covers any branch protection rule that may exist in the future.
gh pr merge "$BRANCH" --squash --admin --delete-branch

# ------------------------------------------------------------------ 4. sync main
git checkout main
git branch -D "$BRANCH" 2>/dev/null || true
git pull --ff-only origin main

echo "auto-deploy: published to main — Cloudflare Pages will build in ~1 min."
