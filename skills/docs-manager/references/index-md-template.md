# INDEX.md Template

Use this structure for `.midas/docs/INDEX.md`. Fill the sections from what is actually in `.midas/docs/` and the repo; do not hardcode file lists. For standards, the description lists the specific practices in the file, not a generic category line.

```markdown
# Documentation Index

**Read this first** at the start of any development task, then open the files below that fit the task.

**Area**: [paths from .midas/config.yml `area`, or "whole repo"]

## Project Documentation

Located in `.midas/docs/project/`

### Tech Stack (`project/tech-stack.md`)
[What it covers]

### Architecture (`project/architecture.md`)
[What it covers — if it exists]

---

## Technical Standards

### [Category] Standards

Located in `.midas/docs/standards/[category]/`

#### [Topic] (`standards/[category]/[topic].md`)
[The practices it states, e.g. "assert with Shouldly; build test data with Bogus fakers via RuleFor; name tests Method_ShouldX_WhenY"]

[... every category and file found ...]

---

## Decisions

Located in `.midas/docs/decisions/` — one card per decision (from an ADR, or from a shared task folder under `.midas/tasks/` that holds its research and decision log): the decision, the MUST / MUST NOT constraints for code, where it lives, implementation state. `decisions/INDEX.md` groups them by topic.

[One line per topic: the topic and its current decisions, e.g. "sync — JF004 incremental SyncV1 consumers, JF006 outbox two-way sync"]

---

## Review Lessons

Located in `.midas/docs/knowledge/review-lessons/` — what reviewers had to point out, by module. Read the module's file before changing it.

#### [Module] (`knowledge/review-lessons/[module].md`)
[The topics it covers and how many lessons, e.g. "concurrency (4), domain (6), testing (3) — send/edit races, expiry dates, legacy column widths"]

---

## Existing Sources

Guidance that lives elsewhere in the repo. It still applies; standards here don't repeat it.

- `CLAUDE.md` — [one line]
- `.claude/rules/[...]` — [one line each]
- `adr/` — [what the ADRs cover; omit once the ADRs were rehomed into task folders]

---

## Keeping It Current

- `/agentic-midas:standards-update "<convention>"` adds or changes one standard.
- `/agentic-midas:standards-discover` re-reads config, code, docs and recent PR reviews, and adds review lessons.
- `/agentic-midas:adr-distill` refreshes the decision cards after an ADR changes; `/agentic-midas:develop` records new decisions as cards backed by their task folder.
- Regenerate this index after any change to `.midas/docs/`.
```
