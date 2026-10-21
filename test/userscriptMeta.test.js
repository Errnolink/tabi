const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadMeta (locale) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'util', 'userscriptMeta.js'), 'utf8')
  const sandbox = {
    URL: URL,
    navigator: locale ? { language: locale } : undefined
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  return sandbox.userscriptMeta
}

const plain = function (value) { return JSON.parse(JSON.stringify(value)) }

const header = function (rules) {
  return ['// ==UserScript=='].concat(rules).concat(['// ==/UserScript==']).join('\n')
}

test('parseHeader collects keyed features into value arrays', function () {
  const meta = loadMeta()
  const features = meta.parseHeader(header([
    '// @name         Test Script',
    '// @namespace    https://example.com/ns',
    '// @version      1.2.3',
    '// @match        https://example.com/*',
    '// @match        https://api.example.com/*',
    '// @grant        GM_getValue'
  ]))
  assert.equal(features.name[0], 'Test Script')
  assert.equal(features.namespace[0], 'https://example.com/ns')
  assert.equal(features.version[0], '1.2.3')
  assert.deepEqual(plain(features.match), ['https://example.com/*', 'https://api.example.com/*'])
  assert.deepEqual(plain(features.grant), ['GM_getValue'])
})

test('parseHeader returns null when there is no metadata block', function () {
  assert.equal(loadMeta().parseHeader('no block here\n// @match https://example.com/*'), null)
})

test('lines after the end marker are not metadata', function () {
  const meta = loadMeta()
  const content = header(['// @match https://good.example/*']) + '\n// @match https://after.example/*\nreal body'
  const features = meta.parseHeader(content)
  assert.deepEqual(plain(features.match), ['https://good.example/*'])
})

test('a @name tag matching the navigator locale becomes name:local', function () {
  const meta = loadMeta('de-DE')
  const features = meta.parseHeader(header([
    '// @name        Original',
    '// @name:de-DE   Original auf Deutsch',
    '// @name:en-US   Original in English'
  ]))
  assert.deepEqual(plain(features.name), ['Original'])
  assert.deepEqual(plain(features['name:local']), ['Original auf Deutsch'])
  assert.deepEqual(plain(features['name:en-US']), ['Original in English'])
})

test('locale matching is case-insensitive and prefix-based', function () {
  const meta = loadMeta('de-DE')
  const features = meta.parseHeader(header(['// @name:DE-AT   Variante']))
  assert.deepEqual(plain(features['name:local']), ['Variante'])
  assert.equal(features['name:de-at'], undefined)
})

test('with no locale available, no name tag is localized', function () {
  const meta = loadMeta()
  const features = meta.parseHeader(header(['// @name:en   English']))
  assert.equal(features['name:local'], undefined)
  assert.deepEqual(plain(features['name:en']), ['English'])
})

test('anchored match patterns reject the audit query-smuggling URLs', function () {
  const meta = loadMeta()
  const features = meta.parseHeader(header(['// @match https://www.example.com/*']))
  assert.equal(meta.matchesUrl(features, 'https://evil.com/?https://www.example.com/'), false)
  assert.equal(meta.matchesUrl(features, 'https://evil.com/?u=https://www.example.com/x'), false)
  assert.equal(meta.matchesUrl(features, 'https://example.com.evil.com/'), false)
})

test('match patterns match scheme, host and path as documented', function () {
  const meta = loadMeta()
  const exact = meta.parseHeader(header(['// @match https://example.com/*']))
  assert.equal(meta.matchesUrl(exact, 'https://example.com/'), true)
  assert.equal(meta.matchesUrl(exact, 'https://example.com/a/b?q=1'), true)
  assert.equal(meta.matchesUrl(exact, 'http://example.com/'), false)

  const starScheme = meta.parseHeader(header(['// @match *://example.com/*']))
  assert.equal(meta.matchesUrl(starScheme, 'http://example.com/'), true)
  assert.equal(meta.matchesUrl(starScheme, 'https://example.com/'), true)
  assert.equal(meta.matchesUrl(starScheme, 'ftp://example.com/x'), false)

  const wildcardHost = meta.parseHeader(header(['// @match https://*.example.com/*']))
  assert.equal(meta.matchesUrl(wildcardHost, 'https://example.com/'), true)
  assert.equal(meta.matchesUrl(wildcardHost, 'https://a.b.example.com/'), true)
  assert.equal(meta.matchesUrl(wildcardHost, 'https://badexample.com/'), false)
})

test('a ? in a match pattern is a literal, not a wildcard', function () {
  const meta = loadMeta()
  const features = meta.parseHeader(header(['// @match https://*/search?q=*']))
  assert.equal(meta.matchesUrl(features, 'https://anycdn.com/search?q=x'), true)
  assert.equal(meta.matchesUrl(features, 'https://anycdn.com/searchAq=x'), false)
})

test('<all_urls> covers web and file schemes but not internal schemes', function () {
  const meta = loadMeta()
  const features = meta.parseHeader(header(['// @match <all_urls>']))
  assert.equal(meta.matchesUrl(features, 'https://example.com/'), true)
  assert.equal(meta.matchesUrl(features, 'file:///tmp/x'), true)
  assert.equal(meta.matchesUrl(features, 'data:text/html,hi'), true)
  assert.equal(meta.matchesUrl(features, 'about:blank'), false)
})

test('@include globs are anchored; ? is a single-char wildcard only in scheme-less globs', function () {
  const meta = loadMeta()
  const glob = meta.parseHeader(header(['// @include *.example.com/foo*']))
  assert.equal(meta.matchesUrl(glob, 'https://a.example.com/foo/bar'), true)
  assert.equal(meta.matchesUrl(glob, 'http://a.example.com/foo'), true)
  assert.equal(meta.matchesUrl(glob, 'https://example.com/foo'), false)

  const question = meta.parseHeader(header(['// @include *.example.com/page?id=?']))
  assert.equal(meta.matchesUrl(question, 'https://a.example.com/page?id=7'), true)
  assert.equal(meta.matchesUrl(question, 'https://a.example.com/page?id=72'), false)

  const withScheme = meta.parseHeader(header(['// @include https://example.com/page?id=*']))
  assert.equal(meta.matchesUrl(withScheme, 'https://example.com/page?id=7'), true)
  assert.equal(meta.matchesUrl(withScheme, 'http://example.com/page?id=7'), false)
})

test('@include * matches everything', function () {
  const meta = loadMeta()
  const features = meta.parseHeader(header(['// @include *']))
  assert.equal(meta.matchesUrl(features, 'https://example.com/'), true)
  assert.equal(meta.matchesUrl(features, 'ftp://x/y'), true)
})

test('@matches is accepted as an alias of @match', function () {
  const meta = loadMeta()
  assert.equal(meta.matchesUrl(meta.parseHeader(header(['// @matches https://example.org/*'])), 'https://example.org/z'), true)
})

test('@exclude rules win over matches', function () {
  const meta = loadMeta()
  const features = meta.parseHeader(header([
    '// @match https://example.com/*',
    '// @exclude https://example.com/private/*'
  ]))
  assert.equal(meta.matchesUrl(features, 'https://example.com/public'), true)
  assert.equal(meta.matchesUrl(features, 'https://example.com/private/x'), false)
})

test('a script with no match or include rules runs nowhere', function () {
  const meta = loadMeta()
  assert.equal(meta.matchesUrl(meta.parseHeader(header(['// @name x'])), 'https://example.org/'), false)
})

test('grantList normalizes both GM.* and GM_* spellings', function () {
  const meta = loadMeta()
  assert.deepEqual(plain(meta.grantList(['GM_getValue', 'GM.setValue', 'unsafeWindow', 'none', 'bogus'])), {
    getValue: true,
    setValue: true,
    unsafeWindow: true
  })
  assert.deepEqual(plain(meta.grantList('GM_xmlhttpRequest')), { xmlhttpRequest: true })
  assert.deepEqual(plain(meta.grantList([])), {})
})

test('connectAllowed honors exact hosts, subdomains and wildcards', function () {
  const meta = loadMeta()
  assert.equal(meta.connectAllowed(['api.example.com'], 'api.example.com'), true)
  assert.equal(meta.connectAllowed(['example.com'], 'api.example.com'), true)
  assert.equal(meta.connectAllowed(['api.example.com'], 'example.com'), false)
  assert.equal(meta.connectAllowed(['*'], 'evil.com'), true)
  assert.equal(meta.connectAllowed(['*.example.com'], 'example.com'), true)
  assert.equal(meta.connectAllowed(['*.example.com'], 'a.example.com'), true)
  assert.equal(meta.connectAllowed(['*.example.com'], 'notexample.com'), false)
  assert.equal(meta.connectAllowed([], 'example.com'), false)
  assert.equal(meta.connectAllowed('example.com', 'example.com'), false)
})

test('isUniversal detects the run-everywhere spellings', function () {
  const meta = loadMeta()
  ;['*', '<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'].forEach(function (rule) {
    assert.equal(meta.isUniversal({ match: [rule] }), true, rule)
  })
  assert.equal(meta.isUniversal({ include: ['*'] }), true)
  assert.equal(meta.isUniversal({ match: ['https://example.com/*'] }), false)
})

test('identityHash is a stable 8-hex FNV-1a digest', function () {
  const meta = loadMeta()
  assert.equal(meta.identityHash(''), '811c9dc5')
  assert.equal(meta.identityHash('a'), 'e40c292c')
  assert.equal(meta.identityHash('control-panel-for-twitter'), '210cab4d')
  assert.equal(meta.identityHash('a'), meta.identityHash('a'))
  assert.notEqual(meta.identityHash('a'), meta.identityHash('b'))
  assert.match(meta.identityHash('anything'), /^[0-9a-f]{8}$/)
})
