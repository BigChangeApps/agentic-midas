---
name: adr-distill
description: Distill a repo's Architecture Decision Records into .midas/docs/decisions/ — one card per ADR with its status, the decision, the MUST / MUST NOT constraints code has to respect, the code paths it governs and its work items and PRs, its implementation state checked against the code — offer the constraints as standards, and reconstruct a research folder under .midas/tasks/research/ for each ADR whose work is still open, so /agentic-midas:develop can start from it. With --rehome, moves every ADR into a shared task folder that becomes its card's source, so a team can retire the ADR folder. Run by /agentic-midas:init, or on its own after ADRs change.
argument-hint: "[--adr-dir=<path>] [--research=open|all|none] [--only=JF020,JF021] [--rehome]"
---

# ADR Distillation

Turns ADRs into knowledge the Midas workflows can use without reading 20 long documents: **decision cards** (shared docs), **constraints** offered as standards, and **retro research folders** for decisions whose work is still ahead.

The ADRs stay the source of truth until a team retires them. Cards link to their source and never replace it; a card is regenerated when its source changes. To leave ADR files behind and keep decisions in the framework, `--rehome` moves each ADR's full content into a shared task folder, which then becomes the card's source (`source: task`). New decisions are recorded the same way by `/agentic-midas:develop`.

## Arguments

| Argument | Default | Meaning |
|----------|---------|---------|
| `--adr-dir=<path>` | found | The ADR folder. Otherwise the first of `adr/`, `docs/adr/`, `docs/adrs/`, `docs/decisions/`, `decisions/`, `doc/adr/`, `docs/architecture/decisions/` that holds `.md` files. |
| `--research=` | `open` | `open`: research folders for ADRs whose work is not done; `all`: also for done ones; `none`: cards only. |
| `--only=` | all | Comma-separated ADR ids or file name prefixes to (re)distill. |
| `--rehome` | — | Make shared task folders the source of every decision so the ADR folder can be retired: implies `--research=all` for every ADR (superseded ones too), copies each ADR into its folder and re-points the cards to it. Needs `tasks_shared: true` in `.midas/config.yml`; otherwise say so and stop. |

## Phase Configuration

| Phase | Subject | activeForm |
|-------|---------|------------|
| 1 | Find ADRs and plan | Finding ADRs |
| 2 | Distill ADRs into cards | Distilling ADRs |
| 3 | Review cards and constraints | Reviewing decision cards |
| 4 | Write cards and standards | Writing decision cards |
| 5 | Reconstruct research for open decisions | Reconstructing research |
| 6 | Summary | Summarizing |

**Task Tracking**: `TaskCreate` every phase (pending) with sequential dependencies; skipped phases are `completed` with `metadata: {skipped: true}`. When `/agentic-midas:init` runs this workflow inline, it tracks it as one of its own phases instead.

---

## Phase 1: Find ADRs and plan

1. Find the ADR folder (above). None → say so and stop (init continues without it).
2. Check `.midas/docs/` exists; if not, offer `/agentic-midas:init` and stop if declined.
3. List the ADR files. For each, note its id (the leading `JF020`, `ADR-0007`, `0007`… or the file name), title, and the last commit that touched it: `git log -1 --format=%h -- "<file>"`.
4. Read `.midas/docs/decisions/` if it exists. A card whose `source_commit` equals the ADR's last commit is current: skip it unless `--only` names it. Cards written before `source` existed carry `adr_path` / `adr_commit`: read them as `source: adr`. A card with `source: task` was rehomed or recorded by `/develop`: no ADR drives it, so leave it alone unless `--only` names it — then refresh it from its folder (the distiller reads task folders too). No ADR folder but task-sourced cards present is normal after a rehome.
5. Work out the Azure DevOps org/project/repo from `origin` (as in `../standards-discover/SKILL.md` Phase 1) for PR links.
6. Show the plan: ADRs found, new / changed / current, research mode. Confirm with AskUserQuestion.

## Phase 2: Distill ADRs into cards

1. Create a temp directory (`mktemp -d`).
2. Read `references/adr-distiller-prompt.md` and `references/decision-card-template.md`.
3. Split the ADRs to distill into groups of about 4 (keep ADRs that supersede or extend each other in the same group when their ids show it) and launch one subagent per group in one message (Agent tool, `subagent_type: general-purpose`), with: the ADR paths, the card template, the org/project/repo, the repo root, and the output dir `{tmpdir}/cards/`.
4. Each writes `{tmpdir}/cards/<ADR-id>.md` (the card) and `{tmpdir}/cards/<ADR-id>.yml` (the metadata the next phases use).
5. Read all `.yml` files. Resolve supersession across groups: when card A says it supersedes B (fully or one decision), set B's `superseded_by` and drop B's constraints that A replaces.

## Phase 3: Review cards and constraints

1. Show the table, ordered by id:

   | ADR | Title | Status (ADR) | Implementation (code) | Constraints | Superseded by | Research |
   |-----|-------|--------------|-----------------------|-------------|---------------|----------|

   Implementation is the distiller's verdict from the code (`done`, `partial`, `not-started`, `unknown`), not the ADR's own status — flag every row where they disagree (e.g. "Proposed" but `done`).
   Research shows whether a folder will be reconstructed under the chosen mode (see Phase 5).
2. AskUserQuestion: write all cards (recommended) / review card by card / cancel.
3. **Constraints → standards.** Show every MUST / MUST NOT constraint from non-superseded ADRs whose implementation is `done` or `partial` (a constraint of an unimplemented decision is not yet true of the code — it stays on the card only):

   | # | Constraint | Category | ADR | Already in CLAUDE.md / rules? |

   Constraints already stated in `CLAUDE.md` or `.claude/rules/**` are listed but not offered. AskUserQuestion: apply all offered (recommended) / one by one / skip.

## Phase 4: Write cards and standards

Run the `docs-operator` subagent (subagent_type: `agentic-midas:docs-operator`) once with:
- the approved cards → `.midas/docs/decisions/<ADR-id>-<slug>.md` (replace changed cards; remove a card only if its ADR file was deleted — ask first);
- `.midas/docs/decisions/INDEX.md` → ADRs grouped by topic (from the cards' `topics`), each row: id, title, status, implementation, one-line decision, superseded-by;
- the approved constraints → standards in `.midas/docs/standards/<category>/` with **Sources** naming the ADR path;
- if `.midas/docs/project/architecture.md` exists: add or refresh its `## Key Decisions` section — one line per current (non-superseded) decision linking its card;
- regenerate `.midas/docs/INDEX.md`.

## Phase 5: Reconstruct research for open decisions

Skip with `--research=none` (and no `--rehome`).

1. **Candidates**: `open` → ADRs not superseded whose implementation is `not-started`, `partial` or `unknown`; `all` → every non-superseded ADR; `--rehome` → every ADR, superseded ones included, since the ADR files may be deleted afterwards.
2. Skip candidates that already have a folder (`.midas/tasks/research/*-<adr-id-lowercase>-*`) unless `--only` names them. With `--rehome`, an existing folder still needs `outputs/original-adr.md`: copy the ADR there (`cp`) and add the `decision-log.md` header from the prompt if it lacks one, without redoing the rest.
3. Ask with AskUserQuestion: reconstruct all candidates (recommended) / let me pick (then ask which ids, as text) / none. Read `tasks_shared` from `.midas/config.yml`: when it is not true, say that `.midas/tasks/` is local to this clone.
4. Read `references/retro-research-prompt.md`. Launch one subagent per 2-3 candidates in one message (Agent tool, `subagent_type: general-purpose`), passing each candidate's ADR path, its card and `.yml`, the folder path `.midas/tasks/research/<adr-date>-<adr-id-lowercase>-<slug>/` (`adr-date` = the ADR's **Date** line, else its first commit date), the org/project/repo and `rehome` (true with `--rehome`).
5. List the folders created and, for each, the command to continue: `/agentic-midas:develop <work item id> --research=<folder>` (or the folder alone when no work item is known).
6. **Rehome** (only with `--rehome`, once every ADR has a folder with `outputs/original-adr.md`):
   1. Show the mapping `| ADR | File | Folder |` and confirm with AskUserQuestion.
   2. Run `docs-operator` once: re-point each card — `source: task`, `source_path: <folder>/`, `source_commit` empty until the folders are committed, the **Links** source line pointing at the folder and its `decision-log.md` — then rewrite `decisions/INDEX.md` and regenerate `.midas/docs/INDEX.md` (the ADR folder leaves "Existing sources").
   3. List what still points at the ADR folder: `git grep -n -I -e '<adr-dir>/' -- . ':!.midas/tasks'`. References by id alone (`JF005`) stay valid, since cards and folders keep the ids.
   4. Tell the user the ADR folder can now be deleted, once those references are updated and the folders committed. Never delete it yourself: it is a team decision.

## Phase 6: Summary

- ADRs found, cards written / updated / current, implementation states, status disagreements found
- Constraints applied as standards (and skipped)
- Research folders reconstructed, with their next step
- With `--rehome`: cards re-pointed, and the references to the ADR folder still to update
- Next: commit `.midas/docs/decisions/` if the docs are shared (and `.midas/tasks/` when `tasks_shared`); re-run `/agentic-midas:adr-distill` after an ADR changes. After a rehome there are no ADRs left to watch: new decisions come from `/agentic-midas:develop`.

---

## Rules

- **Never invent.** Cards and research folders state only what the ADR, its PRs, its work items or the code show, each with its source. A gap is written as a gap ("the ADR records no alternatives").
- **ADRs are read-only.** Never edit the ADR files; disagreements between an ADR and the code go on the card and in the summary.
- **Cards don't copy ADRs.** A card is a page at most; the link to its source carries the detail.
- Write `.midas/docs/` only through `docs-operator`. Research folders under `.midas/tasks/` are written by the research subagents directly.
