# Third-party notices

## maister

Parts of this plugin are adapted from [maister](https://github.com/SkillPanel/maister), released under the MIT License (full text in [`licenses/maister-LICENSE`](licenses/maister-LICENSE)):

> Copyright (c) 2025-2026 Marek Kaluzny (SkillPanel.com) and Maister contributors

Ported from upstream commit `a1f05e0aa5fd2333cd3d5081491a0153f7202db3` (`plugins/maister/`, version 2.2.6). Changes made here:

- `.maister/` paths became `.midas/`, and `maister:` skill and agent names became `agentic-midas:`.
- `development` became `develop`, with Azure DevOps work item input, Midas branch, commit and PR conventions, and a fallback to the repo's `CLAUDE.md` and `.claude/rules/**` when `.midas/docs/INDEX.md` is absent.
- Agents renamed to avoid clashes with `/feature`: `code-reviewer` → `dev-code-reviewer`, `spec-auditor` → `spec-file-auditor`.
- .NET detection in `test-suite-runner` and `production-readiness-checker`.
- The bash hooks were rewritten in `hooks/develop.tsx`.

Files adapted from maister:

- `agents/ascii-mockup-generator.md
agents/code-quality-pragmatist.md
agents/codebase-analysis-reporter.md
agents/dev-code-reviewer.md
agents/e2e-test-verifier.md
agents/gap-analyzer.md
agents/implementation-completeness-checker.md
agents/implementation-planner.md
agents/production-readiness-checker.md
agents/reality-assessor.md
agents/spec-file-auditor.md
agents/specification-creator.md
agents/task-group-implementer.md
agents/test-suite-runner.md
agents/user-docs-generator.md
skills/codebase-analyzer/references/code-analysis.md
skills/codebase-analyzer/references/combined.md
skills/codebase-analyzer/references/context-discovery.md
skills/codebase-analyzer/references/file-discovery.md
skills/codebase-analyzer/references/migration-target.md
skills/codebase-analyzer/references/pattern-mining.md
skills/codebase-analyzer/SKILL.md
skills/develop/SKILL.md
skills/implementation-plan-executor/SKILL.md
skills/implementation-verifier/SKILL.md
skills/mockup-studio/references/design-resource-discovery.md
skills/mockup-studio/references/visual-companion.md
skills/mockup-studio/server/index.mjs
skills/mockup-studio/server/template.html
skills/mockup-studio/SKILL.md
skills/orchestrator-framework/assets/dashboard.html
skills/orchestrator-framework/references/html-report-style.md
skills/orchestrator-framework/references/orchestrator-patterns.md
skills/orchestrator-framework/SKILL.md`
- `skills/quick-bugfix/SKILL.md` (Azure DevOps Bug input, Midas branch and commit conventions, the `CLAUDE.md` standards fallback, and a choice for code with no test harness)
