const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadUrlCleaning (settingsMap) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main', 'urlCleaning.js'), 'utf8')
  const sandbox = {
    URL: URL,
    settings: { get: function (key) { return settingsMap[key] } }
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  return sandbox
}

const cleaner = loadUrlCleaning({})
const clean = function (urlString, isMainFrame) {
  return cleaner.urlCleanNavigationURL(urlString, isMainFrame === undefined ? true : isMainFrame)
}

test('strips tracking params and keeps functional ones', function () {
  assert.equal(clean('https://example.com/page?id=7&q=test&utm_source=news&fbclid=abc'), 'https://example.com/page?id=7&q=test')
})

test('prefix rule catches any utm_* param but not lookalikes', function () {
  assert.equal(clean('https://example.com/p?notgclid=1&utm_whatever=2&keepme=3'), 'https://example.com/p?notgclid=1&keepme=3')
})

test('site-scoped params are only stripped on their own site', function () {
  assert.equal(clean('https://www.youtube.com/watch?v=abc&si=xyz'), 'https://www.youtube.com/watch?v=abc')
  assert.equal(clean('https://example.com/watch?v=abc&si=xyz'), null)
  assert.equal(clean('https://www.amazon.com/dp/B123?ref_=nav&pd_rd_w=zzz&qid=9'), 'https://www.amazon.com/dp/B123?qid=9')
})

test('x.com, twitter.com and t.co are never touched, on any subdomain', function () {
  assert.equal(clean('https://x.com/user?fbclid=1'), null)
  assert.equal(clean('https://t.co/abc123?utm_source=x'), null)
  assert.equal(clean('https://mobile.x.com/home?utm_campaign=y'), null)
})

test('tracking redirects are unwrapped to their destination', function () {
  assert.equal(clean('https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc&sa=D'), 'https://example.com/a?b=c')
  assert.equal(clean('https://google.com/url?url=https%3A%2F%2Fexample.com%2Ff'), 'https://example.com/f')
  assert.equal(clean('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org%2Fa%3Fb%3Dc&h=AT1'), 'https://example.org/a?b=c')
  assert.equal(clean('https://out.reddit.com/t3_abc?url=https%3A%2F%2Fexample.org%2Fpost'), 'https://example.org/post')
  assert.equal(clean('https://linksynergy.com/link?murl=https%3A%2F%2Fexample.net%2Fbuy'), 'https://example.net/buy')
  assert.equal(clean('https://steamcommunity.com/linkfilter/?url=https%3A%2F%2Fexample.com%2Fgame'), 'https://example.com/game')
  assert.equal(clean('https://www.instagram.com/linkshim?u=https%3A%2F%2Fexample.com%2Fig'), 'https://example.com/ig')
  assert.equal(clean('https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fyt'), 'https://example.com/yt')
})

test('a destination that is not a web URL is not followed', function () {
  assert.equal(clean('https://google.com/url?q=javascript%3Aalert(1)'), null)
})

test('redirect unwrapping is path-scoped, so google search results stay', function () {
  assert.equal(clean('https://google.com/search?q=https%3A%2F%2Fexample.com%2Fx'), null)
})

test('redirect unwrapping and de-AMP run on main-frame navigations only', function () {
  assert.equal(clean('https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fa', false), null)
  assert.equal(clean('https://cdn.ampproject.org/c/s/example.com/a', false), null)
})

test('param stripping still runs inside subframes', function () {
  assert.equal(clean('https://example.com/frame?utm_source=x&id=1', false), 'https://example.com/frame?id=1')
  assert.equal(clean('https://www.google.com/amp/s/example.com/a?utm_campaign=y', false), 'https://www.google.com/amp/s/example.com/a')
})

test('google AMP cache URLs are rewritten to the canonical page', function () {
  assert.equal(clean('https://www.google.com/amp/s/example.com/news/story'), 'https://example.com/news/story')
  assert.equal(clean('https://google.com/amp/example.com/page'), 'http://example.com/page')
})

test('ampproject cache URLs are rewritten, search dropped, hash kept', function () {
  assert.equal(clean('https://cdn.ampproject.org/c/s/example.com/a?amp=1#frag'), 'https://example.com/a#frag')
  assert.equal(clean('https://cdn.ampproject.org/c/example.com'), 'http://example.com')
  assert.equal(clean('https://cdn.ampproject.org/wp/s/example.com/x/y'), 'https://example.com/x/y')
  assert.equal(clean('https://cdn.ampproject.org/c/http/example.com/x'), 'http://example.com/x')
})

test('non-AMP pages and non-cache paths are left alone', function () {
  assert.equal(clean('https://example.com/amp/page'), null)
  assert.equal(clean('https://www.google.com/search?q=x'), null)
})

test('only http(s) URLs are cleaned', function () {
  assert.equal(clean('file:///C:/x.html'), null)
  assert.equal(clean('about:blank'), null)
  assert.equal(clean('min://app/index.html'), null)
  assert.equal(clean('not a url'), null)
})

test('a URL with nothing to clean returns null instead of a new string', function () {
  assert.equal(clean('https://example.com/clean?id=1'), null)
})

test('the urlCleaning setting gates the feature', function () {
  assert.equal(loadUrlCleaning({}).urlCleaningEnabled(), true)
  assert.equal(loadUrlCleaning({ urlCleaning: true }).urlCleaningEnabled(), true)
  assert.equal(loadUrlCleaning({ urlCleaning: false }).urlCleaningEnabled(), false)
})
