import { expect, mock, test } from 'claude-code/testing'

import type { Feature } from '../types'
import {
  APPROVE_PLAN,
  APPROVE_SPEC,
  FEATURE_TOOL,
  GATED,
  SHIP,
  applyUpdate,
  baseBranchReason,
  destructiveOp,
  editBlock,
  paneMarkdown,
  parseUpdate,
  reminderText,
  statusText,
  trackerText,
} from './feature'

const REPO = { name: 'JobFinance', path: '/ws/JobFinance', base: 'main' }
const START: Feature = {
  id: 7,
  title: 'Show quote activity',
  root: '/ws',
  phase: 'story',
  repos: [],
  ac: [],
  decisions: [],
  prs: [],
  approvals: {},
}

test('gates hold a phase back until the band approves it; stepping back re-opens them', async () => {
  expect(applyUpdate(null, { id: 7 }).error).toContain('start it with id, title and root')

  const blocked = applyUpdate(START, { id: 7, phase: 'plan' })
  expect(blocked.feature?.phase).toBe('story')
  expect(blocked.error).toContain('Approve spec')

  const approved: Feature = { ...START, phase: 'review', approvals: { spec: true, plan: true, push: true } }
  expect(applyUpdate(approved, { id: 7, phase: 'pr' }).feature?.phase).toBe('pr')
  expect(applyUpdate(approved, { id: 7, phase: 'build' }).feature?.approvals).toEqual({ spec: true, plan: true, push: false })
  expect(applyUpdate(approved, { id: 7, phase: 'spec' }).feature?.approvals).toEqual({ spec: false, plan: false, push: false })
  expect(applyUpdate(approved, { id: 7, title: 'x' }).feature?.approvals).toEqual(approved.approvals)
})

test('updates keep only usable values', async () => {
  expect(parseUpdate({ id: 7, specUrl: 'javascript:alert(1)' })).toBeNull()
  expect(parseUpdate({ id: '7' })).toBeNull()
  const u = parseUpdate({
    id: 7,
    root: '/ws/',
    repos: [{ ...REPO, path: '/ws/JobFinance/' }, { name: 'rel', path: 'rel', base: 'main' }],
    prs: [{ repo: 'JobFinance', url: 'https://evil.example/pr' }],
  })
  expect(u).toEqual({ id: 7, root: '/ws', repos: [REPO], prs: [] })

  const withSession = { ...REPO, session: 'local_1' }
  expect(parseUpdate({ id: 7, repos: [withSession, { ...REPO, session: 1 }] })?.repos).toEqual([withSession])
})

test('edits wait for approval, stay in planned repos and off base branches', async () => {
  const planned: Feature = { ...START, phase: 'build', repos: [REPO], approvals: { spec: true, plan: true } }
  expect(editBlock({ ...planned, approvals: {} }, '/ws/JobFinance/a.ts').reason).toContain('waits until the spec and plan')
  expect(editBlock(planned, '/ws/BigWeb/b.cs').reason).toContain('outside the planned repos')
  expect(editBlock(planned, '/ws/JobFinance/a.ts').repo).toEqual(REPO)
  const delegated = { ...planned, repos: [{ ...REPO, session: 'local_1' }] }
  expect(editBlock(delegated, '/ws/JobFinance/a.ts').reason).toContain('sub-session local_1')
  expect(editBlock({ ...planned, approvals: {} }, '/ws/.midas/7/summary.html')).toEqual({})
  expect(editBlock(planned, '/tmp/scratch.md')).toEqual({})
  expect(editBlock({ ...planned, phase: 'done' }, '/ws/BigWeb/b.cs')).toEqual({})

  expect(baseBranchReason(REPO, 'main')).toContain('Create the feature branch')
  expect(baseBranchReason({ ...REPO, base: 'develop' }, 'WebRelease2')).toContain('on WebRelease2')
  expect(baseBranchReason(REPO, 'feature/7-quote-activity')).toBeUndefined()

  expect(GATED.test('git -C /ws/JobFinance push -u origin feature/7-x')).toBe(true)
  expect(GATED.test('cd /ws/JobFinance && git commit -am "feat: #7 x"')).toBe(true)
  expect(GATED.test('git --no-pager -c user.name=x commit')).toBe(true)
  expect(GATED.test('az repos pr create --repository JobFinance')).toBe(true)
  expect(GATED.test('git status && git log')).toBe(false)
  expect(GATED.test('git log -- src/commit.ts')).toBe(false)
  expect(GATED.test('git diff origin/main -- push.ts')).toBe(false)
})

test('the pane and status line show repos, criteria and decisions', async () => {
  const f: Feature = {
    ...START,
    phase: 'build',
    repos: [{ ...REPO, tests: 'passed' }],
    ac: [{ text: 'Edits show', status: 'verified', evidence: 'ActivityTests' }, { text: 'Times local', status: 'todo' }],
    decisions: [{ question: 'Empty state copy?' }, { question: 'Page size?', choice: '20', by: 'claude', why: 'matches the list' }],
  }
  const snaps = [{ name: 'JobFinance', branch: 'feature/7-x', changed: 3, ahead: 1 }]

  expect(trackerText('build')).toBe('Story ✓ › Spec ✓ › Plan ✓ › Build ● › Review › PR')
  expect(statusText(f, snaps)).toBe('AB#7 · Build · 1/1 repos changed · 1/2 AC · 1 waiting')

  const md = paneMarkdown(f, snaps, { JobFinance: ['src/a.ts'] })
  expect(md).toContain('| JobFinance | feature/7-x | main | 3 | 1 | passed |')
  expect(md).toContain('- [x] Edits show · verified — ActivityTests')
  expect(md).toContain('- [ ] Times local')
  expect(md).toContain('#### Decisions waiting\n\n- Empty state copy?')
  expect(md).toContain('Page size? → **20** (claude): matches the list')
  expect(md).toContain('`src/a.ts`')
})

const band = {
  plugin: 'agentic-midas',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

test('the band walks the gates, and the guards follow them', async ($, on) => {
  mock.store(on)
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))
  on('tool.check', () => ({ decision: 'allow' }))

  const status = (u: Record<string, unknown>) => $.tool.call({ tool: FEATURE_TOOL, id: 7, ...u })
  const edit = (file_path: string) =>
    $.tool.check({ tool: 'Edit', input: { file_path, old_string: 'a', new_string: 'b' } }).then(r => r.decision)
  const bash = (command: string) => $.tool.check({ tool: 'Bash', input: { command } }).then(r => r.decision)
  const push = () => bash('git -C /ws/JobFinance push -u origin feature/7-x')
  const commit = () => bash('git -C /ws/JobFinance commit -m "feat: #7 quote activity"')

  await status({ title: START.title, root: '/ws' })
  const ui = await $.ui.mount(band)
  expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: 'https://dev.azure.com/bigchange/BigChange/_workitems/edit/7' })
  expect(await edit('/ws/JobFinance/a.ts')).toBe('deny')

  const early = await status({ phase: 'plan' })
  expect(early.isError).toBe(true)

  await status({ phase: 'spec', specUrl: 'https://claude.ai/code/artifact/spec', ac: [{ text: 'Edits show', status: 'todo' }] })
  await ui.press({ key: 'approve-spec' })
  await status({ phase: 'plan', repos: [REPO], decisions: [{ question: 'Empty state copy?' }] })
  expect(await ui.find({ key: 'decisions' })).toBeDefined()
  await ui.press({ key: 'approve-plan' })
  expect(sent).toEqual([APPROVE_SPEC, APPROVE_PLAN])

  await status({ phase: 'build', decisions: [{ question: 'Empty state copy?', choice: 'No activity yet', by: 'user' }] })
  expect(await ui.find({ key: 'decisions' })).toBeUndefined()
  expect(await edit('/ws/JobFinance/a.ts')).toBe('allow')
  expect(await edit('/ws/BigWeb/b.cs')).toBe('deny')
  expect(await push()).toBe('deny')
  expect(await commit()).toBe('deny')
  expect(await bash('git -C /ws/JobFinance diff origin/main')).toBe('allow')

  await status({ phase: 'review', summaryUrl: 'https://claude.ai/code/artifact/summary' })
  await ui.press({ key: 'ship' })
  expect(sent.at(-1)).toBe(SHIP)
  expect(await commit()).toBe('allow')
  expect(await push()).toBe('allow')

  // Paused, then picked up from the store with its approvals.
  await ui.press({ key: 'close' })
  expect(await ui.find({ type: 'Link' })).toBeUndefined()
  const resumed = await status({})
  expect(String(resumed.result)).toContain('"phase":"review"')
  expect(await push()).toBe('allow')
})

test('commands that can throw away uncommitted work are caught; read-only ones pass', async () => {
  const op = (command: string) => destructiveOp(command, '/ws')
  expect(op('git stash')?.op).toBe('git stash')
  expect(op('git -C /ws/JobFinance stash push -m wip')?.op).toBe('git stash')
  expect(op('git stash list')).toBeUndefined()
  expect(op('cd /ws/JobFinance && git reset --hard origin/main')?.op).toBe('git reset --hard')
  expect(op('git checkout -- src/a.ts')?.op).toBe('git checkout of files')
  expect(op('git checkout .')?.op).toBe('git checkout of files')
  expect(op('git checkout -b feature/7-x')).toBeUndefined()
  expect(op('git restore src/a.ts')?.op).toBe('git restore')
  expect(op('git restore --staged src/a.ts')).toBeUndefined()
  expect(op('git clean -fd')?.op).toBe('git clean')
  expect(op('git clean -n')).toBeUndefined()
  expect(op('git push --force-with-lease origin x')?.op).toBe('git push --force')
  expect(op('git branch -D feature/7-x')?.op).toBe('git branch -D')
  expect(op('git status && git diff origin/main')).toBeUndefined()

  expect(op('rm -rf dist')).toEqual({ op: 'rm -r', isAsked: true })
  expect(op('rm -r /ws/JobFinance/obj')).toEqual({ op: 'rm -r', isAsked: true })
  expect(op('rm -rf /tmp/scratch')).toBeUndefined()
  expect(op('rm src/old.ts')).toBeUndefined()
})

test('the reminder names the item, phase and gates', async () => {
  const text = reminderText({ ...START, phase: 'build', approvals: { spec: true, plan: true } })
  expect(text).toContain('AB#7 "Show quote activity", phase Build')
  expect(text).toContain('Approve spec passed, Approve plan passed, Commit & PR not yet')
  expect(text).toContain('invoke that skill again with 7')
  expect(text).not.toContain('sub-sessions')

  const delegated = reminderText({ ...START, phase: 'build', repos: [{ ...REPO, session: 'local_1' }] })
  expect(delegated).toContain('Code changes run in sub-sessions (JobFinance → local_1)')
})

test('during a feature the guard refuses destructive git for everyone and asks about rm -r', async ($, on) => {
  mock.store(on)
  on('tool.check', () => ({ decision: 'allow' }))
  const bash = (command: string) => $.tool.check({ tool: 'Bash', input: { command } }).then(r => r.decision)

  expect(await bash('git stash')).toBe('allow')
  await $.tool.call({ tool: FEATURE_TOOL, id: 7, title: START.title, root: '/ws' })
  expect(await bash('git stash')).toBe('deny')
  expect(await bash('rm -rf dist')).toBe('ask')
  expect(await bash('rm -rf /tmp/scratch')).toBe('allow')
  expect(await bash('git status')).toBe('allow')
})
