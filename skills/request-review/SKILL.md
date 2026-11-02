---
name: request-review
description: Ask the team to review your Azure DevOps pull request. Finds the pull request from its id or link, from a work item's links or from the current branch (and creates it when there is none), publishes a draft, posts a review request to the team's Slack channel and moves the work item to the Reviewing column. Use when the user's branch is ready for review, asks for a review or to announce a PR, or invokes /request-review.
argument-hint: "[pull request or work item id or link]"
---

# Request a review

Get the user's pull request in front of reviewers. **Creating the pull request, publishing a draft and the Slack post each wait for the user's yes.**

First read `../../reference/pull-requests.md`, relative to this skill's base directory, for finding and loading the pull request, and `../../reference/work-items.md` **Team defaults** and **Repos, branches, commits and pull requests**.

## 1. Find the pull request

From `$ARGUMENTS`:

- A pull request id or link (`!123`, `/pullrequest/<id>`): load it as the reference says.
- A work item (`#123`, `AB#123`, a `_workitems/edit/<id>` link, or bare digits that `wit_work_item` finds): load it with `expand: "Relations"` and take its `Pull Request` artifact links (the id is the part after the last `%2F` of the `vstfs:///Git/PullRequestId/...` url). Several: keep the active ones; still several, ask which.
- Nothing: the active pull requests from the current branch, as the reference says.

A completed or abandoned pull request: say so and stop. With none found, go to step 2; otherwise skip it.

## 2. Create it, when there is none

1. The branch is the current one. On the base branch or a detached HEAD, stop: the work needs its own branch.
2. `git status --porcelain`: uncommitted changes aren't in the pull request; say so and ask whether to go on.
3. If the branch isn't on `origin` or is ahead of it, ask, then `git push -u origin <branch>`.
4. The work item: from the argument, else the `<id>` in the branch name, else ask.
5. Propose the title and description and wait for a yes (the user can edit them):
   - **Title:** the repo's `CLAUDE.md` commit or pull request rules when it has them (types, scopes), otherwise the reference's `feat: #<id> <title>` (`fix:` for a Bug).
   - **Description:** what changed and why, in a few lines, from the commits (`git log origin/<base>..HEAD`) and the work item.
6. Create it with the reference's `az repos pr create`, without `--draft`, since it goes to review now.

## 3. Ready for review

- **Draft:** ask, then publish it (`repo_pull_request_write`, `action: "update"`, `isDraft: false`).
- **Merge conflicts** (`mergeStatus: "conflicts"`): say so; reviewers can't see the final change until they're resolved. Ask whether to go on.

## 4. Post to Slack

The channel is in **Team defaults**. Write the message in English, in the first person, Slack mrkdwn (`<url|label>` links, `*bold*`), no filler:

```
Hi, can I get a review on this, please? :eyes:
*PR:* <https://dev.azure.com/bigchange/BigChange/_git/<repo>/pullrequest/<id>|!<id> - <pull request title>>
*Task:* <https://dev.azure.com/bigchange/BigChange/_workitems/edit/<item id>|#<item id> - <item title>>
```

One `*Task:*` line per linked work item. Show the message and the channel, and post only after a yes; the user can edit the wording.

With `SLACK_TOKEN` set (a Slack bot token with `chat:write`; `chat:write.customize` to post under the user's name), post it with the Slack Web API, the body built as JSON with the text escaped:

```bash
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_TOKEN" -H "Content-Type: application/json; charset=utf-8" \
  --data @<body.json>   # {"channel":"<channel>","text":"<message>","username":"<user's display name>","unfurl_links":false}
```

- `ok: true`: report the channel and `ts`.
- `missing_scope`: post again without `username`.
- Any other `ok: false`: report the `error` as it came back (`not_in_channel`: the bot must be invited to the channel) and go on to step 5.

Without `SLACK_TOKEN`, give the approved message as a block ready to paste into the channel.

## 5. Move the work item to Reviewing

For each linked work item, unless it is already in Reviewing or a later column (Ready for testing, Testing, Closing) or `Closed`: one `wit_work_item_write` update with `System.State` → `Approval` and the board column field from **Team defaults** → `Reviewing`. On the Midas Stories board every column from Reviewing to Closing is `Approval`, so the column must be set too.

## 6. Report

In chat, a few lines: the pull request link (created, published or as it was), the Slack post (posted, or the text to paste) and each work item's new state and column. If a step failed, say which, with the error, and that the steps before it stand.
