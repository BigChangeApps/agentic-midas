---
name: close-item
description: Close a Midas Azure DevOps work item (Bug, User Story or Enabler) that has reached the Closing column. Fills what closing needs from the item's merged pull requests and the release calendar, namely the Release (usually the next one), Services required (every service the change touched), and for a customer-facing bug or improvement Release Note Needed and the Release Note. Shows the update, then after a yes saves it and moves the item to Done (Closed). Use when the user wants to close, finish or move an item to Done, fill its release fields, or invokes /close-item.
argument-hint: "<work item id or link>"
---

# Close a work item

Finish a work item: fill the fields closing needs, then move it to Done. **Nothing is written to ADO until the user says yes.**

First read `../../reference/work-items.md`, relative to this skill's base directory: **Team defaults**, **Session title** (label `Close`), **Rich text**, and in **Bug triage** the field table, **Services required** and the **ADO requires fields** table.

## 1. Load the item

Take the id from `$ARGUMENTS`: digits, `#123`, `AB#123`, or a link with `_workitems/edit/<id>` or `?workitem=<id>`. With no id, ask for one.

Call `wit_work_item` with `action: "get"`, `project: "BigChange"` and `expand: "Relations"`, then name the session. Take the type, state, board column, title, description, the fields below, and the `Pull Request` artifact links (the id is the part after the last `%2F` of the `vstfs:///Git/PullRequestId/...` url). Load its child items too and add their pull requests.

- **Already `Closed` or `Removed`:** say so and stop.
- **Not in the Closing column** (the board column field from **Team defaults**): say which column it is in and ask whether to close it anyway. Testing is skipped when it's still in Reviewing, Ready for testing or Testing.

## 2. Check the work is merged

Load each pull request (`repo_pull_request`). An active one isn't merged: list it and ask whether to go on. Abandoned ones don't count. No pull requests at all: ask what shipped (a config change, nothing), because the fields below come from the code that changed.

## 3. Work out the fields

Fill only what is empty or wrong, and keep a value someone set unless the evidence contradicts it (then say why).

**Services required** (`Custom.Servicesrequired`): from the files each merged pull request changed, through the reference's **Services required** tables. Get the files from the pull request's merge commit (`lastMergeCommit`): `git -C <repo> show --name-only --format= <commit>` in a local checkout (fetch first), otherwise `repo_search_commits` or the commit's changes in ADO. For a monolith change in shared code, follow the `ProjectReference`s as the reference says. Join the services with `;` and no spaces, in picklist order. `N/A` when nothing deploys (tooling, tests, docs, pipelines only).

**Release #** (`Custom.Release#`): usually the next release.
- **A monolith (`BigChange`) change:** the first release branch that holds the merge commit, as `../triage-bug/SKILL.md` **Appendix: is the fix released?** steps 1–2 say. Not on a release branch yet: the next release.
- **Any other change that ships to customers:** the next release, the first one in the [Release Cycle 2026](https://dev.azure.com/bigchange/BigChange/_wiki/wikis/BigChange.wiki/44862/Release-Cycle-2026) wiki page (`wiki`, `action: "get_page_content"`; for another year, `search_wiki` for "Release Cycle <year>") whose **Freeze** date is today or later.
- **`None Applicable`** when Services required is `N/A`.

The value is the release number as the picklist has it (`26.11.02`). Show its Freeze and 1st Customers dates with it.

**Release Note Needed** (`Custom.ReleaseNoteNeeded`) and **Release Notes** (`Custom.ReleaseNotes`): a release note is for customers of the existing product.
- `Yes` for a **Bug**, or an improvement to the **existing system** (BigWeb, the mobile app, the BO REST API, Xero sync), that customers will notice; always when the item has a JobWatch reference (`bigchangeAgile.JobWatchTicketReference`).
- `No` for work customers can't see (sync internals, logging, retries, refactoring, tooling), Enablers, and new screens not yet released to customers (the new Job Finance quotes, behind their rollout).
- With `Yes`, write the note when the field is empty or doesn't read this way: one or two plain sentences on what now works, in the words customers see on screen. No service, table or class names, and no "Fixed an issue where". For a bug, start from its Expectation of fix. Example: "Purchase Orders duplicated as a Delivery Note now keep their line items."
- Leave the Release Notes empty with `No`.

**A Bug** also needs Root Cause Multi, Introduced and Problem type to close (the reference's **ADO requires fields** table). `/triage-bug` usually set them. Fill an empty one from the fix's pull request and the bug as the reference's field table says, and ask when the evidence doesn't settle it.

## 4. Propose

Show one table, `| Field | Now | New | Why |`, only for the fields that change, then `State → Closed (Done)`. Add a line for each thing you weren't sure of. Ask: `Save and move to Done?`

The user can change any value in chat. Write only after a clear yes.

## 5. Save and close

One `wit_work_item_write` update with the changed fields and `System.State` → `Closed`. The Done column follows from the state. Release Notes is a text field; any rich-text field keeps its format, as the reference's **Rich text** says.

If ADO refuses for a missing field, read its allowed values as the reference says, propose one, and retry after a yes. Any other error: show it as it came back and stop; nothing was saved.

## 6. Report

In chat, a few lines: the item link, its new state, and the fields saved with their values.
