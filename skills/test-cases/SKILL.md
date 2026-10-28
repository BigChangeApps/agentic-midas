---
name: test-cases
description: Create manual test cases in Azure DevOps for a Midas work item (User Story, Bug or Enabler). Works out what was really built from the item, its pull requests and the code, drafts a small set of general test cases that prove the feature works end to end as a Claude Doc the user edits and comments on, and after an explicit yes creates them in the current sprint's test plan under a suite for the item. Use when the user wants test cases, a test plan or a test suite for a work item, asks what to verify when testing it, or invokes /test-cases.
argument-hint: "<work item id or link> [what to focus on]"
---

# Test cases for a Midas work item

Draft a few general test cases that show the feature works as a Claude Doc the user edits and comments on, then create them in the sprint's test plan with the `azure-devops` MCP tools. **Nothing is written to ADO until the user says yes.**

First read `../../reference/work-items.md`, relative to this skill's base directory: Team defaults, Draft doc, Working through the doc and Test plans.

## 1. Load the item

Take the id from `$ARGUMENTS`: digits, `#123`, `AB#123`, or a link with `_workitems/edit/<id>` or `?workitem=<id>`. With no id, ask for one. Any other text is what to focus on.

Call `wit_work_item` with `action: "get"`, `project: "BigChange"` and `expand: "Relations"`. From it take the description, the acceptance criteria and the linked pull requests and commits. Then name the session as the reference's **Session title** says.

Find out what was really built, because the acceptance criteria often differ from it:
- Read the merged pull requests' changes in this workspace. Look for the UI flows, the states the feature handles, and anything the code does on purpose that the criteria don't mention.
- Read `.midas/<id>/` if `/feature` built the item. It holds decisions agreed outside the work item, such as scope added or cut.
- Note each criterion that depends on work that isn't built or merged yet, and each event the app can't produce yet. For example, the activity a missing Send button would write.

If the item already has Tested By links, list those test cases. Then ask whether to add to them or replace them.

## 2. Find the plan and suite (read only)

- Get the sprint: `work` → `list_team_iterations`, team `Midas`, timeframe `current`. Use its `name` (e.g. `122`) and `path`.
- Get the plan: `wit_query` → `wiql`: `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Test Plan' AND [System.Title] = 'Midas_Stories_<name>'`. If there is no such plan, it is created in step 4.
- Get the suites: `testplan` → `list_suites` with the plan id. The top suite is the root. If a child named `<id> : …` exists, reuse it.

## 3. Draft the doc

Keep the set small and general: one test case for each main thing the feature does. The feature decides how many cases and steps. A small change may need one short case, while an end-to-end flow can be one case with 20 steps. Prefer one longer case that follows a real flow over many tiny ones.
- Check that the feature works. Expected results describe behaviour, such as "an edit entry appears at the top without a reload and summarises the change". Don't check exact labels, colours, spacing or every boundary value.
- Cover:
  - the main path of each group of acceptance criteria;
  - the negative or edge cases that matter, such as no change, closed or read-only states, another user, and permissions;
  - one regression check for each area the change touched, if it carries risk.
- Every step is done and checked through the app or BigWeb, never with SQL queries or database rows. When a test needs data the feature doesn't create, the first step says exactly how to make it in the app (for example, create it in BigWeb and wait for the sync). Leave out a criterion only the database can show, and say in chat that backend tests cover it.
- Leave out criteria that can't be tested yet. List them under **Not covered yet**, each with the work item it waits for, rather than as Blocked test cases.
- Priority 1 for core criteria, 2 for the rest.
- Step text is plain text: no angle brackets (ADO strips anything that looks like an HTML tag) and no `|` (it separates the action from the expected result).

Create a Claude Doc named `#<id> Test cases: <title>`, as the reference's Draft doc section says (whole, in one call, then open it), laid out like this:

```
## Where
- Work item: [#<id> <title>](<link>)
- Plan: Midas_Stories_<n> (#<plan id>, or new)
- Suite: <id> : <title> (#<suite id>, or new)

## 1. <test case title>
Priority: 1

| # | Action | Expected result |
|---|---|---|
| 1 | <action> | <expected> |

## 2. <test case title>
…

## Not covered yet       ← only if any
- <criterion>: waits for [#<id>](<link>)

## Still needed          ← only if something is missing
- <question>
```

Then call `draft_work_item` with `type: "Test cases"`, `title: <the item's title>`, the doc's `url` and `id: <the item's id>`. The band offers **Open doc**, **Action comments**, **Create** and **Cancel**. In chat, say in two lines how many test cases the doc holds, what is not covered yet, and that the user can edit the doc, select text to comment, then use the band.

**No docs tools?** Show the same layout in chat, with steps as `<action> → <expected>`, and end with `Create them, or tell me what to change.` Create only on a clear yes. Skip the doc and band steps.

## 4. Work through the doc

Follow the reference's Working through the doc section.

## 5. Create

On **"Create it."** (the band's Create) or a clear yes in chat:

1. Read the doc as it stands. If **Still needed** has questions left, ask for those instead of creating. Each `## <n>. <title>` section is a test case: its Priority line, and one step per table row. **Where**, **Not covered yet** and **Still needed** aren't test cases.
2. **Plan**, if missing: call `testplan_test_plan_write` with `action: "create"`, `project: "BigChange"`, `name: "Midas_Stories_<n>"`, `iteration: <sprint path>` and `areaPath: "BigChange\\Finance\\Midas"`. Then `list_suites` to get its root suite.
3. **Suite**, if missing: a requirement-based suite, which shows every test case linked to the item. The MCP server only creates static suites, so use the az CLI. Write the body to a file in the scratchpad:

   ```json
   {"suiteType":"requirementTestSuite","requirementId":<id>,"parentSuite":{"id":<root suite id>},"name":"<id> : <title>","inheritDefaultConfigurations":true}
   ```

   ```bash
   az devops invoke --org https://dev.azure.com/bigchange --area testplan --resource suites --route-parameters project=BigChange planId=<plan id> --http-method POST --in-file <file> --api-version 7.1
   ```

4. **Test cases**: for each one, call `testplan_test_case_write` with:
   - `action: "create"` and `project: "BigChange"`
   - `title` and `priority`
   - `areaPath: "BigChange\\Finance\\Midas"` and `iterationPath: <sprint path>`
   - `testsWorkItemId: <id>`, which adds the Tested By link
   - `steps` as `1. <action>|<expected>`, one step per line

   Send them in parallel.
5. **Check** with `testplan` → `list_cases` that the suite holds every new test case. If you reused an existing static suite, add the missing ones with `testplan_test_suite_write` → `add_test_cases`.
6. Add a first line to the doc: `Created [<n> test cases](<suite link>)`, where the suite link is `https://dev.azure.com/bigchange/BigChange/_testPlans/define?planId=<plan id>&suiteId=<suite id>`. Then call `draft_work_item` again with the same values plus `suiteUrl: <suite link>`.
7. In chat: the suite link, then a table of id, title and priority, then the criteria not covered yet.

If a call fails, show the error as it came back. Say what was created and what wasn't, and stop. The band stays, so the user can fix the doc and press Create again. Test cases that were already created are reused, not created twice.

**"Cancel, don't create these test cases."** (the band's Cancel): write nothing to ADO. Reply `Cancelled — no test cases created. The draft doc stays in your claude.ai gallery.` Don't delete the doc unless the user asks.

## Changing them afterwards

- **Edit:** change steps with `testplan_test_case_write` → `update_steps`. Change titles and priority with `wit_work_item_write` → `update`.
- **Remove from the suite:** remove the link with `wit_work_item_link_write` → `unlink`, using the test case's `id` and `type: "tests"`. Then set the state to `Closed`. Never delete test cases unless the user asks, because deleting them may be permanent.
