#!/usr/bin/env node
// Which standards apply to the current repo: the home's global and stack layers, then the repo's own, one file per key.
// Usage: node ${CLAUDE_PLUGIN_ROOT}/scripts/midas-standards.mjs [--cwd DIR] [--paths]
//   → JSON on stdout, or with --paths the winning files one per line; the reason on stderr and exit 1 when it can't resolve.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { flagValue, runCli } from './cli.mjs'
import { readTopLevelList, resolveMidasPaths } from './midas-paths.mjs'

export const GLOBAL_LAYER = 'all'
export const REPO_LAYER = 'repo'
const STANDARDS_DIR = 'standards'
const EXCLUDE_KEY = 'standards_exclude'

// The `.md` files under `dir`, keyed by their path relative to it with `/` separators (`backend/async.md`).
// Symlinked files and folders are followed; a folder already seen (a symlink loop) is skipped.
function markdownFiles(dir) {
  const walk = (folder, prefix, seen) => {
    const real = realpathSync(folder)
    if (seen.includes(real)) return []

    return readdirSync(folder).flatMap(name => {
      const path = join(folder, name)
      const stat = statOrNull(path)
      if (stat?.isDirectory()) return walk(path, [...prefix, name], [...seen, real])
      return stat?.isFile() && name.endsWith('.md') ? [[[...prefix, name].join('/'), path]] : []
    })
  }

  return existsSync(dir) ? Object.fromEntries(walk(dir, [], [])) : {}
}

function statOrNull(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

// `./process\pr.md` and `process/pr.md` name the same key.
const normaliseKey = key => key.replace(/\\/g, '/').replace(/^(\.\/)+/, '')

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

// Layers run from the most general to the repo; a later layer's file replaces an earlier one with the same key.
// `exclude` drops inherited keys only: a repo opts out of a shared standard, it doesn't hide its own.
export function cascade(layers, excludeAsWritten = []) {
  const exclude = [...new Set(excludeAsWritten.map(normaliseKey))]
  const inherited = new Set(layers.filter(l => l.layer !== REPO_LAYER).flatMap(l => Object.keys(l.files)))
  const own = new Set(layers.filter(l => l.layer === REPO_LAYER).flatMap(l => Object.keys(l.files)))
  const excluded = exclude.filter(key => inherited.has(key) && !own.has(key))

  const warnings = exclude.flatMap(key => {
    if (own.has(key)) return [`${EXCLUDE_KEY} names ${key}, which is this repo's own standard: delete the file instead.`]
    if (!inherited.has(key)) return [`${EXCLUDE_KEY} names ${key}, which no inherited layer has.`]
    return []
  })

  const keys = [...new Set(layers.flatMap(l => Object.keys(l.files)))].filter(key => !excluded.includes(key))
  const holders = key => layers.filter(l => key in l.files)

  const standards = keys
    .map(key => {
      const winner = holders(key).at(-1)
      return { key, layer: winner.layer, path: winner.files[key] }
    })
    .sort(byKey)

  const overridden = keys
    .filter(key => holders(key).length > 1)
    .map(key => ({ key, by: holders(key).at(-1).layer, hidden: holders(key).slice(0, -1).map(l => l.layer) }))
    .sort(byKey)

  return { standards, overridden, excluded, warnings }
}

function excludeList(configFile) {
  return configFile && existsSync(configFile) ? readTopLevelList(readFileSync(configFile, 'utf8'), EXCLUDE_KEY) : []
}

export function resolveStandards({ cwd = process.cwd(), env = process.env } = {}) {
  const paths = resolveMidasPaths({ cwd, env })
  const homeLayer = layer => ({ layer, files: markdownFiles(join(paths.homeDocs, STANDARDS_DIR, layer)) })

  const layers = [
    paths.homeDocs && homeLayer(GLOBAL_LAYER),
    paths.homeDocs && paths.repo && paths.stack && homeLayer(paths.stack),
    paths.repo && { layer: REPO_LAYER, files: markdownFiles(join(paths.docs, STANDARDS_DIR)) },
  ].filter(Boolean)

  const result = cascade(layers, paths.repo ? excludeList(paths.config) : [])
  return { layers: layers.map(l => l.layer), ...result, warnings: [...paths.warnings, ...result.warnings] }
}

await runCli(import.meta.url, args => {
  const cwd = flagValue(args, '--cwd')
  const result = resolveStandards({ cwd: cwd ? resolve(cwd) : process.cwd() })

  if (args.includes('--paths')) {
    process.stdout.write(result.standards.map(s => `${s.path}\n`).join(''))
    for (const warning of result.warnings) process.stderr.write(`${warning}\n`)
    return 0
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
})
