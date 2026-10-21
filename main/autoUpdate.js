/* global fs, path, app, ipc, Menu, dialog, windows, sendIPCToWindow, isDevelopmentMode, buildAppMenu, mainMenu, resetAppMenuCache, l */

var autoUpdaterInstance = null

var updateState = {
  // only NSIS-installed builds carry an app-update.yml; dev runs and the portable zip never call the updater
  supported: process.platform === 'win32' && !isDevelopmentMode && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml')),
  ready: false,
  version: null
}

function logUpdateEvent (message) {
  try {
    var logPath = path.join(app.getPath('userData'), 'update.log')
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 512 * 1024) {
      fs.writeFileSync(logPath, '')
    }
    fs.appendFileSync(logPath, new Date().toISOString() + ' ' + message + '\n')
  } catch (e) { }
}

ipc.handle('get-update-state', function () {
  return updateState
})

function rebuildAppMenusForUpdate () {
  try {
    mainMenu = buildAppMenu()
    Menu.setApplicationMenu(mainMenu)
  } catch (e) {
    logUpdateEvent('menu rebuild failed: ' + (e && e.message))
  }
  resetAppMenuCache()
}

function getUpdateMenuItemLabel () {
  if (updateState.ready && updateState.version) {
    return l('updateRestartToInstall').replace('%s', updateState.version)
  }
  return l('appMenuCheckForUpdates')
}

function quitAndInstallUpdate () {
  if (!updateState.ready) {
    return
  }
  logUpdateEvent('installing update ' + updateState.version)
  // quitAndInstall destroys the windows, so it must not run inside the menu click handler
  setImmediate(function () {
    autoUpdaterInstance.quitAndInstall(false, true)
  })
}

function showUpdateDialog (window, message) {
  var options = {
    type: 'info',
    title: l('appMenuCheckForUpdates'),
    message: message,
    buttons: [l('closeDialog')]
  }
  if (window && !window.isDestroyed()) {
    dialog.showMessageBox(window, options)
  } else {
    dialog.showMessageBox(options)
  }
}

async function checkForUpdatesManually (window) {
  if (updateState.ready) {
    quitAndInstallUpdate()
    return
  }
  if (!updateState.supported) {
    showUpdateDialog(window, l('updateNotAvailableHere'))
    return
  }
  try {
    var result = await autoUpdaterInstance.checkForUpdates()
    var version = result && result.updateInfo && result.updateInfo.version
    if (version && version !== app.getVersion()) {
      logUpdateEvent('manual check: update ' + version + ' found, downloading')
      showUpdateDialog(window, l('updateDownloading').replace('%s', version))
    } else {
      logUpdateEvent('manual check: up to date')
      showUpdateDialog(window, l('updateUpToDate'))
    }
  } catch (e) {
    logUpdateEvent('manual check failed: ' + (e && (e.stack || e.message)))
    showUpdateDialog(window, l('updateCheckFailed').replace('%s', (e && e.message) ? e.message : String(e)))
  }
}

function handleUpdateMenuItem (window) {
  if (updateState.ready) {
    quitAndInstallUpdate()
  } else {
    checkForUpdatesManually(window)
  }
}

ipc.on('installUpdateNow', function () {
  quitAndInstallUpdate()
})

function initializeAutoUpdate () {
  if (!updateState.supported || autoUpdaterInstance) {
    return
  }

  autoUpdaterInstance = require('electron-updater').autoUpdater
  autoUpdaterInstance.autoDownload = true
  autoUpdaterInstance.autoInstallOnAppQuit = true
  autoUpdaterInstance.logger = null

  autoUpdaterInstance.on('checking-for-update', function () {
    logUpdateEvent('checking for update')
  })
  autoUpdaterInstance.on('update-available', function (info) {
    logUpdateEvent('update available: ' + info.version)
  })
  autoUpdaterInstance.on('update-not-available', function (info) {
    logUpdateEvent('no update available, ' + info.version + ' is the latest')
  })
  autoUpdaterInstance.on('update-downloaded', function (info) {
    updateState.ready = true
    updateState.version = info.version
    logUpdateEvent('update downloaded: ' + info.version)
    rebuildAppMenusForUpdate()
    windows.getAll().forEach(function (win) {
      sendIPCToWindow(win, 'update-downloaded', { version: info.version })
    })
  })
  autoUpdaterInstance.on('error', function (err) {
    logUpdateEvent('error: ' + (err && (err.stack || err.message)))
  })

  setTimeout(function () {
    autoUpdaterInstance.checkForUpdates().catch(function (e) {
      logUpdateEvent('automatic check failed: ' + (e && (e.stack || e.message)))
    })
  }, 10 * 1000)

  setInterval(function () {
    autoUpdaterInstance.checkForUpdates().catch(function (e) {
      logUpdateEvent('automatic check failed: ' + (e && (e.stack || e.message)))
    })
  }, 6 * 60 * 60 * 1000)
}

app.on('ready', function () {
  initializeAutoUpdate()
})
