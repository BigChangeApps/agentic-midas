// node --test scripts/repo-map.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { RepoMapError, findRepoByRemote, parseRepoMap, remoteKey } from './repo-map.mjs'

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
const mapJson = repos => JSON.stringify({ repos })

test('remoteKey gives every Azure DevOps form of one repo the same key', () => {
  const key = 'azure:bigchange/bigchange/bigchange.payments'

  for (const url of [
    'git@ssh.dev.azure.com:v3/bigchange/BigChange/BigChange.Payments',
    'ssh://git@ssh.dev.azure.com/v3/bigchange/BigChange/BigChange.Payments',
    'https://bigchange@dev.azure.com/bigchange/BigChange/_git/BigChange.Payments',
    'https://dev.azure.com/bigchange/BigChange/_git/BigChange.Payments/',
    'http://dev.azure.com/bigchange/BigChange/_git/BigChange.Payments',
    'https://bigchange.visualstudio.com/BigChange/_git/BigChange.Payments',
    'https://bigchange.visualstudio.com/DefaultCollection/BigChange/_git/BigChange.Payments',
  ]) {
    assert.equal(remoteKey(url), key, url)
  }
})

test('remoteKey reads an Azure DevOps URL without a project as the project named after the repo', () => {
  assert.equal(remoteKey('https://dev.azure.com/org/_git/Repo'), remoteKey('git@ssh.dev.azure.com:v3/org/Repo/Repo'))
})

test('remoteKey decodes percent-encoded names and survives a stray %', () => {
  assert.equal(remoteKey('https://dev.azure.com/org/My%20Proj/_git/Repo'), 'azure:org/my proj/repo')
  assert.equal(remoteKey('git@ssh.dev.azure.com:v3/org/100%/Repo'), 'azure:org/100%/repo')
})

test('remoteKey gives every GitHub form of one repo the same key', () => {
  const key = 'github:bigchangeapps/agentic-midas'

  for (const url of [
    'git@github.com:BigChangeApps/agentic-midas.git',
    'git@github-bigchange:BigChangeApps/agentic-midas.git',
    'ssh://git@github.com/BigChangeApps/agentic-midas.git',
    'https://github.com/BigChangeApps/agentic-midas',
    'https://github.com/BigChangeApps/agentic-midas.git/',
    'https://user:token@github.com/BigChangeApps/agentic-midas',
  ]) {
    assert.equal(remoteKey(url), key, url)
  }
})

test('remoteKey keeps other remotes as lowercased host and path', () => {
  assert.equal(remoteKey('https://Example.com/x/y.git'), 'example.com/x/y')
  assert.equal(remoteKey('git@gitlab.com:x/y.git'), 'gitlab.com/x/y')
})

test('parseRepoMap returns the repos of a valid map', () => {
  assert.deepEqual(parseRepoMap(mapJson([PAYMENTS, MONOLITH])), [PAYMENTS, MONOLITH])
})

test('parseRepoMap lists every problem at once', () => {
  const broken = mapJson([
    { ...PAYMENTS, stack: 'cobol' },
    { ...MONOLITH, baseBranch: undefined },
    { ...PAYMENTS, folder: 'payments-2' },
  ])

  assert.throws(() => parseRepoMap(broken), RepoMapError)
  assert.throws(
    () => parseRepoMap(broken),
    error =>
      /repos\[0\].*stack "cobol"/.test(error.message) &&
      /repos\[1\].*baseBranch/.test(error.message) &&
      /repos\[2\].*same remote as repos\[0\]/.test(error.message),
  )
})

test('parseRepoMap reports missing or mistyped fields instead of crashing', () => {
  const broken = mapJson([PAYMENTS, { ...MONOLITH, remote: undefined }, { ...MONOLITH, name: 42, folder: 'x', remote: 'git@x:y/z' }, null])

  assert.throws(
    () => parseRepoMap(broken),
    error =>
      error instanceof RepoMapError &&
      /repos\[1\]: remote is missing/.test(error.message) &&
      /repos\[2\]: name is missing/.test(error.message) &&
      /repos\[3\]: name is missing/.test(error.message),
  )
})

test('parseRepoMap refuses invalid JSON and a map without a repos list', () => {
  assert.throws(() => parseRepoMap('{ nope'), /not valid JSON/)
  assert.throws(() => parseRepoMap('{}'), /"repos" list/)
})

test('findRepoByRemote matches whichever remote form the clone uses', () => {
  const repos = [PAYMENTS, MONOLITH]

  assert.equal(findRepoByRemote(repos, 'https://bigchange@dev.azure.com/bigchange/BigChange/_git/BigChange.Payments'), PAYMENTS)
  assert.equal(findRepoByRemote(repos, 'git@ssh.dev.azure.com:v3/bigchange/BigChange/Unknown'), undefined)
  assert.equal(findRepoByRemote(repos, null), undefined)
})
