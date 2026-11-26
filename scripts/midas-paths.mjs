#!/usr/bin/env node
// Where the Midas files live for the current session: the code repo's .midas/ and, when there is one, the home repo's.
// Usage: node ${CLAUDE_PLUGIN_ROOT}/scripts/midas-paths.mjs [--cwd DIR]  → JSON on stdout, or the reason on stderr and exit 1.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { flagValue, runCli } from './cli.mjs'
import { MAP_FILE, findRepoByRemote, originOf, readRepoMap } from './repo-map.mjs'

const MIDAS_DIR = '.midas'
const CONFIG_FILE = 'config.yml'
const HOME_ROLE = 'home'
const GIT_NOT_A_REPO = 128
const YAML_NULLS = ['~', 'null']

export class MidasPathsError extends Error {
  name = 'MidasPathsError'
}

const linesOf = yaml => yaml.replace(/^\uFEFF/, '').split(/\r?\n/)
const keyLine = key => new RegExp(`^${key}\\s*:(\\s|$)`)

// A plain or quoted YAML scalar without its comment: `'a # b'` stays whole, `a # b` is `a`.
function scalarOf(raw) {
  const quoted = /^(['"])(.*?)\1/.exec(raw.trim())
  return quoted ? { value: quoted[2], quoted: true } : { value: raw.trim().replace(/(^|\s+)#.*$/, ''), quoted: false }
}

// A top-level `key: value` plain or quoted scalar from a flat YAML file. Block scalars and flow collections are not supported.
export function readTopLevelScalar(yaml, key) {
  const line = linesOf(yaml).find(l => keyLine(key).test(l))
  if (!line) return undefined

  const { value, quoted } = scalarOf(line.slice(line.indexOf(':') + 1))
  return value && (quoted || !YAML_NULLS.includes(value)) ? value : undefined
}

// Splits a flow list's inside on commas outside quotes: `"a,b", c` → ['"a,b"', ' c'].
function flowItems(inside) {
  const { items, current } = [...inside].reduce(
    ({ items, current, quote }, char) => {
      if (quote) return { items, current: current + char, quote: char === quote ? null : quote }
      if (char === "'" || char === '"') return { items, current: current + char, quote: char }
      if (char === ',') return { items: [...items, current], current: '', quote: null }
      return { items, current: current + char, quote: null }
    },
    { items: [], current: '', quote: null },
  )
  return [...items, current].map(item => scalarOf(item).value).filter(Boolean)
}

const isBlank = line => /^\s*(#.*)?$/.test(line)
const ITEM = /^\s*-(\s|$)/

// A top-level list: a block list (`key:` then `- item` lines, indented or not, comment lines allowed), a one-line
// flow list (`key: [a, "b,c"]`) or a single scalar. Missing or empty, it is []. Nested structures are not supported:
// a mapping item or a flow list spread over several lines throws rather than being misread.
export function readTopLevelList(yaml, key) {
  const lines = linesOf(yaml)
  const at = lines.findIndex(l => keyLine(key).test(l))
  if (at === -1) return []

  const { value } = scalarOf(lines[at].slice(lines[at].indexOf(':') + 1))
  if (value.startsWith('[')) {
    const flow = /^\[(.*)\]$/.exec(value)
    if (!flow) throw new MidasPathsError(`${key}: write the list on one line ([a, b]) or as "- item" lines.`)
    return flowItems(flow[1])
  }
  if (value && !YAML_NULLS.includes(value)) return [value]

  const rest = lines.slice(at + 1)
  const end = rest.findIndex(l => !isBlank(l) && !ITEM.test(l))
  const items = (end === -1 ? rest : rest.slice(0, end)).filter(l => ITEM.test(l)).map(l => scalarOf(l.replace(/^\s*-/, '')))
  if (items.some(item => !item.quoted && /:(\s|$)/.test(item.value))) {
    throw new MidasPathsError(`${key}: list plain items (- a.md), not mappings; quote an item that contains ": ".`)
  }
  return items.map(item => item.value).filter(Boolean)
}

const configPath = dir => join(dir, MIDAS_DIR, CONFIG_FILE)

function readConfigScalar(dir, key) {
  const file = configPath(dir)
  return existsSync(file) ? readTopLevelScalar(readFileSync(file, 'utf8'), key) : undefined
}

function gitRoot(cwd) {
  if (!existsSync(cwd)) throw new MidasPathsError(`${cwd} does not exist.`)

  try {
    // LC_ALL=C keeps git's messages in English, so "not a git repository" can be told apart from other failures.
    const env = { ...process.env, LC_ALL: 'C' }
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return realpathSync.native(out.trim())
  } catch (error) {
    if (error.code === 'ENOENT') throw new MidasPathsError('git is not on PATH, so the repo cannot be found.')
    if (error.status === GIT_NOT_A_REPO && /not a git repository/i.test(String(error.stderr))) return null
    throw new MidasPathsError(`git could not read ${cwd}: ${String(error.stderr || error.message).trim()}`)
  }
}

const isHomeRepo = dir => readConfigScalar(dir, 'role') === HOME_ROLE

// Same folder by identity, so paths differing only in case or through a symlink still match.
function isSameFolder(a, b) {
  const [x, y] = [statSync(a), statSync(b)]
  return x.dev === y.dev && x.ino === y.ino
}

const expandTilde = (path, userHome) => (path === '~' || path.startsWith('~/') ? join(userHome, path.slice(1)) : path)

// A candidate home is accepted only when it is a folder that says `role: home`; otherwise the reason becomes a warning.
function checkHome({ path, label }) {
  if (!existsSync(path)) return { warning: `${label} points at ${path}, which does not exist.` }
  if (!statSync(path).isDirectory()) return { warning: `${label} points at ${path}, which is not a folder.` }

  const dir = realpathSync.native(path)
  return isHomeRepo(dir)
    ? { dir }
    : { warning: `${label} points at ${dir}, whose ${MIDAS_DIR}/${CONFIG_FILE} lacks "role: ${HOME_ROLE}".` }
}

// The first valid home wins, in this order: MIDAS_HOME, the current repo itself, `home:` in the repo's config.
function homeCandidates({ repo, env, userHome }) {
  const configured = repo && readConfigScalar(repo, 'home')

  return [
    env.MIDAS_HOME && { path: resolve(expandTilde(env.MIDAS_HOME, userHome)), source: 'env', label: 'MIDAS_HOME' },
    repo && isHomeRepo(repo) && { path: repo, source: 'cwd', label: 'The current repo' },
    configured && { path: resolve(repo, expandTilde(configured, userHome)), source: 'repo-config', label: `home: in ${configPath(repo)}` },
  ].filter(Boolean)
}

function findHome(context) {
  let warnings = []
  for (const candidate of homeCandidates(context)) {
    const found = checkHome(candidate)
    if (found.dir) return { dir: found.dir, source: candidate.source, warnings }
    warnings = [...warnings, found.warning]
  }

  return { dir: null, source: null, warnings }
}

// The code repo's entry in the home's .midas/repos.json, matched by its origin remote. No map, no entry and no warning.
function repoEntry(repo, home) {
  const none = { repoName: null, stack: null, warnings: [] }
  if (!repo || !home || !existsSync(join(home, MAP_FILE))) return none

  const origin = originOf(repo)
  if (!origin) return { ...none, warnings: [`${repo} has no origin remote, so it can't be matched to ${join(home, MAP_FILE)}.`] }

  try {
    const entry = findRepoByRemote(readRepoMap(home), origin)
    return entry
      ? { repoName: entry.name, stack: entry.stack, warnings: [] }
      : { ...none, warnings: [`${repo} is not in ${join(home, MAP_FILE)}: add it so its stack's standards apply.`] }
  } catch (error) {
    return { ...none, warnings: [error.message] }
  }
}

export function resolveMidasPaths({ cwd = process.cwd(), env = process.env, userHome = homedir() } = {}) {
  const root = gitRoot(cwd)
  const home = findHome({ repo: root, env, userHome })
  const repo = root && !(home.dir && isSameFolder(root, home.dir)) ? root : null

  if (!repo && !home.dir) {
    throw new MidasPathsError(
      [`${cwd} is not inside a git repo and no home repo is configured.`, ...home.warnings, 'Run from a repo, or set MIDAS_HOME to your clone of the home repo.'].join('\n'),
    )
  }

  const midas = dir => join(dir, MIDAS_DIR)
  const entry = repoEntry(repo, home.dir)
  const tasksOwner = home.dir ?? repo
  // Task folders a repo kept before it had a home: still read, so old tasks can be resumed, but nothing new goes there.
  const repoTasks = repo && join(midas(repo), 'tasks')
  const legacyTasks = home.dir && repoTasks && existsSync(repoTasks) ? repoTasks : null

  return {
    mode: home.dir ? 'home' : 'repo',
    repo,
    home: home.dir,
    homeSource: home.source,
    tasks: join(midas(tasksOwner), 'tasks'),
    legacyTasks,
    tasksShared: readConfigScalar(tasksOwner, 'tasks_shared') === 'true',
    docs: repo ? join(midas(repo), 'docs') : null,
    homeDocs: home.dir ? join(midas(home.dir), 'docs') : null,
    config: configPath(repo ?? home.dir),
    repoName: entry.repoName,
    stack: entry.stack,
    warnings: [...home.warnings, ...entry.warnings],
  }
}

await runCli(import.meta.url, args => {
  const cwd = flagValue(args, '--cwd')
  process.stdout.write(`${JSON.stringify(resolveMidasPaths({ cwd: cwd ? resolve(cwd) : process.cwd() }), null, 2)}\n`)
})
