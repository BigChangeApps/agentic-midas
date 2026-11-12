import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Draft } from '../types'
import { registerDevelop, taskSection } from './develop'
import { FEATURE_TOOL_SPEC, featureSection, registerFeature, resumeFeature } from './feature'

// This plugin's server, and a user-scope one under the same name.
const ADO = /^mcp__(plugin_agentic-midas_)?azure-devops__/

// Checked against @azure-devops/mcp@2.10.0 to only read. Everything else on the
// server (every *_write tool, and any tool a newer version adds) is asked.
const READS = new Set([
  'advsec_get_alert_details',
  'advsec_get_alerts',
  'core_get_identity_ids',
  'core_list_project_teams',
  'core_list_projects',
  'pipelines_artifact',
  'pipelines_build',
  'pipelines_build_log',
  'pipelines_definition',
  'pipelines_run',
  'repo_branch',
  'repo_file',
  'repo_pull_request',
  'repo_pull_request_thread',
  'repo_repository',
  'repo_search_commits',
  'search_code',
  'search_wiki',
  'search_workitem',
  'testplan',
  'testplan_show_test_results_from_build_id',
  'wiki',
  'wit_backlog',
  'wit_query',
  'wit_work_item',
  'wit_work_item_attachment',
  'work',
])

type Input = { action?: unknown; savePath?: unknown; destinationPath?: unknown }

const ASK = 'agentic-midas: changes in Azure DevOps need your OK'

// Productboard's write tools. It's a claude.ai connector, so its server name differs per account: match the tool names.
export const PRODUCTBOARD_WRITE =
  /^mcp__.+__(entities_entity_operations|feedback_create_feedback|documents_(create_document|create_folder|create_comment|edit_document|replace_document_content|move_item|rename_item|reply_to_comment))$/
const ASK_PRODUCTBOARD = 'agentic-midas: changes in Productboard need your OK'

// The read tools still reorder the backlog or save downloads to disk on some inputs.
// In plan mode an allow only counts for a tool its server marks readOnlyHint, and
// @azure-devops/mcp marks none, so there every ADO call still asks.
export function decide(tool: string, input: unknown): 'allow' | 'ask' {
  const name = tool.replace(ADO, '')
  const i = (input ?? {}) as Input
  const changes = (name === 'wit_backlog' && i.action === 'reorder') || Boolean(i.savePath || i.destinationPath)

  return READS.has(name) && !changes ? 'allow' : 'ask'
}

export const DRAFT_TOOL = 'mcp__agentic-midas__draft_work_item'
const ITEM_URL = 'https://dev.azure.com/bigchange/BigChange/_workitems/edit/'
const ADO_URL = 'https://dev.azure.com/bigchange/'
const TESTS = 'Test cases'
const EPIC = 'Epic'
const TYPES: readonly string[] = ['Bug', 'Enabler', 'User Story', EPIC, TESTS]

// What the band's buttons say for the person.
export const ACTION = 'Action the comments on the draft doc.'
export const CREATE = 'Create it.'
export const CANCEL = "Cancel, don't create this work item."
export const UPDATE = 'Update it.'
export const CANCEL_UPDATE = "Cancel, don't update this work item."
export const CANCEL_TESTS = "Cancel, don't create these test cases."

const draft = atom({ plugin: 'agentic-midas', key: 'draft' } as const, null)
// The atom ends with the session's process; the store keeps a session's draft for its resume.
// shortcut: a draft whose session is abandoned stays in the store, prune by age if the store grows.
async function draftKey($: EngineInterface) {
  return `draft:${await $.session.id()}`
}

const SCHEMA = {
  type: 'object',
  properties: {
    type: {
      enum: TYPES,
      description: '"Test cases" for a test case draft, with id. "Epic" for an epic plan, with id when it plans into an existing epic',
    },
    title: { type: 'string' },
    url: { type: 'string', description: "The draft doc's claude.ai link" },
    createdId: { type: 'integer', description: 'The new work item id (a new epic), once it is created' },
    id: {
      type: 'integer',
      description: 'The existing work item being refined, the existing epic an epic plan adds to, or the item the test cases are for',
    },
    updated: { type: 'boolean', description: 'true once the refined item, or the plan for an existing epic, is saved in Azure DevOps' },
    suiteUrl: { type: 'string', description: 'The test suite link, once the test cases are created' },
  },
  required: ['type', 'title', 'url'],
}

const asId = (v: unknown) => (Number.isInteger(v) ? (v as number) : undefined)

const isText = (v: unknown): v is string => typeof v === 'string'

export function parseDraft(input: unknown): Draft | null {
  const i = (input ?? {}) as Record<string, unknown>
  const isValid =
    isText(i.type) && TYPES.includes(i.type) && isText(i.title) && isText(i.url) && i.url.startsWith('https://claude.ai/')
  // Test cases are always for an item.
  if (!isValid || (i.type === TESTS && asId(i.id) === undefined)) return null

  return {
    type: i.type as Draft['type'],
    title: i.title as string,
    url: i.url as string,
    createdId: asId(i.createdId),
    id: asId(i.id),
    updated: i.updated === true || undefined,
    suiteUrl: isText(i.suiteUrl) && i.suiteUrl.startsWith(ADO_URL) ? i.suiteUrl : undefined,
  }
}

// The commands the session title names, and their label.
const COMMANDS: Record<string, string> = {
  'new-item': 'New item',
  'refine-item': 'Refine',
  'plan-epic': 'Plan epic',
  'triage-bug': 'Triage',
  feature: 'Feature',
  'test-cases': 'Test cases',
  develop: 'Develop',
  'quick-bugfix': 'Bugfix',
}
const COMMAND = /^\/(?:agentic-midas:)?(new-item|refine-item|plan-epic|triage-bug|feature|test-cases|develop|quick-bugfix)(?:\s+([\s\S]*))?$/
// /develop, /quick-bugfix and /plan-epic also take a description or another link (and /develop a task folder), so only an id, a link or a `YYYY-MM-DD-<id>-` folder names an item.
const FREE_TEXT = new Set(['develop', 'quick-bugfix', 'plan-epic'])
// A bare link, such as a Productboard one, makes a poor session title; the skill names the session once it has the title.
const ONLY_LINK = /^https?:\/\/\S+$/
// A leading number needs 5+ digits, so a brief such as "2026 pricing refresh" or "500 error on save" isn't read as an item.
const FREE_TEXT_ID = /^(?:AB)?#?(\d{5,})\b|_workitems\/edit\/(\d+)|[?&]workitem=(\d+)|\d{4}-\d{2}-\d{2}-(\d{3,})-/
const TITLE_MAX = 80

export type Command = { label: string; id?: number; brief: string }

// `/agentic-midas:test-cases AB#361294` → its label and the work item id (digits, #id, AB#id or a link).
export function parseCommand(prompt: string): Command | null {
  const [, name = '', args = ''] = COMMAND.exec(prompt.trim()) ?? []
  const label = COMMANDS[name]
  if (!label) return null

  const brief = args.trim()
  const id =
    name === 'new-item'
      ? undefined
      : FREE_TEXT.has(name)
        ? FREE_TEXT_ID.exec(brief)?.slice(1).find(Boolean)
        : brief.match(/\d{3,}/)?.[0]
  return { label, id: id ? Number(id) : undefined, brief }
}

// `Test cases #361294: Display quote activity`, so the session list says which item it is.
export function titleFor(cmd: Command, itemTitle?: string): string | undefined {
  const name = cmd.id
    ? `${cmd.label} #${cmd.id}${itemTitle ? `: ${itemTitle}` : ''}`
    : cmd.brief && !ONLY_LINK.test(cmd.brief) && `${cmd.label}: ${cmd.brief}`
  if (!name) return undefined
  return name.length > TITLE_MAX ? `${name.slice(0, TITLE_MAX - 1)}…` : name
}

// The item's title from ADO, through the az CLI sign-in the MCP server uses; none if az is slow or fails.
async function itemTitle($: EngineInterface, id: number): Promise<string | undefined> {
  const argv = ['az', 'boards', 'work-item', 'show', '--org', ADO_URL, '--id', String(id), '--query', 'fields."System.Title"', '-o', 'tsv']
  const r = await $.process.run(argv, { timeoutMs: 5000 }).catch(() => null)
  return r?.exitCode === 0 ? r.stdout.trim() || undefined : undefined
}

function say($: EngineInterface, text: string) {
  void $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  registerFeature(on)
  registerDevelop(on)

  // Keeps a running workflow in view after compaction drops the skill's instructions. The engine takes one unmatched hook.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const added = [...(await featureSection($)), ...(await taskSection($))]

    return added.length ? { sections: [...composed.sections, ...added] } : composed
  })

  on('tool.check', { tool: ADO }, async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'deny') return verdict

    return decide(e.tool, e.input) === 'allow' ? { decision: 'allow' } : { decision: 'ask', reason: ASK }
  }).catch(() => ({ decision: 'ask', reason: ASK }))

  // The skills never write to Productboard; if a tool call tries, the user decides.
  on('tool.check', { tool: PRODUCTBOARD_WRITE }, async ($, e, next) => {
    const verdict = await next(e)
    return verdict.decision === 'deny' ? verdict : { decision: 'ask', reason: ASK_PRODUCTBOARD }
  }).catch(() => ({ decision: 'ask', reason: ASK_PRODUCTBOARD }))

  // The draft tool only sets what the band shows.
  on('tool.check', { tool: DRAFT_TOOL }, () => ({ decision: 'allow' }))

  // Name the session after the item a command works on, not the command.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    const cmd = parseCommand(e.prompt)
    if (!cmd || result.block) return result

    const sessionTitle = titleFor(cmd, cmd.id ? await itemTitle($, cmd.id) : undefined)
    return sessionTitle ? { ...result, sessionTitle } : result
  }).catch(() => ({}))

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'draft_work_item',
      description:
        'Point the band above the prompt at the Midas draft doc (a work item, an epic plan, or test cases for one), giving the user Action comments, Create (or Update, when refining) and Cancel. An epic plan always offers Create. Call it once the draft doc exists, and again with createdId once a new item is created, updated: true once a refined item or an existing epic\'s plan is saved, or suiteUrl once test cases are created.',
      inputSchema: SCHEMA,
    })
    await $.tool.register(FEATURE_TOOL_SPEC)

    // A resumed session gets its bands back.
    try {
      const saved = (await $.store.get(await draftKey($))) as Draft | undefined
      if (saved) await update($, draft, () => saved)
    } catch {}
    await resumeFeature($)

    return next(e)
  })

  on('tool.call', { tool: DRAFT_TOOL }, async ($, e) => {
    const d = parseDraft(e)
    if (!d) return { result: 'Not set: type, title and a https://claude.ai/ doc url are required.', isError: true }

    await update($, draft, () => d)
    await draftKey($)
      .then(key => $.store.set(key, d))
      .catch(() => undefined)

    if (d.createdId || d.updated || d.suiteUrl) return { result: 'The band shows the saved item.' }

    return {
      result: `The band above the prompt now offers Open doc, Action comments, ${d.id && d.type !== TESTS ? 'Update' : 'Create'} and Cancel for this draft.`,
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const d = await read($, draft)
    if (!d || e.props.hasSurvey) return next(e)

    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const clear = async () => {
      await update($, draft, () => null)
      await draftKey($)
        .then(key => $.store.delete(key))
        .catch(() => undefined)
    }

    const isTests = d.type === TESTS

    if (isTests && d.suiteUrl) {
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text>Created test cases for #{d.id}</Text>
          <Link href={d.suiteUrl} label="Open suite" />
          <Button key="dismiss" label="Dismiss" plain onPress={clear} />
        </Box>
      )
    }

    const savedId = d.createdId ?? (d.updated ? d.id : undefined)

    if (savedId) {
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text>
            {d.createdId ? 'Created' : 'Updated'} {d.type} #{savedId}
          </Text>
          <Link href={`${ITEM_URL}${savedId}`} label="Open in Azure DevOps" />
          <Button key="dismiss" label="Dismiss" plain onPress={clear} />
        </Box>
      )
    }

    // An epic plan only creates items, even when it plans into an existing epic.
    const isEpic = d.type === EPIC
    const isRefine = d.id !== undefined && !isTests && !isEpic
    const heading = isTests
      ? `Test cases #${d.id}`
      : isRefine
        ? `Refine ${d.type} #${d.id}`
        : isEpic && d.id
          ? `Epic plan #${d.id}`
          : `${d.type} draft`

    // One row: the title gives way (truncates) so the buttons keep their size.
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Box flexShrink={0}>
          <Text bold>{heading}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate">{d.title}</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
          <Link href={d.url} label="Open doc" />
          {e.props.isWorking ? (
            <Text dimColor>Claude is working…</Text>
          ) : (
            <Box flexDirection="row" gap={1}>
              <Button key="action" label="Action comments" onPress={() => say($, ACTION)} />
              {isRefine ? (
                <Button key="update" label="Update" variant="primary" onPress={() => say($, UPDATE)} />
              ) : (
                <Button key="create" label="Create" variant="primary" onPress={() => say($, CREATE)} />
              )}
              <Button
                key="cancel"
                label="Cancel"
                onPress={async () => {
                  await clear()
                  say($, isTests ? CANCEL_TESTS : isRefine ? CANCEL_UPDATE : CANCEL)
                }}
              />
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
