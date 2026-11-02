---
name: feature
description: Develop a Midas user story end to end. Checks the story and its designs, asks every open question instead of guessing, writes a feature spec and a plan for the user to approve, implements it in one sub-session per repo (in a worktree or the repo folder, so each repo's diff can be reviewed) following each repo's practices, raises every decision the acceptance criteria don't settle, verifies and reviews it in fresh context, publishes a change summary page, then pushes and opens pull requests after the user's go-ahead. Use when the user gives a user story id or link to build, or invokes /feature. Re-running on an id resumes it.
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
- Edits in a repo that has a sub-session are refused here: send them to that session.
- `git commit`, `git push`, `az repos pr create` and ADO PR tools are refused before Commit & PR. The user reviews the uncommitted changes first.
- Commands that could throw away uncommitted work are refused for you and your subagents: `git stash`, `git reset --hard`, `git checkout -- …` or `.`, `git restore`, `git clean -f`, `git push --force`, `git branch -D`. `rm -r` inside the workspace is put to the user.

Don't work around a refusal. Tell the user what it is waiting for.

While a feature is in progress, the mod adds a reminder of it to every system prompt. If this skill's instructions are no longer in your context (after compaction, for example), invoke the skill again with the id before going on.

**Every doc and page opens with `## TL;DR`**: at most 5 lines on what it concludes or delivers, not how. Questions waiting for the user follow under `## Open questions`, each one a question; leave that section out when it is empty.

**Short beats complete.** The user reads every word of the spec and plan before approving them. Write what changes a decision; leave out what the code, the story or a test will say anyway.

Send `feature_status` the `id` plus whatever changed. Lists replace whole. Keep it true: the user steers by the band. Record in `decisions` only choices that change what users see, or that the user made. Internal choices that follow an existing pattern stay out of the band.

## 0. Start or resume

Take the id from `$ARGUMENTS`: digits, `#123`, `AB#123`, or a link with `_workitems/edit/<id>` or `?workitem=<id>`. Call `feature_status` with just the `id`. Once you have the item's title (saved or loaded), name the session as the reference's **Session title** says.
- **Saved state comes back:** say in one line where it stands, and carry on from its phase. Read the spec doc since your last rev first. Repos with a `session` have their sub-session there: check it with `get_session` before sending it work.
- **Nothing saved:** call it with `id`, `title` and `root`. `root` is the absolute path of the folder holding the repos, normally the session's working directory.

## 1. Story

1. Load the item (`wit_work_item` get, expand Relations), its comments, its parent's title, and its attachments. Collect design links from its fields: Figma, Zeplin, prototypes, screenshots. Then move it into work as the reference's **Starting work** says.
2. This version handles **User Stories**. For other types, say so and stop.
3. If the story is weak, offer to refine it first with the `/refine-item` flow, then come back. Weak means no acceptance criteria, criteria that can't be tested, or no clear user or value.
4. Ask in **one** message (AskUserQuestion for choices):
   - for a prototype or design, if none was found, or whether the ones found are current;
   - every question about behaviour the story leaves open.

   **Never guess functionality.** Whatever stays unknown becomes an Open question in the spec.

## 2. Spec

1. Write the spec as a Claude Doc named `AB#<id> spec: <title>`, following the reference's doc rules. **It describes behaviour only**: what a user does and sees. No code, classes, endpoints, tables, retries, locks or other mechanisms. Aim for one screen: it is the story made precise, not a longer story.
   ```
   ## TL;DR                 at most 3 lines: what the user gets; link to AB#<id>
   ## Behaviour             numbered steps of what the user does and sees, including what they see when it fails; link the design a step follows
   ## Acceptance criteria   AC1, AC2, … plain testable statements, never Given/When/Then (see the reference)
   ## Open questions        leave out when empty
   ## Out of scope          only what the story doesn't already exclude; leave out when empty
   ```
   - **The criteria are the story's own**, made testable: keep their count close to the story's. Add one only for an answer the user gave. Split or reword a story criterion only when a test couldn't prove it as written.
   - **Robustness is not behaviour.** Concurrent requests, double clicks, retries, timeouts, partial failures and other services being down get no steps or criteria unless the story asks for them. The plan covers them under Risks, with the simplest handling.
   - A decision the user made goes into the step or criterion it shapes, not into a section of its own.
2. Open the doc, then call `feature_status` with `phase: "spec"`, the `specUrl`, and `ac` (one `todo` per criterion).
3. **Audit the spec.** Spawn the `agentic-midas:spec-auditor` agent (fresh context) in **spec mode** with the spec text and the id. Post each finding as a doc comment anchored on its `quote`, worst first, with its severity, the finding and the ask. In chat, one line: how many findings, how many high, and that **Action comments** applies them.
4. Work through the doc as the reference says. Keep `ac` in step with the doc's criteria. After big changes, audit again.
5. When Open questions is empty and no high audit finding is unresolved, tell the user to press **Approve spec**.
6. On **"Spec approved."**: go to Plan. Leave the story as its author wrote it: don't write the criteria back. If the spec differs from the story in a way the team should know, say so in chat.

## 3. Plan

1. Explore read-only. Look at the repos the feature touches, each repo's CLAUDE.md and conventions, and the closest existing feature to copy its patterns. Find what already exists that the feature can use: endpoints, tables, components, activity and events. **Reuse beats new**: add a table, column, endpoint, message, service or package only when nothing existing can do the job. Subagents can explore in parallel.
2. Add `## Plan` to the end of the spec doc. The user approves the shape of the change, not its steps:
   ```
   ### TL;DR              at most 3 lines
   ### How it works       one or two diagrams
   ### Changes per repo   per repo: name, base branch, at most 6 bullets
   ### New things         table: what · kind · repo · why nothing existing does it
   ### Decisions          only those waiting, each with options and your recommendation
   ### Risks              at most 3, each with the simplest way to handle it
   ```
   - **How it works:** draw the main user action end to end, the way the change summary's diagrams do: which components talk, in order, and where data is checked, stored or refused. Use the real component names and show the failure paths. Add a second diagram only for a second flow: who reads the result, or the states of data the feature adds. Draw each one in the doc as the docs connector's diagram topic says, with one sentence under it. Also write each as a Mermaid `sequenceDiagram` or `flowchart` of at most 25 lines to `<root>/.midas/<id>/diagrams.md`: the PR descriptions use them.
   - **New things** lists every new table, column, endpoint, message, package, page or component, with the existing thing you checked and why it can't do the job. An empty table is a good plan.
   - Check the data lifecycle without printing it: for each piece of data the feature adds or changes, can a user create, see, change and remove it where the spec expects? Put only the gaps in the plan, as a change or a Decision.
   - Contracts in detail, the order of work and the tests per criterion go in the sub-session briefs, not in the plan.
3. Call `feature_status` with `phase: "plan"`, the `repos` (`name`, absolute `path`, `base`), and the open decisions (`question` only).
4. **Audit the plan.** Spawn the `agentic-midas:spec-auditor` agent (fresh context) in **plan mode** with the spec and plan text, the id and the workspace root. Post its findings as doc comments and work through them as in Spec. In chat, one line.
5. Ask the decisions (AskUserQuestion, batched), and record each `choice` with `by: "user"`. Then tell the user to press **Approve plan**.
6. On **"Plan approved. Start building."**: go to Build.

## 4. Build

The code changes run in **sub-sessions**, one per planned repo, each opened in that repo's own folder. Each folder is a git checkout, so the user sees the repo's changes in that session's diff pane and can review and comment there. This session orchestrates: it doesn't edit the repos itself, and the mod refuses its edits in a repo that has a sub-session.

1. Call `feature_status` with `phase: "build"`.
2. Ask with AskUserQuestion where the sub-sessions make the changes:
   - **A worktree per repo (Recommended)**: each sub-session gets its own git worktree of the repo, so the repo's folder stays as it is.
   - **In the repo folders**: each sub-session works in the planned folder itself, on the feature branch.
3. **In the repo folders** only: create the branch in every planned repo now, as the reference says. With worktrees, each sub-session creates it in its own worktree.
4. Start one sub-session per repo with `mcp__ccd_session__start_session` (load it with ToolSearch if needed): `initiation: "user_asked"` (the user's answer above is the go-ahead), `context: "fresh"`, `cwd` the repo's planned `path`, `use_worktree` per the user's choice, `title` `AB#<id> <repo>: <feature title>`, `wake_when_done: true`. With a worktree, also pass `source_branch` the repo's base when that local branch exists. The app may ask the user to allow a folder.
   - Start repos side by side, except one that needs another repo's output first (a generated client or a published contract): start it when that repo's session reports done.
   - The `prompt` is the brief below, and `background` the feature in a few lines: the story, the spec link, the other repos and what each does.
5. Record each repo with `feature_status`: `session` the session id from the result, and with a worktree `path` the worktree folder (`get_session` on that id, or `git -C <repo> worktree list`). The band, the reviewer and Commit & PR read that folder. Link each session for the user as `[AB#<id> <repo>](#<session id>)`.
6. When a sub-session reports, read its full report (`list_events`) and check it against `git -C <path> status` and the diff. Record what it reports: criteria `done` with evidence, `tests: passed` or `failed`, and decisions with `choice`, `by` and `why`. Changes go to the sub-session that owns the repo, with SendMessage to its session id; never edit its files here. If its session is gone, or the user wants a change made here, record the repo without `session` first.
7. Need a repo outside the plan? Ask the user first, then add it to `repos` and start its sub-session.

**The brief** for each sub-session holds:
- AB#<id>, the title and the spec link; this repo's part of the plan (its bullets and New things rows), the contracts it provides or uses (their shape, not code), the criteria it owns with the test that proves each, and the decisions already made;
- with a worktree: first run `git fetch origin --prune` and `git switch --no-track -c <branch> origin/<base>` in it;
- follow the repo's own practices: its CLAUDE.md, the patterns of the feature the plan copies, its test style. Add tests for every criterion it owns. Make everything the feature adds reachable by a user where the spec expects it. Leave no TODOs, commented-out code or debug logging. Touch no other repo;
- **add nothing the plan's New things table doesn't list**: no new table, column, endpoint, message, package, page or component. If one seems needed, ask the user first, saying why nothing existing does the job;
- any choice the spec, criteria and plan don't settle goes to the user, with AskUserQuestion in that session. That includes behaviour, wording, defaults, validation, error handling, what users see, and data kept. A purely internal choice that follows an existing pattern it may make itself, with the reason;
- run the repo's build and tests. Where the repo can run here, start it once and try the changed page or endpoint;
- **don't commit, push or open a PR**, and don't run `git stash`, `reset --hard`, `checkout -- …`, `restore`, `clean -f` or `branch -D`. The changes stay uncommitted for the user's review; Commit & PR happens in the orchestrating session;
- end with a report: files changed with one line on why each, criteria met with their evidence, decisions that change what users see (choice, by whom, why), the build and test results, and what someone needs to try it locally: config and secrets, migrations, seed data, feature flags and URLs.

## 5. Review

1. Call `feature_status` with `phase: "review"`.
2. Spawn the `agentic-midas:feature-reviewer` agent. It works in a fresh context and didn't write the code. Give it the id, the spec text (behaviour, criteria, out of scope), the plan (changes per repo, New things, risks), the decisions, and each repo's path, base and branch. It reviews correctness, whether the feature really works end to end, over-engineering, and scope.
3. **The user picks the fixes.** Show the criteria matrix and the numbered findings grouped by severity. Then ask with AskUserQuestion: fix all fixable findings (Recommended), let me choose (they name the numbers), or skip.
   - Send each picked fix to the sub-session that owns its repo, and wait for their reports. They run their builds and tests again; then ask whether to run the review again.
   - Allow at most 3 rounds; after that, ask whether to go on with the known issues.
   - Never go on with an unresolved high finding unless the user explicitly says so.
   - Set criteria to `verified` with their `evidence`.
4. Publish the change summary as a private Artifact page, loading the artifact-design and artifact-diagramming skills first. It holds:
   - a TL;DR of what changed, then key decisions, open questions and known risks;
   - **How it works**, always, right after the TL;DR: two to four diagrams of the feature as built, so a reviewer sees how it works before reading the diff. Start from the plan's diagrams and redraw them as built; where the build differs, update `.midas/<id>/diagrams.md` too. Pick the flows that carry it:
     - the main user action end to end: which components talk, in order, and where data is checked, stored or refused;
     - who reads the result (editor, customer page, other services) and what each may see;
     - the lifecycle of data the feature adds: its states and what moves it between them.

     Make each one a figure with a numbered title, an inline SVG (`role="img"`, an `aria-label` that says the flow in one sentence) and a caption of two or three sentences on what the drawing can't show. Use the real component names, mark checks and failure paths, and use the page's colour tokens so both themes work. Render it once and fix overlapping or overflowing text. When the code changes, update the diagrams too;
   - links to AB#<id> and the spec;
   - per repo: branch and changed files (uncommitted), each with one line on why;
   - a map from each criterion to its evidence (code and tests);
   - the decisions table;
   - the review findings: each one fixed (and how) or skipped (and why);
   - how to test it locally: concrete steps per repo from the sub-session reports (config and secrets, migrations, seed data, feature flags, URLs), then the clicks that show each criterion.

   Without the Artifact tool, write `<root>/.midas/<id>/summary.html` and use its `file:///` path.
5. Call `feature_status` with the `summaryUrl`. Tell the user to review the uncommitted changes in each sub-session's diff pane (link each session), using the summary as the map, then press **Commit & PR**. Comments they leave on a diff go to that sub-session. If they ask for changes, send them to the sub-session, review again, and update the summary.

## 6. Commit and pull requests

1. On **"Commit, push and open the PRs."**: call `feature_status` with `phase: "pr"`.
2. Commit each repo in its recorded `path` as the reference says: team style, the feature's files staged by name. Ask about any changed file the feature didn't touch.
3. Push each repo, then open one draft PR per repo as the reference says. **The description must stand on its own**: the spec and summary are private claude.ai pages nobody else can open. Record the `prs`.
4. Ask with AskUserQuestion (multiSelect) whether to add a comment on the work item with the PR links and the How it works Mermaid diagram, and whether to move its state. Do only what they pick.
5. Call `feature_status` with `phase: "done"`.

## Rules

- No commit, push, PR, work item comment or state change without its gate or the user's pick.
- Never change git state nobody asked for: no stash, reset, force-push or branch deletion.
- Never guess functionality. Ask, or leave an Open question.
