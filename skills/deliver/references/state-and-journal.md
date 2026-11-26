# Delivery state, journal and status comment

A delivery keeps three records. The work item, git and the pull requests stay the truth; these make a cold resume cheap and let the team see what a run is doing.

```
.midas/tasks/delivery/YYYY-MM-DD-<id>-<slug>/
  orchestrator-state.yml   where the run stands (a cache of the truth)
  journal.md               append-only: what happened, what was asked, what the mandate decided
  retro.md                 written by the Learn stage
```

The folder sits under the resolver's `tasks` (the home's, when there is one) and is committed as the **Task folders** section of `reference/midas-paths.md` says: never when `tasksShared` is false, with the code in repo mode, in the home repo on its own in home mode.

## `orchestrator-state.yml`

The common fields are the framework's (`orchestrator-patterns.md` § 4), with the same write rule: change it key by key, re-read after every write, and take every timestamp from `date -u`. The mod finds an open delivery by this file and reminds the session of it after compaction.

```yaml
orchestrator:
  started_phase: intake
  completed_phases: []          # intake, ready, mandate, build, pr, ci, review, test, close, learn
  failed_phases: []
  created: 2026-11-20T09:12:44Z
  updated: 2026-11-20T09:12:44Z
  task_path: .midas/tasks/delivery/2026-11-20-361453-send-quote-by-email
  task_ids: {}

task:
  title: Send quote by email
  description: Deliver #361453 end to end
  status: in_progress           # pending | in_progress | blocked | completed | failed
  work_item: { id: 361453, type: User Story, title: Send quote by email, url: https://dev.azure.com/bigchange/BigChange/_workitems/edit/361453 }

delivery_context:
  stage: build                  # the stage in progress
  route: develop                # quick-bugfix | develop | feature
  until: done                   # pr | merged | done
  waiting_for: null             # review | ci | deploy | tester | team
  blocked_reason: null
  paused_at: null
  status_comment_id: null       # the one comment on the work item the run keeps up to date

  mandate:
    tier: medium                # low | medium | high
    signals: [ "Size: 2 repos", "Customers: changes the quote email" ]
    may: [ continue, verification_options, branch_name, auto_fix, fix_ci, watch ]
    granted_at: 2026-11-20T09:20:03Z

  triage: null                  # for a Bug: verdict, root cause (file:line), fix, size, files

  contract:
    criteria:
      - { id: AC1, text: "The customer gets the quote as a PDF attachment", status: todo, evidence: null }
    out_of_scope: [ "#361454 Quote email template editor" ]

  build:
    task_path: null             # /develop's task folder, or null
    feature_id: null            # /feature's id, or null
    branch: null
    review: null                # the fresh-context review: findings raised, fixed, skipped

  prs: []                       # { repo, id, url, branch, base, merged_commit }
  ci: []                        # { pr, run_url, result, round, cause }
  review: { rounds: 0, threads_handled: 0, design_objections: 0 }
  test: { suite_url: null, run_url: null, reworks: 0, outcome: null }
  lessons: []                   # { source: review | ci | verification | test | gate, module, text, link }

  metrics:
    asked: 0                    # questions put to the user
    decided_by_mandate: 0
    gate_changes: 0             # gates where the user changed the proposal
    fix_rounds: { verification: 0, ci: 0, review: 0, rework: 0 }
    waits: {}                   # stage → seconds spent waiting for people or pipelines
    finished_at: null
```

## `journal.md`

One line per event, appended, never rewritten. The retro reads it; so does a teammate who picks the run up.

```
# Delivery journal: #361453 Send quote by email

2026-11-20T09:12Z  intake    New delivery. Item in Ready, no branch, no PR. Entering Ready.
2026-11-20T09:20Z  mandate   ASKED  tier medium (Size: 2 repos; Customers). User granted as proposed, route develop, run to Done.
2026-11-20T09:58Z  build     MANDATE continue  Phase 2 exit gate passed: no scope decisions.
2026-11-20T10:15Z  build     ASKED  Phase 5 requirement: bounce handling. User: "log only, no retry".
2026-11-20T11:40Z  ci        Run 48213 failed: QuoteEmailTests.Sends_pdf (change). Fix round 1.
2026-11-20T11:52Z  ci        MANDATE fix_ci  Pushed fix 3fa9c1e. Run 48219 green.
2026-11-20T12:05Z  review    WAIT   Review requested on PR 9142. Run /agentic-midas:deliver 361453 to carry on.
2026-11-21T08:31Z  review    OUTSIDE PR 9142 has 3 new threads.
```

The markers: `ASKED` (a question and the user's answer), `MANDATE <key>` (decided under the mandate), `WAIT`, `OUTSIDE` (something changed while the run wasn't looking), `BLOCKED`, `LESSON`.

## The status comment on the work item

One comment, kept up to date in place, so the item shows where its delivery stands without filling its history. Post it at the Mandate stage after the user agrees to it, keep its id in `status_comment_id`, and update that comment on every stage change and on blocked (`wit_work_item_comment_write`: `action: "add"` the first time, then `action: "update"` with that `commentId`; if the comment was deleted, add a new one and store its id). Every write shows the mod's permission prompt.

Keep it short, in the item's comment format (see the reference's **Rich text**), with other work items as `#<id>` links:

```
🤖 Delivery by <user's first name> with agentic-midas — updated <date, time UTC>

Stage: Review (waiting for review of PR 9142)
Route: /develop · Mandate: medium
Done: Ready ✓ · Build ✓ · PR ✓ · CI ✓ (1 fix)
Criteria: 3 of 4 verified, AC4 waits for the test run
Pull requests: !9142 job-finance, !9143 bigchange-web (merge job-finance first)
Needs someone: —            ← or the one question a blocked run is waiting on
To stop this run from the board: add the tag agent-stop.
```

Never put in it: claude.ai links (they are private to their author), code, log dumps, or anything from a customer's data.
