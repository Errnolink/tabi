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
    GM_getResourceText: 'getResourceText',
    'GM.getResourceText': 'getResourceText',
    GM_getResourceURL: 'getResourceURL',
    'GM.getResourceURL': 'getResourceURL',
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

  /* Scheme-less @include globs (e.g. *.example.com/foo*) anchor their host part to
     the URL's hostname, so a query or fragment can never satisfy the host portion */
  function includeGlobMatches (pattern, url) {
    var parsed
    try {
      parsed = new URL(url)
    } catch (e) {
      return false
    }
    var rest = String(pattern).trim()
    var schemeIndex = rest.indexOf('://')
    if (schemeIndex !== -1) {
      var scheme = rest.slice(0, schemeIndex).toLowerCase()
      rest = rest.slice(schemeIndex + 3)
      if (scheme === '*') {
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return false
        }
      } else if (parsed.protocol !== scheme + ':') {
        return false
      }
    }
    var slash = rest.indexOf('/')
    var hostPart = slash === -1 ? rest : rest.slice(0, slash)
    var pathPart = slash === -1 ? '' : rest.slice(slash)
    if (!globToRegExp(hostPart, true).test(parsed.hostname)) {
      return false
    }
    if (!pathPart) {
      return true
    }
    return globToRegExp(pathPart, true).test(parsed.pathname + parsed.search)
  }

  function patternMatches (pattern, url) {
    var parts = matchPatternParts(pattern)
    if (!parts) {
      return includeGlobMatches(pattern, url)
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

  function normalizeRunAt (features) {
    var list = featureList(features || {}, 'run-at', 'runAt')
    var value = String(list[0] || '').trim().toLowerCase()
    if (value === 'document-start' || value === 'document-body' || value === 'document-end') {
      return value
    }
    return 'document-idle'
  }

  function assembleScriptCode (requires, body) {
    var parts = (Array.isArray(requires) ? requires : []).filter(function (code) { return typeof code === 'string' && code })
    parts.push(String(body))
    return parts.join('\n;\n')
  }

  var GM_OBJECT_NAMES = {
    getValue: ['GM_getValue', 'getValue'],
    setValue: ['GM_setValue', 'setValue'],
    deleteValue: ['GM_deleteValue', 'deleteValue'],
    listValues: ['GM_listValues', 'listValues'],
    addStyle: ['GM_addStyle', 'addStyle'],
    xmlhttpRequest: ['GM_xmlhttpRequest', 'xmlHttpRequest'],
    openInTab: ['GM_openInTab', 'openInTab'],
    setClipboard: ['GM_setClipboard', 'setClipboard'],
    getResourceText: ['GM_getResourceText', 'getResourceText'],
    getResourceURL: ['GM_getResourceURL', 'getResourceURL'],
    registerMenuCommand: ['GM_registerMenuCommand', 'registerMenuCommand']
  }

  var GM_API_SOURCES = {
    info: 'var GM_info = __gmInfo',
    getValue: 'function GM_getValue (name, defaultValue) { return Object.prototype.hasOwnProperty.call(__gmValues, name) ? __gmValues[name] : defaultValue }',
    setValue: 'function GM_setValue (name, value) { __gmValues[name] = value; __gmCall("setValue", [name, value]).catch(function () { }) }',
    deleteValue: 'function GM_deleteValue (name) { delete __gmValues[name]; __gmCall("deleteValue", [name]).catch(function () { }) }',
    listValues: 'function GM_listValues () { return Object.keys(__gmValues) }',
    addStyle: 'function GM_addStyle (css) { var style = document.createElement("style"); style.textContent = css; (document.head || document.documentElement || document).appendChild(style); return style }',
    xmlhttpRequest: 'function GM_xmlhttpRequest (details) { details = details || {}; var reqId = "r" + (++__gmSeq); __gmCall("xmlhttpRequest", [reqId, { method: details.method || "GET", url: details.url, headers: details.headers || null, data: details.data || null, timeout: details.timeout || 0, responseType: details.responseType || "text" }]).then(function (result) { if (result.ok) { if (details.onload) { details.onload(result.data) } } else if (result.data && result.data.timedOut) { if (details.ontimeout) { details.ontimeout(result.data) } } else if (details.onerror) { details.onerror({ error: result.data && result.data.error, response: result.data }) } }).catch(function (err) { if (details.onerror) { details.onerror({ error: String(err) }) } }); return { abort: function () { __gmCall("abortRequest", [reqId]).catch(function () { }) } } }',
    openInTab: 'function GM_openInTab (url, options) { __gmCall("openInTab", [String(url), { active: !(options && options.active === false) }]).catch(function () { }) }',
    setClipboard: 'function GM_setClipboard (text) { __gmCall("setClipboard", [String(text)]).catch(function () { }) }',
    getResourceText: 'function GM_getResourceText (name) { var r = __gmResources[String(name)]; if (!r) { throw new Error("resource not found: " + name) } return r.text }',
    getResourceURL: 'function GM_getResourceURL (name) { var r = __gmResources[String(name)]; if (!r) { throw new Error("resource not found: " + name) } return "data:" + r.mime + ";base64," + r.base64 }',
    registerMenuCommand: 'function GM_registerMenuCommand (label) { __gmMenuCommands.push(String(label)); return String(label) }'
  }

  /* Builds the sandboxed GM.* prelude around a userscript body.
     scriptInfo: {id, name, version, description, namespace, matches, includes, grants, run-at}
     values: stored GM values; resources: {name: {text, mime, base64}} from stored @resource data. */
  function buildGMWrapped (scriptInfo, values, resources) {
    var info = scriptInfo || {}
    var metaInfo = {
      id: info.id,
      name: info.name,
      version: info.version || '',
      description: info.description || '',
      namespace: info.namespace || '',
      matches: info.matches || [],
      includes: info.includes || [],
      grants: info.grants || [],
      'run-at': info['run-at'] || ''
    }
    var resourceData = {}
    var resourceNames = Object.keys(resources || {})
    resourceNames.forEach(function (name) {
      var entry = resources[name]
      if (entry && typeof entry.text === 'string') {
        resourceData[name] = { text: entry.text, mime: entry.mime || 'text/plain', base64: entry.base64 || '' }
      }
    })

    var prelude = '(function () {' +
      'var __gmScript = ' + JSON.stringify(metaInfo) + ';' +
      'var __gmValues = ' + JSON.stringify(values || {}) + ';' +
      'var __gmSeq = 0; var __gmMenuCommands = [];' +
      'var __gmResources = ' + JSON.stringify(resourceData) + ';' +
      'var __gmInfo = { script: __gmScript, scriptHandler: "Tabi userscripts", version: "1.0", scriptMetaStr: "" };' +
      'function __gmCall (call, args) { if (typeof __tabiGM__ === "undefined" || !__tabiGM__ || !__tabiGM__.request) { return Promise.resolve({ ok: false, data: { error: "GM bridge unavailable" } }) } return __tabiGM__.request({ scriptId: __gmScript.id, call: call, args: args }) };'

    var granted = grantList((info.grants) || [])
    var gmObjectEntries = []
    for (var api in GM_OBJECT_NAMES) {
      if (!granted[api]) {
        continue
      }
      if (!GM_API_SOURCES[api]) {
        continue
      }
      prelude += GM_API_SOURCES[api] + ';'
      gmObjectEntries.push(GM_OBJECT_NAMES[api][1] + ': ' + GM_OBJECT_NAMES[api][0])
    }
    if (granted.info) {
      prelude += GM_API_SOURCES.info + ';'
      gmObjectEntries.push('info: GM_info')
    }
    if (granted.unsafeWindow) {
      prelude += 'var unsafeWindow = window;'
    }
    if (gmObjectEntries.length) {
      prelude += 'var GM = { ' + gmObjectEntries.join(', ') + ' };'
    }

    return prelude + ';(function () {' + (info.content || '') + '\n})();})();'
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
    normalizeRunAt: normalizeRunAt,
    assembleScriptCode: assembleScriptCode,
    buildGMWrapped: buildGMWrapped,
    identityHash: identityHash
  }
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = userscriptMeta
}
