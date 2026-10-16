import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Draft } from '../types'

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

// The read tools still reorder the backlog or save downloads to disk on some inputs.
export function decide(tool: string, input: unknown): 'allow' | 'ask' {
  const name = tool.replace(ADO, '')
  const i = (input ?? {}) as Input
  const changes = (name === 'wit_backlog' && i.action === 'reorder') || Boolean(i.savePath || i.destinationPath)

  return READS.has(name) && !changes ? 'allow' : 'ask'
}

export const DRAFT_TOOL = 'mcp__agentic-midas__draft_work_item'
const ITEM_URL = 'https://dev.azure.com/bigchange/BigChange/_workitems/edit/'
const TYPES: readonly string[] = ['Bug', 'Enabler', 'User Story']

// What the band's buttons say for the person.
export const ACTION = 'Action the comments on the draft doc.'
export const CREATE = 'Create it.'
export const CANCEL = "Cancel, don't create this work item."
export const UPDATE = 'Update it.'
export const CANCEL_UPDATE = "Cancel, don't update this work item."

const draft = atom({ plugin: 'agentic-midas', key: 'draft' } as const, null)

const SCHEMA = {
  type: 'object',
  properties: {
    type: { enum: TYPES },
    title: { type: 'string' },
    url: { type: 'string', description: "The draft doc's claude.ai link" },
    createdId: { type: 'integer', description: 'The new work item id, once it is created' },
    id: { type: 'integer', description: 'The existing work item being refined' },
    updated: { type: 'boolean', description: 'true once the refined item is saved in Azure DevOps' },
  },
  required: ['type', 'title', 'url'],
}

const asId = (v: unknown) => (Number.isInteger(v) ? (v as number) : undefined)

const isText = (v: unknown): v is string => typeof v === 'string'

export function parseDraft(input: unknown): Draft | null {
  const i = (input ?? {}) as Record<string, unknown>
  const isValid =
    isText(i.type) && TYPES.includes(i.type) && isText(i.title) && isText(i.url) && i.url.startsWith('https://claude.ai/')
  if (!isValid) return null

  return {
    type: i.type as Draft['type'],
    title: i.title as string,
    url: i.url as string,
    createdId: asId(i.createdId),
    id: asId(i.id),
    updated: i.updated === true || undefined,
  }
}

function say($: EngineInterface, text: string) {
  void $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  on('tool.check', { tool: ADO }, async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'deny') return verdict

    return decide(e.tool, e.input) === 'allow' ? { decision: 'allow' } : { decision: 'ask', reason: ASK }
  }).catch(() => ({ decision: 'ask', reason: ASK }))

  // The draft tool only sets what the band shows.
  on('tool.check', { tool: DRAFT_TOOL }, () => ({ decision: 'allow' }))

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'draft_work_item',
      description:
        'Point the band above the prompt at the Midas work item draft doc, giving the user Action comments, Create (or Update, with id) and Cancel. Call it once the draft doc exists, and again with createdId once a new item is created, or with updated: true once a refined item is saved.',
      inputSchema: SCHEMA,
    })

    return next(e)
  })

  on('tool.call', { tool: DRAFT_TOOL }, async ($, e) => {
    const d = parseDraft(e)
    if (!d) return { result: 'Not set: type, title and a https://claude.ai/ doc url are required.', isError: true }

    await update($, draft, () => d)

    if (d.createdId || d.updated) return { result: 'The band shows the saved item.' }

    return {
      result: `The band above the prompt now offers Open doc, Action comments, ${d.id ? 'Update' : 'Create'} and Cancel for this draft.`,
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const d = await read($, draft)
    if (!d || e.props.hasSurvey) return next(e)

    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const clear = () => update($, draft, () => null)

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

    const isRefine = d.id !== undefined

    // One row: the title gives way (truncates) so the buttons keep their size.
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Box flexShrink={0}>
          <Text bold>{isRefine ? `Refine ${d.type} #${d.id}` : `${d.type} draft`}</Text>
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
                  say($, isRefine ? CANCEL_UPDATE : CANCEL)
                }}
              />
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
