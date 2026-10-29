# PR Review Miner — Subagent Prompt Template

Read one batch of human review comments from completed pull requests and pull out two things: the **conventions** reviewers ask for (candidate standards) and the **lessons** — domain knowledge, pitfalls and design rules a reviewer had to point out, even once.

## Inputs

- Batch file: `[batch_file]` — JSON lines: `pr`, `date`, `title`, `thread`, `status` (`fixed`, `closed`, `active`, `wontFix`, `byDesign`, …), `file`, `line`, `author`, `reply` (false = the thread's opening comment), `text`
- PR link: `https://dev.azure.com/[org]/[project]/_git/[repo]/pullrequest/<pr>`
- Existing guidance to skip: `[existing_guidance]` (CLAUDE.md, `.claude/rules/**`, `.midas/docs/` files — read them first)
- Output file: `[output_file]`

Read the whole batch file. Read a thread's replies with its opening comment: the reply often says how it was settled ("Fixed in 7748c514", "agreed, but not here").

## What counts

**Pattern** — a convention asked for in general terms, reusable on any change: "use Shouldly", "no null guards on injected deps", "name tests Method_ShouldX_WhenY", "validators cap text at the legacy column width". Record every PR where it appears.

**Lesson** — knowledge a future change in the same area needs, even from one PR:
- domain rules and invariants ("ExpiryDate is a calendar date at midnight UTC, so compare dates, not instants")
- concurrency and ordering traps ("an edit that lands during a send can put BigWeb back to Draft")
- data and sync facts ("`IX_Quote_LegacyInvoiceId` is unique only where `DeletionDate IS NULL`")
- testing gaps that recur ("cover the 404 for another customer's quote")
- security or access assumptions ("these endpoints rely on the private ALB and an unguessable UID")

Write each lesson as a rule for the next change, not as a story of the PR: "When X, do Y, because Z."

**Skip**: approvals, "LGTM", questions answered without a change, typos, formatting nits, comments that only restate the PR description, anything already stated in `[existing_guidance]` (unless the thread adds a detail it lacks — then record only the detail), comments about the review tooling itself.

**Weigh by outcome**: a thread `fixed`/`closed` or with an agreeing reply is evidence the team accepted it; `wontFix`/`byDesign` means the team rejected it — record it as a lesson only when the rejection itself teaches something ("we accept X because Y"), and say so.

## Module

Give every pattern and lesson a `module` from the file path: the feature module or layer folder (`Quotes`, `JobFinances`, `Shared`, `Invoices`, `test`, `dms`, `tf`, `build`, …) or, outside such a structure, the top folder. Use `general` when it applies everywhere.

## Output

Write YAML to `[output_file]`:

```yaml
batch: [batch_number]
prs_read: 0                # distinct PRs in the batch
comments_read: 0
patterns:
  - category: "testing"    # global | backend | frontend | testing | <custom>
    standard_name: "Short Name"
    description: "What the convention requires, 1-3 sentences"
    module: "general"
    prs: [67516, 67650]
    evidence:
      - "PR 67516 test/.../SendQuoteEmailTests.cs: \"No 404 test for a quote that belongs to another customer\" (fixed) https://dev.azure.com/..."
lessons:
  - module: "Quotes"
    topic: "concurrency"   # domain | concurrency | data-sync | testing | security | performance | api | infra | other
    lesson: "When a PUT and a send overlap, … because …"
    paths: ["src/BigChange.JobFinance/Quotes/Domain/Entities/Quote.cs"]
    prs: [67516]
    date: "2026-10-20"     # newest PR date for this lesson
    outcome: "fixed"       # fixed | rejected | open
    evidence: "PR 67516 Quote.cs: \"An edit that lands during a send can put BigWeb back to Draft\" (fixed) https://dev.azure.com/..."
```

## Rules

- Every pattern and lesson cites at least one PR comment with its link. Never write a lesson the comments don't support.
- Quote briefly (under 25 words); don't copy whole threads.
- Merge duplicates inside the batch: one pattern or lesson, all its PRs.
- Paths are repo-relative, without the leading `/`.
- Read only. Write nothing but `[output_file]`.
