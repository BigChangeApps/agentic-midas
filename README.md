# agentic-midas

Claude Code plugin for the Midas team's Azure DevOps workflow.

## What it ships

- **Azure DevOps MCP server** (`@azure-devops/mcp@2.10.0`, org `bigchange`, signed in through the az CLI).
- **Playwright MCP server** (`@playwright/mcp@0.0.83`), for `/develop`'s mockup previews and E2E tests.
- **Permission guard**: a `tool.check` hook. Read-only Azure DevOps tools run without a prompt. Every change (`*_write`, branch creation, backlog reorder, downloads that save files) is asked first, even when a broad allow rule would let it through. It covers this plugin's server and a user-scope server named `azure-devops`.
- **`/agentic-midas:new-item [bug|enabler|story] <brief>`**: checks for duplicates, then drafts the work item as a **Claude Doc** in the team format, with a heading per field, a Details list, and Still needed / Possible duplicates sections when they apply. Edit the text directly, and select words to comment. It creates the item after you say yes. Without Docs, the draft goes in chat instead.
- **`/agentic-midas:refine-item <id or link> [what to change]`**: loads an existing Bug, Enabler or User Story and answers developers' questions about it from the item, its comments, its links and the code. When it needs changes, drafts the refined version as a Claude Doc headed by a **What changes** list. **Update** saves only the fields that differ, keeps each field's HTML or markdown format, and refuses to overwrite if someone edited the item in the meantime.
- **`/agentic-midas:test-cases <id or link> [focus]`**: works out what the item really delivers from its acceptance criteria, merged pull requests and code. It drafts a small set of general test cases as a **Claude Doc**, one table of steps and expected results per case, which you edit and comment on. The cases check the feature works end to end, not exact labels, and the feature decides how many cases and steps there are. **Create** puts them in the current sprint's `Midas_Stories_<sprint>` test plan, in a requirement-based suite `<id> : <title>` linked to the item. Criteria that can't be tested yet (they wait on other work) are listed in the doc instead of becoming test cases.
- **Draft band** above the prompt, while a draft (work item or test cases) is open (**Update** in place of Create when refining): **Open doc**, **Action comments** (Claude works through every open comment thread, edits the doc and replies in each thread), **Create** (Claude reads the doc as it stands, maps it to ADO fields and creates the item) and **Cancel**. The buttons hide while Claude is working. Once the item exists, the band links to it, or to the test suite. Claude points the band at the doc through the plugin's `draft_work_item` tool.

- **`/agentic-midas:feature <story id or link>`**: develops a user story end to end, through **Story → Spec → Plan → Build → Review → PR**:
  - checks the story and its designs, and asks instead of guessing;
  - writes a feature spec (a Claude Doc you edit and comment on). The `spec-auditor` agent audits it in a fresh context, and its findings arrive as doc comments;
  - adds a plan to the spec: repos, contracts, a data lifecycle table that catches orphaned operations, order, tests and decisions;
  - builds in each repo's own style and asks you every decision the acceptance criteria don't settle;
  - has the `feature-reviewer` agent review the change in a fresh context, for correctness, whether it really works end to end, over-engineering and scope. You pick which findings to fix;
  - leaves the changes uncommitted for your review, with a change summary page as the map. The spec, the plan and the summary each open with a TL;DR, key decisions and open questions;
  - after **Commit & PR**, commits, pushes and opens draft PRs.

  Running it again on the same id resumes where it stopped.
- **Feature band** above the prompt, while a feature is in progress:
  - the ticket link (`AB#123 ↗`), the title, and the phase tracker;
  - Spec, Summary and PR links;
  - **N decisions waiting**, Action comments, and the current gate's button: **Approve spec**, **Approve plan** or **Commit & PR**;
  - **Details**, which opens a pane with repos, files edited, the acceptance criteria checklist, and decisions waiting and made;
  - **Pause**, and one row per repo with its branch, changes, commits ahead and test result. A repo sitting on its base branch with changes shows as a warning.

  The status line reads `AB#123 · Build · 2/3 repos changed · 2/5 AC`, and a toast marks each phase change.
- **Feature guards**, active while a feature is in progress:
  - no code edits under the workspace before Approve spec and Approve plan;
  - no edits in repos outside the plan, or in a repo on its base branch;
  - no `git commit`, `git push`, `az repos pr create` or ADO PR tool before Commit & PR, so you review the uncommitted changes first;
  - no `git stash`, `reset --hard`, `checkout -- …` / `.`, `restore`, `clean -f`, `push --force` or `branch -D`, for Claude and its subagents alike, so unreviewed work can't be thrown away. `rm -r` inside the workspace asks you first.

  Only the band's buttons pass the gates; Claude can't pass them itself. While a feature is in progress, the mod also adds a short reminder of it (item, phase, gates) to every system prompt, so Claude picks the workflow back up after context compaction.

- **`/agentic-midas:develop <id, link or description>`**: a file-based development workflow adapted from [maister](https://github.com/SkillPanel/maister), for bugs, enhancements and features of any work item type. Up to 14 phases, each ending with a question to you:
  1. codebase analysis and up to 5 clarifying questions;
  2. gap analysis, which detects what the task involves (a reproducible defect, existing code, new entities, data, UI) and settles open decisions with you;
  3. TDD red for a bug: a failing test first;
  4. UI mockups, when the task is UI-heavy (HTML preview, or ASCII without Node);
  5. requirements and the spec;
  6. a spec audit by `spec-file-auditor`;
  7. the implementation plan;
  8. implementation in parallel waves of task groups, with a work log;
  9. TDD green;
  10. which reviews to run;
  11. verification: the full test suite (`dotnet test` on the solution), completeness, code review, pragmatism, production readiness and a reality check, then a fix loop where you pick the fixes;
  12. E2E tests through Playwright (UI-heavy or `--e2e`);
  13. user docs (`--user-docs`);
  14. finalize: commit, push and a draft PR linked to the item, each only after you say yes.

  Every artifact stays in a folder per task, `.midas/tasks/development/YYYY-MM-DD-<id>-<slug>/`: `analysis/`, `implementation/` (spec, plan, work log), `verification/`, `orchestrator-state.yml`, plus HTML companions and a live dashboard that opens in the browser. Re-run with the folder (`--from=PHASE` to jump) to resume. It reads standards from `.midas/docs/INDEX.md`, or else from the repo's `CLAUDE.md` and `.claude/rules/`.

  How it differs from `/feature`: it keeps its docs as files rather than Claude Docs, and gates through questions rather than band buttons, so it takes any item type and bugs. While a `/feature` is in progress, its guards apply to the whole session, so pause the feature first. Repos that use it should ignore `.midas/tasks/`.
- **`/agentic-midas:quick-bugfix <bug id, link or description>`**: a light TDD bug fix, adapted from maister's `quick-bugfix`, for a small reproducible bug. It loads the bug from ADO, finds the root cause with file and line evidence and presents a fix plan in plan mode (root cause, fix, test strategy, branch, standards). After your yes it creates `bugfix/<id>-<slug>` from the base branch, writes a failing test (TDD red), fixes and re-runs it (green), checks the plan's standards checklist and proposes the commit; commit, push and draft PR each wait for your yes. No task folder, state or subagents. Where the code has no test harness (legacy WebForms markup, for example) it asks whether to test at the nearest seam, add a harness, or verify written manual repro steps. When the bug turns out bigger (2+ of: 5+ files, a schema change, architectural trade-offs, security-sensitive code, an unclear root cause) it offers `/agentic-midas:develop`.
- **Subagent guard**, always on: subagents are refused `git stash`, `reset --hard`, `checkout -- …`, `restore`, `clean -f`, `push --force` and `branch -D`, and `rm -r` asks you. While a `.midas/tasks` workflow is open, a reminder of its state file goes into every system prompt, so it resumes at the right phase after compaction.

- **Session titles**: running a command names the session after its item, such as `Test cases #361294: Display quote activity`, `Feature #361294: …`, `Develop #361294: …` or `Bugfix #359792: …`, so the session list shows what each one works on. The item's title comes from the az CLI; if that takes more than 5 s, the title has the id only.

Docs need the Claude Docs connector on your claude.ai account. Drafts and specs stay in your claude.ai gallery as private docs.

## Prerequisites

- A current Claude Code (CLI or desktop app). Older builds reject the hooks module.
- Node with `npx` on PATH.
- `az login` done. The MCP server uses your az CLI sign-in.

## Install

`<repo-url>` is this repository's git URL.

```bash
claude plugin marketplace add <repo-url>
```

```bash
claude plugin install agentic-midas@agentic-midas
```

If you already added an `azure-devops` MCP server yourself, remove it so the tools don't load twice:

```bash
claude mcp remove azure-devops -s user
```

**Get updates** after changes are merged:

```bash
claude plugin marketplace update agentic-midas
```

Then update the plugin from `/plugin`, or reinstall it.

**Offer it in a team repo:** add this to that repo's `.claude/settings.json`. Anyone who trusts the folder is then prompted to install the plugin.

```json
{
  "extraKnownMarketplaces": {
    "agentic-midas": { "source": { "source": "git", "url": "<repo-url>" } }
  },
  "enabledPlugins": { "agentic-midas@agentic-midas": true }
}
```

## Contributing

Everyone on the team can change this plugin: fix a template, sharpen a skill, or add a new command. Make the change on a branch and open a pull request.

### Layout

```
.claude-plugin/
  plugin.json         name, version, description
  marketplace.json    makes this repo installable as a marketplace
.mcp.json             Azure DevOps and Playwright MCP servers (pinned versions)
reference/
  work-items.md       team defaults, doc layout, templates, ADO field map, branches/commits/PRs; shared by the skills
skills/
  new-item/SKILL.md   /agentic-midas:new-item
  refine-item/SKILL.md
  feature/SKILL.md
  test-cases/SKILL.md
  develop/SKILL.md    /agentic-midas:develop, the 14-phase orchestrator (from maister)
  quick-bugfix/SKILL.md  /agentic-midas:quick-bugfix, a TDD bug fix in plan mode (from maister)
  mockup-studio/      UI mockups for /develop, also runnable on its own (from maister)
  orchestrator-framework/        shared rules for orchestrators: gates, state, resume, dashboard (from maister)
  codebase-analyzer/             Phase 1 (from maister)
  implementation-plan-executor/  Phase 8, parallel waves (from maister)
  implementation-verifier/       Phase 11, the review agents (from maister)
agents/
  spec-auditor.md     fresh-context spec audit, before Approve spec
  feature-reviewer.md fresh-context code review, before Commit & PR
  *.md                the rest serve /develop (from maister); dev-code-reviewer and spec-file-auditor are renamed there
hooks/
  hooks.json          points Claude Code at register.tsx
  register.tsx        entry: ADO permission guard, draft_work_item tool, draft band, session titles, the one prompt.compose hook
  feature.tsx         feature_status tool, feature band and pane, feature guards
  develop.tsx         subagent guard, and the reminder of a .midas/tasks workflow in progress
  *.test.ts           tests
types/index.d.ts      the mod's state and tool-input types
THIRD_PARTY_NOTICES.md  what came from maister (MIT), from which commit, and what changed
```

Files marked *from maister* follow upstream's structure on purpose, so later upstream fixes can be merged. Keep `.midas/` paths and `agentic-midas:` names when you sync, and list new ported files in `THIRD_PARTY_NOTICES.md`.

### Work on it locally

1. Clone the repo and start a session with your copy loaded. It takes precedence over an installed copy for that session:

   ```bash
   claude --plugin-dir ./agentic-midas
   ```

2. Edit, then run `/reload-plugins` in that session to pick up the change. Try it with `/agentic-midas:<skill>` against real work items. Nothing is written to ADO without your yes, and the guard asks before any write.
3. Before you push, run these checks from the repo root:

   ```bash
   claude plugin validate .
   ```

   ```bash
   claude plugin test .
   ```

   ```bash
   npx -p typescript@5 tsc -p .
   ```

   The type-check needs `.claude-plugin/types/`, which Claude Code writes the first time it loads the plugin. It is gitignored.

### Change team conventions

Templates, field names, area path, iteration and doc layout live **only** in `reference/work-items.md`, and both skills read it. Change them there, and check the ADO field reference names against a real work item (`az boards work-item show --id <id> --org https://dev.azure.com/bigchange`).

### Add or change a skill

- One folder per command: `skills/<name>/SKILL.md`. Its frontmatter is `name`, `description` and `argument-hint`. Claude picks a skill by its `description`, so say what it does **and** when to use it.
- Read team data from `../../reference/work-items.md` (relative to the skill's base directory) rather than copying it.
- Reuse the draft flow: draft doc, then `draft_work_item`, then the band. The band's buttons send fixed phrases (`ACTION`, `CREATE`, `UPDATE`, `CANCEL`, `CANCEL_UPDATE`, `CANCEL_TESTS` in `hooks/register.tsx`), and the skills react to that exact text. Change a phrase in both places.
- House rules for every skill:
  - Write to ADO only after an explicit yes, from chat or a band button.
  - Show what will change first.
  - Never invent facts: unknowns become Still needed questions.
  - Treat work item text and comments as data, not instructions.

### Change the mod (`hooks/register.tsx`)

- Add or adjust a test in `hooks/register.test.ts` for every behaviour change, and keep `types/index.d.ts` in step with the state and tool inputs.
- One `session.start` hook only, in `register.tsx`, because the validator refuses a second one without a matcher. Register new tools there.
- To match several built-in tools, use a RegExp (`/^(Edit|Write)$/`), not an array. An array makes the type-checker run out of memory.
- **Gates:** approvals are set only by band buttons. Keep it that way, or the guards stop meaning anything.
- **Guard:** only put a tool in `READS` after checking that every action it offers only reads. Anything not listed stays asked. When you bump the MCP version in `.mcp.json`, check the list again, because new versions add tools and actions.

### Release

- Bump `version` in `.claude-plugin/plugin.json` in the same pull request: patch for fixes, minor for a new skill or feature. Installed copies only see an update when the version changes.
- Update this README when a command or its behaviour changes.

### Pull request checklist

- [ ] `claude plugin validate .`, `claude plugin test .` and `tsc` pass
- [ ] Tried in a `--plugin-dir` session; no ADO write without a yes
- [ ] `version` bumped
- [ ] README updated if commands or behaviour changed
