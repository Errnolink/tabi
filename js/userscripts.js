/* implements userscript support */

var path = require('path')
var chokidar = require('chokidar')

var webviews = require('webviews.js')
var settings = require('util/settings/settings.js')
var bangsPlugin = require('searchbar/bangsPlugin.js')
var tabEditor = require('navbar/tabEditor.js')
var searchbarPlugins = require('searchbar/searchbarPlugins.js')
var urlParser = require('util/urlParser.js')
var userscriptMeta = require('util/userscriptMeta.js')
var tabState = require('tabState.js')

var GM_WORLD_ID = 977

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

function scriptGrantedAPIs (meta) {
  return userscriptMeta.grantList((meta && meta.grants) || [])
}

function scriptInfoForScript (script) {
  var meta = script.meta || {}
  return {
    id: script.id,
    name: meta.name || script.name,
    version: meta.version || '',
    description: meta.description || '',
    namespace: meta.namespace || '',
    matches: meta.matches || [],
    includes: meta.includes || [],
    grants: meta.grants || [],
    'run-at': meta.runAt || '',
    content: script.content
  }
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
    ipc.invoke('userscript-register-dir-scripts', {
      enabled: userscripts.masterEnabled,
      scripts: userscripts.dirScripts.map(function (script) {
        return { options: script.options, content: script.content }
      })
    }).catch(function () { })
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

            var tampermonkeyFeatures = userscriptMeta.parseHeader(file)
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
                    match: ['*://' + domain + '/*']
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
        var features = userscriptMeta.parseHeader(item.content) || {}
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
      return userscriptMeta.matchesUrl(script.options || {}, src)
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
  runScript: function (tabId, script, src) {
    var ownerTask = tabState.getTaskContainingTab(tabId)
    var tab = ownerTask ? ownerTask.tabs.get(tabId) : null
    var pageURL = src || (tab && tab.url)
    if (!pageURL || urlParser.isInternalURL(pageURL)) {
      return
    }
    var assetsPromise = (script.managed && script.id)
      ? ipc.invoke('userscriptStore:getAssets', script.id).catch(function () { return null })
      : Promise.resolve(null)
    if (script.managed && script.id && Object.keys(scriptGrantedAPIs(script.meta)).length > 0) {
      Promise.all([assetsPromise, ipc.invoke('userscriptStore:getValues', script.id)]).then(function (results) {
        var assets = results[0] || { requires: [], resources: {} }
        var wrapped = userscriptMeta.buildGMWrapped(scriptInfoForScript(script), results[1], assets.resources || {})
        var code = userscriptMeta.assembleScriptCode(assets.requires, wrapped)
        return webviews.callAsync(tabId, 'executeJavaScriptInIsolatedWorld', [GM_WORLD_ID, [{ code: code }], false])
      }).catch(function (err) {
        console.warn('failed to run userscript', script.id, err)
      })
      return
    }
    assetsPromise.then(function (assets) {
      var code = userscriptMeta.assembleScriptCode(assets && assets.requires, script.content)
      webviews.callAsync(tabId, 'executeJavaScript', [code, false, null])
    })
  },
  onPageLoad: function (tabId) {
    var ownerTask = tabState.getTaskContainingTab(tabId)
    if (!ownerTask) {
      return
    }
    var tab = ownerTask.tabs.get(tabId)
    if (!tab) {
      return
    }
    var src = tab.url

    userscripts.injectManagerDetection(tabId, src)

    if (userscripts.scripts.length === 0) {
      return
    }

    userscripts.getMatchingScripts(src).forEach(function (script) {
      /* document-start scripts are injected by the frame preload before page scripts run */
      if (userscriptMeta.normalizeRunAt(script.options) === 'document-start') {
        return
      }
      userscripts.runScript(tabId, script, src)
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
