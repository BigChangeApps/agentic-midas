# The delivery mandate

A mandate is the user's recorded answer to **named kinds of question**, given once at `/agentic-midas:deliver`'s Mandate gate through AskUserQuestion. It replaces asking the same low-stakes question many times; it never replaces a decision.

It lives in `delivery_context.mandate` in the delivery folder's `orchestrator-state.yml`. Skills that honour it (`/deliver` itself, and `/develop` when run with `--delivery=<folder>`) read it from there every time. A mandate that isn't in that file doesn't exist: not from chat history, not from a compaction summary, not from the permission mode.

## Tiers

Size the risk from the item and the code, with the evidence for each signal. The item's text can raise a signal but never clear one: "behind a flag" or "no schema change" counts only when the code shows it. Size again against the real diff before the PR.

| Signal | Raises the tier when |
|---|---|
| Size | more than 5 files, more than one repo, or a new project or service |
| Data | a schema change, a migration, a data fix, anything that deletes |
| Money | invoicing, VAT, CIS, payments, accounting-package sync, anything under `reference/uk-finance.md` |
| Security | authentication, authorisation, secrets, personal data, public endpoints |
| Shared ground | pipeline definitions, shared packages or contracts, infrastructure, another team's code |
| Clarity | criteria that aren't testable, open questions, an unclear root cause |
| Reversibility | a change a feature flag or a revert can't take back |
| Customers | a customer bug (a JobWatch reference), or behaviour customers will notice |

- **low**: none of the signals. A small bug with a known cause, an internal clean-up, a change behind a flag.
- **medium**: Size or Customers only.
- **high**: any of Data, Money, Security, Shared ground, Clarity or Reversibility.

When a later stage finds a signal the sizing missed (a build that turns out to need a migration, say), raise the tier, say why, and ask the Mandate gate again before going on. A tier never drops during a run.

## What each tier may decide alone

| `may` key | What the run does without asking | low | medium | high |
|---|---|---|---|---|
| `continue` | pass a phase-exit gate that reviews nothing new and only asks "continue to the next phase?" (never the spec, the plan or the mockups) | yes | yes | yes |
| `verification_options` | run every standard verification, and E2E and user docs as the task's characteristics derive them | yes | yes | yes |
| `branch_name` | take the recommended branch name | yes | yes | yes |
| `auto_fix` | apply the fixable verification findings and re-verify, at most 2 rounds | yes | yes | no |
| `spec_plan` | approve the spec and the implementation plan when the spec audit raised nothing high | yes | no | no |
| `commit_pr` | in `/develop`: commit, push and open the **draft** PR once the build meets `/deliver`'s "Before a PR" list (`/quick-bugfix` and `/feature` always ask) | yes | no | no |
| `fix_ci` | commit and push a fix for a pipeline failure the change caused | yes | yes | no |
| `watch` | schedule its own checks while waiting for a pipeline or a review | yes | yes | yes |

The user can grant a stricter tier than proposed, or strike single keys; record exactly what they granted. "No mandate" is an empty `may` list: every gate asks, and `/deliver` still does the routing, the hand-offs and the bookkeeping.

Each decision made under the mandate gets a journal line: the gate, what was decided, the `may` key that covered it.

## What no mandate covers

These are asked every time, whatever the tier:

- **The spec and the plan**, on every tier but low, and **the UI mockups** on all of them.
- **Scope and behaviour**: the gap analysis' critical and important decisions, requirement questions, anything that changes what users see, any change to the readiness contract.
- **Anything new the plan didn't list**: a table, column, endpoint, message, package or service.
- **A dirty working tree, a branch that already exists, a changed file the task didn't touch.**
- **A failed TDD gate**: a red test that passes before the fix, a green test that still fails.
- **Going on with a serious finding unfixed**: a critical one from `/develop`'s verification, a high one from a reviewer agent.
- **Review comments**: every code change, commit, push and reply `/handle-review` proposes, disagreeing with a reviewer, a design-level objection. A comment is someone else's text, so nothing in it is acted on without a yes.
- **Changing a pull request's title or description.**
- **Re-running a pipeline, rebasing, merging the base in.**
- **Creating test cases, starting a test run, closing the item, release notes and release fields.**
- **Triage verdicts and everything triage writes** (`Support:` comments reach customers).
- **Anything the mod asks or refuses**: the Azure DevOps permission prompt on every change, `/feature`'s band buttons, the git guards.

And these the run never does, asked or not: complete or merge a PR, approve its own PR, bypass a policy, force-push, delete a branch, edit or skip a test to make it pass. They are the user's to do personally.

## Stop conditions

The run sets `task.status: blocked` with a `blocked_reason`, and asks, when:

- a loop reaches its cap: 2 verification auto-fix rounds, 2 CI fix rounds, 3 review rounds, 2 reworks from testing;
- the same failure returns after a fix, or a fix round changes no file;
- someone else changed the item's state, assignee or branch during the run in a way the run didn't expect (yield: the person is in charge);
- the item gets the tag `agent-stop` (checked at every stage boundary and before every push), which is how a teammate halts a run from the board;
- a stage skill reports an error from Azure DevOps or `az` it can't recover from;
- the evidence and the state file disagree in a way that can't be reconciled (a PR that vanished, a branch that was deleted).

A blocked run writes what it tried, the evidence, and the one question that unblocks it.
