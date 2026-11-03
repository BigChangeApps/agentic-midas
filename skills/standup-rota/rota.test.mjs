// node --test skills/standup-rota/rota.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { page, pickHosts, weekStart } from './rota.mjs'

test('one host a day, nobody twice while someone else is free, the only free person keeps their day', () => {
  for (let run = 0; run < 50; run++) {
    const hosts = pickHosts([
      { day: 1, people: ['A', 'B', 'C'] },
      { day: 2, people: ['A', 'B', 'C'] },
      { day: 3, people: ['A'] },
      { day: 4, people: [] },
    ]).map(s => s.host)
    assert.equal(hosts[2], 'A')
    assert.equal(hosts[3], undefined)
    assert.deepEqual(hosts.slice(0, 2).sort(), ['B', 'C'])
  }
})

test('more days than people spreads the days evenly', () => {
  const slots = [1, 2, 3, 4, 5].map(day => ({ day, people: ['A', 'B'] }))
  const a = pickHosts(slots).filter(s => s.host === 'A').length
  assert.ok(a === 2 || a === 3)
})

test('week start is the Monday of this week, next week or the given date', () => {
  const tuesday = new Date(2026, 10, 3)
  assert.equal(weekStart('this', tuesday), Date.UTC(2026, 10, 2))
  assert.equal(weekStart(undefined, tuesday), Date.UTC(2026, 10, 9))
  assert.equal(weekStart('2026-11-15'), Date.UTC(2026, 10, 9))
  assert.throws(() => weekStart('soon'))
})

test('the image page shows the range, first names, who is off and why there is no standup, and escapes names', () => {
  const html = page([
    { day: Date.UTC(2026, 9, 30), people: [], off: ['Rowan Hanson'], host: 'Juan Betancur' },
    { day: Date.UTC(2026, 10, 2), people: [], off: [], why: 'team day off' },
  ])
  assert.match(html, /<p>30 October – 2 November<\/p>/)
  assert.match(html, /<b>Juan<\/b>.*>Rowan</)
  assert.match(html, /<td>Monday<\/td>.*team day off/)
  assert.doesNotMatch(page([{ day: 0, people: [], off: [], host: '<x>' }]), /<x>/)
})
