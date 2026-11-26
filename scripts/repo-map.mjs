// The home repo's map of code repos, .midas/repos.json: parse and validate it, and match a clone to its entry by remote.
// A library for midas-paths.mjs and midas-repos.mjs; it has no CLI of its own.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const STACKS = ['dotnet', 'dotnet-framework', 'react', 'sql']
export const MAP_FILE = join('.midas', 'repos.json')
const FIELDS = ['name', 'folder', 'remote', 'stack', 'baseBranch', 'summary']

export class RepoMapError extends Error {
  name = 'RepoMapError'
}

const safeDecode = segment => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// `git@host:path` (scp style) or any URL git accepts (ssh://, https://, http://).
function hostAndPath(url) {
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(url)
  if (scp) return { host: scp[1], path: scp[2] }

  try {
    const parsed = new URL(url)
    return { host: parsed.hostname, path: parsed.pathname }
  } catch {
    return null
  }
}

// Azure DevOps: ssh.dev.azure.com/v3/org/project/repo, dev.azure.com/org[/project]/_git/repo,
// org.visualstudio.com[/DefaultCollection][/project]/_git/repo. A missing project means the project named after the repo.
function azureKey(host, parts) {
  if (host === 'ssh.dev.azure.com') return parts[0] === 'v3' && parts.length === 4 ? `azure:${parts.slice(1).join('/')}` : undefined

  const at = parts.indexOf('_git')
  if (at === -1 || at !== parts.length - 2) return undefined
  const repo = parts[at + 1]
  const before = parts.slice(0, at)

  if (host === 'dev.azure.com' && before.length >= 1 && before.length <= 2) return `azure:${before[0]}/${before[1] ?? repo}/${repo}`

  const org = /^([^.]+)\.visualstudio\.com$/.exec(host)?.[1]
  const rest = before[0]?.toLowerCase() === 'defaultcollection' ? before.slice(1) : before
  return org && rest.length <= 1 ? `azure:${org}/${rest[0] ?? repo}/${repo}` : undefined
}

// GitHub, including SSH host aliases such as `github-work` from ~/.ssh/config.
const githubKey = (host, parts) => ((host === 'github.com' || /^github([-.]|$)/.test(host)) && parts.length === 2 ? `github:${parts.join('/')}` : undefined)

// One key per repo, whichever form its remote takes.
export function remoteKey(url) {
  const trimmed = url.trim()
  const parsed = hostAndPath(trimmed)
  if (!parsed) return trimmed.toLowerCase()

  const host = parsed.host.toLowerCase()
  const segments = parsed.path.split('/').filter(Boolean).map(safeDecode)
  const parts = segments.map((segment, i) => (i === segments.length - 1 ? segment.replace(/\.git$/, '') : segment))

  return (azureKey(host, parts) ?? githubKey(host, parts) ?? `${host}/${parts.join('/')}`).toLowerCase()
}

const isText = value => typeof value === 'string' && value.trim() !== ''

function fieldProblems(repo, at) {
  const missing = FIELDS.filter(f => !isText(repo?.[f])).map(f => `repos[${at}]: ${f} is missing or empty.`)
  const badStack = isText(repo?.stack) && !STACKS.includes(repo.stack) ? [`repos[${at}]: stack "${repo.stack}" is not one of ${STACKS.join(', ')}.`] : []
  return [...missing, ...badStack]
}

const UNIQUE = [
  ['name', name => name],
  ['folder', folder => folder],
  ['remote', remoteKey],
]

// Duplicates among the entries whose field is set; a missing field is already reported by fieldProblems.
function duplicateProblems(repos) {
  return UNIQUE.flatMap(([field, keyOf]) => {
    const entries = repos.map((repo, at) => ({ repo, at })).filter(({ repo }) => isText(repo?.[field]))
    return entries.flatMap(({ repo, at }) => {
      const first = entries.find(other => keyOf(other.repo[field]) === keyOf(repo[field]))
      return first.at !== at ? [`repos[${at}]: same ${field} as repos[${first.at}] (${first.repo.name}).`] : []
    })
  })
}

export function parseRepoMap(json) {
  const data = (() => {
    try {
      return JSON.parse(json)
    } catch (error) {
      throw new RepoMapError(`${MAP_FILE} is not valid JSON: ${error.message}`)
    }
  })()
  if (!Array.isArray(data?.repos)) throw new RepoMapError(`${MAP_FILE} needs a "repos" list.`)

  const problems = [...data.repos.flatMap(fieldProblems), ...duplicateProblems(data.repos)]
  if (problems.length > 0) throw new RepoMapError([`${MAP_FILE} has problems:`, ...problems].join('\n'))

  return data.repos
}

export function readRepoMap(home) {
  const file = join(home, MAP_FILE)
  if (!existsSync(file)) throw new RepoMapError(`${home} has no ${MAP_FILE}.`)
  return parseRepoMap(readFileSync(file, 'utf8'))
}

export function findRepoByRemote(repos, url) {
  if (!url) return undefined
  const key = remoteKey(url)
  return repos.find(repo => remoteKey(repo.remote) === key)
}

// The `origin` remote of a clone, or null when it has none.
export function originOf(dir) {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}
