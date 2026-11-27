#!/usr/bin/env node
// Reads an Epic's (or a single Feature's) tree from Azure DevOps and works out, from each child's state history,
// each Feature's Start date, Target date and state, and the Epic's state. Read-only: it never writes to ADO.
// Prints JSON to stdout, with `changes` listing every field it would set.
//
// Usage: node feature-progress.mjs <epicOrFeatureId> [--org bigchange] [--project BigChange]
// Auth:  az CLI (az account get-access-token), as the signed-in user.
// Tests: node --test skills/feature-progress/feature-progress.test.mjs

import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Child states. An item that skipped Implementation started when it first reached a later state.
const START_STATES = ['Implementation', 'Approval', 'Approved', 'Merge', 'Closed']
const DONE_STATE = 'Closed'
const IGNORED_STATES = ['Removed']
// Feature states: New, Analysing, Ready, In Progress, Closed, Removed.
const FEATURE_NOT_STARTED = ['New', 'Analysing', 'Ready']
// Epic states: Backlog (Funnel), Analysing, Review, Portfolio Backlog, Implementing - Persevere, Implementing - MVP, Closed, Removed.
const EPIC_NOT_STARTED = ['Backlog (Funnel)', 'Analysing', 'Review', 'Portfolio Backlog']

// The calendar day in the UK, where the team works, for an ISO timestamp.
export const ukDate = iso =>
  iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso)) : null

// From a child's state moves (oldest first): the day it started, and the day it closed if it's Closed now.
export function workDates(moves, currentState) {
  const started = moves.find(m => START_STATES.includes(m.to))
  const lastClose = currentState === DONE_STATE ? moves.filter(m => m.to === DONE_STATE).at(-1) : null
  return {
    started: started ? ukDate(started.at) : null,
    startedVia: started?.to ?? null,
    closed: lastClose ? ukDate(lastClose.at) : null,
  }
}

// A Feature from its children: start = earliest start, end = latest close once every counted child is Closed.
export function rollUp(children) {
  const counted = children.filter(c => !IGNORED_STATES.includes(c.state))
  const starts = counted.filter(c => c.work.started).sort((x, y) => x.work.started.localeCompare(y.work.started))
  const closes = counted.filter(c => c.work.closed).sort((x, y) => x.work.closed.localeCompare(y.work.closed))
  const open = counted.filter(c => !c.work.closed)
  const allClosed = counted.length > 0 && open.length === 0
  return {
    startDate: starts[0]?.work.started ?? null,
    startSetBy: starts[0]?.id ?? null,
    targetDate: allClosed ? closes.at(-1).work.closed : null,
    targetSetBy: allClosed ? closes.at(-1).id : null,
    counted: counted.length,
    open: open.map(c => ({ id: c.id, type: c.type, state: c.state })),
  }
}

// A Feature's state follows its children. With no counted children it's left alone (an empty bugs feature
// someone closed stays closed).
export function featureState(current, p) {
  if (current === 'Removed' || !p.counted) return current
  if (p.targetDate) return 'Closed'
  if (p.startDate) return 'In Progress'
  return FEATURE_NOT_STARTED.includes(current) ? current : 'Ready'
}

// The Epic from its Features' states after this run, Removed ones aside.
export function epicState(current, featureStates) {
  const counted = featureStates.filter(s => s !== 'Removed')
  if (current === 'Removed') return current
  if (counted.length && counted.every(s => s === 'Closed')) return 'Closed'
  if (counted.some(s => s === 'In Progress' || s === 'Closed') && EPIC_NOT_STARTED.includes(current))
    return 'Implementing - MVP'
  return current
}

// Every field to set; `to: null` clears it. The Start date always follows the children, so a Feature with nothing
// started loses its Start date. The Target date is only ever set: while work is open it's left as it is.
export function changes(result) {
  const out = []
  const add = (item, field, from, to) => to && to !== from && out.push({ id: item.id, field, from, to })
  for (const ft of result.features) {
    if (ft.startDate && !ft.proposed.startDate)
      out.push({ id: ft.id, field: 'Microsoft.VSTS.Scheduling.StartDate', from: ft.startDate, to: null })
    add(ft, 'Microsoft.VSTS.Scheduling.StartDate', ft.startDate, ft.proposed.startDate)
    add(ft, 'Microsoft.VSTS.Scheduling.TargetDate', ft.targetDate, ft.proposed.targetDate)
    add(ft, 'System.State', ft.state, ft.proposed.state)
  }
  if (result.epic) add(result.epic, 'System.State', result.epic.state, result.epic.proposed.state)
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const rootId = Number(args.find(a => /^\d+$/.test(a)))
  const opt = (name, def) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : def)
  if (!rootId) {
    console.error('Usage: node feature-progress.mjs <epicOrFeatureId> [--org bigchange] [--project BigChange]')
    process.exit(2)
  }

  let token
  try {
    token = execSync(
      'az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv',
      { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
  } catch {
    console.error('Could not get an Azure DevOps token from az. Run `az login` and try again.')
    process.exit(4)
  }
  const base = `https://dev.azure.com/${opt('org', 'bigchange')}/${opt('project', 'BigChange')}/_apis/wit`

  const get = async url => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}\n${await res.text()}`)
    return res.json()
  }
  const childIds = wi =>
    (wi.relations ?? [])
      .filter(r => r.rel === 'System.LinkTypes.Hierarchy-Forward')
      .map(r => Number(r.url.split('/').pop()))
  const getItems = async ids => {
    const out = []
    for (let i = 0; i < ids.length; i += 200) {
      const j = await get(`${base}/workitems?ids=${ids.slice(i, i + 200).join(',')}&$expand=relations&api-version=7.1`)
      out.push(...j.value)
    }
    return out
  }
  // Every state change, oldest first.
  const stateHistory = async id => {
    const moves = []
    for (let skip = 0; ; skip += 200) {
      const j = await get(`${base}/workItems/${id}/updates?$top=200&$skip=${skip}&api-version=7.1`)
      for (const u of j.value) {
        const st = u.fields?.['System.State']
        if (st) moves.push({ from: st.oldValue ?? null, to: st.newValue, at: u.fields['System.ChangedDate']?.newValue })
      }
      if (j.value.length < 200) return moves
    }
  }
  const f = (wi, name) => wi.fields[name]
  const summary = wi => ({
    id: wi.id,
    type: f(wi, 'System.WorkItemType'),
    title: f(wi, 'System.Title'),
    state: f(wi, 'System.State'),
    startDate: ukDate(f(wi, 'Microsoft.VSTS.Scheduling.StartDate')),
    targetDate: ukDate(f(wi, 'Microsoft.VSTS.Scheduling.TargetDate')),
  })
  const feature = async feat => {
    const kids = childIds(feat).length ? await getItems(childIds(feat)) : []
    const children = []
    for (const k of kids) {
      const moves = await stateHistory(k.id)
      children.push({
        ...summary(k),
        work: workDates(moves, f(k, 'System.State')),
        moves: moves.map(m => `${ukDate(m.at)} ${m.from ?? '∅'}→${m.to}`),
      })
    }
    const proposed = rollUp(children)
    proposed.state = featureState(f(feat, 'System.State'), proposed)
    return { ...summary(feat), children, proposed }
  }

  const [root] = await getItems([rootId])
  const rootType = f(root, 'System.WorkItemType')
  const result = { epic: null, features: [], other: [] }
  if (rootType === 'Feature') {
    result.features.push(await feature(root))
  } else if (rootType === 'Epic') {
    result.epic = summary(root)
    for (const item of await getItems(childIds(root))) {
      if (f(item, 'System.WorkItemType') === 'Feature') result.features.push(await feature(item))
      else result.other.push(summary(item))
    }
    result.epic.proposed = {
      state: epicState(result.epic.state, result.features.map(ft => ft.proposed.state)),
      notClosed: result.features
        .filter(ft => !['Closed', 'Removed'].includes(ft.proposed.state))
        .map(ft => ({ id: ft.id, state: ft.proposed.state })),
    }
  } else {
    console.error(`${rootId} is a ${rootType}; give an Epic or a Feature`)
    process.exit(3)
  }
  result.changes = changes(result)
  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
