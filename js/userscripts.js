/* implements userscript support */

var path = require('path')
var chokidar = require('chokidar')

var webviews = require('webviews.js')
var settings = require('util/settings/settings.js')
var bangsPlugin = require('searchbar/bangsPlugin.js')
var tabEditor = require('navbar/tabEditor.js')
var searchbarPlugins = require('searchbar/searchbarPlugins.js')
var urlParser = require('util/urlParser.js')

function parseTampermonkeyFeatures (content) {
  var parsedFeatures = {}
  var foundFeatures = false

  var lines = content.split('\n')

  var isInFeatures = false
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '// ==UserScript==') {
      isInFeatures = true
      continue
    }
    if (lines[i].trim() === '// ==/UserScript==') {
      isInFeatures = false
      break
    }
    if (isInFeatures && lines[i].startsWith('//')) {
      foundFeatures = true
      var feature = lines[i].replace('//', '').trim()
      var featureName = feature.split(' ')[0]
      var featureValue = feature.replace(featureName + ' ', '').trim()
      featureName = featureName.replace('@', '')

      // special case: find the localized name for the current locale
      if (featureName.startsWith('name:') && featureName.split(':')[1].substring(0, 2) === navigator.language.substring(0, 2)) {
        featureName = 'name:local'
      }
      if (parsedFeatures[featureName]) {
        parsedFeatures[featureName].push(featureValue)
      } else {
        parsedFeatures[featureName] = [featureValue]
      }
    }
  }
  if (foundFeatures) {
    return parsedFeatures
  } else {
    return null
  }
}

// checks if a URL matches a wildcard pattern
function urlMatchesPattern (url, pattern) {
  if (pattern === '*') {
    return true
  }
  var idx = -1
  var parts = pattern.split('*')
  for (var i = 0; i < parts.length; i++) {
    idx = url.indexOf(parts[i], idx)
    if (idx === -1) {
      return false
    }
    idx += parts[i].length
  }
  return idx !== -1
}

var MANAGER_DETECT_HOSTS = ['greasyfork.org', 'sleazyfork.org']

var MANAGER_DETECT_SCRIPT = '(function () {' +
  'var api = { version: "5.3.3", isInstalled: function () { return Promise.resolve(null) } };' +
  'var external = window.external;' +
  'if (!external || typeof external !== "object") {' +
  'external = {};' +
  'try { Object.defineProperty(window, "external", { value: external, configurable: true }) } catch (err) { return }' +
  '}' +
  'try { Object.defineProperty(external, "Tampermonkey", { value: api, configurable: true }) } catch (err) { }' +
  '})()'

var GM_GRANT_ALIASES = {
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

var GM_OBJECT_NAMES = {
  getValue: ['GM_getValue', 'getValue'],
  setValue: ['GM_setValue', 'setValue'],
  deleteValue: ['GM_deleteValue', 'deleteValue'],
  listValues: ['GM_listValues', 'listValues'],
  addStyle: ['GM_addStyle', 'addStyle'],
  xmlhttpRequest: ['GM_xmlhttpRequest', 'xmlHttpRequest'],
  openInTab: ['GM_openInTab', 'openInTab'],
  setClipboard: ['GM_setClipboard', 'setClipboard'],
  registerMenuCommand: ['GM_registerMenuCommand', 'registerMenuCommand']
}

var GM_API_SOURCES = {
  info: 'var GM_info = __gmInfo',
  getValue: 'function GM_getValue (name, defaultValue) { return Object.prototype.hasOwnProperty.call(__gmValues, name) ? __gmValues[name] : defaultValue }',
  setValue: 'function GM_setValue (name, value) { __gmValues[name] = value; __gmRelay("setValue", [name, value]) }',
  deleteValue: 'function GM_deleteValue (name) { delete __gmValues[name]; __gmRelay("setValue", [name, undefined]) }',
  listValues: 'function GM_listValues () { return Object.keys(__gmValues) }',
  addStyle: 'function GM_addStyle (css) { var style = document.createElement("style"); style.textContent = css; (document.head || document.documentElement || document).appendChild(style); return style }',
  xmlhttpRequest: 'function GM_xmlhttpRequest (details) { details = details || {}; var reqId = "r" + (++__gmSeq); __gmPending[reqId] = function (result) { if (result.ok) { if (details.onload) { details.onload(result.data) } } else if (result.data && result.data.timedOut) { if (details.ontimeout) { details.ontimeout(result.data) } } else if (details.onerror) { details.onerror({ error: result.error, response: result.data }) } }; __gmRelay("xmlhttpRequest", [reqId, { method: details.method || "GET", url: details.url, headers: details.headers || null, data: details.data || null, timeout: details.timeout || 0, responseType: details.responseType || "text" }], reqId); return { abort: function () { __gmRelay("abortRequest", [reqId]) } } }',
  openInTab: 'function GM_openInTab (url, options) { __gmRelay("openInTab", [String(url), { active: !(options && options.active === false) }]) }',
  setClipboard: 'function GM_setClipboard (text) { __gmRelay("setClipboard", [String(text)]) }',
  registerMenuCommand: 'function GM_registerMenuCommand (label) { __gmMenuCommands.push(String(label)); return String(label) }'
}

function scriptGrantedAPIs (meta) {
  var granted = {}
  var list = (meta && meta.grants) || []
  for (var i = 0; i < list.length; i++) {
    var key = GM_GRANT_ALIASES[String(list[i]).trim()]
    if (key) {
      granted[key] = true
    }
  }
  return granted
}

function buildGMWrappedScript (script, values) {
  var meta = script.meta || {}
  var granted = scriptGrantedAPIs(meta)
  var scriptInfo = {
    id: script.id,
    name: meta.name || script.name,
    version: meta.version || '',
    description: meta.description || '',
    namespace: meta.namespace || '',
    matches: meta.matches || [],
    includes: meta.includes || [],
    grants: meta.grants || [],
    'run-at': meta.runAt || ''
  }

  var prelude = '(function () {' +
    'var __gmScript = ' + JSON.stringify(scriptInfo) + ';' +
    'var __gmValues = ' + JSON.stringify(values || {}) + ';' +
    'var __gmSeq = 0; var __gmPending = {}; var __gmMenuCommands = [];' +
    'var __gmInfo = { script: __gmScript, scriptHandler: "Tabi userscripts", version: "1.0", scriptMetaStr: "" };' +
    'function __gmRelay (call, args, cbId) { window.postMessage({ __xbGM: { scriptId: __gmScript.id, call: call, args: args, cbId: cbId } }, window.location.origin) }' +
    'window.addEventListener("message", function (e) { if (e.source !== window) { return } var d = e.data; if (!d || !d.__xbGMResult) { return } var cb = __gmPending[d.__xbGMResult.cbId]; if (!cb) { return } delete __gmPending[d.__xbGMResult.cbId]; cb(d.__xbGMResult) });'

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

  return prelude + ';(function () {' + script.content + '\n})();})();'
}

const userscripts = {
  scriptDir: path.join(window.globalArgs['user-data-path'], 'userscripts'),
  scripts: [], // {options: {}, content}
  dirScripts: [],
  storeScripts: [],
  masterEnabled: false,
  showDirectory: function () {
    electron.shell.openPath(userscripts.scriptDir)
  },
  ensureDirectoryExists: function () {
    fs.access(userscripts.scriptDir, fs.constants.R_OK, function (err) {
      if (err) {
        fs.mkdir(userscripts.scriptDir, function (err) {
          if (err) {
            console.warn('failed to create userscripts directory', err)
          }
        })
      }
    })
  },
  rebuildScriptList: function () {
    if (!userscripts.masterEnabled) {
      userscripts.scripts = []
      return
    }
    var managed = userscripts.storeScripts.filter(function (script) {
      return script.enabled !== false
    })
    userscripts.scripts = managed.concat(userscripts.dirScripts)
  },
  loadScripts: function () {
    userscripts.dirScripts = []
    userscripts.rebuildScriptList()

    fs.readdir(userscripts.scriptDir, function (err, files) {
      if (err) {
        userscripts.ensureDirectoryExists()
        return
      } else if (files.length === 0) {
        return
      }

      // store the scripts in memory
      files.forEach(function (filename) {
        if (filename.endsWith('.js')) {
          // installed userscripts are managed by the userscript store, not the loose-file directory
          if (filename.endsWith('.user.js') && fs.existsSync(path.join(userscripts.scriptDir, filename.slice(0, -8) + '.json'))) {
            return
          }
          fs.readFile(path.join(userscripts.scriptDir, filename), 'utf-8', function (err, file) {
            if (err || !file) {
              return
            }

            var domain = filename.slice(0, -3)
            if (domain.startsWith('www.')) {
              domain = domain.slice(4)
            }
            if (!domain) {
              return
            }

            var tampermonkeyFeatures = parseTampermonkeyFeatures(file)
            if (tampermonkeyFeatures) {
              var scriptName = tampermonkeyFeatures['name:local'] || tampermonkeyFeatures.name
              if (scriptName) {
                scriptName = scriptName[0]
              } else {
                scriptName = filename
              }
              userscripts.dirScripts.push({ options: tampermonkeyFeatures, content: file, name: scriptName })
            } else {
              // legacy script
              if (domain === 'global') {
                userscripts.dirScripts.push({
                  options: {
                    match: ['*']
                  },
                  content: file,
                  name: filename
                })
              } else {
                userscripts.dirScripts.push({
                  options: {
                    match: ['*://' + domain]
                  },
                  content: file,
                  name: filename
                })
              }
            }
            userscripts.rebuildScriptList()
          })
        }
      })
    })
  },
  loadStoreScripts: function () {
    return ipc.invoke('userscriptStore:list', true).then(function (items) {
      userscripts.storeScripts = (items || []).map(function (item) {
        var features = parseTampermonkeyFeatures(item.content) || {}
        var name = features['name:local'] || features.name
        return {
          options: features,
          content: item.content,
          name: (name && name[0]) || item.meta.name || item.id,
          id: item.id,
          managed: true,
          enabled: item.meta.enabled !== false,
          meta: item.meta
        }
      })
      userscripts.rebuildScriptList()
    }).catch(function (err) {
      console.warn('failed to load installed userscripts', err)
    })
  },
  startDirWatcher: function () {
    userscripts.stopDirWatcher() // destroy any previous instance
    userscripts.watcherInstance = chokidar.watch(userscripts.scriptDir, {
      ignoreInitial: true,
      disableGlobbing: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    })
    userscripts.watcherInstance.on('all', debounce(function () {
      userscripts.loadScripts()
    }, 100))
  },
  stopDirWatcher: function () {
    if (userscripts.watcherInstance) {
      userscripts.watcherInstance.close()
      userscripts.watcherInstance = null
    }
  },
  getMatchingScripts: function (src) {
    return userscripts.scripts.filter(function (script) {
      if (script.enabled === false) {
        return false
      }
      if (
        (!script.options.match && !script.options.include) ||
        (script.options.match && script.options.match.some(pattern => urlMatchesPattern(src, pattern))) ||
        (script.options.include && script.options.include.some(pattern => urlMatchesPattern(src, pattern)))) {
        if (!script.options.exclude || !script.options.exclude.some(pattern => urlMatchesPattern(src, pattern))) {
          return true
        }
      }
    })
  },
  injectManagerDetection: function (tabId, src) {
    if (!userscripts.masterEnabled) {
      return
    }
    var host = ''
    try {
      host = new URL(src).hostname
    } catch (err) {
      return
    }
    var matched = MANAGER_DETECT_HOSTS.some(function (detectHost) {
      return host === detectHost || host.endsWith('.' + detectHost)
    })
    if (!matched) {
      return
    }
    webviews.callAsync(tabId, 'executeJavaScript', [MANAGER_DETECT_SCRIPT, false, null])
  },
  runScript: function (tabId, script) {
    if (urlParser.isInternalURL(tabs.get(tabId).url)) {
      return
    }
    if (script.managed && script.id && Object.keys(scriptGrantedAPIs(script.meta)).length > 0) {
      ipc.invoke('userscriptStore:getValues', script.id).then(function (values) {
        return webviews.callAsync(tabId, 'executeJavaScript', [buildGMWrappedScript(script, values), false, null])
      }).catch(function (err) {
        console.warn('failed to run userscript', script.id, err)
      })
      return
    }
    webviews.callAsync(tabId, 'executeJavaScript', [script.content, false, null])
  },
  onPageLoad: function (tabId) {
    var src = tabs.get(tabId).url

    userscripts.injectManagerDetection(tabId, src)

    if (userscripts.scripts.length === 0) {
      return
    }

    userscripts.getMatchingScripts(src).forEach(function (script) {
      // TODO run different types of scripts at the correct time
      if (!script.options['run-at'] || script.options['run-at'].some(i => ['document-start', 'document-body', 'document-end', 'document-idle'].includes(i))) {
        userscripts.runScript(tabId, script)
      }
    })
  },
  initialize: function () {
    settings.listen('userscriptsEnabled', function (value) {
      userscripts.masterEnabled = value === true
      if (userscripts.masterEnabled) {
        userscripts.loadScripts()
        userscripts.startDirWatcher()
      } else {
        userscripts.stopDirWatcher()
      }
      userscripts.rebuildScriptList()
    })

    ipc.on('userscript-store-changed', function () {
      userscripts.loadStoreScripts()
    })
    userscripts.loadStoreScripts()

    webviews.bindEvent('dom-ready', userscripts.onPageLoad)

    webviews.bindIPC('showUserscriptDirectory', function () {
      userscripts.showDirectory()
    })

    bangsPlugin.registerCustomBang({
      phrase: '!run',
      snippet: l('runUserscript'),
      isAction: false,
      showSuggestions: function (text, input, event) {
        searchbarPlugins.reset('bangs')

        var isFirst = true
        userscripts.scripts.forEach(function (script) {
          if (script.name.toLowerCase().startsWith(text.toLowerCase())) {
            searchbarPlugins.addResult('bangs', {
              title: script.name,
              fakeFocus: isFirst && text,
              click: function () {
                tabEditor.hide()
                userscripts.runScript(tabs.getSelected(), script)
              }
            })
            isFirst = false
          }
        })
      },
      fn: function (text) {
        if (!text) {
          return
        }
        var matchingScript = userscripts.scripts.find(script => script.name.toLowerCase().startsWith(text.toLowerCase()))
        if (matchingScript) {
          userscripts.runScript(tabs.getSelected(), matchingScript)
        }
      }
    })
  }
}

module.exports = userscripts
