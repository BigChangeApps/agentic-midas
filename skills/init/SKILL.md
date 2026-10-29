---
name: init
description: Set up .midas/docs/ for a repo — tech stack and architecture docs from codebase analysis, decision cards distilled from the ADRs (plus research folders for decisions still open), then coding standards and review lessons discovered from config, code, docs, CI and the review comments on past Azure DevOps pull requests. Takes --area=<path> to focus a large repo (the BigChange monolith) on one part. Never rewrites CLAUDE.md. /develop and /quick-bugfix read the result through .midas/docs/INDEX.md.
argument-hint: "[--area=<path>] [--pr-count=50|all] [--adr-research=open|all|none] [--skip-adr] [--standards-from=PATH]"
---

# Initialize Midas docs

Create `.midas/docs/` from real codebase analysis: project docs (tech stack, architecture) and the coding standards the team actually follows. `/agentic-midas:develop` and `/agentic-midas:quick-bugfix` read them through `.midas/docs/INDEX.md`; without it they fall back to `CLAUDE.md` and `.claude/rules/**`.

**NOTE**: Use the **Agent tool with the `docs-operator` subagent** (subagent_type: `agentic-midas:docs-operator`) for all docs-manager operations, and the **Agent tool** (subagent_type: `agentic-midas:project-analyzer`) for project analysis. Use the **Skill tool** only for `standards-discover` (Phase 9, the last phase). Phase 8 runs the `adr-distill` workflow inline: read `../adr-distill/SKILL.md` and follow it, then continue here. The Agent tool returns control to this skill; the Skill tool does not.

## Arguments

| Argument | Default | Meaning |
|----------|---------|---------|
| `--area=<path>` | whole repo | Focus analysis, code sampling and PR history on this path (several allowed, comma-separated). Use it in the BigChange monolith, e.g. `--area=BigWeb/InvoiceNew.aspx,BigWeb/js/2.0`. |
| `--pr-count=<n>` | 50 | Completed pull requests whose review comments `standards-discover` reads; `all` reads the whole history in parallel batches. |
| `--adr-research=` | `open` | Passed to `adr-distill --research`: reconstruct research folders for ADRs whose work is still open (`open`), for all (`all`), or none. |
| `--skip-adr` | — | Skip Phase 8. |
| `--standards-from=PATH` | — | Copy standards from another repo's `.midas/docs/standards/` as the starting point. |

When the repo is very large (thousands of source files, several solutions) and no `--area` was given, ask with AskUserQuestion which area to focus on, offering the top-level folders that hold most of the code plus "Whole repo".

## Phase Configuration

| Phase | Subject | activeForm |
|-------|---------|------------|
| 1 | Pre-flight checks | Running pre-flight checks |
| 2 | Analyze project codebase | Analyzing project codebase |
| 3 | Present findings & gather context | Gathering project context |
| 4 | Choose where the docs live | Choosing where the docs live |
| 5 | Initialize documentation structure | Initializing documentation |
| 6 | Generate project documentation | Generating project documentation |
| 7 | Validate | Validating initialization |
| 8 | Distill ADRs | Distilling ADRs |
| 9 | Discover coding standards | Discovering coding standards |

**Task Tracking**: Before Phase 1, use `TaskCreate` for all phases (pending), then set sequential dependencies with `TaskUpdate addBlockedBy`. At each phase: `TaskUpdate` to `in_progress` → execute → `TaskUpdate` to `completed`. Skipped phases are marked `completed` with `metadata: {skipped: true}`.

---

## PHASE 1: Pre-flight Checks

1. Find the repo root (`git rev-parse --show-toplevel`); `.midas/` goes there.
2. Read the repo's `origin` remote. Note the Azure DevOps org, project and repo (`git@ssh.dev.azure.com:v3/<org>/<project>/<repo>` or `https://dev.azure.com/<org>/<project>/_git/<repo>`), or GitHub. Note the base branch the way `../../reference/work-items.md` describes it (`BigChange` → `WebRelease2`).
3. **If `--standards-from=PATH`**: check `PATH/.midas/docs/standards/` exists; if not, say so and stop.
4. **If `.midas/docs/` exists**, ask with AskUserQuestion:
   - "Update existing documentation" → skip to Phase 6
   - "Back up and reinitialize" → `mv .midas/docs .midas/docs.backup-$(date +%Y%m%d-%H%M%S)`
   - "Cancel" → stop

---

## PHASE 2: Project Analysis

Run the `project-analyzer` subagent, passing the area (if any) so it samples only there while still reading the repo-wide build and config files.

Store the analysis for Phases 3 and 6.

---

## PHASE 3: Present Findings & Gather Context

1. Present the analysis: project type, languages and frameworks, architecture, tech stack, conventions, strengths and risks. For an area, say what the area is and how it fits the repo.
2. AskUserQuestion: is the analysis accurate? Collect corrections.
3. Ask (one AskUserQuestion, optional answers) for what the code can't tell: what the area/project is for, and constraints worth recording (legacy code no one may touch, things in migration).
4. Ask which project docs to generate (multi-select): "Tech Stack" (always), "Architecture" (recommended).

---

## PHASE 4: Choose Where the Docs Live

Check whether the repo already commits any Claude files (`git ls-files CLAUDE.md .claude`) and whether `.gitignore` ignores `.claude/` or `.midas/`. Then ask with AskUserQuestion:

- **"Commit .midas/docs and .midas/tasks with the repo"** — the team shares the standards and the task folders: research, specs, plans and the decision logs behind decision cards. Recommend this when the team wants decisions recorded in the framework rather than in ADR files: `/develop` then records new decisions as cards backed by their task folder, and `adr-distill --rehome` can retire the ADR folder. Sets `tasks_shared: true`.
- **"Commit .midas/docs only"** — the team shares the standards; task folders stay personal. Add `.midas/tasks/` to `.gitignore` — a repo change you'll show in the summary, not commit. Sets `tasks_shared: false`.
- **"Keep .midas/ local"** — add `.midas/` to `.git/info/exclude`, which no one else sees. Recommend this when the repo commits no Claude files or ignores `.claude/` (as the BigChange monolith does): sharing docs there is a team decision. Sets `tasks_shared: false`.

Never commit anything yourself.

---

## PHASE 5: Initialize Documentation Structure

**Run the `docs-operator` subagent** with:

> "Initialize documentation structure. [If --standards-from: Standards source path: <PATH>/.midas/docs/standards/. Copy standards from it.] Otherwise create no standard files — standards-discover writes them from evidence. Create only `.midas/docs/project/` and `.midas/docs/standards/`. Area: <area or 'whole repo'>. Do not touch CLAUDE.md."

Then, directly with Write, create `.midas/config.yml` if it doesn't exist:

```yaml
# Midas project configuration (agentic-midas plugin).
# html_output — the /develop dashboard and the HTML companions of spec, plan and reports. Default: true.
html_output: true
# mockup_format — html (browser preview) or ascii (terminal). Falls back to ascii without Node.js. Default: html.
mockup_format: html
# area — the paths init focused on; standards-discover and /develop read it.
area: [<paths, or empty for the whole repo>]
# tasks_shared — .midas/tasks/ is committed with the repo; /develop stages its task folder and records decisions as cards. Default: false.
tasks_shared: <true or false, from Phase 4>
```

When `.midas/config.yml` already exists without `tasks_shared`, add that key with the Phase 4 answer and leave the rest as it is.

---

## PHASE 6: Generate Project Documentation

Generate only the docs chosen in Phase 3:
- Tech Stack → `references/tech-stack-template.md`
- Architecture → `references/architecture-template.md`

Fill them from the analysis and the user's answers; for an area, describe the area first and the rest of the repo only as far as the area depends on it. Write to `.midas/docs/project/`.

---

## PHASE 7: Validate

1. **Run `docs-operator`** with: "Regenerate INDEX.md for .midas/docs/. List the repo's existing guidance (CLAUDE.md files, .claude/rules/**, adr/, CONTRIBUTING.md) under 'Existing sources' so readers go there too. Report whether CLAUDE.md points at INDEX.md; do not edit it."
2. **CLAUDE.md pointer.** If the repo has a `CLAUDE.md` without a pointer to `.midas/docs/INDEX.md`, ask with AskUserQuestion whether to append the section from `../docs-manager/references/claude-md-template.md` to the end of it (never rewrite or reorder what's there). With no `CLAUDE.md`, ask whether to create one holding only that section — and if the docs are local (Phase 4), say it would be an untracked file. "Skip" is fine: `/develop` and `/quick-bugfix` read INDEX.md either way.
3. Summarize: the area, what was created, where the docs live (committed or local), docs-operator failures if any.

---

## PHASE 8: Distill ADRs

Skip with `--skip-adr`, or when no ADR folder exists (`adr/`, `docs/adr/`, `docs/decisions/`, … — see `../adr-distill/SKILL.md`).

Read `../adr-distill/SKILL.md` and run its Phases 1-6 inline with `--research=<--adr-research>`, tracking it as this one phase. It writes the decision cards to `.midas/docs/decisions/`, offers their constraints as standards, adds `## Key Decisions` to `architecture.md`, and reconstructs research folders under `.midas/tasks/research/` for decisions still open. To move every ADR into the framework later, run `/agentic-midas:adr-distill --rehome` (needs `tasks_shared: true`). Running it before standards discovery lets Phase 9 treat the cards as existing guidance instead of re-deriving the ADRs.

---

## PHASE 9: Discover Coding Standards

Invoke the `agentic-midas:standards-discover` skill via the Skill tool:

> "Run standards discovery with --scope=full --pr-count=<n> [--area=<paths>]. This is part of /agentic-midas:init."

It runs its own review and approval flow (standards, then review lessons). When it finishes, give a short summary: decision cards and research folders from Phase 8, standards discovered and applied, review lessons written per module, PRs read and how many had review comments, and the next steps (review `.midas/docs/`, commit it if the docs are shared, start work with `/agentic-midas:quick-bugfix` or `/agentic-midas:develop`).

---

## Error Handling

- `.midas/docs/` can't be created → check permissions, suggest creating it by hand.
- project-analyzer fails → offer to continue from the user's input only.
- docs-operator fails → retry up to 2 times, then give manual steps.
- Never roll back on your own; ask before anything destructive.
