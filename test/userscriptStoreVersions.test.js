const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadStore () {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main', 'userscriptStore.js'), 'utf8')
  const sandbox = {
    URL: URL,
    console: console,
    require: function (name) {
      if (name === 'url') {
        return require('url')
      }
      throw new Error('unexpected require: ' + name)
    },
    path: { join: function () { return '' }, resolve: function () { return '' } },
    userDataPath: '',
    ipc: { handle: function () { }, on: function () { }, send: function () { } },
    app: { on: function () { }, once: function () { } },
    userscriptMeta: require('../js/util/userscriptMeta.js')
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  return sandbox
}

const store = loadStore()
const compare = store.userscriptStoreCompareVersions

test('equal versions compare as zero', function () {
  assert.equal(compare('1.2.3', '1.2.3'), 0)
})

test('parts compare numerically, not lexicographically', function () {
  assert.equal(compare('1.10', '1.9'), 1)
  assert.equal(compare('1.9', '1.10'), -1)
  assert.equal(compare('1.2.10', '1.2.3'), 1)
})

test('a shorter version sorts before one extended with a zero', function () {
  assert.equal(compare('1.2', '1.2.0'), -1)
})

test('a plain number sorts above one with a prerelease suffix', function () {
  assert.equal(compare('1.0.0', '1.0.0-beta'), 1)
  assert.equal(compare('1.0.0-beta', '1.0.0'), -1)
  assert.equal(compare('1.0.1beta', '1.0.1'), -1)
  assert.equal(compare('1.2a', '1.2'), -1)
})

test('suffixes compare lexicographically against each other', function () {
  assert.equal(compare('1.0.0-beta', '1.0.0-alpha'), 1)
  assert.equal(compare('1.0.0-alpha', '1.0.0-beta'), -1)
})

test('non-numeric parts fall back to string comparison', function () {
  assert.equal(compare('abc', 'abd'), -1)
  assert.equal(compare('2', 'abc'), -1)
})

test('the comparison is antisymmetric on mixed pairs', function () {
  const pairs = [['1.2.4', '1.2.3'], ['1.10', '1.9'], ['1.2', '1.2.0'], ['1.0.0', '1.0.0-beta']]
  pairs.forEach(function (pair) {
    const forward = compare(pair[0], pair[1])
    assert.equal(forward, -compare(pair[1], pair[0]), pair.join(' vs '))
    assert.notEqual(forward, 0, pair.join(' vs '))
  })
})

test('the full update ladder is totally ordered', function () {
  const ladder = ['1.0.0-alpha', '1.0.0-beta', '1.0.0', '1.0.1', '1.2', '1.2.0', '1.10']
  for (var i = 0; i < ladder.length - 1; i++) {
    assert.equal(compare(ladder[i + 1], ladder[i]), 1, ladder[i] + ' < ' + ladder[i + 1])
  }
})

test('an update check treats a higher store version as newer', function () {
  assert.equal(compare('2.0.1', '2.0.0') > 0, true)
  assert.equal(compare('1.9.9', '1.10.0') > 0, false)
})

test('versionPart splits numeric heads from suffixes', function () {
  var part = store.userscriptStoreVersionPart('1.2.3-beta', 2)
  assert.equal(part.num, 3)
  assert.equal(part.suffix, '-beta')
  assert.equal(store.userscriptStoreVersionPart('1.2', 2), null)
  var nonNumeric = store.userscriptStoreVersionPart('v3', 0)
  assert.equal(nonNumeric.num, null)
  assert.equal(nonNumeric.suffix, 'v3')
})
