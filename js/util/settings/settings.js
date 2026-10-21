var settings = {
  filePath: window.globalArgs['user-data-path'] + (process.platform === 'win32' ? '\\' : '/') + 'settings.json',
  list: {},
  onChangeCallbacks: [],
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
    ipc.send('settingChanged', key, value)
    settings.runChangeCallbacks(key)
  },
  merge: function (key, patch) {
    var base = settings.list[key]
    if (typeof base !== 'object' || base === null) {
      base = {}
    }
    settings.list[key] = Object.assign({}, base, patch)
    ipc.send('settingMerged', key, patch)
    settings.runChangeCallbacks(key)
  },
  initialize: function () {
    var fileData
    try {
      fileData = fs.readFileSync(settings.filePath, 'utf-8')
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn(e)
      }
    }
    if (fileData) {
      settings.list = JSON.parse(fileData)
    }

    settings.runChangeCallbacks()

    ipc.on('settingChanged', function (e, key, value) {
      settings.list[key] = value
      settings.runChangeCallbacks(key)
    })
  }
}

settings.initialize()
module.exports = settings
