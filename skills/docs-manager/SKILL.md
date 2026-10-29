---
name: docs-manager
description: Internal engine for the files in .midas/docs/ — the folder structure, standard files, decision cards, review lessons and INDEX.md. Run by the docs-operator subagent for /agentic-midas:init, standards-discover, standards-update and adr-distill. Never edits CLAUDE.md.
user-invocable: false
---

# Documentation Manager (Internal Engine)

Manages the files in `.midas/docs/`. Not user-invocable: the `docs-operator` subagent runs it for `/agentic-midas:init`, `standards-discover`, `standards-update` and `adr-distill`.

## Core Principles

- **The repo's docs are the source of truth.** This plugin bundles no baseline standards: standards come from evidence (`standards-discover`) or from the user (`standards-update`).
- **INDEX.md is the map**, regenerated after every change.
- **CLAUDE.md is the user's.** Never create, edit or reorder it here; report whether it points at INDEX.md and let the calling skill ask.

## Structure

```
.midas/
├── config.yml                 # html_output, mockup_format, area, tasks_shared (written by init)
├── docs/
│   ├── INDEX.md               # master index — read first
│   ├── project/
│   │   ├── tech-stack.md
│   │   └── architecture.md    # optional
│   ├── standards/
│   │   ├── global/            # language-agnostic
│   │   ├── backend/           # C#/.NET services, data access, messaging
│   │   ├── frontend/          # WebForms/ASPX, jQuery, MFE
│   │   ├── testing/
│   │   └── <custom>/          # any category the evidence calls for
│   ├── decisions/             # adr-distill and /develop: one card per decision + INDEX.md by topic
│   │   ├── INDEX.md
│   │   └── <ADR-id>-<slug>.md
│   └── knowledge/
│       └── review-lessons/    # standards-discover: reviewers' lessons, one file per module
│           └── <module>.md
└── tasks/                     # task and research folders — committed when config.yml has tasks_shared: true, else personal
```

## Standard File Format

`standards/<category>/<topic>.md`: a `## Topic` heading, then one `### Standard Name` per standard with a 1-10 line description (code excluded), a brief example only where it clarifies (under 10 lines), and a **Sources** line: the config file, docs file or PR links the standard came from. Standards are quick-reference conventions, not tutorials; split a file that grows unwieldy.

---

## Operations

### 1. Initialize

Parameters: `standards_source_path` (optional), `area` (optional).

1. Create `.midas/docs/project/` and `.midas/docs/standards/`. If `.midas/docs/` already exists, report it and stop: the caller asks the user.
2. With `standards_source_path`, copy its category folders into `.midas/docs/standards/`. Without it, create no standard files.
3. Generate INDEX.md (operation 2).
4. Report what was created.

### 2. Regenerate INDEX.md

1. Scan `.midas/docs/`.
2. For each file, read it and write a description. For standards, **list the actual practices** in the file, not a generic category line.
3. Find the repo's existing guidance: `CLAUDE.md` (root and nested), `.claude/rules/**`, `adr/` or `docs/adr/`, `CONTRIBUTING.md`. List them under "Existing sources" with one line each.
4. Fill `references/index-md-template.md` and write `.midas/docs/INDEX.md`.
5. Report whether `CLAUDE.md` mentions `.midas/docs/INDEX.md`. Do not edit it.

### 3. Create or update a standard file

1. Create mode: write the file in the format above, creating the category folder if needed.
2. Update mode: read the file, merge the new standards as `###` sections, keep the existing ones unless the caller says a standard replaces one.
3. Regenerate INDEX.md.

### 4. Write decision cards

The caller passes the cards (`adr-distill/references/decision-card-template.md` format) and the decisions index rows.
1. Write each card to `decisions/<ADR-id>-<slug>.md`, replacing the previous card for that decision (match on the `adr:` frontmatter, not the file name). The caller may pass only frontmatter and Links changes for a card (a rehome): apply those and keep the rest of the card.
2. Write `decisions/INDEX.md`: one table per topic (`| ADR | Title | Status | Implementation | Decision | Superseded by |`), current decisions first, superseded ones last.
3. If the caller passes a `## Key Decisions` section and `project/architecture.md` exists, replace that section there (append it if missing); touch nothing else in the file.
4. Regenerate INDEX.md.

### 5. Write review lessons

The caller passes lessons grouped by module.
1. Per module, write `knowledge/review-lessons/<module>.md`: a `# <Module> — review lessons` heading, then one `## <Topic>` per topic, each lesson a bullet: the rule, then `— <paths> · <date> · [PR <id>](<link>)`.
2. Update mode: keep existing bullets; add new ones; replace a bullet only when the caller marks it as replaced by a newer PR.
3. Regenerate INDEX.md.

### 6. Validate

Check that every file under `.midas/docs/` is in INDEX.md and every INDEX.md entry exists, that project docs hold real content rather than placeholders, that standards carry their sources, that each decision card's `source_path` (or, on cards older than `source`, `adr_path`) exists, and that each lesson links a PR. Report the issues; fix only INDEX.md entries (missing or broken), and report the rest to the caller.

---

## Notes

- Return control to the caller when done: it has more steps.
- Never touch `.midas/tasks/`.
