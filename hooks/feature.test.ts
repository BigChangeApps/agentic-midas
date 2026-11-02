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
  subRepo,
  trackerText,
} from './feature'
import { DRAFT_TOOL } from './register'

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

test('a gate passed in another session holds: the store wins over this session\'s copy', async ($, on) => {
  // The store every session shares, written below as the band in another session would.
  const store = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('tool.check', () => ({ decision: 'allow' }))
  const status = (u: Record<string, unknown>) => $.tool.call({ tool: FEATURE_TOOL, id: 7, ...u })

  await status({ title: START.title, root: '/ws', phase: 'spec', specUrl: 'https://claude.ai/code/artifact/spec' })
  store.set('feature:7', { ...(store.get('feature:7') as Feature), phase: 'plan', approvals: { spec: true, plan: true } })

  const built = await status({ phase: 'build', repos: [REPO] })
  expect(built.isError).toBeFalsy()
  expect((store.get('feature:7') as Feature).approvals).toEqual({ spec: true, plan: true })
})

test('an open draft has the band; a saved one gives it back to the feature', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))
  on('tool.check', () => ({ decision: 'allow' }))

  await $.tool.call({ tool: FEATURE_TOOL, id: 7, title: START.title, root: '/ws' })
  const draft = { tool: DRAFT_TOOL, type: 'User Story', title: START.title, url: 'https://claude.ai/code/artifact/draft', id: 7 } as const
  await $.tool.call(draft)
  const ui = await $.ui.mount(band)
  expect(await ui.find({ key: 'update' })).toBeDefined()
  expect(await ui.find({ key: 'details' })).toBeUndefined()

  await $.tool.call({ ...draft, updated: true })
  expect(await ui.find({ key: 'details' })).toBeDefined()
})

test('a sub-session sees its feature read-only, under its guards', async ($, on) => {
  const worktree = '/ws/JobFinance/.claude/worktrees/7-x'
  const f: Feature = {
    ...START,
    phase: 'build',
    repos: [{ ...REPO, path: worktree, session: 'local_1' }],
    approvals: { spec: true, plan: true },
  }
  expect(subRepo(f, worktree)?.name).toBe('JobFinance')
  expect(subRepo({ ...f, repos: [{ ...REPO, session: 'local_1' }] }, worktree)?.name).toBe('JobFinance')
  expect(subRepo(f, '/ws')).toBeUndefined()
  expect(subRepo({ ...f, repos: [{ ...REPO, path: worktree }] }, worktree)).toBeUndefined()
  expect(subRepo({ ...f, phase: 'done' }, worktree)).toBeUndefined()

  mock.store(on, { 'feature:7': f })
  on('session.root', () => ({ value: worktree }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))
  on('tool.check', () => ({ decision: 'allow' }))
  const bash = (command: string) => $.tool.check({ tool: 'Bash', input: { command } }).then(r => r.decision)

  const ui = await $.ui.mount(band)
  expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: 'https://dev.azure.com/bigchange/BigChange/_workitems/edit/7' })
  expect(await ui.find({ key: 'approve-plan' })).toBeUndefined()
  expect(await bash(`git -C ${worktree} commit -m "feat: #7 x"`)).toBe('deny')
  expect(await bash('git stash')).toBe('deny')
  expect(await bash('git status')).toBe('allow')
  expect(await $.tool.check({ tool: 'Edit', input: { file_path: `${worktree}/a.ts`, old_string: 'a', new_string: 'b' } }).then(r => r.decision)).toBe('allow')
})

const pane = {
  plugin: 'agentic-midas',
  component: 'Pane',
  surface: 'mobile',
  requestId: 'midas-feature',
  props: { title: 'AB#7', isFocused: false, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('a resumed session gets its feature band back; a phone gets the gate in the pane', async ($, on) => {
  const owned: Feature = { ...START, phase: 'plan', specUrl: 'https://claude.ai/code/artifact/spec', approvals: { spec: true }, owner: 's1' }
  mock.store(on, { 'feature:7': owned, 'feature:8': { ...owned, id: 8, owner: 's2' } })
  on('session.id', () => ({ value: 's1' }))
  // What lies beneath the plugin when a session (re)starts.
  on('tool.register', ($, e) => ({ value: { tool: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))
  on('tool.check', () => ({ decision: 'allow' }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: {} as never }
  })

  const ui = await $.ui.mount(band)
  expect(await ui.find({ key: 'approve-plan' })).toBeUndefined()
  await $.session.start({ cwd: '/ws', surface: 'desktop', isInteractive: true } as never)
  expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: 'https://dev.azure.com/bigchange/BigChange/_workitems/edit/7' })
  expect(await ui.find({ key: 'approve-plan' })).toBeDefined()

  await $.session.attach({ surface: 'mobile', clientId: 'phone' } as never)
  expect(opened).toEqual(['midas-feature'])
  const phone = await $.ui.mount(pane)
  expect(await phone.find({ key: 'approve-plan' })).toBeDefined()
  await phone.press({ key: 'approve-plan' })
  expect(sent).toEqual([APPROVE_PLAN])
  expect(await phone.find({ key: 'approve-plan' })).toBeUndefined()
})

test('every 15 seconds the band takes up a gate passed in another session', async ($, on) => {
  const store = new Map<string, unknown>([['feature:7', { ...START, phase: 'plan', approvals: { spec: true }, owner: 's1' }]])
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  const clock = mock.clock(on)
  on('session.id', () => ({ value: 's1' }))
  on('tool.register', ($, e) => ({ value: { tool: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))

  await $.session.start({ cwd: '/ws', surface: 'desktop', isInteractive: true } as never)
  const ui = await $.ui.mount(band)
  expect(await ui.find({ key: 'approve-plan' })).toBeDefined()

  // The band in another session passes Approve plan.
  store.set('feature:7', { ...START, phase: 'build', approvals: { spec: true, plan: true }, owner: 's1' })
  await clock.advance(15_000)
  expect(await ui.find({ key: 'approve-plan' })).toBeUndefined()
  // The guards follow it too: code is no longer held back for the plan, only kept to the planned repos.
  const check = await $.tool.check({ tool: 'Edit', input: { file_path: '/ws/BigWeb/b.cs', old_string: 'a', new_string: 'b' } })
  expect(JSON.stringify(check)).toContain('outside the planned repos')
})
