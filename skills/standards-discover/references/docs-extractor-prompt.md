# Documentation Standards Extractor — Subagent Prompt Template

Extract coding standards and conventions explicitly documented in project files.

## Task

Find and parse documentation files, extract explicitly stated standards, return findings as YAML.

## Documentation Files to Analyze

1. **README.md** — Look for: Code Style, Contributing Guidelines, Conventions, Best Practices sections
2. **CONTRIBUTING.md** — PR requirements, commit conventions, testing requirements, code review standards
3. **ARCHITECTURE.md** / `docs/architecture/` — Design patterns, architectural decisions
4. **ADRs** (Architecture Decision Records) — `adr/`, `decisions/`, `docs/decisions/` directories. When `.midas/docs/decisions/` exists the ADRs are already distilled: read the cards instead, take their MUST / MUST NOT constraints (source `adr`, citing the ADR path), skip superseded ones, and mark constraints already written as standards with `already_documented`.
5. **CLAUDE.md** (root and nested) / `.claude/CLAUDE.md` / `.claude/rules/**` — AI-specific coding instructions and project conventions. Mark findings that come only from these files with `already_documented: <file>`: the orchestrator does not copy them into `.midas/docs`, it links the file.
6. **Code of Conduct**, **STYLEGUIDE.md** — If present

## What to Extract

Look for explicit standard statements:
- "We use..." / "This project uses..."
- "Always..." / "Never..."
- "Prefer X over Y"
- "Required: ..." / "Must..."
- Code examples showing correct/incorrect patterns
- Numbered rules or guidelines lists

**Only extract explicitly stated standards** — do not infer from code examples alone.

## Categorization

Discover existing categories from `.midas/docs/standards/*/`. Baseline categories: `global/`, `frontend/`, `backend/`, `testing/`. Propose new categories if patterns don't fit existing ones.

## Confidence Range

Documentation findings: **80-92%** confidence (explicitly documented = strong evidence).

Higher end (90+) when multiple docs agree or when stated as mandatory rules.

## Output Format

Return YAML:

```yaml
findings:
  - category: "[category/subcategory]"
    standard_name: "[Short Name]"
    description: "[What the standard requires]"
    confidence: [80-92]
    evidence:
      - "[filename]: \"[exact quote or paraphrase]\""
    source: "documentation"
    already_documented: "[CLAUDE.md or .claude/rules file, when that is the only source]"
    examples:
      - "[Example from docs if provided]"
```

## Rules

- Include exact quotes or close paraphrases in evidence
- Note which file each standard comes from
- Return empty findings list if no documentation files found
- Prioritize actionable, clear standards over vague guidance
- Do not duplicate what config files already enforce — focus on human-written guidelines
- Do NOT write any files to the project directory. Write your YAML results to: `[output_file]` (the orchestrator replaces this placeholder with an actual temp file path when invoking you).
