---
name: handle-review
description: Work through the open review comments on your own Azure DevOps pull request. Lists the unresolved threads, proposes a fix or an answer for each, applies the approved fixes on the pull request's branch and runs the affected tests, then commits and pushes after a yes, replies in each thread and marks the fixed ones resolved. Use when reviewers left comments on the user's pull request, the user asks to address, handle or answer review comments, or invokes /handle-review.
argument-hint: "[pull request id or link]"
---

# Handle review comments

Address the reviewers' open threads on the user's own pull request. **Code changes, the commit, the push and every reply each wait for the user's yes.**

First read `../../reference/pull-requests.md`, relative to this skill's base directory: how to find and load the pull request, which standards to follow, how replies are written, and the tools that post them. For the commit, also read `../../reference/work-items.md` **Repos, branches, commits and pull requests**.

## 1. Load the pull request

Find and load it, with its linked work items, as the reference says.

The fixes go on its source branch, in this checkout:

- On that branch already: `git pull --ff-only`.
- On another branch: if `git status --porcelain` shows changes, stop and ask; never stash, reset or discard on your own. Otherwise ask, then `git fetch origin` and `git switch <source>`.

## 2. Collect the open threads

List the threads (`repo_pull_request_thread`, `action: "list"`, `status: "Active"`), and for each one the comments if the list trims them. Keep the threads where a person commented. Leave out system and bot threads (votes, policies, builds, work item links).

The signed-in user is `az account show --query user.name -o tsv`. A thread whose last comment is the user's own is waiting on the reviewer: list it separately and don't act on it.

With nothing left, say `No open review comments on !<id>.` and stop.

Show them numbered:

```
[1] src/Orders/Domain/Order.cs:42 - Jane Doe
    Consider moving the total calculation into the entity.
[2] General - Jane Doe
    The description doesn't say why the retry was removed.
```

## 3. Propose what to do

For each thread, read the code it points at, as it is on the branch now, and the standards for that code. Then decide:

- **Fix:** the reviewer is right. Describe the concrete change.
- **Answer:** a question, or the reviewer is wrong. Draft the answer with the reason, from the code, the work item or a decision card. Disagreeing is fine when the code is right.
- **Decision:** it needs the user's call. Put it as a question.

Show every proposal at once, numbered like the threads, then take the user's yes, edits and answers before changing anything. Ask the decisions with AskUserQuestion.

## 4. Apply the fixes

Make the approved changes, following the repo's standards and the style of the code around them. Run the tests that cover what changed, plus the build. Report the results as they came out. A failure stops here until the user decides.

## 5. Commit and push

Propose one commit message in the repo's convention: its `CLAUDE.md` commit rules when it has them, otherwise the reference's commit format with the work item id. Stage the changed files by name. Commit after a yes, push after a separate yes. If the user doesn't want to push yet, ask whether to post the replies anyway: a reply that says "fixed" before the reviewer can see the fix confuses them.

## 6. Reply

Draft a reply for every handled thread and show them all at once:

- A fix: what changed and where, in one sentence.
- An answer: the answer and its reason.

After a yes, post each as a reply in its thread. Then set the status: `Fixed` for threads that were fixed. Leave answered threads open for the reviewer to close, unless the user says otherwise.

In chat: the threads replied to and their status, the commit, and the pull request link.

If a post fails, show the error as it came back, say which replies were posted and which weren't, and offer to retry the rest.

## 7. What the review taught

A comment that shows a convention the repo's standards don't capture yet: suggest it as a standard and, once the user agrees, run `/agentic-midas:standards-update` with it. A domain pitfall or a one-off lesson belongs in the review lessons, which `/agentic-midas:standards-discover` collects from merged pull requests.
