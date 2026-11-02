# Retro Research — Subagent Prompt Template

Reconstruct a research folder from an ADR, in the layout `/agentic-midas:develop --research=<folder>` reads. The folder records research that was done when the ADR was written — reconstructed after the fact, from the ADR and its trail, not a new investigation.

When the folder will **replace** the ADR (`[rehome]` is true, so the ADR file may later be deleted), it must hold everything the ADR holds: copy the ADR verbatim to `outputs/original-adr.md`, and carry every measurement, option, trade-off and concern into the other files, so nothing depends on the ADR file existing.

## Inputs

- ADR file: `[adr_path]`; its card `[card_path]` and metadata `[card_yml]`
- Folder to create: `[research_folder]`
- Rehome: `[rehome]` (true / false)
- Azure DevOps `[org]` / `[project]` / `[repo]`

## Sources (in order of trust)

1. The ADR itself: context, measurements, options, decision, trade-offs, concerns.
2. The card: implementation state checked against the code, constraints, open questions.
3. The work items (`az boards work-item show --id <id>`: title, state, description, acceptance criteria; skip quietly if `az` fails) and the PRs from the card (subjects; `az repos pr show --id <id> --query description -o tsv` when it adds facts).
4. The code at the paths the card lists — only to state what exists today.

Never add findings from outside these sources. Where a source is silent, write that it is silent.

## Files to write

```
[research_folder]/
├── orchestrator-state.yml
├── planning/research-plan.md
└── outputs/
    ├── research-report.md
    ├── solution-exploration.md
    ├── high-level-design.md
    ├── decision-log.md
    ├── open-questions.md
    └── original-adr.md      # only when [rehome] is true: the ADR, byte for byte
```

Every markdown file starts with:

> **Reconstructed from [ADR-id]** (`[adr_path]`, commit [source_commit from the card]) on [today]. Statements cite their source: *(ADR §…)*, *(AB#…)*, *(PR …)*, *(code: path)*.

### `orchestrator-state.yml`

```yaml
research_context:
  research_question: "[the problem the ADR answers, as a question]"
  research_type: [technical | architecture | mixed]
  confidence_level: [high | medium | low]   # how complete the ADR's evidence is
  reconstructed_from: "[adr_path]"
  reconstructed_at: [YYYY-MM-DD]
  adr: [ADR-id]
  adr_status: [status from the card]
  implementation: [from the card]
  work_items: [ids]
  prs: [ids]
status: completed          # the research is done; the implementation is what remains open
phases:
  planning: completed
  gathering: completed
  synthesis: completed
  design: completed
```

### `planning/research-plan.md`
The research question, scope and what was out of scope, the sources the ADR relied on (benchmarks, spikes, measurements, documents it cites).

### `outputs/research-report.md`
- **Question** and **context** (why it came up, constraints at the time)
- **Findings** — numbered, each with its source; measurements quoted with their numbers
- **Conclusion** — the decision and its main reason
- **State today** — the card's implementation verdict and evidence

### `outputs/solution-exploration.md`
The options the ADR considered with their pros, cons and why each was taken or dropped. If the ADR names no alternatives, write exactly that and list only the chosen option — do not invent alternatives.

### `outputs/high-level-design.md`
The chosen design: components, responsibilities, data and message flow, the code paths that exist today and those still to build. A C4-style component list or a mermaid diagram only when the ADR gives enough to draw it.

### `outputs/decision-log.md`
Starts with a header the decision card reads:

```markdown
# [ADR-id] — [title]

**Status:** [the ADR's status, as written] · **Date:** [adr_date] · **Implementation:** [from the card]
```

Then one entry per decision in the ADR: `### D<n>: <decision>` with status (from the card, plus "superseded by …" where it applies), rationale, consequences, and the constraints it implies.

### `outputs/open-questions.md`
What a developer must settle before building: the ADR's concerns and unresolved points, parts marked proposed, missing pieces from the card's implementation check, blockers named in work items. Each with its source. This is what `/agentic-midas:develop` Phase 1 asks about. For a decision whose implementation is `done`, write "None open — implemented" plus any concern the ADR still lists.

### `outputs/original-adr.md` (rehome only)
Copy the ADR file unchanged (`cp`), so its exact wording survives once the ADR folder is gone. Images or files the ADR links go next to it under `outputs/adr-assets/`, with the links in the copy left as they are.

## Rules

- Write only inside `[research_folder]`. Never edit or delete the ADR, or touch `.midas/docs/`.
- Quote numbers and names exactly as the sources give them.
- Report back: the folder path, the research question, the number of findings, open questions, and the work item to pass to `/agentic-midas:develop`.
