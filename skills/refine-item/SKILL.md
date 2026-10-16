---
name: refine-item
description: Refine an existing Midas Azure DevOps work item (Bug, Enabler or User Story). Answers developers' questions about it from the item, its comments, its links and the code. When it needs changes, drafts the updated item as a Claude Doc the user edits and comments on, then updates the work item only after an explicit yes. Use when the user gives a work item id or link and wants to understand, question, refine, rewrite or update it, or invokes /refine-item.
argument-hint: "<work item id or link> [what to change]"
---

# Refine a Midas work item

Help developers understand an existing work item. When it needs changes, draft the refined version as a Claude Doc they edit and comment on, then update the item in Azure DevOps with the `azure-devops` MCP tools. **Nothing is written to ADO until the user says yes.**

First read `../../reference/work-items.md`, relative to this skill's base directory. It holds the team defaults, the doc layout, how to work through the doc, the rich-text rules, and each type's template and fields.

## 1. Load the item

Take the id from `$ARGUMENTS`: digits, `#123`, `AB#123`, or a link with `_workitems/edit/<id>` or `?workitem=<id>` (board links). With no id, ask for one. Any other text is what the user wants changed.

Call `wit_work_item` with `action: "get"`, `project: "BigChange"` and `expand: "Relations"`. Keep its `rev` and `multilineFieldsFormat`. Also list its comments (`list_comments`, `top: 20`) and get the parent's title.

- The type must be Bug, Enabler or User Story. For anything else, say this command handles those three, and stop.
- If it is Closed or Removed, say so and ask whether to go on.

In chat, three lines:
1. `<Type> #<id>: <title>` · State · Iteration · Assigned to · Parent
2. Where it falls short of the team format: empty or thin template fields, acceptance criteria that can't be tested, a release note with internal names.
3. Ask: questions about it, or refine it?

If `$ARGUMENTS` already says what to change, skip the question and go to step 3.

## 2. Answer questions

Developers ask about scope, acceptance criteria, edge cases, which services and code are involved, and how to test. Answer from the item, its comments, its parent, and its linked pull requests and commits. Use the code in this workspace when it helps, citing `file:line`. Write nothing while answering.

When the item doesn't answer a question, say so plainly. That gap is often what needs refining: offer to add it to the draft, or as a Still needed question.

## 3. Draft the refined item

When the user asks to refine, rewrite or update it, or agrees to a change you offered:

1. Start from the item's current values. Map each field to its template section, and convert rich text to markdown (the reference's Reading rule). Fields outside the template stay out of the doc and untouched.
2. Apply the changes the user asked for or agreed to. Don't rewrite text nobody asked about. Never invent facts: unknowns go under **Still needed**.
3. Lay the doc out as the reference says, with this section first:

   ```
   ## What changes
   - <field>: <one line on what changes and why>
   ```

4. Name the doc `#<id> <Type>: <title> (refine)`, create it, and open it.
5. Call `draft_work_item` with `type`, `title`, the doc's `url` and `id: <the item's id>`. The band then offers **Open doc**, **Action comments**, **Update** and **Cancel**.
6. In chat, say in two lines what the draft changes, what is still needed, and that the user can edit the text, select words to comment, then use the band.

**No docs tools?** Show the changed fields in chat as before → after, then end with `Update it, or tell me what to change.` Update only on a clear yes. Skip the doc and band steps.

## 4. Work through the doc

Follow the reference's Working through the doc section. After each round of changes, keep **What changes** in step with the doc.

## 5. Update

On **"Update it."** (the band's Update) or a clear yes in chat:

1. Read the doc as it stands. If **Still needed** has questions left, ask for those instead of updating.
2. Read the item again. If its `rev` moved since step 1, someone changed it in ADO. Tell the user which fields changed there and ask whether to keep their version or the doc's. Never overwrite theirs without asking.
3. Compare each doc section and Details line with the item, ignoring whitespace and formatting-only differences. Only the fields that really differ go in the update.
4. Call `wit_work_item_write` with `action: "update"`, the `id`, `project: "BigChange"` and `updates`:
   - First `{ op: "test", path: "/rev", value: <rev> }`, so ADO refuses the update if the item changed after your read.
   - Then one `{ op: "replace", path: "/fields/<field>", value }` per changed field. Use `op: "add"` for a field that was empty.
   - Write rich text as the reference's Updating rule says.
   - Leave state, assignee and `Custom.AITicketCreation` alone unless the user asked.
5. If the parent changed, remove the old link (`wit_work_item_link_write`, `action: "unlink"`, `type: "parent"`) and link the new one (`action: "link"`, `type: "parent"`).
6. Add a first line to the doc: `Updated [<Type> #<id>](<link>)`. Then call `draft_work_item` again with the same values plus `updated: true`.
7. In chat: `Updated <Type> #<id>: <the fields that changed>`, then the link.

If the update fails, show the error as it came back and say **nothing was updated**. A failed rev test means someone edited the item meanwhile, so go back to step 2. The band stays, so the user can press Update again.

**"Cancel, don't update this work item."** (the band's Cancel): write nothing to ADO. Reply `Cancelled — the work item is unchanged. The draft doc stays in your claude.ai gallery.` Don't delete the doc unless the user asks.
