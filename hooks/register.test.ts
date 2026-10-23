import { expect, test } from 'claude-code/testing'

import type { Draft } from '../types'
import {
  ACTION,
  CANCEL,
  CANCEL_TESTS,
  CANCEL_UPDATE,
  CREATE,
  DRAFT_TOOL,
  UPDATE,
  decide,
  parseCommand,
  parseDraft,
  titleFor,
} from './register'

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

const TESTS: Draft = { type: 'Test cases', title: 'Display quote activity', url: 'https://claude.ai/artifact/tc', id: 361294 }
const SUITE = 'https://dev.azure.com/bigchange/BigChange/_testPlans/define?planId=361396&suiteId=361487'

test('a test case draft needs its item and only takes an ADO suite link', async () => {
  expect(parseDraft({ ...TESTS, id: undefined })).toBeNull()
  expect(parseDraft({ ...TESTS, suiteUrl: 'https://evil.example/x' })?.suiteUrl).toBeUndefined()
  expect(parseDraft({ ...TESTS, suiteUrl: SUITE })?.suiteUrl).toBe(SUITE)
})

test('a test case draft offers Create, then links the suite', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))

  await $.tool.call({ tool: DRAFT_TOOL, ...TESTS })
  const ui = await $.ui.mount({ ...band(false), surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Test cases #361294/ })).toBeDefined()
  expect(await ui.find({ key: 'update' })).toBeUndefined()
  await ui.press({ key: 'create' })
  await ui.press({ key: 'cancel' })
  expect(sent).toEqual([CREATE, CANCEL_TESTS])

  await $.tool.call({ tool: DRAFT_TOOL, ...TESTS, suiteUrl: SUITE })
  expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: SUITE })
})

test('commands name the session after their item', async () => {
  expect(parseCommand('/agentic-midas:test-cases AB#361294')).toEqual({ label: 'Test cases', id: 361294, brief: 'AB#361294' })
  expect(parseCommand('/feature https://dev.azure.com/bigchange/BigChange/_workitems/edit/361294')?.id).toBe(361294)
  expect(parseCommand('/agentic-midas:new-item bug 500 on invoice save')?.id).toBeUndefined()
  expect(parseCommand('Create it.')).toBeNull()
  expect(parseCommand('/agentic-midas:features 1')).toBeNull()

  const cmd = parseCommand('/agentic-midas:feature 361294')!
  expect(titleFor(cmd, 'Display quote activity')).toBe('Feature #361294: Display quote activity')
  expect(titleFor(cmd)).toBe('Feature #361294')
  expect(titleFor(parseCommand('/agentic-midas:new-item')!)).toBeUndefined()
  expect(titleFor(cmd, 'x'.repeat(200))).toHaveLength(80)
})

test('the session title comes from the prompt, with the item title from az', async ($, on) => {
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: 'Display quote activity\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  const named = await $.classic.UserPromptSubmit({ prompt: '/agentic-midas:test-cases 361294' })
  expect(named.sessionTitle).toBe('Test cases #361294: Display quote activity')

  const plain = await $.classic.UserPromptSubmit({ prompt: 'Create it.' })
  expect(plain.sessionTitle).toBeUndefined()
})

test('/develop names an item only from an id, a link or a task folder', async () => {
  expect(parseCommand('/agentic-midas:develop AB#361453')).toMatchObject({ label: 'Develop', id: 361453 })
  expect(parseCommand('/develop https://dev.azure.com/bigchange/BigChange/_workitems/edit/361453')?.id).toBe(361453)
  expect(parseCommand('/develop .midas/tasks/development/2026-10-22-361453-send-quote')?.id).toBe(361453)
  expect(parseCommand('/develop Fix the 500 error on quote save')).toMatchObject({ label: 'Develop', id: undefined })
  expect(titleFor(parseCommand('/develop Fix the 500 error on quote save')!)).toBe('Develop: Fix the 500 error on quote save')
})
