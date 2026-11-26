// node --test scripts/midas-standards.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cascade, resolveStandards } from './midas-standards.mjs'

const SCRIPT = fileURLToPath(new URL('./midas-standards.mjs', import.meta.url))
const REMOTE = 'git@ssh.dev.azure.com:v3/bigchange/BigChange/BigChange.Payments'

const sandbox = () => realpathSync(mkdtempSync(join(tmpdir(), 'midas-standards-')))

function write(path, text = '# rule\n') {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function gitRepo(dir, config) {
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  if (config !== undefined) write(join(dir, '.midas', 'config.yml'), config)
  return dir
}

function workspace({ repoConfig = '', stack = 'dotnet' } = {}) {
  const root = sandbox()
  const home = gitRepo(join(root, 'agentic-midas-home'), 'role: home\n')
  write(
    join(home, '.midas', 'repos.json'),
    JSON.stringify({ repos: [{ name: 'BigChange.Payments', folder: 'payments', remote: REMOTE, stack, baseBranch: 'main', summary: 'Payments.' }] }),
  )
  const repo = gitRepo(join(root, 'payments'), repoConfig)
  execFileSync('git', ['remote', 'add', 'origin', REMOTE], { cwd: repo })
  return { home, repo, env: { MIDAS_HOME: home } }
}

const homeStd = (home, layer, key) => join(home, '.midas', 'docs', 'standards', layer, key)
const repoStd = (repo, key) => join(repo, '.midas', 'docs', 'standards', key)

test('cascade lets the repo beat the stack and the stack beat the global layer, file by file', () => {
  const result = cascade([
    { layer: 'all', files: { 'global/security.md': '/h/all/global/security.md', 'process/pull-requests.md': '/h/all/process/pull-requests.md' } },
    { layer: 'dotnet', files: { 'global/security.md': '/h/dotnet/global/security.md', 'backend/async.md': '/h/dotnet/backend/async.md' } },
    { layer: 'repo', files: { 'backend/async.md': '/r/backend/async.md' } },
  ])

  assert.deepEqual(result.standards, [
    { key: 'backend/async.md', layer: 'repo', path: '/r/backend/async.md' },
    { key: 'global/security.md', layer: 'dotnet', path: '/h/dotnet/global/security.md' },
    { key: 'process/pull-requests.md', layer: 'all', path: '/h/all/process/pull-requests.md' },
  ])
  assert.deepEqual(result.overridden, [
    { key: 'backend/async.md', by: 'repo', hidden: ['dotnet'] },
    { key: 'global/security.md', by: 'dotnet', hidden: ['all'] },
  ])
})

test('cascade drops excluded inherited files and warns about excludes that match nothing inherited', () => {
  const result = cascade(
    [
      { layer: 'all', files: { 'global/security.md': '/h/a', 'process/pull-requests.md': '/h/b' } },
      { layer: 'repo', files: { 'backend/own.md': '/r/own' } },
    ],
    ['process/pull-requests.md', 'backend/own.md', 'nope/missing.md'],
  )

  assert.deepEqual(
    result.standards.map(s => s.key),
    ['backend/own.md', 'global/security.md'],
  )
  assert.deepEqual(result.excluded, ['process/pull-requests.md'])
  assert.deepEqual(result.warnings, [
    "standards_exclude names backend/own.md, which is this repo's own standard: delete the file instead.",
    'standards_exclude names nope/missing.md, which no inherited layer has.',
  ])
})

test('resolveStandards reads the global, stack and repo layers for a mapped repo', () => {
  const { home, repo, env } = workspace({ repoConfig: 'standards_exclude:\n  - process/pull-requests.md\n' })
  write(homeStd(home, 'all', 'global/security.md'))
  write(homeStd(home, 'all', 'process/pull-requests.md'))
  write(homeStd(home, 'dotnet', 'backend/async.md'))
  write(homeStd(home, 'react', 'frontend/components.md'))
  write(repoStd(repo, 'backend/async.md'))
  write(repoStd(repo, 'backend/notes.txt'))

  const result = resolveStandards({ cwd: repo, env })

  assert.deepEqual(result.layers, ['all', 'dotnet', 'repo'])
  assert.deepEqual(result.standards, [
    { key: 'backend/async.md', layer: 'repo', path: repoStd(repo, 'backend/async.md') },
    { key: 'global/security.md', layer: 'all', path: homeStd(home, 'all', 'global/security.md') },
  ])
  assert.deepEqual(result.overridden, [{ key: 'backend/async.md', by: 'repo', hidden: ['dotnet'] }])
  assert.deepEqual(result.excluded, ['process/pull-requests.md'])
  assert.deepEqual(result.warnings, [])
})

test('resolveStandards without a stack uses the global layer and says why', () => {
  const { home, repo } = workspace()
  execFileSync('git', ['remote', 'set-url', 'origin', 'git@ssh.dev.azure.com:v3/bigchange/BigChange/Unmapped'], { cwd: repo })
  write(homeStd(home, 'all', 'global/security.md'))

  const result = resolveStandards({ cwd: repo, env: { MIDAS_HOME: home } })

  assert.deepEqual(result.layers, ['all', 'repo'])
  assert.deepEqual(
    result.standards.map(s => s.layer),
    ['all'],
  )
  assert.ok(result.warnings.some(w => /not in .*repos\.json/.test(w)))
})

test("resolveStandards without a home is the repo's own standards", () => {
  const repo = gitRepo(join(sandbox(), 'payments'))
  write(repoStd(repo, 'global/naming.md'))

  const result = resolveStandards({ cwd: repo, env: {} })

  assert.deepEqual(result.layers, ['repo'])
  assert.deepEqual(result.standards, [{ key: 'global/naming.md', layer: 'repo', path: repoStd(repo, 'global/naming.md') }])
})

test('resolveStandards in the home itself lists the global layer only', () => {
  const { home } = workspace()
  write(homeStd(home, 'all', 'global/security.md'))
  write(homeStd(home, 'dotnet', 'backend/async.md'))

  const result = resolveStandards({ cwd: home, env: {} })

  assert.deepEqual(result.layers, ['all'])
  assert.deepEqual(
    result.standards.map(s => s.key),
    ['global/security.md'],
  )
})

test('the CLI prints the cascade as JSON, or one winning path per line with --paths', () => {
  const { home, repo, env } = workspace()
  write(homeStd(home, 'all', 'global/security.md'))
  write(repoStd(repo, 'backend/async.md'))
  const run = args => execFileSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' })

  assert.deepEqual(JSON.parse(run([])).layers, ['all', 'dotnet', 'repo'])
  assert.equal(run(['--paths']), `${repoStd(repo, 'backend/async.md')}\n${homeStd(home, 'all', 'global/security.md')}\n`)
})

test('cascade matches exclude keys written with ./ or backslashes', () => {
  const result = cascade([{ layer: 'all', files: { 'process/pull-requests.md': '/h/a' } }], ['./process/pull-requests.md', 'process\\pull-requests.md'])

  assert.deepEqual(result.standards, [])
  assert.deepEqual(result.excluded, ['process/pull-requests.md'])
  assert.deepEqual(result.warnings, [])
})

test('resolveStandards follows symlinked standard files and folders, and skips non-markdown files', () => {
  const { home, repo, env } = workspace()
  const shared = join(sandbox(), 'shared')
  write(join(shared, 'naming.md'))
  write(join(shared, 'deep', 'nested.md'))
  write(join(shared, 'notes.txt'))
  mkdirSync(join(home, '.midas', 'docs', 'standards', 'all'), { recursive: true })
  symlinkSync(shared, join(home, '.midas', 'docs', 'standards', 'all', 'global'))
  write(join(sandbox(), 'one.md'))
  mkdirSync(join(repo, '.midas', 'docs', 'standards', 'backend'), { recursive: true })
  const target = join(sandbox(), 'own.md')
  write(target)
  symlinkSync(target, repoStd(repo, 'backend/own.md'))

  const result = resolveStandards({ cwd: repo, env })

  assert.deepEqual(
    result.standards.map(s => `${s.layer}:${s.key}`),
    ['repo:backend/own.md', 'all:global/deep/nested.md', 'all:global/naming.md'],
  )
})

test('resolveStandards survives a symlink loop in a standards folder', () => {
  const { home, repo, env } = workspace()
  const dir = join(home, '.midas', 'docs', 'standards', 'all', 'global')
  write(join(dir, 'naming.md'))
  symlinkSync(dir, join(dir, 'again'))

  const result = resolveStandards({ cwd: repo, env })

  assert.deepEqual(
    result.standards.map(s => s.key),
    ['global/naming.md'],
  )
})

test('the CLI takes --cwd', () => {
  const { repo, env } = workspace()
  write(repoStd(repo, 'backend/async.md'))

  const out = execFileSync(process.execPath, [SCRIPT, '--paths', '--cwd', repo], { cwd: sandbox(), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' })

  assert.equal(out, `${repoStd(repo, 'backend/async.md')}\n`)
})

test('resolveStandards keeps the stack layer when the home has no folder for that stack yet', () => {
  const { home, repo, env } = workspace({ stack: 'sql' })
  write(homeStd(home, 'all', 'global/security.md'))

  const result = resolveStandards({ cwd: repo, env })

  assert.deepEqual(result.layers, ['all', 'sql', 'repo'])
  assert.deepEqual(
    result.standards.map(s => `${s.layer}:${s.key}`),
    ['all:global/security.md'],
  )
  assert.deepEqual(result.warnings, [])
})
