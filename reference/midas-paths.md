# Where the Midas files live

Skills don't assume `.midas/` sits in the current repo. They ask the resolver once, at the start, and use its paths:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/midas-paths.mjs [--cwd DIR]
```

It prints JSON:

| Field | Meaning |
|---|---|
| `mode` | `home` when a home repo was found, otherwise `repo` |
| `repo` | the code repo's root, or `null` when the session runs in the home repo itself |
| `home` | the home repo's root, or `null` |
| `homeSource` | how the home was found: `env` (`MIDAS_HOME`), `repo-config` (`home:` in the repo's `.midas/config.yml`), `cwd` (the session runs inside it), or `null` |
| `tasks` | where task folders go (`<tasks>/development/…`, `<tasks>/research/…`): the home's `.midas/tasks` when there is a home, otherwise the repo's |
| `legacyTasks` | the code repo's own `.midas/tasks` when there is a home and that folder exists (task folders from before the home), otherwise `null` |
| `tasksShared` | whether task folders are committed: `tasks_shared: true` in the config next to `tasks` (the home's in home mode) |
| `docs` | the code repo's `.midas/docs` (its standards, decisions, review lessons), or `null` without a code repo |
| `homeDocs` | the home's `.midas/docs` (shared across repos), or `null` |
| `config` | the `.midas/config.yml` to read options from: the code repo's, or the home's without one |
| `repoName` | the code repo's name in the home's `.midas/repos.json`, matched by its `origin` remote, or `null` |
| `stack` | that entry's stack (`dotnet`, `dotnet-framework`, `react`, `sql`), or `null` |
| `warnings` | reasons a configured home was ignored, or the repo is missing from the map; show them to the user |

## Task folders

Every skill that creates or looks up a task folder runs the resolver once, at the start, and shows its `warnings` once. Then:

- **New folders go under `tasks`.** Every `.midas/tasks/…` path a skill names means `<tasks>/…`.
- **Existing folders** (to resume a task, or to skip work already done) are looked up under `tasks`, then under `legacyTasks`. A folder found under `legacyTasks` is resumed where it is; don't move it. A task path the user passes is tried the same way, then as given.
- **Repos.** In home mode the task folder lives in another repo than the code. Record the repos the task changes as `task.repos` in its `orchestrator-state.yml`: `{name, path}`, with `name` from the home's `.midas/repos.json` (`repoName` for the current repo, the folder name for a repo the map lacks) and `path` its absolute root.
- **Paths written into a repo's files** (decision cards, PR descriptions) are relative to the repo that holds the folder. A folder in the home is written as `home:.midas/tasks/…`.
- **Committing** follows `tasksShared`. When false, task folders are never staged. When true, in repo mode the task folder is staged with the code, as before. A folder resumed under `legacyTasks` follows the code repo's own rules instead: stage it with the code only when that repo's `.midas/config.yml` says `tasks_shared: true` and git doesn't ignore it (`git check-ignore -q <folder>` fails). In home mode it is never staged with the code: commit it in the home repo on its own (`git -C <home> add <folder>`, then `docs: #<id> <slug>` or the home's own commit rules), after the same `AskUserQuestion` yes as the code commit, and push the home only when the user says so. The dashboard files (`dashboard.html`, `dashboard-data.js`) stay unstaged either way.
- **Permissions.** In home mode the task folder is outside the session's repo, so Claude Code asks before each write there unless the home is in the user's `permissions.additionalDirectories`. When a write to it is refused, say that and how to add it; don't fall back to the repo's `.midas/tasks`.

## How the home is found

1. `MIDAS_HOME` (per developer, `~` allowed).
2. The current repo, when it is the home.
3. `home:` in the code repo's `.midas/config.yml`, relative to the repo root (for teams that clone repos side by side).

A folder counts as the home only when its `.midas/config.yml` has `role: home`. A missing folder or one without that line becomes a warning, and the resolver tries the next source; with none left it falls back to the repo's own `.midas/`.

Outside any git repo and without a home, it exits 1 with the reason on stderr: tell the user, and stop.

## The repo map

The home's `.midas/repos.json` lists every code repo: `name`, `folder` (where to clone it, next to the home), `remote`, `stack`, `baseBranch` and a one-line `summary`. A clone is recognised by its `origin` remote, in SSH or HTTPS form, never by its folder name.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/midas-repos.mjs check            # repos you lack, extra clones, clones the map doesn't know
node ${CLAUDE_PLUGIN_ROOT}/scripts/midas-repos.mjs render --write   # regenerate the Repos section of the home's CLAUDE.md
node ${CLAUDE_PLUGIN_ROOT}/scripts/midas-repos.mjs render --check   # exit 1 when CLAUDE.md is out of date with the map
```
