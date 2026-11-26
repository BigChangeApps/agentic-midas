#!/usr/bin/env node
// The home repo's map of code repos (.midas/repos.json): render it into the home's CLAUDE.md, and check local clones against it.
// Usage: node ${CLAUDE_PLUGIN_ROOT}/scripts/midas-repos.mjs render [--write|--check] | check [--root DIR]   (both take --home DIR)
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { flagValue, runCli } from './cli.mjs'
import { resolveMidasPaths } from './midas-paths.mjs'
import { MAP_FILE, RepoMapError, STACKS, findRepoByRemote, originOf, readRepoMap, remoteKey } from './repo-map.mjs'

export const REPO_MAP_START = '<!-- midas:repos:start -->'
export const REPO_MAP_END = '<!-- midas:repos:end -->'

const repoLine = repo => `- **${repo.name}** — ${repo.summary} Folder \`${repo.folder}\`, base \`${repo.baseBranch}\`. Remote \`${repo.remote}\``

export function renderRepoMap(repos) {
  const stacks = STACKS.filter(stack => repos.some(repo => repo.stack === stack)).map(stack =>
    [`### ${stack}`, '', ...repos.filter(repo => repo.stack === stack).map(repoLine)].join('\n'),
  )

  return [
    REPO_MAP_START,
    `<!-- Generated from ${MAP_FILE} by agentic-midas: edit the JSON, then run \`midas-repos.mjs render --write\`. -->`,
    '## Repos',
    '',
    'Each repo is cloned once, next to this one, in the folder named here. Recognise a clone by its `origin` remote, not by its folder name.',
    '',
    stacks.join('\n\n'),
    REPO_MAP_END,
  ].join('\n')
}

const occurrences = (text, marker) => text.split(marker).length - 1

// Replaces the one generated section, or appends it when there is none. Anything else is left for a person to fix.
export function updateClaudeMd(existing, section) {
  const [starts, ends] = [occurrences(existing, REPO_MAP_START), occurrences(existing, REPO_MAP_END)]
  if (starts === 0 && ends === 0) return existing.trim() ? `${existing.trimEnd()}\n\n${section}\n` : `${section}\n`

  const start = existing.indexOf(REPO_MAP_START)
  const end = existing.indexOf(REPO_MAP_END)
  if (starts === 1 && ends === 1 && start < end) return existing.slice(0, start) + section + existing.slice(end + REPO_MAP_END.length)

  throw new RepoMapError(
    `CLAUDE.md has ${starts} "${REPO_MAP_START}" and ${ends} "${REPO_MAP_END}" markers. Keep one pair, start before end, or remove both; then render again.`,
  )
}

function isFolder(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// The git folders directly under `root`, symlinked ones included, with their origin remote (null when they have none).
export function scanClones(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() || (entry.isSymbolicLink() && isFolder(join(root, entry.name))))
    .map(entry => join(root, entry.name))
    .filter(dir => existsSync(join(dir, '.git')))
    .map(dir => ({ dir, remote: originOf(dir) }))
}

export function checkClones(repos, clones) {
  const clonesOf = repo => clones.filter(c => c.remote && remoteKey(c.remote) === remoteKey(repo.remote)).map(c => c.dir)

  return {
    found: repos.filter(repo => clonesOf(repo).length > 0).map(repo => ({ name: repo.name, dirs: clonesOf(repo) })),
    missing: repos.filter(repo => clonesOf(repo).length === 0).map(({ name, folder, remote }) => ({ name, folder, remote })),
    unmapped: clones.filter(c => c.remote && !findRepoByRemote(repos, c.remote)),
    noRemote: clones.filter(c => !c.remote).map(c => c.dir),
  }
}

function formatReport({ found, missing, unmapped, noRemote }) {
  return [
    ...found.map(f => `Found: ${f.name} (${f.dirs.join(', ')})`),
    ...missing.map(m => `Missing: ${m.name} (clone into ${m.folder} from ${m.remote})`),
    ...unmapped.map(u => `Not in the map: ${u.dir} (${u.remote})`),
    ...noRemote.map(dir => `No origin remote, so not matched: ${dir}`),
  ].join('\n')
}

function homeFrom(args) {
  const given = flagValue(args, '--home')
  if (given) return resolve(given)

  const { home } = resolveMidasPaths()
  if (!home) throw new RepoMapError('No home repo found: pass --home DIR or set MIDAS_HOME.')
  return home
}

function render(home, args) {
  const section = renderRepoMap(readRepoMap(home))
  const file = join(home, 'CLAUDE.md')
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const next = updateClaudeMd(current, section)

  if (args.includes('--check')) {
    if (next === current) return 0
    process.stderr.write(`${file} is out of date with ${MAP_FILE}: run midas-repos.mjs render --write.\n`)
    return 1
  }
  if (args.includes('--write')) {
    writeFileSync(file, next)
    return 0
  }

  process.stdout.write(`${section}\n`)
  return 0
}

const realpathOr = path => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

function check(home, args) {
  const homeReal = realpathOr(home)
  const clones = scanClones(resolve(flagValue(args, '--root') ?? dirname(home))).filter(c => realpathOr(c.dir) !== homeReal)
  const report = checkClones(readRepoMap(home), clones)
  const text = formatReport(report)

  if (text) process.stdout.write(`${text}\n`)
  return report.missing.length > 0 ? 1 : 0
}

const USAGE = 'Usage: midas-repos.mjs render [--write|--check] [--home DIR] | check [--root DIR] [--home DIR]'

await runCli(import.meta.url, ([command, ...args]) => {
  if (command === 'render') return render(homeFrom(args), args)
  if (command === 'check') return check(homeFrom(args), args)
  throw new Error(USAGE)
})
