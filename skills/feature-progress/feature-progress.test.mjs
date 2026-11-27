// node --test skills/feature-progress/feature-progress.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changes, epicState, featureState, rollUp, ukDate, workDates } from './feature-progress.mjs'

const move = (to, at) => ({ to, at })
const child = (id, state, started, closed) => ({ id, type: 'User Story', state, work: { started, closed } })

test('UK day: a late evening change in summer is the next day in the UK', () => {
  assert.equal(ukDate('2026-07-01T23:30:00Z'), '2026-07-02')
  assert.equal(ukDate('2026-11-12T23:30:00Z'), '2026-11-12')
})

test('a child starts on its first move into Implementation or a later state, whichever came first', () => {
  const moves = [move('New', '2026-11-01T09:00Z'), move('Approval', '2026-11-03T09:00Z'), move('Implementation', '2026-11-05T09:00Z')]
  assert.deepEqual(workDates(moves, 'Implementation'), { started: '2026-11-03', startedVia: 'Approval', closed: null })
})

test('a child reopened and closed again counts from its last close; a reopened one is not closed', () => {
  const moves = [
    move('Implementation', '2026-11-02T09:00Z'),
    move('Closed', '2026-11-04T09:00Z'),
    move('Implementation', '2026-11-06T09:00Z'),
    move('Closed', '2026-11-09T09:00Z'),
  ]
  assert.equal(workDates(moves, 'Closed').closed, '2026-11-09')
  assert.equal(workDates(moves.slice(0, 3), 'Implementation').closed, null)
})

test('a Feature ends only when every child is closed, and Removed children do not count', () => {
  const open = rollUp([child(1, 'Closed', '2026-11-03', '2026-11-05'), child(2, 'Approval', '2026-11-02', null)])
  assert.equal(open.startDate, '2026-11-02')
  assert.equal(open.startSetBy, 2)
  assert.equal(open.targetDate, null)

  const done = rollUp([child(1, 'Closed', '2026-11-03', '2026-11-05'), child(3, 'Removed', null, null)])
  assert.equal(done.targetDate, '2026-11-05')
  assert.equal(done.targetSetBy, 1)
})

test('a Feature with no children, or only Removed ones, has no dates', () => {
  assert.equal(rollUp([]).targetDate, null)
  assert.equal(rollUp([child(3, 'Removed', null, null)]).targetDate, null)
})

test('Feature state follows its children: all closed → Closed, started → In Progress, nothing started → Ready', () => {
  const p = (startDate, targetDate, counted = 1) => ({ startDate, targetDate, counted })
  assert.equal(featureState('Ready', p('2026-11-02', null)), 'In Progress')
  assert.equal(featureState('In Progress', p('2026-11-02', '2026-11-05')), 'Closed')
  assert.equal(featureState('Closed', p('2026-11-02', null)), 'In Progress')
  assert.equal(featureState('In Progress', p(null, null)), 'Ready')
  assert.equal(featureState('Closed', p(null, null)), 'Ready')
  assert.equal(featureState('New', p(null, null)), 'New')
  assert.equal(featureState('Analysing', p(null, null)), 'Analysing')
  assert.equal(featureState('Removed', p('2026-11-02', '2026-11-05')), 'Removed')
})

test('a Feature with no counted children keeps its state', () => {
  assert.equal(featureState('Closed', { startDate: null, targetDate: null, counted: 0 }), 'Closed')
  assert.equal(featureState('In Progress', { startDate: null, targetDate: null, counted: 0 }), 'In Progress')
})

test('Epic state: all Features closed → Closed, any started → Implementing - MVP unless it already started', () => {
  assert.equal(epicState('Review', ['Closed', 'Removed']), 'Closed')
  assert.equal(epicState('Review', ['In Progress', 'New']), 'Implementing - MVP')
  assert.equal(epicState('Implementing - Persevere', ['In Progress']), 'Implementing - Persevere')
  assert.equal(epicState('Review', ['New', 'Ready']), 'Review')
  assert.equal(epicState('Review', []), 'Review')
  assert.equal(epicState('Review', ['Removed']), 'Review')
})

test('changes clear a Start date nothing backs up, keep an open Target date, and skip values that already match', () => {
  const result = {
    epic: null,
    features: [
      { id: 1, state: 'In Progress', startDate: '2026-11-01', targetDate: '2026-12-01',
        proposed: { state: 'In Progress', startDate: null, targetDate: null } },
      { id: 2, state: 'Ready', startDate: '2026-11-03', targetDate: null,
        proposed: { state: 'In Progress', startDate: '2026-11-03', targetDate: null } },
    ],
  }
  assert.deepEqual(changes(result), [
    { id: 1, field: 'Microsoft.VSTS.Scheduling.StartDate', from: '2026-11-01', to: null },
    { id: 2, field: 'System.State', from: 'Ready', to: 'In Progress' },
  ])
})
