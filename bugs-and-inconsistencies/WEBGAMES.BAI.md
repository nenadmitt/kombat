# apps/webgames — bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

## 2026-08-07 — `npm run typecheck` drops an untracked `tsconfig.tsbuildinfo`

- **Where**: `apps/webgames/tsconfig.json` (inherits `incremental` from
  `tsconfig.base.json`); no `.gitignore` entry anywhere covers
  `*.tsbuildinfo`.
- **Why it's wrong**: a plain `npm run typecheck --workspace
  @gaming-platform/webgames` writes `apps/webgames/tsconfig.tsbuildinfo` and
  it shows up as untracked in `git status`, so it is one `git add -A` away
  from being committed as a build artifact.
- **Suggested fix**: add `*.tsbuildinfo` to the root `.gitignore`.
