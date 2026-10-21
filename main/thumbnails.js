/* global path, app, fs, ipc */

const THUMBNAIL_MAX_FILES = 300

const thumbnailManager = {
  dir: null,
  lruMap: new Map(),

  getDir: function () {
    if (!this.dir) {
      this.dir = path.join(app.getPath('userData'), 'thumbnails')
      try {
        if (!fs.existsSync(this.dir)) {
          fs.mkdirSync(this.dir, { recursive: true })
        }
      } catch (err) {
        console.error('Failed to create thumbnail directory:', err)
      }
    }
    return this.dir
  },

  getFilePath: function (tabId) {
    return path.join(this.getDir(), `${tabId}.jpg`)
  },

  initLRU: function () {
    try {
      const dir = this.getDir()
      const files = fs.readdirSync(dir)
      const entries = []
      for (const file of files) {
        if (file.endsWith('.jpg')) {
          const tabId = file.slice(0, -4)
          const fullPath = path.join(dir, file)
          const stat = fs.statSync(fullPath)
          entries.push({ tabId: tabId, mtime: stat.mtimeMs })
        }
      }
      entries.sort(function (a, b) {
        return a.mtime - b.mtime
      })
      this.lruMap.clear()
      for (const entry of entries) {
        this.lruMap.set(entry.tabId, entry.mtime)
      }
      this.pruneLRU()
    } catch (err) {
      console.error('Failed to init thumbnail LRU:', err)
    }
  },

  pruneLRU: function () {
    try {
      while (this.lruMap.size > THUMBNAIL_MAX_FILES) {
        const oldestTabId = this.lruMap.keys().next().value
        if (!oldestTabId) {
          break
        }
        this.delete(oldestTabId)
      }
    } catch (err) {
      console.error('Failed to prune thumbnail LRU:', err)
    }
  },

  save: async function (tabId, nativeImg, crop) {
    if (!nativeImg || nativeImg.isEmpty()) {
      return null
    }
    const size = nativeImg.getSize()
    if (size.width === 0 || size.height === 0) {
      return null
    }

    const focused = crop ? nativeImg.crop(crop) : nativeImg
    const thumbSize = focused.getSize()
    const thumb = focused.resize({ width: Math.min(560, thumbSize.width), quality: 'good' }).toJPEG(80)
    await fs.promises.writeFile(this.getFilePath(tabId), thumb)

    this.lruMap.delete(tabId)
    this.lruMap.set(tabId, Date.now())
    this.pruneLRU()

    return {
      aspect: thumbSize.width / thumbSize.height
    }
  },

  delete: function (tabId) {
    try {
      this.lruMap.delete(tabId)
      const filePath = this.getFilePath(tabId)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (err) {
      // file might already be removed
    }
  }
}

app.whenReady().then(function () {
  thumbnailManager.initLRU()
})

ipc.on('deleteThumbnail', function (e, tabId) {
  thumbnailManager.delete(tabId)
})
