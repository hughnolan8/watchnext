---
name: ship
description: Ship the current WatchNext change — lint, build, review, commit on a branch, open a PR, merge it, update local main and check the Vercel production deploy. Use when a change is finished and should go live.
---

# Ship a change

1. **Sync.** `git fetch origin` and make sure the branch is based on current `origin/main` (rebase if not). If you're on `main`, create a branch first: `git switch -c <short-kebab-description>`.
2. **Check.** Run `npm run lint` and `npm run build`. Fix failures before going on; don't ship with errors.
3. **Review.** Run the `reviewer` agent on the diff and fix anything real it finds.
4. **Commit.** Stage only the files for this change (never `.env*`). Message: short imperative summary, then a blank line and a sentence or two on why.
5. **PR.** `git push -u origin HEAD`, then `gh pr create --base main` with:
   - Title: short, imperative, user-facing (match `git log --oneline` style, e.g. "Show 'More like this' inside the details pop-up").
   - Body: **What** (bullets), **How it was checked** (lint, build, what you looked at in the browser).
6. **Merge.** If the project owner's workflow allows auto-merging (check with the person you're working for if unsure), `gh pr merge --squash --delete-branch`. Otherwise stop and share the PR link.
7. **Update local main.** In the main checkout: `git switch main && git pull --ff-only`.
8. **Verify deploy.** Watch the Vercel production deployment for the merge commit (Vercel MCP `list_deployments` / `get_deployment`, or `vercel ls watchnext --prod`). Report READY with the URL, or ERROR with the relevant build log lines.

Report: PR link, merge commit, deployment status.
