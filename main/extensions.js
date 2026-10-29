/* global path, userDataPath, session, ipc, app, windows, createWindow, sendIPCToWindow, getView, getWindowFromViewContents, getTabIDFromWebContents, onContainerPartitionAdded, containerPartitions, DEFAULT_CONTAINER */
var ElectronChromeExtensions = require('electron-chrome-extensions').ElectronChromeExtensions
var installChromeWebStore = require('electron-chrome-web-store').installChromeWebStore
var uninstallExtension = require('electron-chrome-web-store').uninstallExtension
var updateExtensions = require('electron-chrome-web-store').updateExtensions

/*
one ElectronChromeExtensions instance per container partition; all instances
share one unpacked extension directory (userData/Extensions), so a store
install in any container is picked up by every container on next boot, and
extension state (storage, cookies, background pages) stays partition-scoped
*/
var extensionInstances = {} // partition: ElectronChromeExtensions
var pendingExtensionTabCreation = {} // token: { resolve, reject, timer }
var extensionsPath = path.join(userDataPath, 'Extensions')

function extensionManifestBlocksWebRequest (manifest) {
  if (!manifest) {
    return false
  }
  return (manifest.permissions || []).includes('webRequestBlocking')
}

function extensionsInitForPartition (partition) {
  if (extensionInstances[partition]) {
    return
  }

  var ses = session.fromPartition(partition)

  var instance = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    createTab: function (details) {
      return extensionCreateTab(details, partition)
    },
    selectTab: extensionSelectTab,
    removeTab: extensionRemoveTab,
    createWindow: extensionCreateWindow,
    removeWindow: extensionRemoveWindow
  })

  extensionInstances[partition] = instance

  ElectronChromeExtensions.handleCRXProtocol(ses)

  installChromeWebStore({
    session: ses,
    extensionsPath: extensionsPath,
    minimumManifestVersion: 2,
    autoUpdate: false
  }).catch(function (err) {
    console.warn('extension setup failed for ' + partition, err)
  })
}

/*
chrome.tabs.create: the tab model lives in the UI renderer, so ask it to
create the tab (in the calling instance's container) and wait for the view
*/
function extensionCreateTab (details, partition) {
  return new Promise(function (resolve, reject) {
    var win = windows.getCurrent()
    if (!win) {
      win = createWindow()
    }

    var token = 'ext-tab-' + Date.now() + '-' + Math.round(Math.random() * 1e9)
    var timer = setTimeout(function () {
      if (pendingExtensionTabCreation[token]) {
        delete pendingExtensionTabCreation[token]
        reject(new Error('extension tab creation timed out'))
      }
    }, 15000)
    pendingExtensionTabCreation[token] = { resolve: resolve, reject: reject, timer: timer }

    sendIPCToWindow(win, 'extension-create-tab', {
      token: token,
      url: details.url || '',
      active: details.active !== false,
      partition: partition
    })
  })
}

ipc.on('extension-tab-created', function (e, data) {
  var pending = pendingExtensionTabCreation[data.token]
  if (!pending) {
    return
  }
  clearTimeout(pending.timer)
  delete pendingExtensionTabCreation[data.token]

  var checks = 0
  var check = function () {
    var view = getView(data.tabId)
    if (view) {
      pending.resolve([view.webContents, getWindowFromViewContents(view.webContents) || windows.getCurrent()])
    } else if (checks++ < 100) {
      setTimeout(check, 50)
    } else {
      pending.reject(new Error('created extension tab has no view'))
    }
  }
  check()
})

var extensionsNotifying = false

function extensionSelectTab (tab, window) {
  if (extensionsNotifying) {
    return
  }
  var tabId = getTabIDFromWebContents(tab)
  var win = window || windows.getCurrent()
  if (tabId == null || !win) {
    return
  }
  sendIPCToWindow(win, 'extension-select-tab', { tabId: tabId })
}

var extensionsReleasingViews = new WeakSet()

function extensionRemoveTab (tab, window) {
  if (tab.isDestroyed() || extensionsReleasingViews.has(tab)) {
    return
  }
  var tabId = getTabIDFromWebContents(tab)
  var win = window || windows.getCurrent()
  if (tabId == null || !win) {
    return
  }
  sendIPCToWindow(win, 'extension-close-tab', { tabId: tabId })
}

function extensionCreateWindow (details) {
  return new Promise(function (resolve) {
    var win = createWindow()
    var url = Array.isArray(details.url) ? details.url[0] : details.url
    if (url) {
      sendIPCToWindow(win, 'addTab', { url: url })
    }
    resolve(win)
  })
}

function extensionRemoveWindow (win) {
  if (win && !win.isDestroyed()) {
    win.close()
  }
}

/* hooks called from main/viewManager.js */

function extensionsNotify (fn) {
  extensionsNotifying = true
  try {
    fn()
  } finally {
    extensionsNotifying = false
  }
}

function extensionsRegisterView (view, partition) {
  if (!containerPartitions().includes(partition)) {
    return
  }
  extensionsInitForPartition(partition)
  var instance = extensionInstances[partition]
  var win = windows.getCurrent()
  if (!instance || !win) {
    return
  }
  extensionsNotify(() => instance.addTab(view.webContents, win))
}

function extensionsUnregisterView (view) {
  var instance = ElectronChromeExtensions.fromSession(view.webContents.session)
  if (instance) {
    extensionsReleasingViews.add(view.webContents)
    instance.removeTab(view.webContents)
  }
}

function extensionsNotifyViewSelected (view) {
  var instance = ElectronChromeExtensions.fromSession(view.webContents.session)
  if (instance) {
    extensionsNotify(() => instance.selectTab(view.webContents))
  }
}

/* context menu items from chrome.contextMenus, merged in main/remoteMenu.js */

function getExtensionContextMenuItems (tab, params) {
  var instance = ElectronChromeExtensions.fromSession(tab.session)
  if (!instance) {
    return []
  }
  try {
    return instance.getContextMenuItems(tab, params)
  } catch (err) {
    console.warn('failed to build extension context menu items', err)
    return []
  }
}

/* management page requests, relayed through the view preload */

ipc.on('extensionsRequest', function (e, data) {
  var frameURL = null
  try {
    frameURL = e.senderFrame.url
  } catch (err) {
    return
  }

  if (!frameURL.startsWith('min://app/pages/')) {
    return
  }

  // uninstall and update may only be requested from the management page
  if (!frameURL.startsWith('min://app/pages/extensions/') && data.type !== 'list') {
    return
  }

  if (data.type === 'list') {
    e.sender.send('extensionsReply', { replyTo: data.requestId, extensions: extensionsListAll() })
  } else if (data.type === 'uninstall') {
    extensionsUninstall(data.id).then(function () {
      e.sender.send('extensionsReply', { replyTo: data.requestId, extensions: extensionsListAll() })
    }).catch(function (err) {
      e.sender.send('extensionsReply', { replyTo: data.requestId, error: String(err) })
    })
  } else if (data.type === 'update') {
    extensionsCheckUpdates().then(function () {
      e.sender.send('extensionsReply', { replyTo: data.requestId, extensions: extensionsListAll() })
    }).catch(function (err) {
      e.sender.send('extensionsReply', { replyTo: data.requestId, error: String(err) })
    })
  }
})

function extensionsListAll () {
  var byId = {}
  Object.keys(extensionInstances).forEach(function (partition) {
    var ses = session.fromPartition(partition)
    var sessionExtensions = ses.extensions || ses
    sessionExtensions.getAllExtensions().forEach(function (ext) {
      if (!byId[ext.id]) {
        byId[ext.id] = {
          id: ext.id,
          name: ext.name,
          version: ext.version,
          manifestVersion: ext.manifest ? ext.manifest.manifest_version : undefined,
          permissions: ext.manifest ? (ext.manifest.permissions || []) : [],
          description: ext.manifest ? ext.manifest.description : undefined,
          iconUrl: 'crx://extension-icon/' + ext.id + '/48/2?partition=' + encodeURIComponent(partition),
          blocksMinFilter: extensionManifestBlocksWebRequest(ext.manifest),
          partitions: []
        }
      }
      byId[ext.id].partitions.push(partition)
      byId[ext.id].blocksMinFilter = byId[ext.id].blocksMinFilter || extensionManifestBlocksWebRequest(ext.manifest)
    })
  })
  return Object.keys(byId).map(function (id) { return byId[id] })
}

function extensionsUninstall (id) {
  return Object.keys(extensionInstances).reduce(function (chain, partition) {
    return chain.then(function () {
      return uninstallExtension(id, { session: session.fromPartition(partition), extensionsPath: extensionsPath })
    })
  }, Promise.resolve())
}

function extensionsCheckUpdates () {
  return Object.keys(extensionInstances).reduce(function (chain, partition) {
    return chain.then(function () {
      return updateExtensions(session.fromPartition(partition))
    })
  }, Promise.resolve())
}

ipc.handle('getExtensionTabWebContentsID', function (e, tabId) {
  var view = getView(tabId)
  return view ? view.webContents.id : null
})

app.once('ready', function () {
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession)
  onContainerPartitionAdded(function (partition) {
    if (partition === DEFAULT_CONTAINER.partition) {
      extensionsInitForPartition(partition)
    }
  })
})

/* called from main/viewManager.js and main/remoteMenu.js in the concatenated main bundle */
global.extensionsRegisterView = extensionsRegisterView
global.extensionsUnregisterView = extensionsUnregisterView
global.extensionsNotifyViewSelected = extensionsNotifyViewSelected
global.getExtensionContextMenuItems = getExtensionContextMenuItems
