// Picks one standup host per working day of a week from the Midas team's capacity in Azure DevOps:
// people with capacity > 0, minus their days off and the team's days off. Prints the rota as text and
// renders it as a PNG to paste into Slack (copied to the clipboard on macOS).
// Usage: node rota.mjs [this|next|YYYY-MM-DD]   (default next)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DAY = 86_400_000

// shortcut: runs `az`, not `az.cmd`, so it fails on Windows; add that if someone on Windows needs it.
function az(resource, ...route) {
  const args = ['devops', 'invoke', '--org', 'https://dev.azure.com/bigchange', '--area', 'work', '--resource', resource,
    '--route-parameters', 'project=BigChange', 'team=Midas', ...route, '--api-version', '7.1', '-o', 'json']
  return JSON.parse(execFileSync('az', args, { encoding: 'utf8' }))
}

// ADO dates are UTC midnights, and a range's end is its last day.
const within = (day, start, end) => Date.parse(start) <= day && day <= Date.parse(end)

export function weekStart(arg = 'next', now = new Date()) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(arg)
  if (!date && arg !== 'this' && arg !== 'next') throw new Error(`Give this, next or a date (YYYY-MM-DD), not "${arg}"`)
  const base = date ? Date.parse(arg) : Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const monday = base - ((new Date(base).getUTCDay() + 6) % 7) * DAY
  return arg === 'next' ? monday + 7 * DAY : monday
}

// Random order, but nobody hosts twice while someone free that day hasn't hosted yet.
export function pickHosts(slots, random = Math.random) {
  const order = new Map(slots.flatMap(s => s.people).map(p => [p, random()]))
  const hosted = new Map()
  // Fewest choices first, so a day only one person can do keeps that person.
  for (const s of [...slots].sort((a, b) => a.people.length - b.people.length)) {
    s.host = [...s.people].sort((a, b) => (hosted.get(a) ?? 0) - (hosted.get(b) ?? 0) || order.get(a) - order.get(b))[0]
    if (s.host) hosted.set(s.host, (hosted.get(s.host) ?? 0) + 1)
  }
  return slots
}

const esc = s => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
const first = name => name.split(' ')[0]
const date = (day, opts) => new Date(day).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })

// The rota as the team's Slack image: Day, Date, Lead, Off. No today highlight, so it stays valid all week.
export function page(slots) {
  const [from, to] = [slots[0].day, slots.at(-1).day]
  const range = date(from, { month: 'long' }) === date(to, { month: 'long' })
    ? `${date(from, { day: 'numeric' })} – ${date(to, { day: 'numeric', month: 'long' })}`
    : `${date(from, { day: 'numeric', month: 'long' })} – ${date(to, { day: 'numeric', month: 'long' })}`
  const rows = slots.map(s => `<tr><td>${date(s.day, { weekday: 'long' })}</td><td class="muted">${date(s.day, { day: 'numeric', month: 'short' })}</td>`
    + `<td>${s.host ? `<b>${esc(first(s.host))}</b>` : `<span class="muted">${esc(s.why)}</span>`}</td>`
    + `<td class="off">${esc(s.off.map(first).join(', '))}</td></tr>`).join('')
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:28px 28px 20px;background:#fff;color:#1f2533;font:17px/1.3 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
h1{margin:0;font-size:30px;line-height:40px}
p{margin:6px 0 0;color:#5b6270;line-height:24px}
.bar{width:160px;height:8px;border-radius:4px;background:#f5b800;margin:12px 0 22px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{height:44px;text-align:left;font-weight:400;color:#6b7280}
td{height:52px;white-space:nowrap}
th,td{padding:0 14px;border-bottom:1px solid #e5e7eb}
.muted{color:#6b7280}
.off{color:#b5452f}
</style><h1>Catch-up rota</h1><p>${range}</p><div class="bar"></div>
<table><colgroup><col width="24%"><col width="18%"><col width="22%"><col></colgroup>
<tr><th>Day</th><th>Date</th><th>Lead</th><th>Off</th></tr>${rows}</table>`
}

const BROWSERS = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']

function render(slots, monday) {
  const dir = mkdtempSync(join(tmpdir(), 'standup-rota-'))
  const html = join(dir, 'rota.html')
  const png = join(dir, `rota-${new Date(monday).toISOString().slice(0, 10)}.png`)
  writeFileSync(html, page(slots))
  // shortcut: macOS browser paths only; add Linux/Windows ones if someone there needs the image.
  const browser = BROWSERS.find(existsSync)
  if (!browser) return `Image: no Chrome or Edge found, open ${html} in a browser and screenshot it`
  // Fixed row heights in the page, so its height is known up front: header 205 px, then 53 px a row.
  execFileSync(browser, ['--headless', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--window-size=720,${205 + 53 * slots.length}`, `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' })
  if (process.platform !== 'darwin') return `Image: ${png}`
  execFileSync('osascript', ['-e', `set the clipboard to (read (POSIX file "${png}") as «class PNGf»)`])
  return `Image: ${png} (copied to the clipboard)`
}

function main() {
  const monday = weekStart(process.argv[2])
  const slots = [0, 1, 2, 3, 4].map(i => ({ day: monday + i * DAY, people: [], off: [], why: 'no ADO iteration' }))

  for (const it of az('iterations').value) {
    const { startDate, finishDate } = it.attributes
    if (!startDate || !slots.some(s => within(s.day, startDate, finishDate))) continue
    const members = az('capacities', `iterationId=${it.id}`).teamMembers
    const teamOff = az('teamdaysoff', `iterationId=${it.id}`).daysOff
    for (const s of slots.filter(s => within(s.day, startDate, finishDate))) {
      if (teamOff.some(r => within(s.day, r.start, r.end))) { s.why = 'team day off'; continue }
      s.why = members.length ? 'nobody free' : 'no ADO capacity yet'
      for (const m of members.filter(m => m.activities.some(a => a.capacityPerDay > 0))) {
        const off = m.daysOff.some(r => within(s.day, r.start, r.end))
        ;(off ? s.off : s.people).push(m.teamMember.displayName)
      }
    }
  }

  pickHosts(slots)
  console.log(`Standup rota, w/c ${date(monday, { day: 'numeric', month: 'short' })}`)
  for (const s of slots) console.log(`• ${date(s.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${s.host ? first(s.host) : `no standup (${s.why})`}${s.off.length ? `  (off: ${s.off.map(first).join(', ')})` : ''}`)
  console.log(render(slots, monday))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
