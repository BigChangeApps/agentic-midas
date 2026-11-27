// node --test scripts/midas-repos.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { REPO_MAP_END, REPO_MAP_START, checkClones, renderRepoMap, scanClones, updateClaudeMd } from './midas-repos.mjs'
import { RepoMapError } from './repo-map.mjs'

const SCRIPT = fileURLToPath(new URL('./midas-repos.mjs', import.meta.url))

const PAYMENTS = {
  name: 'BigChange.Payments',
  folder: 'payments',
  remote: 'git@ssh.dev.azure.com:v3/bigchange/BigChange/BigChange.Payments',
  stack: 'dotnet',
  baseBranch: 'main',
  summary: 'Stripe payments service.',
}
const MONOLITH = {
  name: 'BigChange',
  folder: 'mono-repo',
  remote: 'git@ssh.dev.azure.com:v3/bigchange/BigChange/BigChange',
  stack: 'dotnet-framework',
  baseBranch: 'WebRelease2',
  summary: 'The monolith.',
}

const sandbox = () => realpathSync(mkdtempSync(join(tmpdir(), 'midas-repos-')))

function clone(dir, remote) {
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  if (remote) execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: dir })
  return dir
}

test('renderRepoMap groups repos by stack between the generated markers', () => {
  const text = renderRepoMap([PAYMENTS, MONOLITH])

  assert.ok(text.startsWith(REPO_MAP_START))
  assert.ok(text.endsWith(REPO_MAP_END))
  assert.ok(text.indexOf('### dotnet\n') < text.indexOf('### dotnet-framework\n'))
  assert.match(text, /- \*\*BigChange\.Payments\*\* — Stripe payments service\. Folder `payments`, base `main`\./)
  assert.match(text, /- \*\*BigChange\*\* — The monolith\. Folder `mono-repo`, base `WebRelease2`\./)
})

test('updateClaudeMd replaces only the generated section, or appends it when missing', () => {
  const section = renderRepoMap([PAYMENTS])
  const existing = `# Home\n\nIntro.\n\n${REPO_MAP_START}\nold\n${REPO_MAP_END}\n\nOutro.\n`

  assert.equal(updateClaudeMd(existing, section), `# Home\n\nIntro.\n\n${section}\n\nOutro.\n`)
  assert.equal(updateClaudeMd('# Home\n', section), `# Home\n\n${section}\n`)
  assert.equal(updateClaudeMd('', section), `${section}\n`)
})

test('updateClaudeMd refuses unpaired, reversed or repeated markers rather than guess', () => {
  const section = renderRepoMap([PAYMENTS])

  for (const broken of [
    `${REPO_MAP_START}\nkeep me\n`,
    `${REPO_MAP_END}\nkeep me\n${REPO_MAP_START}\n`,
    `${REPO_MAP_START}\n${REPO_MAP_END}\n${REPO_MAP_START}\n${REPO_MAP_END}\n`,
  ]) {
    assert.throws(() => updateClaudeMd(broken, section), error => error instanceof RepoMapError && /markers/.test(error.message))
  }
})

test('scanClones finds git folders and symlinked clones under the root with their remote', () => {
  const root = sandbox()
  const payments = clone(join(root, 'payments'), PAYMENTS.remote)
  const elsewhere = clone(join(sandbox(), 'monolith'), MONOLITH.remote)
  symlinkSync(elsewhere, join(root, 'mono-repo'))
  clone(join(root, 'scratch'))
  mkdirSync(join(root, 'not-a-repo'))

  const clones = scanClones(root).sort((a, b) => a.dir.localeCompare(b.dir))

  assert.deepEqual(clones, [
    { dir: join(root, 'mono-repo'), remote: MONOLITH.remote },
    { dir: payments, remote: PAYMENTS.remote },
    { dir: join(root, 'scratch'), remote: null },
  ])
})

test('checkClones reports found, missing, unmapped and remote-less clones', () => {
  const clones = [
    { dir: '/r/payments', remote: PAYMENTS.remote },
    { dir: '/r/payments-363341', remote: 'https://bigchange@dev.azure.com/bigchange/BigChange/_git/BigChange.Payments' },
    { dir: '/r/other', remote: 'git@ssh.dev.azure.com:v3/bigchange/BigChange/Other' },
    { dir: '/r/scratch', remote: null },
  ]

  const report = checkClones([PAYMENTS, MONOLITH], clones)

  assert.deepEqual(report.found, [{ name: 'BigChange.Payments', dirs: ['/r/payments', '/r/payments-363341'] }])
  assert.deepEqual(report.missing, [{ name: 'BigChange', folder: 'mono-repo', remote: MONOLITH.remote }])
  assert.deepEqual(report.unmapped, [{ dir: '/r/other', remote: 'git@ssh.dev.azure.com:v3/bigchange/BigChange/Other' }])
  assert.deepEqual(report.noRemote, ['/r/scratch'])
})

function homeWithMap(repos) {
  const home = clone(join(sandbox(), 'agentic-midas-home'))
  mkdirSync(join(home, '.midas'))
  writeFileSync(join(home, '.midas', 'config.yml'), 'role: home\n')
  writeFileSync(join(home, '.midas', 'repos.json'), JSON.stringify({ repos }))
  writeFileSync(join(home, 'CLAUDE.md'), '# Home\n')
  return home
}

const run = (args, { cwd, env = { PATH: process.env.PATH } } = {}) => {
  try {
    return { status: 0, stdout: execFileSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8', stdio: 'pipe' }) }
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr }
  }
}

test('CLI render --check fails while CLAUDE.md is stale, render --write fixes it', () => {
  const home = homeWithMap([PAYMENTS])

  assert.equal(run(['render', '--check', '--home', home]).status, 1)
  assert.equal(run(['render', '--write', '--home', home]).status, 0)
  assert.match(readFileSync(join(home, 'CLAUDE.md'), 'utf8'), /BigChange\.Payments/)
  assert.equal(run(['render', '--check', '--home', home]).status, 0)
})

test('CLI check scans the folder next to the home by default and exits 1 when a repo is missing', () => {
  const home = homeWithMap([PAYMENTS, MONOLITH])
  clone(join(home, '..', 'payments'), PAYMENTS.remote)

  const result = run(['check', '--home', home])

  assert.equal(result.status, 1)
  assert.match(result.stdout, /Missing: BigChange \(clone into mono-repo from .*BigChange\/BigChange\)/)
  assert.match(result.stdout, /Found: BigChange\.Payments/)
})

test('CLI check resolves a relative --home and leaves the home itself out', () => {
  const home = homeWithMap([PAYMENTS])
  clone(join(home, '..', 'payments'), PAYMENTS.remote)

  const result = run(['check', '--home', '.'], { cwd: home })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /Found: BigChange\.Payments/)
  assert.doesNotMatch(result.stdout, /agentic-midas-home/)
})

test('CLI finds the home through MIDAS_HOME when --home is not given', () => {
  const home = homeWithMap([PAYMENTS])
  clone(join(home, '..', 'payments'), PAYMENTS.remote)

  const result = run(['check'], { cwd: sandbox(), env: { PATH: process.env.PATH, MIDAS_HOME: home } })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Found: BigChange\.Payments/)
})

test('CLI refuses an unknown command and an empty --home', () => {
  const unknown = run(['frobnicate'], { cwd: sandbox() })
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /Usage/)

  const empty = run(['check', '--home='], { cwd: sandbox() })
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /--home needs a value/)
})
