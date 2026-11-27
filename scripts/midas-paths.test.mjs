// node --test scripts/midas-paths.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MidasPathsError, readTopLevelScalar, resolveMidasPaths } from './midas-paths.mjs'

const SCRIPT = fileURLToPath(new URL('./midas-paths.mjs', import.meta.url))

const sandbox = () => realpathSync(mkdtempSync(join(tmpdir(), 'midas-paths-')))

function gitRepo(dir, config) {
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  if (config !== undefined) writeConfig(dir, config)
  return dir
}

function writeConfig(dir, text) {
  mkdirSync(join(dir, '.midas'), { recursive: true })
  writeFileSync(join(dir, '.midas', 'config.yml'), text)
}

const homeRepo = dir => gitRepo(dir, 'role: home\n')

test('a repo without a home keeps everything in the repo', () => {
  const repo = gitRepo(join(sandbox(), 'payments'))

  const paths = resolveMidasPaths({ cwd: repo, env: {} })

  assert.deepEqual(paths, {
    mode: 'repo',
    repo,
    home: null,
    homeSource: null,
    tasks: join(repo, '.midas', 'tasks'),
    legacyTasks: null,
    tasksShared: false,
    docs: join(repo, '.midas', 'docs'),
    homeDocs: null,
    config: join(repo, '.midas', 'config.yml'),
    repoName: null,
    stack: null,
    warnings: [],
  })
})

test('MIDAS_HOME moves tasks to the home repo and keeps docs in the code repo', () => {
  const root = sandbox()
  const home = homeRepo(join(root, 'agentic-midas-home'))
  const repo = gitRepo(join(root, 'payments'))

  const paths = resolveMidasPaths({ cwd: repo, env: { MIDAS_HOME: home } })

  assert.equal(paths.mode, 'home')
  assert.equal(paths.home, home)
  assert.equal(paths.homeSource, 'env')
  assert.equal(paths.tasks, join(home, '.midas', 'tasks'))
  assert.equal(paths.docs, join(repo, '.midas', 'docs'))
  assert.equal(paths.homeDocs, join(home, '.midas', 'docs'))
  assert.deepEqual(paths.warnings, [])
})

test('in home mode the repo\'s own task folders stay findable as legacyTasks', () => {
  const root = sandbox()
  const home = homeRepo(join(root, 'agentic-midas-home'))
  const repo = gitRepo(join(root, 'mono-repo'))
  const fresh = gitRepo(join(root, 'payments'))
  mkdirSync(join(repo, '.midas', 'tasks', 'development'), { recursive: true })

  assert.equal(resolveMidasPaths({ cwd: repo, env: { MIDAS_HOME: home } }).legacyTasks, join(repo, '.midas', 'tasks'))
  assert.equal(resolveMidasPaths({ cwd: fresh, env: { MIDAS_HOME: home } }).legacyTasks, null)
  assert.equal(resolveMidasPaths({ cwd: repo, env: {} }).legacyTasks, null)
  mkdirSync(join(home, '.midas', 'tasks'), { recursive: true })
  assert.equal(resolveMidasPaths({ cwd: home, env: {} }).legacyTasks, null)
})

test('tasksShared comes from the config next to the task folders', () => {
  const root = sandbox()
  const home = gitRepo(join(root, 'agentic-midas-home'), 'role: home\ntasks_shared: true\n')
  const repo = gitRepo(join(root, 'payments'), 'tasks_shared: false\n')
  const sharing = gitRepo(join(root, 'xero'), 'tasks_shared: true # committed\n')

  assert.equal(resolveMidasPaths({ cwd: repo, env: { MIDAS_HOME: home } }).tasksShared, true)
  assert.equal(resolveMidasPaths({ cwd: repo, env: {} }).tasksShared, false)
  assert.equal(resolveMidasPaths({ cwd: sharing, env: {} }).tasksShared, true)

  const privateHome = gitRepo(join(root, 'private-home'), 'role: home\n')
  assert.equal(resolveMidasPaths({ cwd: sharing, env: { MIDAS_HOME: privateHome } }).tasksShared, false)
})

test('home: in the repo config is read relative to the repo root', () => {
  const root = sandbox()
  const home = homeRepo(join(root, 'agentic-midas-home'))
  const repo = gitRepo(join(root, 'payments'), 'home: ../agentic-midas-home  # sibling clone\n')

  const paths = resolveMidasPaths({ cwd: repo, env: {} })

  assert.equal(paths.home, home)
  assert.equal(paths.homeSource, 'repo-config')
})

test('MIDAS_HOME wins over the repo config', () => {
  const root = sandbox()
  const envHome = homeRepo(join(root, 'mine'))
  homeRepo(join(root, 'agentic-midas-home'))
  const repo = gitRepo(join(root, 'payments'), 'home: ../agentic-midas-home\n')

  const paths = resolveMidasPaths({ cwd: repo, env: { MIDAS_HOME: envHome } })

  assert.equal(paths.home, envHome)
  assert.equal(paths.homeSource, 'env')
})

test('MIDAS_HOME expands a leading ~', () => {
  const root = sandbox()
  const home = homeRepo(join(root, 'agentic-midas-home'))
  const repo = gitRepo(join(root, 'payments'))

  const paths = resolveMidasPaths({ cwd: repo, env: { MIDAS_HOME: '~/agentic-midas-home' }, userHome: root })

  assert.equal(paths.home, home)
})

test('a session started inside the home repo has a home and no code repo', () => {
  const home = homeRepo(join(sandbox(), 'agentic-midas-home'))
  const nested = join(home, 'notes')
  mkdirSync(nested)

  const paths = resolveMidasPaths({ cwd: nested, env: {} })

  assert.equal(paths.mode, 'home')
  assert.equal(paths.repo, null)
  assert.equal(paths.home, home)
  assert.equal(paths.homeSource, 'cwd')
  assert.equal(paths.docs, null)
  assert.equal(paths.config, join(home, '.midas', 'config.yml'))
})

test('a subdirectory of a repo resolves to the repo root', () => {
  const repo = gitRepo(join(sandbox(), 'payments'))
  const nested = join(repo, 'src', 'api')
  mkdirSync(nested, { recursive: true })

  assert.equal(resolveMidasPaths({ cwd: nested, env: {} }).repo, repo)
})

test('a home that is not a home repo is reported and ignored', () => {
  const root = sandbox()
  const notHome = gitRepo(join(root, 'random'))
  const repo = gitRepo(join(root, 'payments'))

  const paths = resolveMidasPaths({ cwd: repo, env: { MIDAS_HOME: notHome } })

  assert.equal(paths.mode, 'repo')
  assert.equal(paths.home, null)
  assert.equal(paths.tasks, join(repo, '.midas', 'tasks'))
  assert.equal(paths.warnings.length, 1)
  assert.match(paths.warnings[0], /MIDAS_HOME .*random.*"role: home"/)
})

test('a missing home folder is reported and ignored', () => {
  const repo = gitRepo(join(sandbox(), 'payments'), 'home: ../nowhere\n')

  const paths = resolveMidasPaths({ cwd: repo, env: {} })

  assert.equal(paths.mode, 'repo')
  assert.match(paths.warnings[0], /home: in .*config\.yml .*nowhere.* does not exist/)
})

test('a repo listed in the home repo map gets its name and stack, matched by remote', () => {
  const root = sandbox()
  const home = homeRepo(join(root, 'agentic-midas-home'))
  writeFileSync(
    join(home, '.midas', 'repos.json'),
    JSON.stringify({
      repos: [
        {
          name: 'BigChange.Payments',
          folder: 'payments',
          remote: 'git@ssh.dev.azure.com:v3/bigchange/BigChange/BigChange.Payments',
          stack: 'dotnet',
          baseBranch: 'main',
          summary: 'Payments.',
        },
      ],
    }),
  )
  const repo = gitRepo(join(root, 'payments-second-clone'))
  execFileSync('git', ['remote', 'add', 'origin', 'https://bigchange@dev.azure.com/bigchange/BigChange/_git/BigChange.Payments'], { cwd: repo })
  const unlisted = gitRepo(join(root, 'scratch'))
  execFileSync('git', ['remote', 'add', 'origin', 'git@ssh.dev.azure.com:v3/bigchange/BigChange/Other'], { cwd: unlisted })
  const noOrigin = gitRepo(join(root, 'local-only'))

  const listed = resolveMidasPaths({ cwd: repo, env: { MIDAS_HOME: home } })
  const other = resolveMidasPaths({ cwd: unlisted, env: { MIDAS_HOME: home } })

  assert.equal(listed.repoName, 'BigChange.Payments')
  assert.equal(listed.stack, 'dotnet')
  assert.equal(other.repoName, null)
  assert.equal(other.stack, null)
  assert.match(other.warnings.join('\n'), /scratch is not in .*repos\.json/)
  assert.match(resolveMidasPaths({ cwd: noOrigin, env: { MIDAS_HOME: home } }).warnings.join('\n'), /local-only has no origin remote/)
})

test('a bad MIDAS_HOME is reported and the repo config home is used instead', () => {
  const root = sandbox()
  const home = homeRepo(join(root, 'agentic-midas-home'))
  const repo = gitRepo(join(root, 'payments'), 'home: ../agentic-midas-home\n')

  const paths = resolveMidasPaths({ cwd: repo, env: { MIDAS_HOME: join(root, 'stale') } })

  assert.equal(paths.home, home)
  assert.equal(paths.homeSource, 'repo-config')
  assert.equal(paths.warnings.length, 1)
  assert.match(paths.warnings[0], /MIDAS_HOME .*stale.* does not exist/)
})

test('a home that is a file is reported as not a folder', () => {
  const root = sandbox()
  writeFileSync(join(root, 'home.txt'), '')
  const repo = gitRepo(join(root, 'payments'), 'home: ../home.txt\n')

  const paths = resolveMidasPaths({ cwd: repo, env: {} })

  assert.equal(paths.mode, 'repo')
  assert.match(paths.warnings[0], /home\.txt.* is not a folder/)
})

test('the same folder reached through a differently cased path is not both repo and home', () => {
  const home = homeRepo(join(sandbox(), 'agentic-midas-home'))
  const differentCase = home.replace('agentic-midas-home', 'Agentic-Midas-Home')
  const isCaseInsensitive = existsSync(differentCase)

  const paths = resolveMidasPaths({ cwd: home, env: { MIDAS_HOME: isCaseInsensitive ? differentCase : home } })

  assert.equal(paths.repo, null)
  assert.equal(paths.mode, 'home')
})

test('a cwd that does not exist fails with that reason', () => {
  const missing = join(sandbox(), 'gone')

  assert.throws(() => resolveMidasPaths({ cwd: missing, env: {} }), /gone does not exist/)
})

test('outside any repo and without a home it fails with a clear message', () => {
  const dir = sandbox()

  assert.throws(() => resolveMidasPaths({ cwd: dir, env: {} }), MidasPathsError)
  assert.throws(() => resolveMidasPaths({ cwd: dir, env: {} }), /not inside a git repo.*MIDAS_HOME/s)
})

test('outside any repo MIDAS_HOME alone is enough', () => {
  const root = sandbox()
  const home = homeRepo(join(root, 'agentic-midas-home'))
  const elsewhere = join(root, 'elsewhere')
  mkdirSync(elsewhere)

  const paths = resolveMidasPaths({ cwd: elsewhere, env: { MIDAS_HOME: home } })

  assert.equal(paths.mode, 'home')
  assert.equal(paths.repo, null)
  assert.equal(paths.tasks, join(home, '.midas', 'tasks'))
})

test('readTopLevelScalar reads top-level keys only, without quotes or comments', () => {
  const yaml = [
    'role: "home"  # this repo',
    "home: '../agentic-midas-home'",
    'orchestrator:',
    '  home: nested-is-ignored',
    'empty:',
  ].join('\n')

  assert.equal(readTopLevelScalar(yaml, 'role'), 'home')
  assert.equal(readTopLevelScalar(yaml, 'home'), '../agentic-midas-home')
  assert.equal(readTopLevelScalar(yaml, 'empty'), undefined)
  assert.equal(readTopLevelScalar(yaml, 'missing'), undefined)
  assert.equal(readTopLevelScalar('orchestrator:\n  home: x\n', 'home'), undefined)
})

test('readTopLevelScalar copes with a BOM, # inside quotes, YAML nulls and a space before the colon', () => {
  assert.equal(readTopLevelScalar('﻿role: home\n', 'role'), 'home')
  assert.equal(readTopLevelScalar('home: "../h #x"  # note\n', 'home'), '../h #x')
  assert.equal(readTopLevelScalar('home: ~\n', 'home'), undefined)
  assert.equal(readTopLevelScalar('home: null\n', 'home'), undefined)
  assert.equal(readTopLevelScalar('home: ""\n', 'home'), undefined)
  assert.equal(readTopLevelScalar('home:foo\n', 'home'), undefined)
  assert.equal(readTopLevelScalar('role : home\n', 'role'), 'home')
})

test('the CLI prints the paths as JSON and exits 1 with the message when it cannot resolve', () => {
  const repo = gitRepo(join(sandbox(), 'payments'))
  const env = { PATH: process.env.PATH }

  const out = JSON.parse(execFileSync('node', [SCRIPT], { cwd: repo, env, encoding: 'utf8' }))
  assert.equal(out.repo, repo)

  const fromFlag = JSON.parse(execFileSync('node', [SCRIPT, '--cwd', repo], { env, encoding: 'utf8' }))
  assert.equal(fromFlag.repo, repo)

  const failed = (() => {
    try {
      execFileSync('node', [SCRIPT], { cwd: sandbox(), env, encoding: 'utf8', stdio: 'pipe' })
    } catch (error) {
      return error
    }
  })()
  assert.equal(failed?.status, 1)
  assert.match(failed.stderr, /not inside a git repo/)
})

const runCli = (args, options) => {
  try {
    return { status: 0, stdout: execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe', ...options }) }
  } catch (error) {
    return { status: error.status, stderr: error.stderr }
  }
}

test('the CLI accepts --cwd=DIR and refuses --cwd without a folder', () => {
  const repo = gitRepo(join(sandbox(), 'payments'))
  const env = { PATH: process.env.PATH }

  assert.equal(JSON.parse(runCli([`--cwd=${repo}`], { env }).stdout).repo, repo)

  for (const args of [['--cwd'], ['--cwd', '--other']]) {
    const result = runCli(args, { cwd: repo, env })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /--cwd needs a value/)
  }
})

test('the CLI says git is missing rather than that there is no repo', () => {
  const repo = gitRepo(join(sandbox(), 'payments'))

  const result = runCli(['--cwd', repo], { env: { PATH: '' } })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /git is not on PATH/)
})
