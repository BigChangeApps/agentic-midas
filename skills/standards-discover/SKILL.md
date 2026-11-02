---
name: standards-discover
description: Discover coding standards from config files, code patterns, docs (CLAUDE.md, .claude/rules, ADRs and their distilled decision cards), CI pipelines and the review comments on completed Azure DevOps pull requests — hundreds of PRs, mined in parallel batches. Scores each finding by evidence, asks before applying, writes approved standards to .midas/docs/standards/ and the reviewers' one-off lessons to .midas/docs/knowledge/review-lessons/. Takes --area to focus a large repo.
argument-hint: "[--scope=full|quick|<category>] [--area=<paths>] [--pr-count=50|all] [--confidence=60] [--skip-external]"
---

# Standards Discovery

Analyzes several sources in parallel, aggregates findings with confidence scores, presents them for approval, and applies the approved ones through the `docs-operator` subagent. Review comments yield two outputs: **standards** (conventions seen in 2+ PRs) and **lessons** (domain knowledge and pitfalls a reviewer pointed out, even once).

## Core Principles

1. **Parallel**: launch the discovery subagents in one message.
2. **Evidence-based**: every finding cites files, counts, config rules, ADRs or PR comment links.
3. **Confidence scoring**: source count, consistency, explicitness, evidence, PR feedback.
4. **Deduplication**: one standard found by several sources is one finding with combined evidence.
5. **Graceful degradation**: skip a source that isn't available (no `az` sign-in, no docs) and say so.
6. **No copies of existing guidance**: a rule already stated in `CLAUDE.md`, `.claude/rules/**` or a decision card in `.midas/docs/decisions/` stays there. Record it only when another source adds something (a PR thread showing how it's applied, a detail the rule lacks); INDEX.md links the existing files.

---

## Input Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--scope` | `full` | `full`, `quick`, or a category (`global`, `backend`, `frontend`, `testing`, or a custom one) |
| `--area` | `area` in `.midas/config.yml`, else whole repo | Paths to focus code sampling and PR history on |
| `--confidence` | `60` | Minimum confidence (0-100) to show a finding |
| `--auto-apply` | `false` | Apply findings with confidence ≥ 90 without asking |
| `--skip-external` | `false` | Skip PR history and CI pipelines |
| `--pr-count` | `50` | Completed pull requests to read review comments from; `all` reads the whole history |

| Scope | Config (P2) | Code (P3) | Docs (P4) | PRs + CI (P5) |
|-------|-------------|-----------|-----------|----------------|
| `full` | Yes | Yes | Yes | Yes |
| category | Relevant configs | Relevant files | Yes | Yes |
| `quick` | Yes | No | No | No |

---

## Phase Configuration

| Phase | Subject | activeForm |
|-------|---------|------------|
| 1 | Plan discovery and collect PR comments | Collecting PR review comments |
| 2 | Analyze configuration files | Analyzing configuration files |
| 3 | Mine code patterns | Mining code patterns |
| 4 | Extract documentation standards | Extracting documentation standards |
| 5 | Mine PR reviews and CI | Mining PR reviews and CI |
| 6 | Aggregate & deduplicate findings | Aggregating findings |
| 7 | Review findings with user | Reviewing findings |
| 8 | Apply approved standards and lessons | Applying standards |
| 9 | Generate summary report | Generating summary |

**Task Tracking**: At the start of Phase 1, `TaskCreate` every phase (pending). Phases 2-5 are blocked by Phase 1 and run in parallel; Phase 6 is blocked by 2-5; Phases 7-9 are sequential. Phases skipped by scope are `completed` with `metadata: {skipped: true, reason: "..."}`.

---

## Execution Workflow

### Phase 1: Planning and PR collection

1. Parse the options. Read `.midas/config.yml` for `area` when `--area` isn't given.
2. Check `.midas/docs/` exists. If not, offer `/agentic-midas:init` first.
3. Read `.midas/docs/INDEX.md`, the existing standard files and `.midas/docs/knowledge/review-lessons/` (if any), to tell updates from creates.
4. Work out the PR source: the `origin` remote gives the Azure DevOps org, project and repo (`git@ssh.dev.azure.com:v3/<org>/<project>/<repo>` — the repo name is the last segment, e.g. `BigChange.JobFinance`); the base branch follows `../../reference/work-items.md` (`BigChange` → `WebRelease2`, otherwise `origin/HEAD`).
5. Show the plan (scope, area, sources, PR count) and confirm with AskUserQuestion. With `--pr-count=all` or over 200, say how many PRs that is (`git log --first-parent origin/<base> --format=%s -- <area> | grep -c '^Merged PR'`) and that mining takes one subagent per ~300 comments.
6. Create a temp directory (`mktemp -d`) and, unless `--skip-external` or scope `quick`, collect the comments with the script in this skill's base directory (run it from the repo root, `timeout: 600000`):
   ```bash
   bash <skill base>/scripts/collect-pr-comments.sh <org> <project> <repo> <base> <pr_count> {tmpdir}/prs [area paths...]
   ```
   Fetching takes about 0.3 s per PR (8 in parallel): over ~1500 PRs, run it with `run_in_background` and wait for it to finish. It prints `stats.json`: PRs read, PRs with human review comments, comments, batches. Check `az account show` first; if `az` isn't signed in or the script fails on access (`TF401019`), skip PR mining and say so. Exit code 2 means the base branch has no `Merged PR <id>` squash subjects: fall back to `az repos pr list --status completed --target-branch <base> --top <n> --query "[].[pullRequestId,closedDate,title]" -o tsv` into `{tmpdir}/prs/pr-ids.tsv` and rerun the script's fetch part by hand, or skip PRs.

### Phases 2-5: Parallel Discovery

1. Each subagent writes to `{tmpdir}/config.yml`, `code.yml`, `docs.yml`, `external.yml`, and one `pr-batch-NN.yml` per batch.
2. Read the template of each phase you run:

| Phase | Condition | Template | Subagents |
|-------|-----------|----------|-----------|
| 2: Config | Always | `references/config-analyzer-prompt.md` | 1 |
| 3: Code patterns | scope ≠ `quick` | `references/code-pattern-prompt.md` | 1 |
| 4: Documentation | scope ≠ `quick` | `references/docs-extractor-prompt.md` | 1 |
| 5: CI and hooks | no `--skip-external` | `references/external-analyzer-prompt.md` | 1 |
| 5: PR reviews | comments collected | `references/pr-batch-miner-prompt.md` | 1 per `{tmpdir}/prs/batches/batch-NN.jsonl` |

3. Fill the placeholders (`[scope]`, `[area]`, `[org]`, `[project]`, `[repo]`, `[batch_file]`, `[batch_number]`, `[existing_guidance]` — the CLAUDE.md files, `.claude/rules/**` and `.midas/docs/` files —, `[output_file]`).
4. Launch all subagents in one message (Agent tool, `subagent_type: general-purpose`). With more than 8 batches, launch the first 8 with the other phases and the rest as they finish.
5. Wait for all of them, then Read each temp file.
6. Show the number of findings per phase, the PR stats (PRs read, with review comments, comments, date range) and the patterns and lessons found per batch.

### Phase 6: Aggregation

Read `references/aggregation-strategy.md`, then:
- **Standards**: merge the PR patterns across batches (union of PR ids — the PR count decides the score), combine with the other phases, deduplicate on `category + standard_name`, score, detect conflicts, group into High (≥ 80), Medium (60-79), Low (< 60), and filter by `--confidence`.
- **Lessons**: merge across batches, drop those a standard or existing guidance now covers, group by module and topic.

Show: raw findings, unique standards, conflicts, lessons per module.

### Phase 7: Review and Approval

**Step 1: the full table first**, grouped by confidence, every row with its sources:

```
### High confidence (>= 80%) — 5 standards

| # | Standard | Category | Score | Sources | Description |
|---|----------|----------|-------|---------|-------------|
| 1 | Shouldly assertions | testing | 92 | docs, code, PRs | Assert with Shouldly, never FluentAssertions |
```

Then Medium, Low, and Conflicts (`| # | Standard | Conflict | Sources A | Sources B |`).

**Step 2: approvals**
- **High**: AskUserQuestion — apply all, or review one by one (full evidence, examples, score breakdown).
- **Medium**: one by one — Accept / Modify / Skip.
- **Low**: table rows only; offer to expand or skip all.
- **Conflicts**: each with both sides' evidence — side A, side B, skip, or custom.

With `--auto-apply`, findings ≥ 90 are approved without asking.

**Step 3: lessons.** Show a table per module (`| # | Topic | Lesson | PRs | Outcome |`), newest first. Lessons are many and individually small, so ask once with AskUserQuestion: write all (recommended), choose modules (then ask which), or skip. Rejected-outcome lessons are shown marked "team decided against" and written only with the rest.

### Phase 8: Application

Write through the `docs-operator` subagent, never with Write/Edit, so INDEX.md stays consistent.

1. Prepare each approved standard: a `###` heading, a 1-10 line description, brief preferred/avoid examples where they help, the rationale, and the sources (PR comments as links: `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>`; ADRs as their repo path). Group related standards into one topic file; note create vs update.
2. Prepare the approved lessons as one file per module: `.midas/docs/knowledge/review-lessons/<module>.md`, sections per topic, each lesson a bullet with its paths, date and PR links. Merge into an existing file: keep its lessons, replace one only when a newer PR contradicts it (say so in the bullet).
3. Run `docs-operator` once (subagent_type: `agentic-midas:docs-operator`) with all of them: apply each create/update, then regenerate INDEX.md. It does not edit CLAUDE.md.

Show: created, updated, total standards and lessons.

### Phase 9: Summary

- Sources analyzed: config files, code files sampled, docs parsed, PRs read (with review comments, comments, date range), pipelines read
- Standards applied, by category; lessons written, by module
- Standards skipped (low confidence, declined)
- Next steps: review `.midas/docs/standards/` and `knowledge/`, commit them if the docs are shared, re-run after a batch of PRs. When few PRs had review comments, suggest a larger `--pr-count` or a wider `--area`.

Delete the temp directory only after the summary, and only if the user doesn't want the raw comments (`{tmpdir}/prs/pr-comments.jsonl`) kept.

---

## Error Handling

| Situation | Strategy |
|-----------|----------|
| `.midas/docs/` missing | Offer `/agentic-midas:init`, stop if declined |
| `az` not signed in, or no access | Skip PR mining, say so, continue |
| Some PRs fail to fetch | The stats count them (`prs_failed`); continue with the rest |
| A remote that isn't Azure DevOps | GitHub: `gh pr list --state merged --limit <n>` and `gh api repos/{owner}/{repo}/pulls/<n>/comments` into the same JSONL shape; otherwise skip PRs |
| Config file parse error | Skip that file, warn, continue |
| No standards found | Suggest a lower threshold or another scope/area |
| docs-operator fails | Offer retry / skip / cancel |
| A subagent returns nothing | Note it, go on with the rest |

---

## Examples

```bash
/agentic-midas:standards-discover                                   # full, area from .midas/config.yml
/agentic-midas:standards-discover --pr-count=all                    # every merged PR, mined in batches
/agentic-midas:standards-discover --area=BigWeb/js/2.0 --pr-count=100
/agentic-midas:standards-discover --scope=testing
/agentic-midas:standards-discover --scope=quick                     # config files only
/agentic-midas:standards-discover --skip-external                   # no PR history, no pipelines
```
