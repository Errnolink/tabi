/* Shared userscript metadata helpers: header parsing, match/include/exclude
   URL matching, grant tables, @connect rules and install identity hashing.
   Used from the main build (concatenated), the UI renderer (browserify) and
   the userscript pages (plain script tag), so it must stay dependency-free
   and expose a single `userscriptMeta` object. */

var userscriptMeta = (function () {
  var GRANT_ALIASES = {
    GM_getValue: 'getValue',
    'GM.getValue': 'getValue',
    GM_setValue: 'setValue',
    'GM.setValue': 'setValue',
    GM_deleteValue: 'deleteValue',
    'GM.deleteValue': 'deleteValue',
    GM_listValues: 'listValues',
    'GM.listValues': 'listValues',
    GM_addStyle: 'addStyle',
    'GM.addStyle': 'addStyle',
    GM_xmlhttpRequest: 'xmlhttpRequest',
    'GM.xmlHttpRequest': 'xmlhttpRequest',
    GM_openInTab: 'openInTab',
    'GM.openInTab': 'openInTab',
    GM_setClipboard: 'setClipboard',
    'GM.setClipboard': 'setClipboard',
    GM_registerMenuCommand: 'registerMenuCommand',
    'GM.registerMenuCommand': 'registerMenuCommand',
    GM_info: 'info',
    'GM.info': 'info',
    unsafeWindow: 'unsafeWindow'
  }

  function parseHeader (content) {
    var features = {}
    var found = false
    var inBlock = false
    var lines = String(content).split('\n')
    var locale = ''
    try {
      if (typeof navigator !== 'undefined' && navigator.language) {
        locale = navigator.language.substring(0, 2).toLowerCase()
      }
    } catch (e) { }
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim()
      if (trimmed === '// ==UserScript==') {
        inBlock = true
        continue
      }
      if (trimmed === '// ==/UserScript==') {
        break
      }
      if (inBlock && trimmed.startsWith('//')) {
        found = true
        var line = trimmed.replace(/^\/\/+\s*/, '')
        var name = line.split(/\s+/)[0]
        var value = line.slice(name.length).trim()
        name = name.replace(/^@/, '')
        if (name.startsWith('name:')) {
          var tag = name.split(':')[1] || ''
          if (tag.substring(0, 2).toLowerCase() === locale) {
            name = 'name:local'
          }
        }
        if (!features[name]) {
          features[name] = []
        }
        features[name].push(value)
      }
    }
    return found ? features : null
  }

  function featureList (features, key, altKey) {
    var list = features[key] || features[altKey] || []
    return Array.isArray(list) ? list : [list]
  }

  function globToRegExp (glob, questionWildcard) {
    var out = ''
    for (var i = 0; i < glob.length; i++) {
      var ch = glob[i]
      if (ch === '*') {
        out += '.*'
      } else if (ch === '?' && questionWildcard) {
        out += '.'
      } else {
        out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
    }
    return new RegExp('^' + out + '$')
  }

  function matchPatternParts (pattern) {
    if (pattern === '<all_urls>') {
      return { all: true }
    }
    var match = /^(\*|[a-z][a-z0-9+.-]*):\/\/([^/]*)(\/.*)$/i.exec(pattern)
    if (!match) {
      return null
    }
    return {
      scheme: match[1].toLowerCase(),
      host: match[2].toLowerCase(),
      path: match[3]
    }
  }

  var ALL_SCHEMES = ['http:', 'https:', 'file:', 'ftp:', 'ws:', 'wss:', 'data:']

  function patternMatches (pattern, url) {
    var parts = matchPatternParts(pattern)
    if (!parts) {
      return globToRegExp(pattern, true).test(url)
    }
    var parsed
    try {
      parsed = new URL(url)
    } catch (e) {
      return false
    }
    if (parts.all) {
      return ALL_SCHEMES.indexOf(parsed.protocol) !== -1
    }
    if (parts.scheme === '*') {
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false
      }
    } else if (parsed.protocol !== parts.scheme + ':') {
      return false
    }
    if (parts.host !== '*') {
      if (parts.host.startsWith('*.')) {
        var base = parts.host.slice(2)
        if (parsed.hostname !== base && !parsed.hostname.endsWith('.' + base)) {
          return false
        }
      } else if (parsed.hostname !== parts.host) {
        return false
      }
    }
    return globToRegExp(parts.path, false).test(parsed.pathname + parsed.search)
  }

  function matchesUrl (features, url) {
    var matchRules = featureList(features, 'match', 'matches')
    var includeRules = featureList(features, 'include', 'includes')
    var excludeRules = featureList(features, 'exclude', 'excludes')
    if (!matchRules.length && !includeRules.length) {
      return false
    }
    var hit = matchRules.some(function (rule) { return patternMatches(rule, url) }) ||
      includeRules.some(function (rule) { return patternMatches(rule, url) })
    if (!hit) {
      return false
    }
    return !excludeRules.some(function (rule) { return patternMatches(rule, url) })
  }

  function grantList (grants) {
    var granted = {}
    var list = Array.isArray(grants) ? grants : grants ? [grants] : []
    for (var i = 0; i < list.length; i++) {
      var key = GRANT_ALIASES[String(list[i]).trim()]
      if (key) {
        granted[key] = true
      }
    }
    return granted
  }

  function connectAllowed (rules, host) {
    var list = Array.isArray(rules) ? rules : []
    if (!list.length) {
      return false
    }
    return list.some(function (rule) {
      var r = String(rule).trim()
      if (r === '*') {
        return true
      }
      if (r.startsWith('*.')) {
        var base = r.slice(2)
        return host === base || host.endsWith('.' + base)
      }
      return host === r || host.endsWith('.' + r)
    })
  }

  function isUniversal (features) {
    var rules = featureList(features, 'match', 'matches').concat(featureList(features, 'include', 'includes'))
    return rules.some(function (rule) {
      var r = String(rule).trim()
      return r === '*' || r === '<all_urls>' || r === '*://*/*' || r === 'http://*/*' || r === 'https://*/*'
    })
  }

  function identityHash (str) {
    var hash = 0x811c9dc5
    var s = String(str)
    for (var i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return ('0000000' + hash.toString(16)).slice(-8)
  }

  return {
    GRANT_ALIASES: GRANT_ALIASES,
    parseHeader: parseHeader,
    matchesUrl: matchesUrl,
    grantList: grantList,
    connectAllowed: connectAllowed,
    isUniversal: isUniversal,
    identityHash: identityHash
  }
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = userscriptMeta
}
