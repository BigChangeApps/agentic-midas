# CLAUDE.md Documentation Section Template

`/agentic-midas:init` appends this section to the end of the repo's `CLAUDE.md`, and only after the user says yes. Never rewrite, reorder or trim what is already in `CLAUDE.md`. Check the INDEX.md path exists before adding it.

```markdown
## Midas docs and standards

Before writing or changing code, also for quick requests outside a `/agentic-midas:*` workflow:

1. Read @.midas/docs/INDEX.md. It maps the team's standards by domain, the tech stack and architecture docs, and the repo's other guidance.
2. Open the files it points to that fit the task; the index alone is not enough.
3. Follow the standards. If one conflicts with the task, ask.

When a fix or a review comment shows a convention the standards don't capture yet, suggest it; once the user agrees, run `/agentic-midas:standards-update` with it.
```
