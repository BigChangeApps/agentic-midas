import { expect, test } from 'claude-code/testing'

import type { Draft } from '../types'
import { ACTION, CANCEL, CANCEL_UPDATE, CREATE, DRAFT_TOOL, UPDATE, decide, parseDraft } from './register'

const PLUGIN = 'mcp__plugin_agentic-midas_azure-devops__'
const USER = 'mcp__azure-devops__'

test('reads run, writes and unknown tools are asked', async () => {
  expect(decide(`${PLUGIN}wit_work_item`, { action: 'get', id: 1 })).toBe('allow')
  expect(decide(`${USER}search_workitem`, { searchText: 'invoice' })).toBe('allow')
  expect(decide(`${PLUGIN}wit_work_item_write`, { action: 'create' })).toBe('ask')
  expect(decide(`${PLUGIN}repo_create_branch`, {})).toBe('ask')
  expect(decide(`${PLUGIN}some_new_tool`, {})).toBe('ask')
})

test('read tools that change something are asked', async () => {
  expect(decide(`${PLUGIN}wit_backlog`, { action: 'list_work_items' })).toBe('allow')
  expect(decide(`${PLUGIN}wit_backlog`, { action: 'reorder', ids: [1] })).toBe('ask')
  expect(decide(`${PLUGIN}pipelines_artifact`, { action: 'download' })).toBe('allow')
  expect(decide(`${PLUGIN}pipelines_artifact`, { action: 'download', destinationPath: 'out' })).toBe('ask')
  expect(decide(`${PLUGIN}wit_work_item_attachment`, { attachmentId: 'x', savePath: 'tmp' })).toBe('ask')
})

const BUG: Draft = {
  type: 'Bug',
  title: 'Invoice sync fails for zero-value lines',
  url: 'https://claude.ai/artifact/abc',
}

test('a draft needs a known type and a claude.ai doc link', async () => {
  expect(parseDraft({ ...BUG, createdId: 7 })).toEqual({ ...BUG, createdId: 7 })
  expect(parseDraft({ ...BUG, type: 'Task' })).toBeNull()
  expect(parseDraft({ ...BUG, url: 'javascript:alert(1)' })).toBeNull()
})

const band = (isWorking: boolean) =>
  ({
    plugin: 'agentic-midas',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} },
  }) as const

test('the band acts on the draft doc and steps aside while Claude works', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  // The engine's own band, drawn when the mod has nothing to show.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))

  await $.tool.call({ tool: DRAFT_TOOL, ...BUG })

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...band(false), surface })
    expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: BUG.url })
    await ui.unmount()
  }

  const busy = await $.ui.mount({ ...band(true), surface: 'desktop' })
  expect(await busy.find({ key: 'create' })).toBeUndefined()
  await busy.unmount()

  const ui = await $.ui.mount({ ...band(false), surface: 'desktop' })
  await ui.press({ key: 'action' })
  await ui.press({ key: 'create' })
  expect(sent).toEqual([ACTION, CREATE])

  await $.tool.call({ tool: DRAFT_TOOL, ...BUG, createdId: 7 })
  expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({
    href: 'https://dev.azure.com/bigchange/BigChange/_workitems/edit/7',
  })
  await ui.press({ key: 'dismiss' })
  expect(await ui.find({ type: 'Link' })).toBeUndefined()
})

test('Cancel clears the band and tells Claude', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  // The engine's own band, drawn when the mod has nothing to show.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))

  await $.tool.call({ tool: DRAFT_TOOL, ...BUG })
  const ui = await $.ui.mount({ ...band(false), surface: 'desktop' })
  await ui.press({ key: 'cancel' })
  expect(sent).toEqual([CANCEL])
  expect(await ui.find({ key: 'create' })).toBeUndefined()
})

test('a refine draft offers Update, then links the updated item', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))

  await $.tool.call({ tool: DRAFT_TOOL, ...BUG, id: 360900 })
  const ui = await $.ui.mount({ ...band(false), surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Refine Bug #360900/ })).toBeDefined()
  expect(await ui.find({ key: 'create' })).toBeUndefined()
  await ui.press({ key: 'update' })
  expect(sent).toEqual([UPDATE])

  await $.tool.call({ tool: DRAFT_TOOL, ...BUG, id: 360900, updated: true })
  expect(await ui.find({ type: 'Text', text: /Updated Bug #360900/ })).toBeDefined()
  expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({
    href: 'https://dev.azure.com/bigchange/BigChange/_workitems/edit/360900',
  })

  await $.tool.call({ tool: DRAFT_TOOL, ...BUG, id: 360900 })
  await ui.press({ key: 'cancel' })
  expect(sent).toEqual([UPDATE, CANCEL_UPDATE])
})
