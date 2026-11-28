# Plan 168: The docs redeploy workflow runs with a token that can do nothing

> **Executor instructions**: Follow this plan step by step. If anything in the "STOP conditions" section occurs, stop and report. Do not edit `plans/README.md`; the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6a516de2..HEAD -- .github/workflows/docs-redeploy.yml` If the file changed, compare it with the excerpt below; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `6a516de2`, 2026-11-28

## Why this matters

`.github/workflows/docs-redeploy.yml` is the only workflow in the repository without a `permissions` key, so its job gets the repository's default `GITHUB_TOKEN` scopes. The job checks nothing out and calls no GitHub API: it posts to a deploy hook URL held in a secret. Every other workflow here declares least privilege. An empty permission set makes the token useless to anything that step might ever run.

## Current state

The whole file:

```yaml
name: Redeploy docs on release

on:
  release:
    types: [published]

jobs:
  redeploy:
    name: Trigger Vercel deploy hook
    runs-on: ubuntu-latest
    steps:
      - name: Trigger deploy hook
        env:
          DEPLOY_HOOK_URL: ${{ secrets.VERCEL_DEPLOY_HOOK_DOCS }}
        run: |
          if [ -z "$DEPLOY_HOOK_URL" ]; then
            echo "VERCEL_DEPLOY_HOOK_DOCS secret is not set; skipping."
            exit 0
          fi
          curl -fsS -X POST "$DEPLOY_HOOK_URL"
```

For the style of a top-level permissions block in this repository, look at `.github/workflows/validate.yml`.

## Scope

**In scope**: `.github/workflows/docs-redeploy.yml` only. **Out of scope**: every other workflow, the labeler workflow included. No changeset.

## Git workflow

- Work on the branch you were started on (`ci/docs-redeploy-permissions`). Do not push, do not open a pull request.
- One commit: `ci(docs-redeploy): give the job's token no permissions`, with a one-sentence body saying the job only posts to a deploy hook. Commit with `git -c commit.gpgsign=false commit`. No `Co-Authored-By`, no "Generated with", no mention of any AI tool or model.

## Steps

### Step 1: Add the block

Insert, between the `on:` block and `jobs:`, separated by blank lines:

```yaml
permissions: {}
```

**Verify**: `bun x js-yaml .github/workflows/docs-redeploy.yml >/dev/null 2>&1 || python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/docs-redeploy.yml')); assert d['permissions']=={} , d"` → exit 0. `bun run lint` → exit 0 (after `bun install --frozen-lockfile`).

## Done criteria

- [ ] `git diff --stat origin/main..HEAD` lists only `.github/workflows/docs-redeploy.yml`, 2 insertions
- [ ] `git log origin/main..HEAD --format=%B | grep -ciE 'co-authored|generated with|claude|devin|codex|gpt'` prints `0`
- [ ] `git status --short` is empty (run `git checkout -- AGENTS.md` if `turbo` touched it)

## STOP conditions

- The file does not match the excerpt.

## Maintenance notes

- If the job ever needs to read the repository or call the API, grant that one scope at the job level.
