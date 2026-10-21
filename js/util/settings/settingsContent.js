var settings = {
  loaded: false,
  list: {},
  onLoadCallbacks: [],
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
  get: function (key, cb) {
    // get the setting from the cache if possible
    if (settings.loaded) {
      cb(settings.list[key])

    // if the settings haven't loaded, wait until they have
    } else {
      settings.onLoadCallbacks.push({
        key: key,
        cb: cb
      })
    }
  },
  listen: function (key, cb) {
    if (key && cb) {
      settings.get(key, cb)
      settings.onChangeCallbacks.push({ key, cb })
    } else if (key) {
      // global listener
      settings.onChangeCallbacks.push({ cb: key })
    }
  },
  set: function (key, value) {
    settings.list[key] = value
    postMessage({ message: 'setSetting', key, value })
    settings.runChangeCallbacks(key)
  },
  merge: function (key, patch) {
    var base = settings.list[key]
    if (typeof base !== 'object' || base === null) {
      base = {}
    }
    settings.list[key] = Object.assign({}, base, patch)
    postMessage({ message: 'setSettingMerged', key, patch })
    settings.runChangeCallbacks(key)
  },
  load: function () {
    postMessage({ message: 'getSettingsData' })
  },
  onLoad: function (cb) {
    if (settings.loaded) {
      cb()
    } else {
      settings.onLoadCallbacks.push({
        key: '',
        cb: cb
      })
    }
  }
}

window.addEventListener('message', function (e) {
  if (e.data.message && e.data.message === 'receiveSettingsData') {
    settings.list = e.data.settings

    if (!settings.loaded) {
      settings.onLoadCallbacks.forEach(function (item) {
        item.cb(settings.list[item.key])
      })
      settings.onLoadCallbacks = []
    }

    settings.loaded = true
    settings.runChangeCallbacks()
  }
})

settings.load()
