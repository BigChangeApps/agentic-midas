import { expect, mock, test } from 'claude-code/testing'

import { isOpen, isStateFile, subagentVerdict, taskReminderText, taskStatusOf } from './develop'

const STATE = `orchestrator:
  completed_phases: [1, 2]
  options:
    html_output: true
task:
  title: Send quote by email
  description: |
    The customer gets the quote
  status: in_progress
task_context:
  status: ignored
`

test('only a .midas task state file names a running task', async () => {
  expect(isStateFile('/ws/job-finance/.midas/tasks/development/2026-10-22-361453-send-quote/orchestrator-state.yml')).toBe(true)
  expect(isStateFile('/ws/job-finance/.midas/tasks/development/orchestrator-state.yml')).toBe(false)
  expect(isStateFile('/ws/job-finance/src/orchestrator-state.yml')).toBe(false)
})

test('the task status is read from the task block, not from other blocks', async () => {
  expect(taskStatusOf(STATE)).toBe('in_progress')
  expect(taskStatusOf(STATE.replace('status: in_progress', 'status: completed'))).toBe('completed')
  expect(taskStatusOf('task_context:\n  status: in_progress\n')).toBeUndefined()
  expect(taskStatusOf('')).toBeUndefined()
})

test('pending, in-progress and blocked tasks are open; finished or unknown ones are not', async () => {
  expect(isOpen('in_progress')).toBe(true)
  expect(isOpen('blocked')).toBe(true)
  expect(isOpen('completed')).toBe(false)
  expect(isOpen('failed')).toBe(false)
  expect(isOpen(undefined)).toBe(false)
})

test('the reminder names the state file and the gate rule', async () => {
  const text = taskReminderText('/ws/.midas/tasks/development/t/orchestrator-state.yml')
  expect(text).toContain('/ws/.midas/tasks/development/t/orchestrator-state.yml')
  expect(text).toContain('/agentic-midas:develop')
  expect(text).toContain('AskUserQuestion')
})

test('subagents are refused git commands that discard work and asked about rm -r', async () => {
  expect(subagentVerdict('git stash')?.decision).toBe('deny')
  expect(subagentVerdict('git -C /ws/repo reset --hard HEAD')?.decision).toBe('deny')
  expect(subagentVerdict('git push --force')?.decision).toBe('deny')
  expect(subagentVerdict('rm -rf bin obj')?.decision).toBe('ask')
  expect(subagentVerdict('git status && dotnet test')).toBeUndefined()
  expect(subagentVerdict('git stash list')).toBeUndefined()
})

test('the guard applies inside a subagent loop and leaves the main loop alone', async ($, on) => {
  mock.store(on)
  on('tool.check', () => ({ decision: 'allow' }))
  const bash = (command: string, agentId?: string) =>
    $.tool.check({ tool: 'Bash', input: { command }, agentId }).then(r => r.decision)

  expect(await bash('git stash')).toBe('allow')
  expect(await bash('git stash', 'agent-1')).toBe('deny')
  expect(await bash('dotnet test', 'agent-1')).toBe('allow')
})
