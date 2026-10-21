const writeFileAtomic = require('write-file-atomic')

var settings = {
  filePath: null,
  fileWritePromise: null,
  list: {},
  onChangeCallbacks: [],
  writeFile: function () {
    /*
      Writing to the settings file from multiple places simultaneously causes data corruption, so to avoid that:
      * We forward data from the renderer process to the main process, and only write from there
      * In the main process, we put multiple save requests in a queue (by chaining them to a promise) so they execute individually
      * https://github.com/minbrowser/min/issues/1520
      */

    /* eslint-disable no-inner-declarations */
    function newFileWrite () {
      return new Promise(function (resolve, reject) {
        writeFileAtomic(settings.filePath, JSON.stringify(settings.list), {}, function (err) {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }

    function ongoingFileWrite () {
      return settings.fileWritePromise || Promise.resolve()
    }
    /* eslint-enable no-inner-declarations */

    // eslint-disable-next-line no-return-assign
    settings.fileWritePromise = ongoingFileWrite().then(newFileWrite).then(() => settings.fileWritePromise = null)
  },
  runChangeCallbacks (key) {
    settings.onChangeCallbacks.forEach(function (listener) {
      if (!key || !listener.key || listener.key === key) {
        try {
          if (listener.key) {
            listener.cb(settings.list[listener.key])
          } else {
            listener.cb(key)
          }
        } catch (e) {
          console.warn('error in settings change listener', e)
        }
      }
    })
  },
  get: function (key) {
    return settings.list[key]
  },
  listen: function (key, cb) {
    if (key && cb) {
      cb(settings.get(key))
      settings.onChangeCallbacks.push({ key, cb })
    } else if (key) {
      // global listener
      settings.onChangeCallbacks.push({ cb: key })
    }
  },
  set: function (key, value) {
    settings.list[key] = value
    settings.writeFile()
    settings.runChangeCallbacks(key)

    windows.getAll().forEach(function (win) {
      getWindowWebContents(win).send('settingChanged', key, value)
    })
  },
  merge: function (key, patch) {
    var base = settings.list[key]
    if (typeof base !== 'object' || base === null) {
      base = {}
    }
    settings.list[key] = Object.assign({}, base, patch)
    settings.writeFile()
    settings.runChangeCallbacks(key)

    windows.getAll().forEach(function (win) {
      getWindowWebContents(win).send('settingChanged', key, settings.list[key])
    })
  },
  initialize: function (userDataPath) {
    settings.filePath = userDataPath + (process.platform === 'win32' ? '\\' : '/') + 'settings.json'

    try {
      const fileData = fs.readFileSync(settings.filePath, 'utf-8')
      if (fileData) {
        settings.list = JSON.parse(fileData)
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn('Error reading settings file:', e)
      }
    }

    ipc.on('settingChanged', function (e, key, value) {
      settings.list[key] = value
      settings.writeFile()
      settings.runChangeCallbacks(key)

      windows.getAll().forEach(function (win) {
        if (getWindowWebContents(win).id !== e.sender.id) {
          getWindowWebContents(win).send('settingChanged', key, value)
        }
      })
    })

    ipc.on('settingMerged', function (e, key, patch) {
      settings.merge(key, patch)
    })
  }
}

module.exports = settings
