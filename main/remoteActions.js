/*
Wraps APIs that are only available in the main process in IPC messages, so that the BrowserWindow can use them
*/

/* global containerPartitions */

ipc.handle('startFileDrag', function (e, path) {
  app.getFileIcon(path, {}).then(function (icon) {
    e.sender.startDrag({
      file: path,
      icon: icon
    })
  })
})

function showFocusModeDialog1 () {
  dialog.showMessageBox({
    type: 'info',
    buttons: [l('closeDialog')],
    message: l('isFocusMode'),
    detail: l('focusModeExplanation1') + ' ' + l('focusModeExplanation2')
  })
}

function showFocusModeDialog2 () {
  dialog.showMessageBox({
    type: 'info',
    buttons: [l('closeDialog')],
    message: l('isFocusMode'),
    detail: l('focusModeExplanation2')
  })
}

ipc.handle('showFocusModeDialog2', showFocusModeDialog2)

ipc.handle('showOpenDialog', async function (e, options) {
  const result = await dialog.showOpenDialog(windows.windowFromContents(e.sender).win, options)
  return result.filePaths
})

ipc.handle('showSaveDialog', async function (e, options) {
  const result = await dialog.showSaveDialog(windows.windowFromContents(e.sender).win, options)
  return result.filePath
})

ipc.handle('addWordToSpellCheckerDictionary', function (e, word) {
  containerPartitions().forEach(function (partition) {
    session.fromPartition(partition).addWordToSpellCheckerDictionary(word)
  })
})

ipc.handle('clearSiteData', function (e, data) {
  var origin
  try {
    origin = new URL(data.url).origin
  } catch (err) {
    return false
  }
  if (!containerPartitions().includes(data.partition)) {
    return false
  }
  var ses = session.fromPartition(data.partition)
  return ses.clearStorageData({ origin: origin }).then(function () {
    return ses.cookies.flushStore()
  }).then(() => true)
})

ipc.handle('clearStorageData', function () {
  /* It's important not to delete data from file:// from the default partition, since that would also remove internal browser data (such as bookmarks). However, HTTP data does need to be cleared, as there can be leftover data from loading external resources in the browser UI */
  var partitionClears = containerPartitions().map(function (partition) {
    var ses = session.fromPartition(partition)
    return ses.clearStorageData()
      .then(function () {
        return ses.clearCache()
      })
      .then(function () {
        return ses.clearHostResolverCache()
      })
      .then(function () {
        return ses.clearAuthCache()
      })
  })

  return Promise.all(partitionClears.concat([
    session.defaultSession.clearStorageData({ origin: 'http://' }),
    session.defaultSession.clearStorageData({ origin: 'https://' }),
    session.defaultSession.clearCache(),
    session.defaultSession.clearHostResolverCache(),
    session.defaultSession.clearAuthCache()
  ]))
})

ipc.handle('clearBrowsingData', function (e, options) {
  options = options || {}
  var jobs = []

  var partitions = []
  if (options.siteData || options.cache) {
    if (options.allContainers === false && Array.isArray(options.containerIds) && options.containerIds.length > 0) {
      options.containerIds.forEach(function (id) {
        var container = containerRegistry.containers.find(function (c) { return c.id === id })
        if (container && partitions.indexOf(container.partition) === -1) {
          partitions.push(container.partition)
        }
      })
    } else {
      partitions = containerPartitions()
    }
  }

  if (options.siteData) {
    partitions.forEach(function (partition) {
      var ses = session.fromPartition(partition)
      jobs.push(ses.clearStorageData().then(function () {
        return ses.cookies.flushStore()
      }))
    })
  }

  if (options.cache) {
    partitions.forEach(function (partition) {
      var ses = session.fromPartition(partition)
      jobs.push(ses.clearCache().then(function () {
        return ses.clearHostResolverCache()
      }).then(function () {
        return ses.clearAuthCache()
      }))
    })
    jobs.push(session.defaultSession.clearCache())
    jobs.push(session.defaultSession.clearHostResolverCache())
  }

  if (options.thumbnails) {
    try {
      var thumbDir = thumbnailManager.getDir()
      fs.readdirSync(thumbDir).forEach(function (file) {
        if (file.endsWith('.jpg')) {
          thumbnailManager.delete(file.slice(0, -4))
        }
      })
    } catch (err) { }
  }

  return Promise.all(jobs).then(function () {
    return true
  })
})

ipc.handle('fetchFavicon', async function (e, host) {
  if (typeof host !== 'string' || host.length > 253 || !/^[a-z0-9.-]+\.[a-z0-9-]+$/i.test(host)) {
    return null
  }
  var safeHost = host.toLowerCase()
  var cacheDir = path.join(userDataPath, 'faviconCache')
  var controller = new AbortController()
  var timer = setTimeout(function () {
    controller.abort()
  }, 10000)
  try {
    var response = await net.fetch('https://' + safeHost + '/favicon.ico', {
      signal: controller.signal,
      headers: { Accept: 'image/*' }
    })
    if (!response.ok) {
      return null
    }
    var contentType = (response.headers.get('content-type') || 'image/x-icon').split(';')[0].trim()
    if (!contentType.startsWith('image/')) {
      return null
    }
    var buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0 || buffer.length > 512 * 1024) {
      return null
    }
    try {
      fs.mkdirSync(cacheDir, { recursive: true })
      fs.writeFileSync(path.join(cacheDir, safeHost + '.bin'), buffer)
    } catch (err) { }
    return { dataUrl: 'data:' + contentType + ';base64,' + buffer.toString('base64') }
  } catch (err) {
    return null
  } finally {
    clearTimeout(timer)
  }
})

ipc.handle('setDefaultBrowser', function () {
  if (process.platform !== 'win32') {
    return Promise.resolve(false)
  }
  return registryInstaller.install().then(function () {
    settings.set('defaultBrowserRegistered', true)
    shell.openExternal('ms-settings:defaultapps?registeredAppUser=Tabi')
    return true
  }).catch(function () {
    return false
  })
})

/* window actions */

ipc.handle('minimize', function (e) {
  windows.windowFromContents(e.sender).win.minimize()
  // workaround for https://github.com/minbrowser/min/issues/1662
  e.sender.send('minimize')
})

ipc.handle('maximize', function (e) {
  windows.windowFromContents(e.sender).win.maximize()
  // workaround for https://github.com/minbrowser/min/issues/1662
  e.sender.send('maximize')
})

ipc.handle('unmaximize', function (e) {
  windows.windowFromContents(e.sender).win.unmaximize()
  // workaround for https://github.com/minbrowser/min/issues/1662
  e.sender.send('unmaximize')
})

ipc.handle('close', function (e) {
  windows.windowFromContents(e.sender).win.close()
})

ipc.handle('setFullScreen', function (e, fullScreen) {
  windows.windowFromContents(e.sender).win.setFullScreen(e, fullScreen)
})

// workaround for https://github.com/electron/electron/issues/38540
ipc.handle('showItemInFolder', function (e, path) {
  shell.showItemInFolder(path)
})

ipc.on('newWindow', function (e, customArgs) {
  createWindow(customArgs)
})
