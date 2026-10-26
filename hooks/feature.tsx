import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Feature, FeatureApprovals, FeaturePhase, FeatureRepo, FeatureUpdate, RepoGit } from '../types'

export const FEATURE_TOOL = 'mcp__agentic-midas__feature_status'
const ITEM_URL = 'https://dev.azure.com/bigchange/BigChange/_workitems/edit/'
const PANE = 'midas-feature'
// A RegExp, not an array: an array of built-in tools makes the type-checker build every pairing and run out of memory.
export const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/
// Feature work never lands straight on these, whatever the plan names as base.
const PROTECTED = ['main', 'master', 'WebRelease2']

export const PHASES: readonly (readonly [FeaturePhase, string])[] = [
  ['story', 'Story'],
  ['spec', 'Spec'],
  ['plan', 'Plan'],
  ['build', 'Build'],
  ['review', 'Review'],
  ['pr', 'PR'],
  ['done', 'Done'],
]
const order = (p: FeaturePhase) => PHASES.findIndex(([k]) => k === p)
const labelOf = (p: FeaturePhase) => PHASES[order(p)]?.[1] ?? p

// What the band's buttons say for the person.
export const APPROVE_SPEC = 'Spec approved.'
export const APPROVE_PLAN = 'Plan approved. Start building.'
export const SHIP = 'Commit, push and open the PRs.'
export const ACTION_SPEC = 'Action the comments on the spec doc.'
export const DECISIONS = 'Ask me the waiting decisions.'

const feature = atom({ plugin: 'agentic-midas', key: 'feature' } as const, null)
const git = atom({ plugin: 'agentic-midas', key: 'git' } as const, [])
const touched = atom({ plugin: 'agentic-midas', key: 'touched' } as const, {})
const draft = atom({ plugin: 'agentic-midas', key: 'draft' } as const, null)

const storeKey = (id: number) => `feature:${id}`

const SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'integer', description: 'The work item id' },
    title: { type: 'string' },
    root: { type: 'string', description: 'Absolute path of the folder that holds the repos' },
    phase: { enum: PHASES.map(([k]) => k) },
    specUrl: { type: 'string', description: 'The spec doc: a https://claude.ai/ link or a file:/// path' },
    summaryUrl: { type: 'string', description: 'The change summary page: a https://claude.ai/ link or a file:/// path' },
    repos: {
      type: 'array',
      description: "The plan's repos. Edits elsewhere are refused.",
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string', description: 'Absolute path' },
          base: { type: 'string', description: 'Base branch' },
          tests: { enum: ['passed', 'failed'], description: 'Last test run' },
        },
        required: ['name', 'path', 'base'],
      },
    },
    ac: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          status: { enum: ['todo', 'done', 'verified'] },
          evidence: { type: 'string', description: 'Where it is met: tests, files' },
        },
        required: ['text', 'status'],
      },
    },
    decisions: {
      type: 'array',
      description: 'Every choice the spec and criteria do not settle. One without a choice is waiting for the user.',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          choice: { type: 'string' },
          why: { type: 'string' },
          by: { enum: ['user', 'claude'] },
        },
        required: ['question'],
      },
    },
    prs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { repo: { type: 'string' }, url: { type: 'string' } },
        required: ['repo', 'url'],
      },
    },
  },
  required: ['id'],
}

export const isText = (v: unknown): v is string => typeof v === 'string'
const isLink = (v: unknown) => isText(v) && (v.startsWith('https://claude.ai/') || v.startsWith('file:///'))
const isAbsolute = (v: unknown) => isText(v) && v.startsWith('/')
const trim = (p: string) => p.replace(/\/+$/, '')
const list = <T,>(v: unknown, keep: (x: any) => boolean): T[] | undefined =>
  Array.isArray(v) ? (v.filter(x => x && keep(x)) as T[]) : undefined

// Model input → a checked update; undefined when the id or a link is unusable.
export function parseUpdate(input: unknown): FeatureUpdate | null {
  const i = (input ?? {}) as Record<string, unknown>
  if (!Number.isInteger(i.id)) return null
  if ((i.specUrl !== undefined && !isLink(i.specUrl)) || (i.summaryUrl !== undefined && !isLink(i.summaryUrl))) return null

  const u: FeatureUpdate = { id: i.id as number }
  if (isText(i.title)) u.title = i.title
  if (isAbsolute(i.root)) u.root = trim(i.root as string)
  if (isText(i.phase) && order(i.phase as FeaturePhase) >= 0) u.phase = i.phase as FeaturePhase
  if (isText(i.specUrl)) u.specUrl = i.specUrl
  if (isText(i.summaryUrl)) u.summaryUrl = i.summaryUrl
  const repos = list<FeatureRepo>(i.repos, r => isText(r.name) && isAbsolute(r.path) && isText(r.base))
  if (repos) u.repos = repos.map(r => ({ ...r, path: trim(r.path) }))
  const ac = list<Feature['ac'][number]>(i.ac, c => isText(c.text) && ['todo', 'done', 'verified'].includes(c.status))
  if (ac) u.ac = ac
  const decisions = list<Feature['decisions'][number]>(i.decisions, d => isText(d.question))
  if (decisions) u.decisions = decisions
  const prs = list<Feature['prs'][number]>(i.prs, p => isText(p.repo) && isText(p.url) && p.url.startsWith('https://dev.azure.com/'))
  if (prs) u.prs = prs

  return u
}

// Merges an update. Moving forward past a gate needs its band button; moving back re-opens the gates after it.
export function applyUpdate(current: Feature | null, u: FeatureUpdate): { feature?: Feature; error?: string } {
  if (!current) {
    if (!u.title || !u.root) return { error: `No feature AB#${u.id} yet: start it with id, title and root.` }
    current = { id: u.id, title: u.title, root: u.root, phase: 'story', repos: [], ac: [], decisions: [], prs: [], approvals: {} }
  }

  const { phase: want = current.phase, ...fields } = u
  const approvals: FeatureApprovals = { ...current.approvals }
  if (order(want) <= order('spec')) Object.assign(approvals, { spec: false, plan: false, push: false })
  else if (order(want) <= order('plan')) Object.assign(approvals, { plan: false, push: false })
  else if (order(want) <= order('build')) approvals.push = false

  // Only a step back resets; standing still or moving on keeps what was approved.
  const kept = order(want) < order(current.phase) ? approvals : current.approvals
  const needs = [
    order(want) >= order('plan') && !kept.spec ? 'Approve spec' : '',
    order(want) >= order('build') && !kept.plan ? 'Approve plan' : '',
    order(want) >= order('pr') && !kept.push ? 'Commit & PR' : '',
  ].filter(Boolean)
  const phase = needs.length ? current.phase : want
  const error = needs.length
    ? `Still in ${labelOf(current.phase)}: ${labelOf(want)} needs ${needs.join(' and ')} pressed in the band.`
    : undefined

  return { feature: { ...current, ...fields, id: current.id, phase, approvals: kept }, error }
}

export function editBlock(f: Feature | null, path: string): { reason?: string; repo?: FeatureRepo } {
  if (!f || f.phase === 'done' || !path.startsWith(`${f.root}/`) || path.startsWith(`${f.root}/.midas/`)) return {}
  if (!f.approvals.spec || !f.approvals.plan) {
    return { reason: `AB#${f.id} is in ${labelOf(f.phase)}: code waits until the spec and plan are approved in the band.` }
  }

  const repo = f.repos.find(r => path.startsWith(`${r.path}/`))
  if (!repo) {
    return {
      reason: `${path} is outside the planned repos of AB#${f.id}. Ask the user; if they agree, add the repo with feature_status, then edit.`,
    }
  }

  return { repo }
}

export const baseBranchReason = (repo: FeatureRepo, branch: string) =>
  branch && (branch === repo.base || PROTECTED.includes(branch))
    ? `${repo.name} is on ${branch}. Create the feature branch first.`
    : undefined

// `git commit` / `git push` (global options like -C may come first), or `az repos pr create`.
// Matched at the subcommand, so `git log -- src/commit.ts` still runs.
export const GATED = /\bgit(?:\s+(?:-[Cc]\s+\S+|--[\w-]+(?:=\S+)?))*\s+(?:commit|push)\b|\baz\s+repos\s+pr\s+create\b/

const shipBlocked = (f: Feature | null) => f !== null && f.phase !== 'done' && !f.approvals.push
const shipReason = (f: Feature) =>
  `Commits, pushes and pull requests for AB#${f.id} wait for Commit & PR in the band: the user reviews the uncommitted changes first.`

const SEGMENTS = /&&|\|\||;|\||\n/
const tokensOf = (segment: string) => segment.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? []

// Commands that can throw away uncommitted work: git ones are refused, `rm -r` inside the workspace is put to the user.
export function destructiveOp(command: string, root: string): { op: string; isAsked?: boolean } | undefined {
  for (const segment of command.split(SEGMENTS)) {
    const t = tokensOf(segment)

    if (t[0] === 'git') {
      let i = 1
      while (i < t.length && t[i]!.startsWith('-')) i += t[i] === '-C' || t[i] === '-c' ? 2 : 1
      const [sub, ...args] = t.slice(i)
      const has = (...flags: string[]) => args.some(a => flags.includes(a))

      if (sub === 'stash' && !['list', 'show'].includes(args[0] ?? '')) return { op: 'git stash' }
      if (sub === 'reset' && has('--hard')) return { op: 'git reset --hard' }
      if (sub === 'checkout' && has('--', '.')) return { op: 'git checkout of files' }
      if (sub === 'restore' && !(has('--staged', '-S') && !has('--worktree', '-W'))) return { op: 'git restore' }
      if (sub === 'clean' && args.some(a => a === '--force' || /^-[a-zA-Z]*f/.test(a))) return { op: 'git clean' }
      if (sub === 'push' && args.some(a => a === '-f' || a.startsWith('--force'))) return { op: 'git push --force' }
      if (sub === 'branch' && has('-D')) return { op: 'git branch -D' }
    }

    if (t[0] === 'rm' && t.slice(1).some(a => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')) {
      const targets = t.slice(1).filter(a => !a.startsWith('-'))
      if (targets.some(p => !p.startsWith('/') || p === root || p.startsWith(`${root}/`))) return { op: 'rm -r', isAsked: true }
    }
  }

  return undefined
}

export function reminderText(f: Feature): string {
  const passed = (isOn?: boolean) => (isOn ? 'passed' : 'not yet')
  return [
    `A /feature workflow is in progress: AB#${f.id} "${f.title}", phase ${labelOf(f.phase)}.`,
    `Gates: Approve spec ${passed(f.approvals.spec)}, Approve plan ${passed(f.approvals.plan)}, Commit & PR ${passed(f.approvals.push)}. Only the user's band buttons pass them; changes stay uncommitted until Commit & PR.`,
    `If the /agentic-midas:feature skill's instructions are no longer in your context (after compaction, for example), invoke that skill again with ${f.id} before going on, and call feature_status with the id to reload the saved state.`,
  ].join('\n')
}

// The system prompt section that keeps a feature in view after compaction; none when no feature is in progress.
export async function featureSection($: EngineInterface) {
  const f = await read($, feature)
  if (!f || f.phase === 'done') return []

  return [{ id: 'agentic-midas:feature', text: reminderText(f), scope: 'session' as const }]
}

export const trackerText = (phase: FeaturePhase) =>
  PHASES.slice(0, -1)
    .map(([k, label], i) => (i < order(phase) ? `${label} ✓` : k === phase ? `${label} ●` : label))
    .join(' › ')

export function statusText(f: Feature, snaps: readonly RepoGit[]): string {
  const parts = [`AB#${f.id}`, labelOf(f.phase)]
  if (f.repos.length) parts.push(`${snaps.filter(s => s.changed || s.ahead).length}/${f.repos.length} repos changed`)
  if (f.ac.length) parts.push(`${f.ac.filter(c => c.status !== 'todo').length}/${f.ac.length} AC`)
  const waiting = f.decisions.filter(d => !d.choice).length
  if (waiting) parts.push(`${waiting} waiting`)

  return parts.join(' · ')
}

const linksOf = (f: Feature) => [
  ...(f.specUrl ? [{ href: f.specUrl, label: 'Spec' }] : []),
  ...(f.summaryUrl ? [{ href: f.summaryUrl, label: 'Summary' }] : []),
  ...f.prs.map(p => ({ href: p.url, label: `PR ${p.repo}` })),
]

export function paneMarkdown(f: Feature, snaps: readonly RepoGit[], files: Record<string, string[]>): string {
  const out = [`### [AB#${f.id}](${ITEM_URL}${f.id}) ${f.title}`, trackerText(f.phase)]
  const links = linksOf(f).map(l => `[${l.label}](${l.href})`)
  if (links.length) out.push(links.join(' · '))

  if (f.repos.length) {
    const rows = f.repos.map(r => {
      const s = snaps.find(x => x.name === r.name)
      return `| ${r.name} | ${s?.branch || '?'} | ${r.base} | ${s?.changed ?? 0} | ${s?.ahead ?? 0} | ${r.tests ?? '–'} |`
    })
    out.push(['#### Repos', '', '| Repo | Branch | Base | Changed | Ahead | Tests |', '|---|---|---|---|---|---|', ...rows].join('\n'))
  }

  const edited = Object.entries(files)
  if (edited.length) {
    out.push(['#### Edited this session', '', ...edited.map(([repo, paths]) => `- **${repo}**: ${paths.map(p => `\`${p}\``).join(', ')}`)].join('\n'))
  }

  if (f.ac.length) {
    const lines = f.ac.map(c => `- [${c.status === 'todo' ? ' ' : 'x'}] ${c.text}${c.status === 'verified' ? ' · verified' : ''}${c.evidence ? ` — ${c.evidence}` : ''}`)
    out.push(['#### Acceptance criteria', '', ...lines].join('\n'))
  }

  const waiting = f.decisions.filter(d => !d.choice)
  const made = f.decisions.filter(d => d.choice)
  if (waiting.length) out.push(['#### Decisions waiting', '', ...waiting.map(d => `- ${d.question}`)].join('\n'))
  if (made.length) {
    const lines = made.map(d => `- ${d.question} → **${d.choice}**${d.by ? ` (${d.by})` : ''}${d.why ? `: ${d.why}` : ''}`)
    out.push(['#### Decisions made', '', ...lines].join('\n'))
  }

  return out.join('\n\n')
}

function say($: EngineInterface, text: string) {
  void $.prompt.submit({ text, asUser: true })
}

async function snapshot($: EngineInterface, repo: FeatureRepo): Promise<RepoGit> {
  const run = async (...args: string[]) => {
    try {
      const r = await $.process.run(['git', '--no-optional-locks', ...args], { cwd: repo.path })
      return r.exitCode === 0 ? r.stdout.trim() : ''
    } catch {
      return ''
    }
  }
  const [branch, status, ahead] = await Promise.all([
    run('rev-parse', '--abbrev-ref', 'HEAD'),
    run('status', '--porcelain'),
    run('rev-list', '--count', `origin/${repo.base}..HEAD`),
  ])

  return { name: repo.name, branch, changed: status ? status.split('\n').length : 0, ahead: Number(ahead) || 0 }
}

async function refresh($: EngineInterface) {
  const f = await read($, feature)
  if (!f) return $.ui.status(undefined)

  const snaps = await Promise.all(f.repos.map(r => snapshot($, r)))
  await update($, git, () => snaps)
  $.ui.status(statusText(f, snaps))
}

async function save($: EngineInterface, f: Feature) {
  await update($, feature, () => f)
  await $.store.set(storeKey(f.id), f)
  await refresh($)
}

async function approve($: EngineInterface, gate: keyof FeatureApprovals, text: string) {
  const f = await read($, feature)
  if (!f) return

  await save($, { ...f, approvals: { ...f.approvals, [gate]: true } })
  say($, text)
}

async function close($: EngineInterface, isDone: boolean) {
  const f = await read($, feature)
  if (!f) return

  if (isDone) await $.store.delete(storeKey(f.id))
  else $.ui.toast(`Paused AB#${f.id}. /agentic-midas:feature ${f.id} picks it up again.`)
  await update($, feature, () => null)
  await update($, touched, () => ({}))
  $.ui.status(undefined)
}

export const pathOf = (input: unknown) => {
  const i = (input ?? {}) as { file_path?: unknown; notebook_path?: unknown }
  return isText(i.file_path) ? i.file_path : isText(i.notebook_path) ? i.notebook_path : ''
}

type Gate = { key: string; label: string; approval: keyof FeatureApprovals; text: string }

export function gateOf(f: Feature): Gate | undefined {
  if (f.phase === 'spec' && f.specUrl && !f.approvals.spec) return { key: 'approve-spec', label: 'Approve spec', approval: 'spec', text: APPROVE_SPEC }
  if (f.phase === 'plan' && !f.approvals.plan) return { key: 'approve-plan', label: 'Approve plan', approval: 'plan', text: APPROVE_PLAN }
  if (f.phase === 'review' && f.summaryUrl && !f.approvals.push) return { key: 'ship', label: 'Commit & PR', approval: 'push', text: SHIP }
  return undefined
}

// Registered from register.tsx's one session.start hook.
export const FEATURE_TOOL_SPEC = {
  name: 'feature_status',
  description:
    "Record a /feature workflow's state: phase, spec and summary links, planned repos, acceptance criteria, decisions, PRs. Send the id plus what changed (lists replace). The id alone returns the saved state, to resume. Phases past a gate need the user's band button; edits outside the planned repos, and commits, pushes and PRs before Commit & PR, are refused.",
  inputSchema: SCHEMA,
}

export function registerFeature(on: On) {
  // Recording state only draws the band.
  on('tool.check', { tool: FEATURE_TOOL }, () => ({ decision: 'allow' }))

  on('tool.call', { tool: FEATURE_TOOL }, async ($, e) => {
    const u = parseUpdate(e)
    if (!u) return { result: 'Not saved: an integer id is required, and links must be https://claude.ai/ or file:///.', isError: true }

    const active = await read($, feature)
    const current = active?.id === u.id ? active : (((await $.store.get(storeKey(u.id))) as Feature | undefined) ?? null)
    const { feature: f, error } = applyUpdate(current, u)
    if (!f) return { result: error ?? 'Not saved.', isError: true }

    await save($, f)
    if (current?.phase !== f.phase || active?.id !== f.id) $.ui.toast(`AB#${f.id}: ${labelOf(f.phase)}`)

    const state = JSON.stringify({ ...f, git: await read($, git) })
    return error ? { result: `${error}\n\n${state}`, isError: true } : { result: state }
  })

  on('tool.check', { tool: EDIT_TOOLS }, async ($, e, next) => {
    const { reason, repo } = editBlock(await read($, feature), pathOf(e.input))
    const why = reason ?? (repo ? baseBranchReason(repo, (await snapshot($, repo)).branch) : undefined)

    return why ? { decision: 'deny', reason: why } : next(e)
  })

  // Subagents' calls come through here too.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const f = await read($, feature)
    const command = (e.input as { command?: unknown } | undefined)?.command
    if (!f || f.phase === 'done' || !isText(command)) return next(e)

    const destructive = destructiveOp(command, f.root)
    if (destructive?.isAsked) {
      return { decision: 'ask', reason: `${destructive.op} inside the workspace can delete AB#${f.id}'s unreviewed work.` }
    }
    if (destructive) {
      return {
        decision: 'deny',
        reason: `${destructive.op} could throw away AB#${f.id}'s uncommitted, unreviewed changes. If the user really wants it, they run it themselves.`,
      }
    }

    return shipBlocked(f) && GATED.test(command) ? { decision: 'deny', reason: shipReason(f) } : next(e)
  })

  on('tool.check', { tool: /azure-devops__repo_pull_request_write$/ }, async ($, e, next) => {
    const f = await read($, feature)

    return f && shipBlocked(f) ? { decision: 'deny', reason: shipReason(f) } : next(e)
  })

  // Remember what Claude edited, per planned repo.
  on('tool.call', { tool: EDIT_TOOLS }, async ($, e, next) => {
    const ran = await next(e)
    const f = await read($, feature)
    const path = pathOf(e)
    if (!f || !path || ran.deny !== undefined || ran.isError) return ran

    const repo = f.repos.find(r => path.startsWith(`${r.path}/`))
    const name = repo?.name ?? 'outside'
    const shown = repo ? path.slice(repo.path.length + 1) : path
    await update($, touched, t => ({ ...t, [name]: [...new Set([...(t[name] ?? []), shown])].slice(-30) }))
    await refresh($)

    return ran
  })

  // Branch switches and commits change the repo rows.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (await read($, feature)) await refresh($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Markdown, Text } = $.ui.resolve(e)
    const f = await read($, feature)
    if (!f) return <Text dimColor>No feature in progress.</Text>

    return <Markdown text={paneMarkdown(f, await read($, git), await read($, touched))} />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, feature)
    // A work item draft has the band while it is open.
    if (!f || e.props.hasSurvey || (await read($, draft))) return next(e)

    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const snaps = await read($, git)
    const waiting = f.decisions.filter(d => !d.choice).length
    const gate = gateOf(f)
    const isDone = f.phase === 'done'
    const canComment = (f.phase === 'spec' || f.phase === 'plan') && f.specUrl !== undefined
    const room = Math.max(0, e.props.maxRows - 2)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Link href={`${ITEM_URL}${f.id}`} label={`AB#${f.id} ↗`} />
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text bold wrap="truncate">
              {f.title}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text dimColor>{isDone ? 'Done ✓' : trackerText(f.phase)}</Text>
          </Box>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={1}>
          {linksOf(f).map(l => (
            <Link href={l.href} label={l.label} />
          ))}
          <Box flexGrow={1} />
          {e.props.isWorking ? (
            <Text dimColor>Claude is working…</Text>
          ) : (
            <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
              {waiting > 0 && (
                <Button key="decisions" label={`${waiting} decision${waiting === 1 ? '' : 's'} waiting`} onPress={() => say($, DECISIONS)} />
              )}
              {canComment && <Button key="action" label="Action comments" onPress={() => say($, ACTION_SPEC)} />}
              {gate && <Button key={gate.key} label={gate.label} variant="primary" onPress={() => approve($, gate.approval, gate.text)} />}
              <Button key="details" label="Details" plain onPress={() => $.ui.open({ id: PANE, title: `AB#${f.id}` })} />
              <Button key="close" label={isDone ? 'Dismiss' : 'Pause'} plain onPress={() => close($, isDone)} />
            </Box>
          )}
        </Box>
        {snaps.slice(0, room).map(s => {
          const repo = f.repos.find(r => r.name === s.name)
          const isOnBase = s.branch !== '' && (s.branch === repo?.base || PROTECTED.includes(s.branch))
          return (
            <Text wrap="truncate">
              <Text bold>{s.name}</Text>
              <Text color={isOnBase && s.changed ? 'warning' : undefined} dimColor={!(isOnBase && s.changed)}>
                {'  '}
                {s.branch || '?'} ← {repo?.base}
              </Text>
              <Text dimColor>
                {'  '}
                {s.changed} changed · {s.ahead} ahead{repo?.tests ? ` · tests ${repo.tests}` : ''}
              </Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
