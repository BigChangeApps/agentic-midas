# ADR Distiller — Subagent Prompt Template

Distill a group of Architecture Decision Records into decision cards, checking each against the code.

## Inputs

- ADR files: `[adr_paths]`
- Card template: `[card_template]` (read it first)
- Repo root: `[repo_root]`; Azure DevOps `[org]` / `[project]` / `[repo]`
- Output dir: `[output_dir]`

A source can also be a shared task folder (`source: task`, a path ending in `/`) when a rehomed or `/develop`-recorded card is refreshed. Then read `outputs/decision-log.md` (status, date, decisions) as the ADR, plus `research-report.md`, `solution-exploration.md`, `high-level-design.md` and `original-adr.md` if present; history is `git log -- "<folder>"`; keep `source: task` and the folder as `source_path`.

## For each ADR

1. **Read the whole ADR.** Note its id, title, **Date**, **Status** (and any status sentence), the decisions, trade-offs, concerns and every code identifier, path, flag, package and work item it names.
2. **History**: `git log --format='%h %ad %s' --date=short -- "<adr file>"`. The first and last commits give `adr_date` (if the ADR has no Date) and `source_commit`. Set `source: adr` and `source_path` to the ADR's repo-relative path. Subjects like `Merged PR 67202: feat(x): #359985 …` give PR ids and work item ids.
3. **Related work**: work item ids in the ADR text (`#123456`, `AB#123456`, `ADO 345479`) and in those PR subjects. Search the history for PRs that implemented it: `git log --first-parent --format='%h %ad %s' --date=short origin/HEAD | grep -E '#<wi-id>\b'` for each work item. Optionally `az boards work-item show --id <id> --query "fields.\"System.State\"" -o tsv` for the item's state — skip quietly if `az` fails.
4. **Check the code.** For each class, interface, flag, package, migration, pipeline stage or path the decision introduces or removes, look for it (`git ls-files`, `grep -rn` with patterns quoted). Decide `implementation`:
   - `done` — what the decision introduces exists, what it removes is gone
   - `partial` — some of it; list what is missing
   - `not-started` — none of it
   - `unknown` — the decision is about process or infrastructure outside this repo; say why
   Don't trust the ADR's Status for this: ADRs often stay "Proposed" after the work merged, or say "Accepted" before it did.
5. **Constraints.** Turn the decision into rules a code change could break, each `MUST` or `MUST NOT` with a short why and the ADR section it comes from. Leave out background, expected benefits and history. A constraint that holds only behind a feature flag says so.
6. **Supersession.** Note any ADR this one supersedes or extends (wholly or one decision), and any statement in it that another ADR replaced it.
7. **Topics**: 1-3 from `sync, saga, messaging, persistence, migrations, ci, deployment, testing, packaging, monolith, performance, security, api` or a new one if none fits.

## Output

For each ADR write two files to `[output_dir]`:

**`<ADR-id>.md`** — the card, filled from the template.

**`<ADR-id>.yml`**:

```yaml
adr: JF020
title: "Consuming the Job Finance Core Package In-Process from the Monolith"
source: adr
source_path: "adr/JF020 - Consuming the Job Finance Core Package In-Process from the Monolith.md"
source_commit: 1a2b3c4
adr_date: 2026-09-08
status: proposed
implementation: partial
implementation_evidence: "IGeocodingACL exists in Core; no BOServiceLocator facade in this repo"
disagreement: "Status says Proposed; ..."      # omit when none
supersedes: []
superseded_by: []
topics: [monolith, packaging]
work_items: [345479]
prs: [66001]
constraints:
  - rule: "MUST NOT reference MediatR from Core"
    kind: must-not
    category: backend
    why: "the monolith does not host MediatR"
    section: "Decision 3"
    flag: null
open_questions: ["…"]
```

## Rules

- Never invent: every statement comes from the ADR, git history, a work item or the code, and the card says which.
- Read only: write nothing but the files in `[output_dir]`. Never edit the ADRs.
- Keep each card to a page: the ADR link carries the detail.
