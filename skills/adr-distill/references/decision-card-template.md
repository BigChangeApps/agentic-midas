# Decision Card Template

One card per decision, at most a page. It tells a developer what the decision means for the code they are about to change; the source keeps the reasoning.

The source is either an ADR file (`source: adr`) or a shared task folder under `.midas/tasks/` (`source: task`) whose `outputs/decision-log.md` records the decision, next to the research and options behind it. A task folder is the source once an ADR was rehomed (`adr-distill --rehome`) or when `/agentic-midas:develop` recorded the decision itself.

```markdown
---
adr: [decision id, e.g. JF020; a new decision takes the next free number of the repo's series]
title: "[decision title]"
source: [adr | task]
source_path: "[repo-relative path to the ADR file, or to the task folder ending in /]"
source_commit: [short sha of the last commit that touched the source; empty while it is uncommitted]
adr_date: [YYYY-MM-DD from the ADR or decision log, else first commit date]
status: [proposed | accepted | implemented | superseded | deprecated | rejected]   # as the source states it, normalized
status_note: "[the source's own status text, when it says more than one word]"
implementation: [done | partial | not-started | unknown]                          # checked against the code
supersedes: [ADR ids, or "JF018 decision 3" for a partial one]
superseded_by: [ADR ids]
topics: [sync, saga, messaging, persistence, ci, testing, packaging, monolith, ...]
work_items: [ids]
prs: [ids]
distilled_at: [YYYY-MM-DD]
---

# [ADR-id] — [title]

**In one line:** [what was decided]

## Decision
[2-5 bullets: the decisions, numbered as the source numbers them]

## Constraints for code
- **MUST** [rule the code has to follow] — [why, in a clause] *(ADR §Decision 2)*
- **MUST NOT** [...] *(ADR §Trade-offs)*

[Only rules a change could break. None → "None — the decision is about [process / infrastructure]."]

## Where it lives
| Path | Role |
|------|------|
| `src/.../JobSaga.cs` | [the state machine the ADR introduced] |

[Only paths that exist today. Paths the ADR names that don't exist go under Implementation.]

## Implementation
**[done | partial | not-started | unknown]** — [the evidence: classes found, flag names, migrations, merged PRs; for partial, what is missing; where the ADR's status and the code disagree, say so]

## Open questions
[From the ADR's "Concerns & Notes", unresolved items, "proposed" parts. None → omit the section.]

## Links
- Source: [`source_path`](../../../[source_path]) — for a task folder, link `outputs/decision-log.md` too
- Work items: [AB#id …]
- PRs: [PR id](https://dev.azure.com/[org]/[project]/_git/[repo]/pullrequest/[id]) …
- Related decisions: [[ADR-id]-[slug].md] …
```
