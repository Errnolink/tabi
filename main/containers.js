/*
Container sessions. Each container is a persistent Electron partition, so cookies,
storage and cache are fully separated between containers. The registry lives in
userData/containers.json; the container with id 'default' is an alias over the
partition Min already uses for all tabs (persist:webcontent), so existing logins
keep working. The registry tracks a defaultId for the default *role*; it starts
pointing at the id-'default' container and can be moved to any other container
("make default"), including as part of deleting the current default. Container
ids and partitions never change; only the role does.
*/

/* global fs, path, ipc, app, session, windows, webContents, getWindowWebContents, userDataPath, extensionsTeardownPartition */

const containersPath = path.join(userDataPath, 'containers.json')
const pendingContainerRemovalsPath = path.join(userDataPath, 'pending-container-removals.json')

const DEFAULT_CONTAINER = {
  id: 'default',
  name: 'Default',
  color: '#7c7c7d',
  icon: 'circle',
  partition: 'persist:webcontent',
  builtIn: true
}

const CONTAINER_COLORS = {
  blue: '#37adff',
  cyan: '#00c79a',
  green: '#51cd00',
  yellow: '#ffcb00',
  orange: '#ff9f00',
  red: '#ff613d',
  pink: '#ff4bda',
  purple: '#af51f5',
  violet: '#764edd',
  gray: '#7c7c7d'
}

const CONTAINER_ICONS = ['fingerprint', 'briefcase', 'dollar', 'cart', 'vacation', 'gift', 'food', 'fruit', 'pet', 'tree', 'chill', 'circle', 'fence']

const containerRegistry = { version: 1, containers: [], defaultId: DEFAULT_CONTAINER.id }
const containerSessions = new Map() // partition string -> session
const containerPartitionAddedListeners = []
var lastContainerTabCounts = {}
var containersQuitHandled = false

function loadContainersRegistry () {
  var valid = true
  var defaultId = DEFAULT_CONTAINER.id
  try {
    var data = JSON.parse(fs.readFileSync(containersPath, 'utf-8'))
    if (data && Array.isArray(data.containers)) {
      containerRegistry.containers = data.containers
      if (typeof data.defaultId === 'string') {
        defaultId = data.defaultId
      }
    } else {
      valid = false
    }
  } catch (e) {
    valid = false
  }
  if (containerRegistry.containers.length === 0) {
    // fresh registry only; once the id-'default' container is deleted it must
    // not come back, since ids are stable
    containerRegistry.containers.unshift(Object.assign({}, DEFAULT_CONTAINER))
    defaultId = DEFAULT_CONTAINER.id
    valid = false
  }
  if (!containerRegistry.containers.some(c => c.id === defaultId)) {
    defaultId = containerRegistry.containers[0].id
    valid = false
  }
  containerRegistry.defaultId = defaultId
  if (valid) {
    containerRegistry.containers.forEach(function (c) {
      if (!c.partition || typeof c.partition !== 'string') {
        valid = false
      }
    })
  }
  if (!valid) {
    saveContainersRegistry()
  }
}

function saveContainersRegistry () {
  writeFileAtomic(containersPath, JSON.stringify(containerRegistry, null, 2))
}

function newContainerId () {
  for (var i = 0; i < 5; i++) {
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    if (!containerRegistry.containers.some(c => c.id === id)) {
      return id
    }
  }
  return Date.now().toString(36) + process.hrtime.bigint().toString(36)
}

function getContainerSession (partition) {
  if (!containerSessions.has(partition)) {
    containerSessions.set(partition, session.fromPartition(partition))
  }
  return containerSessions.get(partition)
}

function containerPartitions () {
  return containerRegistry.containers.map(c => c.partition)
}

function onContainerPartitionAdded (fn) {
  containerPartitions().forEach(function (partition) {
    fn(partition)
  })
  containerPartitionAddedListeners.push(fn)

  return function () {
    var index = containerPartitionAddedListeners.indexOf(fn)
    if (index !== -1) {
      containerPartitionAddedListeners.splice(index, 1)
    }
  }
}

function currentDefaultId () {
  if (containerRegistry.containers.some(c => c.id === containerRegistry.defaultId)) {
    return containerRegistry.defaultId
  }
  if (containerRegistry.containers.length > 0) {
    containerRegistry.defaultId = containerRegistry.containers[0].id
    saveContainersRegistry()
    return containerRegistry.defaultId
  }
  return DEFAULT_CONTAINER.id
}

function registryState () {
  return {
    containers: containerRegistry.containers,
    defaultId: currentDefaultId()
  }
}

function setDefaultContainer (id) {
  if (!containerRegistry.containers.some(c => c.id === id)) {
    throw new Error('container does not exist')
  }
  containerRegistry.defaultId = id
  saveContainersRegistry()
  broadcastContainersChanged()

  return id
}

function broadcastContainersChanged () {
  var state = registryState()
  windows.openWindows.forEach(function (w) {
    if (w.closed) {
      return
    }
    try {
      getWindowWebContents(w.win).send('containers-changed', state)
    } catch (e) {
      // the window's UI view can already be torn down during shutdown
    }
  })

  webContents.getAllWebContents().forEach(function (contents) {
    try {
      var url = contents.getURL()
      if (url && url.startsWith('min://app/pages/containers')) {
        contents.send('containers-page-changed', state)
      }
    } catch (e) { }
  })
}

function validContainerColor (color) {
  return typeof color === 'string' && (/^#[0-9a-fA-F]{6}$/.test(color) || Object.values(CONTAINER_COLORS).includes(color))
}

function validateContainerData (data) {
  if (!data || typeof data !== 'object') {
    return null
  }
  var result = {}
  if (typeof data.name === 'string' && data.name.trim()) {
    result.name = data.name.trim().slice(0, 64)
  } else {
    return null
  }
  if (data.color !== undefined) {
    if (!validContainerColor(data.color)) {
      return null
    }
    result.color = data.color
  }
  if (data.icon !== undefined) {
    if (!CONTAINER_ICONS.includes(data.icon)) {
      return null
    }
    result.icon = data.icon
  }
  return result
}

function addContainer (data) {
  var validated = validateContainerData(data)
  if (!validated) {
    throw new Error('invalid container data')
  }

  var container = Object.assign({
    id: newContainerId(),
    color: CONTAINER_COLORS.blue,
    icon: 'circle'
  }, validated, {
    id: newContainerId(),
    partition: null
  })
  container.partition = 'persist:container-' + container.id

  containerRegistry.containers.push(container)
  saveContainersRegistry()

  getContainerSession(container.partition)
  containerPartitionAddedListeners.forEach(function (fn) {
    fn(container.partition)
  })
  broadcastContainersChanged()

  return container
}

function updateContainer (id, data) {
  var container = containerRegistry.containers.find(c => c.id === id)
  if (!container) {
    throw new Error('container does not exist')
  }
  if (container.builtIn && data && data.name !== undefined && !data.name.trim()) {
    throw new Error('invalid container data')
  }

  var validated = validateContainerData(Object.assign({
    name: container.name,
    color: container.color,
    icon: container.icon
  }, data))
  if (!validated) {
    throw new Error('invalid container data')
  }

  Object.assign(container, validated)
  saveContainersRegistry()
  broadcastContainersChanged()

  return container
}

function pendingContainerRemovals () {
  try {
    var data = JSON.parse(fs.readFileSync(pendingContainerRemovalsPath, 'utf-8'))
    if (Array.isArray(data)) {
      return data
    }
  } catch (e) { }
  return []
}

function queuePendingContainerRemoval (dirName) {
  var pending = pendingContainerRemovals()
  if (!pending.includes(dirName)) {
    pending.push(dirName)
    writeFileAtomic(pendingContainerRemovalsPath, JSON.stringify(pending))
  }
}

function removeContainerPartitionDir (dirName) {
  var dirPath = path.join(userDataPath, 'Partitions', dirName)
  try {
    fs.rmSync(dirPath, { recursive: true, force: true })
    return true
  } catch (err) {
    // on Windows Chromium keeps file handles open for live sessions; retry next startup
    if (['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'].includes(err.code)) {
      queuePendingContainerRemoval(dirName)
      return false
    }
    console.warn('failed to remove container partition dir', dirName, err)
    return false
  }
}

function retryPendingContainerRemovals () {
  var pending = pendingContainerRemovals()
  if (pending.length === 0) {
    return
  }
  var remaining = pending.filter(function (dirName) {
    return !removeContainerPartitionDir(dirName)
  })
  if (remaining.length > 0) {
    writeFileAtomic(pendingContainerRemovalsPath, JSON.stringify(remaining))
  } else {
    fs.rmSync(pendingContainerRemovalsPath, { force: true })
  }
}

function clearContainerData (id) {
  var container = containerRegistry.containers.find(c => c.id === id)
  if (!container) {
    throw new Error('container does not exist')
  }
  var ses = getContainerSession(container.partition)

  return Promise.allSettled([
    ses.clearData(),
    ses.clearStorageData(),
    ses.clearCache(),
    ses.cookies.flushStore()
  ]).then(function (results) {
    results.forEach(function (result) {
      if (result.status === 'rejected') {
        console.warn('failed to clear container data', id, result.reason)
      }
    })
    notifyContainerCleared(container.id)

    return true
  })
}

/* the UI reloads every open tab of the container once its views exist again */
function notifyContainerCleared (id) {
  windows.openWindows.forEach(function (w) {
    if (w.closed) {
      return
    }
    try {
      getWindowWebContents(w.win).send('containers-cleared', id)
    } catch (e) { }
  })
}

function removeContainer (id, newDefaultId) {
  var container = containerRegistry.containers.find(c => c.id === id)
  if (!container) {
    throw new Error('container does not exist')
  }

  var wasDefault = containerRegistry.defaultId === id
  if (wasDefault) {
    if (containerRegistry.containers.length < 2) {
      throw new Error('another container must exist before the default can be removed')
    }
    if (!newDefaultId || newDefaultId === id || !containerRegistry.containers.some(c => c.id === newDefaultId)) {
      throw new Error('a replacement default container must be chosen')
    }
    setDefaultContainer(newDefaultId)
  }

  containerRegistry.containers = containerRegistry.containers.filter(c => c.id !== id)
  saveContainersRegistry()
  broadcastContainersChanged()

  extensionsTeardownPartition(container.partition)

  var ses = containerSessions.get(container.partition)
  containerSessions.delete(container.partition)

  if (container.partition === DEFAULT_CONTAINER.partition) {
    // the shared partition can never be destroyed or have its dir deleted;
    // once its container is gone it just stays empty and unused
    if (ses) {
      ses.clearData().catch(err => console.warn('failed to clear container data', id, err))
    }
    return true
  }

  var dirName = 'container-' + container.id
  if (ses) {
    // the session object itself can't be destroyed, but its data can
    ses.clearData().catch(err => console.warn('failed to clear container data', id, err))
      .finally(function () {
        removeContainerPartitionDir(dirName)
      })
  } else {
    removeContainerPartitionDir(dirName)
  }

  return true
}

ipc.on('containers:list-sync', function (e) {
  e.returnValue = registryState()
})

ipc.handle('containers:list', function () {
  return registryState()
})

ipc.on('containers:tabCounts', function (e, counts) {
  lastContainerTabCounts = counts || {}
})

ipc.handle('containers:tabCounts', function () {
  return lastContainerTabCounts
})

ipc.handle('containers:add', function (e, data) {
  return addContainer(data)
})

ipc.handle('containers:update', function (e, id, data) {
  return updateContainer(id, data)
})

ipc.handle('containers:remove', function (e, id, newDefaultId) {
  return removeContainer(id, newDefaultId)
})

ipc.handle('containers:clear', function (e, id) {
  return clearContainerData(id)
})

/* bridge for the container manager page (sandboxed, so it goes through postMessage + preload) */

ipc.handle('containers:page', function (e, payload) {
  var senderURL
  try {
    senderURL = e.senderFrame.url
  } catch (err) {
    return null
  }
  var fromContainersPage = senderURL && senderURL.startsWith('min://app/pages/containers/')
  var fromSettingsPage = senderURL && senderURL.startsWith('min://app/pages/settings/')
  if (!fromContainersPage && !fromSettingsPage) {
    return null
  }

  if (!payload || typeof payload.op !== 'string') {
    return null
  }

  if (fromSettingsPage && payload.op !== 'list' && payload.op !== 'vocabulary') {
    return null
  }

  if (payload.op === 'list') {
    return registryState()
  }
  if (payload.op === 'vocabulary') {
    return { colors: CONTAINER_COLORS, icons: CONTAINER_ICONS }
  }
  if (payload.op === 'tabCounts') {
    return lastContainerTabCounts
  }
  if (payload.op === 'add') {
    return addContainer(payload.args)
  }
  if (payload.op === 'update') {
    return updateContainer(payload.args.id, payload.args.data)
  }
  if (payload.op === 'remove') {
    return removeContainer(payload.args.id, payload.args.newDefaultId)
  }
  if (payload.op === 'clear') {
    return clearContainerData(payload.args.id)
  }
  if (payload.op === 'setDefault') {
    return setDefaultContainer(payload.args.id)
  }
  return null
})

app.on('ready', function () {
  retryPendingContainerRemovals()

  // materialize every container session now so that the session-created
  // handlers registered before ready (filtering, permissions, downloads,
  // min:// protocol) wire the new sessions
  containerRegistry.containers.forEach(function (c) {
    getContainerSession(c.partition)
  })
})

/* Chromium writes cookies on a ~30s timer; a login made right before quitting
   would be lost, so flush every container's cookie store before quitting */
app.on('before-quit', function (e) {
  if (containersQuitHandled) {
    return
  }
  containersQuitHandled = true
  e.preventDefault()

  Promise.race([
    Promise.allSettled(Array.from(containerSessions.values()).map(ses => ses.cookies.flushStore())),
    new Promise(function (resolve) {
      setTimeout(resolve, 1500)
    })
  ]).then(function () {
    app.quit()
  })
})

loadContainersRegistry()
