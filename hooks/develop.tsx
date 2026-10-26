import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { EDIT_TOOLS, destructiveOp, isText, pathOf } from './feature'

// The task a /develop, /research, /performance or /migration run keeps under .midas/tasks/<type>/<task>/.
const STATE_FILE = /\/\.midas\/tasks\/[^/]+\/[^/]+\/orchestrator-state\.yml$/
const OPEN = ['pending', 'in_progress', 'blocked']

const task = atom({ plugin: 'agentic-midas', key: 'task' } as const, null)

export const isStateFile = (path: string) => STATE_FILE.test(path)

// `task.status` from orchestrator-state.yml: the first `status:` nested under the top-level `task:` key.
export function taskStatusOf(yaml: string): string | undefined {
  const block = /^task:[ \t]*\n((?:[ \t]+.*\n?|[ \t]*\n)*)/m.exec(yaml)?.[1] ?? ''
  return /^[ \t]+status:[ \t]*([\w-]+)/m.exec(block)?.[1]
}

export const isOpen = (status?: string) => status !== undefined && OPEN.includes(status)

export function taskReminderText(statePath: string): string {
  return [
    `A Midas orchestrator workflow is in progress; its state is ${statePath}.`,
    'Before going on, read that file, resume at the first phase not in completed_phases, and if the skill that owns it (named by the task folder: development → /agentic-midas:develop) is no longer in your context, invoke it again with the task folder.',
    'Every MANDATORY GATE still uses AskUserQuestion, whatever the permission mode.',
  ].join('\n')
}

// Subagents never throw away work: git commands that discard changes are refused, `rm -r` is put to the user.
export function subagentVerdict(command: string): { decision: 'deny' | 'ask'; reason: string } | undefined {
  const destructive = destructiveOp(command, '')
  if (!destructive) return undefined

  return destructive.isAsked
    ? { decision: 'ask', reason: `A subagent wants to run ${destructive.op}.` }
    : { decision: 'deny', reason: `Subagents may not run ${destructive.op}: it can throw away uncommitted work. Report back instead.` }
}

export function registerDevelop(on: On) {
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const command = (e.input as { command?: unknown } | undefined)?.command
    const verdict = e.agentId && isText(command) ? subagentVerdict(command) : undefined

    return verdict ?? next(e)
  })

  // The orchestrator writes its state file first, so the write tells which task is running.
  on('tool.call', { tool: EDIT_TOOLS }, async ($, e, next) => {
    const ran = await next(e)
    const path = pathOf(e)
    if (ran.deny === undefined && !ran.isError && isStateFile(path)) await update($, task, () => path)

    return ran
  })

}

// The system prompt section that keeps a running task in view after compaction; none once its status is closed.
export async function taskSection($: EngineInterface) {
  const statePath = await read($, task)
  if (!statePath) return []

  const status = taskStatusOf(await $.fs.read(statePath).catch(() => ''))
  if (!isOpen(status)) {
    await update($, task, () => null)
    return []
  }

  return [{ id: 'agentic-midas:task', text: taskReminderText(statePath), scope: 'session' as const }]
}
