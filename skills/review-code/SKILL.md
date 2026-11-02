---
name: review-code
description: Review someone else's Azure DevOps pull request as its reviewer. Reads the change against its linked work items and the repo's own standards, decision cards and review lessons, lists numbered findings with draft comments, then posts the approved comments on their lines and casts the vote the user picks. Use when the user is a reviewer on a pull request and gives its id or link, asks to review a PR, or invokes /review-code.
argument-hint: "[pull request id or link]"
---

# Review a pull request

Review a teammate's pull request the way a careful reviewer would, then post only what the user approves. **Nothing is posted and no vote is cast until the user says yes.**

First read `../../reference/pull-requests.md`, relative to this skill's base directory: how to find and load the pull request, read the change without touching the user's checkout, which standards to read, how comments are written, and the tools that post them.

## 1. Load the pull request

Find and load it, with its linked work items, as the reference says. If the user is its author, say this command reviews other people's work and ask whether to go on.

Also list its threads (`repo_pull_request_thread`, `action: "list"`), so you don't repeat what another reviewer already raised.

In chat, three lines:
1. `!<id> <title>` · author · `<source>` → `<target>` · draft or not · files changed
2. What it should deliver, from the work items: one or two lines.
3. Threads already open, and by whom, if any.

## 2. Review

Read the diff, then each changed file in full as the pull request has it, and the standards that fit the changed paths. Check:

- **Requirements:** does it deliver each acceptance criterion? What does an item ask for that the diff doesn't do?
- **Correctness:** logic errors, edge cases, nulls, async and cancellation, concurrency, transactions, error paths.
- **The repo's rules:** its standards, decision cards (their MUST / MUST NOT) and the review lessons for the modules touched.
- **Tests:** is the new behaviour tested, following the repo's test conventions?
- **Security:** injection, unchecked input at a boundary, secrets, error messages that leak data.

Report only what is wrong or risky, never what is fine. Leave alone what a formatter or analyzer already enforces. When a finding rests on how the code behaves at run time (a test fails, a query returns the wrong rows), prove it in a worktree before you claim it, or call it a question.

## 3. Present the findings

Number them, grouped by severity:

- **Must fix:** bugs, security problems, missing requirements, broken rules from a decision card.
- **Should fix:** standards and design concerns.
- **Suggestion:** smaller improvements.

```
[1] src/Orders/Application/UseCases/Commands/CloseOrderHandler.cs:42 - Must fix
    The cancellation token is not passed to SaveChangesAsync.
    Draft: This call drops the CancellationToken - pass it through so a cancelled request stops the save.
```

Then propose a vote from what you found: `WaitingForAuthor` with any Must fix, `ApprovedWithSuggestions` with only Should fix or Suggestion, `Approved` with nothing. Ask with AskUserQuestion: post all, pick which, or edit first. The user can change any draft in chat.

When a finding shows a convention the repo's standards don't capture yet, say so. Once the user agrees, offer `/agentic-midas:standards-update` with it.

## 4. Post and vote

1. Post each approved finding as a new thread on its file and line, as the reference says. Post them one by one.
2. Ask which vote to cast (the proposed one first, marked Recommended), then cast it. "No vote" leaves the comments only.
3. In chat: how many comments were posted, the vote, and the pull request link.

If a post fails, show the error as it came back, say which comments were posted and which weren't, and offer to retry the rest.
