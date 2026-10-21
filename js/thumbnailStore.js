const thumbnailStore = {
  cache: new Map(),
  failures: new Map(),
  loadTokens: new Map(),
  initialized: false,

  getPath: function (tabId) {
    const userData = (window.globalArgs && window.globalArgs['user-data-path']) || ''
    if (!userData) {
      return null
    }
    const sep = window.platformType === 'windows' ? '\\' : '/'
    return userData + sep + 'thumbnails' + sep + tabId + '.jpg'
  },

  peek: function (tabId, version) {
    const cached = thumbnailStore.cache.get(tabId)
    if (cached && cached.version === version) {
      return cached.url
    }
    return null
  },

  load: function (tabId, version) {
    const cached = thumbnailStore.cache.get(tabId)
    if (cached && cached.version === version) {
      return Promise.resolve(cached.url)
    }
    const filePath = thumbnailStore.getPath(tabId)
    if (!filePath || typeof fs === 'undefined' || !fs.promises) {
      return Promise.resolve(null)
    }
    const token = (thumbnailStore.loadTokens.get(tabId) || 0) + 1
    thumbnailStore.loadTokens.set(tabId, token)
    return fs.promises.readFile(filePath).then(function (buffer) {
      thumbnailStore.failures.delete(tabId)
      if (thumbnailStore.loadTokens.get(tabId) !== token) {
        return null
      }
      const previous = thumbnailStore.cache.get(tabId)
      if (previous && previous.url) {
        URL.revokeObjectURL(previous.url)
      }
      const url = URL.createObjectURL(new Blob([buffer], { type: 'image/jpeg' }))
      thumbnailStore.cache.set(tabId, { url: url, version: version })
      return url
    }).catch(function () {
      return null
    })
  },

  failed: function (tabId, version) {
    return thumbnailStore.failures.get(tabId) === version
  },

  markFailed: function (tabId, version) {
    thumbnailStore.failures.set(tabId, version)
  },

  forget: function (tabId) {
    thumbnailStore.failures.delete(tabId)
    thumbnailStore.loadTokens.delete(tabId)
    const cached = thumbnailStore.cache.get(tabId)
    if (cached) {
      URL.revokeObjectURL(cached.url)
      thumbnailStore.cache.delete(tabId)
    }
  },

  initialize: function () {
    if (thumbnailStore.initialized) {
      return
    }
    thumbnailStore.initialized = true
    tasks.on('tab-updated', function (tabId, key) {
      if (key === 'thumbVersion') {
        thumbnailStore.forget(tabId)
      }
    })
    tasks.on('tab-destroyed', function (tabId) {
      thumbnailStore.forget(tabId)
    })
  }
}

thumbnailStore.initialize()

module.exports = thumbnailStore
