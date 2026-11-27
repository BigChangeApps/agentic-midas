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
| `docs` | the code repo's `.midas/docs` (its standards, decisions, review lessons), or `null` without a code repo |
| `homeDocs` | the home's `.midas/docs` (shared across repos), or `null` |
| `config` | the `.midas/config.yml` to read options from: the code repo's, or the home's without one |
| `repoName` | the code repo's name in the home's `.midas/repos.json`, matched by its `origin` remote, or `null` |
| `stack` | that entry's stack (`dotnet`, `dotnet-framework`, `react`, `sql`), or `null` |
| `warnings` | reasons a configured home was ignored, or the repo is missing from the map; show them to the user |

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
