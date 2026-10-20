/* global ipc, tabs */
/* window.require: the real require in the nodeIntegration UI renderer; browserify
   would otherwise bundle the npm electron package here (its transforms skip node_modules) */
var injectBrowserAction = window.require('electron-chrome-extensions/dist/cjs/browser-action.js').injectBrowserAction
var browserUI = require('browserUI.js')
var containers = require('containers.js')

/* mounts the extension <browser-action-list> into the toolbar and routes
   extension tab requests (create/select/close) into Min's tab model */

var actionList = null

function injectStyles () {
  var style = document.createElement('style')
  style.id = 'extensions-toolbar-style'
  style.textContent = `
#toolbar-actions {
  display: flex;
  align-items: center;
  min-width: 0;
}

#toolbar-actions browser-action-list[hidden] {
  display: none;
}

#toolbar-actions browser-action-list {
  --browser-action-hover-bg: var(--pebble-lavender);
  display: flex;
  align-items: center;
}

#toolbar-actions browser-action-list::part(action) {
  width: 30px;
  height: 30px;
  border-radius: var(--r-pill);
  background-size: 66%;
  transition: background-color var(--dur-effects-fast) var(--spring-effects-fast),
    transform var(--dur-effects-fast) var(--spring-effects-fast);
}

#toolbar-actions browser-action-list::part(action):hover {
  background-color: var(--pebble-lavender);
}

#toolbar-actions browser-action-list::part(action):active {
  transform: scale(0.9);
}

#toolbar-actions browser-action-list::part(action) .badge {
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: var(--r-pill);
  font-family: var(--font-sans);
  font-size: 9px;
  font-weight: 600;
  line-height: 14px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}
`
  document.head.appendChild(style)
}

function partitionForTab (tabId) {
  var tab = tabId != null && tabs.get(tabId)
  if (!tab || tab.private) {
    return null
  }
  return containers.partitionFor(tab.containerId)
}

function setTabAttribute (tabId, attempt) {
  ipc.invoke('getExtensionTabWebContentsID', tabId).then(function (contentsId) {
    if (!actionList || tabs.getSelected() !== tabId) {
      return
    }
    if (contentsId != null) {
      actionList.setAttribute('tab', String(contentsId))
    } else if (attempt < 10) {
      setTimeout(function () { setTabAttribute(tabId, attempt + 1) }, 100)
    }
  })
}

function updateActionList () {
  if (!actionList) {
    return
  }
  var tabId = tabs.getSelected()
  var partition = partitionForTab(tabId)
  if (!partition) {
    actionList.setAttribute('hidden', '')
    return
  }
  actionList.removeAttribute('hidden')
  actionList.setAttribute('partition', partition)
  setTabAttribute(tabId, 0)
}

function mount () {
  var slot = document.getElementById('toolbar-actions')
  if (!slot) {
    return false
  }
  actionList = document.createElement('browser-action-list')
  slot.appendChild(actionList)
  updateActionList()
  return true
}

function listenForTabEvents () {
  tabs.on('tab-selected', function () { updateActionList() })
  tabs.on('tab-updated', function (id, key) {
    if (key === 'containerId') {
      updateActionList()
    }
  })
  tabs.on('tab-destroyed', function () { updateActionList() })
  containers.on('changed', function () { updateActionList() })
}

function listenForExtensionCommands () {
  ipc.on('extension-create-tab', function (e, data) {
    var containerId = 'default'
    var match = containers.list().find(function (c) { return c.partition === data.partition })
    if (match) {
      containerId = match.id
    }

    var newTab = tabs.add({ url: data.url, containerId: containerId })

    browserUI.addTab(newTab, {
      enterEditMode: false,
      openInBackground: !data.active
    })

    ipc.send('extension-tab-created', { token: data.token, tabId: newTab })
  })

  ipc.on('extension-select-tab', function (e, data) {
    if (tabs.get(data.tabId)) {
      browserUI.switchToTab(data.tabId)
    }
  })

  ipc.on('extension-close-tab', function (e, data) {
    if (tabs.get(data.tabId)) {
      browserUI.closeTab(data.tabId)
    }
  })
}

function initialize () {
  injectBrowserAction()
  injectStyles()

  if (!mount()) {
    var tries = 0
    var retry = setInterval(function () {
      if (mount() || tries++ > 100) {
        clearInterval(retry)
      }
    }, 100)
  }

  listenForExtensionCommands()

  // tabs is assigned once the first task is selected during startup
  if (tabs) {
    listenForTabEvents()
    updateActionList()
  } else {
    var wait = setInterval(function () {
      if (tabs) {
        clearInterval(wait)
        listenForTabEvents()
        updateActionList()
      }
    }, 50)
  }
}

module.exports = { initialize }
