---
name: new-item
description: Create a Midas Azure DevOps work item (Bug, Enabler or User Story) in the team format from a short brief, a pasted ticket or what was found in this conversation. Checks for duplicates, drafts it as a Claude Doc the user edits and comments on, actions their comments, and creates it only after an explicit yes. Use when the user wants to raise, log, file or create a bug, enabler or user story, or invokes /new-item.
argument-hint: "[bug|enabler|story] <what it is about>"
---

# New Midas work item

Draft a work item in the Midas team format as a Claude Doc, let the user edit and comment on it, then create it in Azure DevOps with the `azure-devops` MCP tools. **Nothing is written to ADO until the user says yes.**

First read `../../reference/work-items.md`, relative to this skill's base directory. It holds the team defaults, the doc layout, how to work through the doc, the rich-text rules, and each type's template and fields.

## 1. Type and brief

Take the type from `$ARGUMENTS`: `bug`, `enabler`, `story` / `user story` / `us` (any case). The rest is the brief.

No type given: infer it. A defect is a Bug. Technical or platform work with no change users can see is an Enabler. A capability users can see is a User Story. If you can't tell, ask with AskUserQuestion.

The brief can be one line, a pasted support ticket or Slack thread, or nothing because the subject is in this conversation, such as a bug just debugged here. Use all of it.

## 2. Check for duplicates

Run `search_workitem` with 3 to 6 key terms from the brief. Use project `["BigChange"]`, area path `["BigChange\\Finance\\Midas"]` and the same work item type. Drop Closed items. Keep up to 3 that look like the same problem for the doc. If one is clearly the same, ask before drafting: stop, or go on.

## 3. Draft the doc

Draft every field of the type's template as the reference's Draft doc section describes. For a Bug, propose a Priority in Details and say why in one line in chat. Name the doc `<Type>: <title>`, and the session `New item: <title>` as the reference's **Session title** says.

Call `draft_work_item` with `type`, `title` and the doc's `url`. The band then offers **Open doc**, **Action comments**, **Create** and **Cancel**. In chat, say in two lines that the draft is in the doc, what is still needed, and that the user can edit the text, select words to comment, then use the band.

**No docs tools?** Show the item in chat in the team format, as plain text, with the Details after it, and end with `Create it, or tell me what to change.` Apply free-text changes and show it again. Create only on a clear yes. Skip the doc and band steps.

## 4. Work through the doc

Follow the reference's Working through the doc section.

## 5. Create

On **"Create it."** (the band's Create) or a clear yes in chat:

1. Read the doc as it stands.
2. If **Still needed** has questions left, or a Bug has no Priority, don't create. Ask for what's missing in chat.
3. Map each `##` section and each Details line to its ADO field (the reference's tables).
4. Call `wit_work_item_write` with `action: "create"`, `project: "BigChange"`, the exact `workItemType` (`Bug`, `Enabler`, `User Story`) and those fields, with rich text as the reference's Creating rule says.
5. With a parent: `wit_work_item_link_write`, `action: "link"`, `updates: [{ id: <new id>, linkToId: <parent id>, type: "parent" }]`.
6. Add a first line to the doc: `Created as [<Type> #<id>](<link>)`. Then call `draft_work_item` again with the same values plus `createdId`.
7. Rename the session `New item #<id>: <title>`.
8. In chat: `Created <Type> #<id>: <title>`, then the link, then `Parent: #<id>` if one was linked.

If the create fails, show the error as it came back, say **nothing was created**, and stop. The band stays, so the user can fix the doc and press Create again.

**"Cancel, don't create this work item."** (the band's Cancel): write nothing to ADO. Reply `Cancelled — nothing created. The draft doc stays in your claude.ai gallery.` Don't delete the doc unless the user asks.
