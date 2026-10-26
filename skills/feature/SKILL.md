---
name: feature
description: Develop a Midas user story end to end. Checks the story and its designs, asks every open question instead of guessing, writes a feature spec and a plan for the user to approve, implements it in the workspace's repos following each repo's practices, raises every decision the acceptance criteria don't settle, verifies and reviews it in fresh context, publishes a change summary page, then pushes and opens pull requests after the user's go-ahead. Use when the user gives a user story id or link to build, or invokes /feature. Re-running on an id resumes it.
argument-hint: "<user story id or link>"
---

# Develop a Midas feature

Take a user story from ADO to pull requests, with the user deciding at every gate. The phases are **Story → Spec → Plan → Build → Review → PR**.

First read `../../reference/work-items.md`, relative to this skill's base directory. It holds the team defaults, the doc and comment workflow, the rich-text rules, and how to name branches, commit and open PRs.

## The band and its gates

Record progress with `feature_status` (`mcp__agentic-midas__feature_status`, load it with ToolSearch if needed). It drives the band above the prompt: ticket link, phase tracker, spec, summary and PR links, one row per repo with branch and changes, a **Details** pane, and the decisions waiting.

There are three gates, and **only the user's band buttons pass them**: **Approve spec**, **Approve plan**, **Commit & PR**. The mod enforces them:
- `feature_status` refuses a phase past an unpassed gate.
- Edits under the workspace are refused before both approvals, except in `.midas/`.
- Edits in repos outside the plan are refused.
- Edits in a repo that sits on its base branch are refused.
- `git commit`, `git push`, `az repos pr create` and ADO PR tools are refused before Commit & PR. The user reviews the uncommitted changes first.
- Commands that could throw away uncommitted work are refused for you and your subagents: `git stash`, `git reset --hard`, `git checkout -- …` or `.`, `git restore`, `git clean -f`, `git push --force`, `git branch -D`. `rm -r` inside the workspace is put to the user.

Don't work around a refusal. Tell the user what it is waiting for.

While a feature is in progress, the mod adds a reminder of it to every system prompt. If this skill's instructions are no longer in your context (after compaction, for example), invoke the skill again with the id before going on.

**Every doc and page opens with a summary block**, so the user sees the point before the detail:

```
## TL;DR            at most 5 lines: what it concludes or delivers, not how
## Key decisions    each with a one-line reason (leave out when empty)
## Open questions   each a question for the user (leave out when empty)
```

Send `feature_status` the `id` plus whatever changed. Lists replace whole. Keep it true: the user steers by the band.

## 0. Start or resume

Take the id from `$ARGUMENTS`: digits, `#123`, `AB#123`, or a link with `_workitems/edit/<id>` or `?workitem=<id>`. Call `feature_status` with just the `id`.
- **Saved state comes back:** say in one line where it stands, and carry on from its phase. Read the spec doc since your last rev first.
- **Nothing saved:** call it with `id`, `title` and `root`. `root` is the absolute path of the folder holding the repos, normally the session's working directory.

## 1. Story

1. Load the item (`wit_work_item` get, expand Relations), its comments, its parent's title, and its attachments. Collect design links from its fields: Figma, Zeplin, prototypes, screenshots.
2. This version handles **User Stories**. For other types, say so and stop.
3. If the story is weak, offer to refine it first with the `/refine-item` flow, then come back. Weak means no acceptance criteria, criteria that can't be tested, or no clear user or value.
4. Ask in **one** message (AskUserQuestion for choices):
   - for a prototype or design, if none was found, or whether the ones found are current;
   - every question about behaviour the story leaves open.

   **Never guess functionality.** Whatever stays unknown becomes an Open question in the spec.

## 2. Spec

1. Write the spec as a Claude Doc named `AB#<id> spec: <title>`, following the reference's doc rules. It describes the feature only: no code, classes, endpoints or tables.
   ```
   ## TL;DR · ## Key decisions · ## Open questions     the summary block
   ## Story          link to AB#<id>, the story in one paragraph
   ## Designs        links, and what each covers
   ## Behaviour      what the user can do, step by step
   ## Acceptance criteria   AC1, AC2, … plain testable statements, never Given/When/Then (see the reference)
   ## Edge cases and errors
   ## Out of scope
   ```
2. Open the doc, then call `feature_status` with `phase: "spec"`, the `specUrl`, and `ac` (one `todo` per criterion).
3. **Audit the spec.** Spawn the `agentic-midas:spec-auditor` agent (fresh context) with the spec text, the id, and the workspace root. Post each finding as a doc comment anchored on its `quote`, worst first, with its severity, the finding and the ask. In chat, one line: how many findings, how many high, and that **Action comments** applies them.
4. Work through the doc as the reference says. Keep `ac` in step with the doc's criteria. After big changes, audit again.
5. When Open questions is empty and no high audit finding is unresolved, tell the user to press **Approve spec**.
6. On **"Spec approved."**: offer to write the final criteria back to the story, following the `/refine-item` Update rules (rev test, field formats), so ADO and the spec agree. Then go to Plan.

## 3. Plan

1. Explore read-only. Look at the repos the feature touches, each repo's CLAUDE.md and conventions, and the closest existing feature to copy its patterns. Subagents can explore in parallel.
2. Add a `## Plan` section to the end of the spec doc, opening with its own short TL;DR:
   - **Repos**: name, base branch, why it changes.
   - **Contracts** between repos: their shape, not code.
   - **Data lifecycle:** one table per piece of data the feature adds or changes. Rows are create, read, update and delete; columns are backend, UI and user access (rendered, routed, reachable). Mark each cell exists, added by this plan, or out of scope. An empty cell the spec doesn't exclude is an orphaned operation: add it to the plan, or ask.
   - **Order**: shared contracts first, then producers, then consumers, then infra.
   - **Tests**: per acceptance criterion.
   - **Decisions**: each with options and your recommendation.
   - **Risks.**
3. Call `feature_status` with `phase: "plan"`, the `repos` (`name`, absolute `path`, `base`), and the open decisions (`question` only).
4. Ask the decisions (AskUserQuestion, batched), and record each `choice` with `by: "user"`. Then tell the user to press **Approve plan**.
5. On **"Plan approved. Start building."**: go to Build.

## 4. Build

1. Call `feature_status` with `phase: "build"`. Create the branch in every planned repo, as the reference says.
2. Implement in the plan's order, following each repo's own practices: its CLAUDE.md, the patterns of the feature you copied, its test style. Add tests for every criterion. Make every cell the data lifecycle table marks as added reachable by a user. Leave no TODOs, commented-out code or debug logging.
3. **Decisions:** any choice the spec, criteria and plan don't settle goes to the user. That includes behaviour, wording, defaults, validation, error handling, what users see, and data kept.
   - Record it first as a waiting decision, so the band shows it.
   - Ask, batching when the work can carry on meanwhile, then record the answer.
   - A purely internal choice that follows an existing pattern you may make yourself: record it with `by: "claude"` and the `why`, so reviewers see it.
4. Need a repo outside the plan? Ask the user first, then add it to `repos`.
5. As criteria are met, set their `status` to `done`. Run each repo's build and tests, and record `tests: passed` or `failed` per repo.
6. **Don't commit.** The changes stay uncommitted, so the user can review them in their own editor's diff. Commits come after Commit & PR.

## 5. Review

1. Call `feature_status` with `phase: "review"`.
2. Spawn the `agentic-midas:feature-reviewer` agent. It works in a fresh context and didn't write the code. Give it the id, the spec text (behaviour, criteria, edge cases, out of scope), the data lifecycle tables, the decisions, and each repo's path, base and branch. It reviews correctness, whether the feature really works end to end, over-engineering, and scope.
3. **The user picks the fixes.** Show the criteria matrix and the numbered findings grouped by severity. Then ask with AskUserQuestion: fix all fixable findings (Recommended), let me choose (they name the numbers), or skip.
   - Fix what they pick. Run the builds and tests again, then ask whether to run the review again.
   - Allow at most 3 rounds; after that, ask whether to go on with the known issues.
   - Never go on with an unresolved high finding unless the user explicitly says so.
   - Set criteria to `verified` with their `evidence`.
4. Publish the change summary as a private Artifact page, loading the artifact-design and artifact-diagramming skills first. It holds:
   - the summary block: TL;DR of what changed, key decisions, open questions and known risks;
   - **How it works**, always, right after the TL;DR: two to four diagrams of the feature as built, so a reviewer sees how it works before reading the diff. Pick the flows that carry it:
     - the main user action end to end: which components talk, in order, and where data is checked, stored or refused;
     - who reads the result (editor, customer page, other services) and what each may see;
     - the lifecycle of data the feature adds: its states and what moves it between them.

     Make each one a figure with a numbered title, an inline SVG (`role="img"`, an `aria-label` that says the flow in one sentence) and a caption of two or three sentences on what the drawing can't show. Use the real component names, mark checks and failure paths, and use the page's colour tokens so both themes work. Render it once and fix overlapping or overflowing text. When the code changes, update the diagrams too;
   - links to AB#<id> and the spec;
   - per repo: branch and changed files (uncommitted), each with one line on why;
   - a map from each criterion to its evidence (code and tests);
   - the decisions table;
   - the review findings: each one fixed (and how) or skipped (and why);
   - how to test it locally.

   Without the Artifact tool, write `<root>/.midas/<id>/summary.html` and use its `file:///` path.
5. Call `feature_status` with the `summaryUrl`. Tell the user to review the uncommitted changes in their editor, using the summary as the map, then press **Commit & PR**. If they ask for changes, make them, review again, and update the summary.

## 6. Commit and pull requests

1. On **"Commit, push and open the PRs."**: call `feature_status` with `phase: "pr"`.
2. Commit each repo as the reference says: team style, the feature's files staged by name. Ask about any changed file the feature didn't touch.
3. Push each repo, then open one draft PR per repo as the reference says. The description holds the summary link, the spec link, sibling PRs and merge order. Record the `prs`.
4. Ask with AskUserQuestion (multiSelect) whether to add a comment on the work item with the summary and PR links, and whether to move its state. Do only what they pick.
5. Call `feature_status` with `phase: "done"`.

## Rules

- No commit, push, PR, work item comment or state change without its gate or the user's pick.
- Never change git state nobody asked for: no stash, reset, force-push or branch deletion.
- Never guess functionality. Ask, or leave an Open question.
