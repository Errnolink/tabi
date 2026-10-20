/*
Container sessions. Each container is a persistent Electron partition, so cookies,
storage and cache are fully separated between containers. The registry lives in
userData/containers.json; the Default container is an alias over the partition
Min already uses for all tabs (persist:webcontent), so existing logins keep working.
*/

/* global fs, path, ipc, app, session, windows, getWindowWebContents, userDataPath */

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

const containerRegistry = { version: 1, containers: [] }
const containerSessions = new Map() // partition string -> session
const containerPartitionAddedListeners = []
var lastContainerTabCounts = {}
var containersQuitHandled = false

function loadContainersRegistry () {
  var valid = true
  try {
    var data = JSON.parse(fs.readFileSync(containersPath, 'utf-8'))
    if (data && Array.isArray(data.containers)) {
      containerRegistry.containers = data.containers
    } else {
      valid = false
    }
  } catch (e) {
    valid = false
  }
  if (!containerRegistry.containers.some(c => c.id === DEFAULT_CONTAINER.id)) {
    containerRegistry.containers.unshift(Object.assign({}, DEFAULT_CONTAINER))
    valid = false
  }
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
  fs.writeFileSync(containersPath, JSON.stringify(containerRegistry, null, 2))
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

function broadcastContainersChanged () {
  windows.openWindows.forEach(function (w) {
    if (w.closed) {
      return
    }
    try {
      getWindowWebContents(w.win).send('containers-changed', containerRegistry.containers)
    } catch (e) {
      // the window's UI view can already be torn down during shutdown
    }
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
    fs.writeFileSync(pendingContainerRemovalsPath, JSON.stringify(pending))
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
    fs.writeFileSync(pendingContainerRemovalsPath, JSON.stringify(remaining))
  } else {
    fs.rmSync(pendingContainerRemovalsPath, { force: true })
  }
}

function removeContainer (id) {
  var container = containerRegistry.containers.find(c => c.id === id)
  if (!container) {
    throw new Error('container does not exist')
  }
  if (container.builtIn) {
    throw new Error('the default container cannot be removed')
  }

  containerRegistry.containers = containerRegistry.containers.filter(c => c.id !== id)
  saveContainersRegistry()
  broadcastContainersChanged()

  var ses = containerSessions.get(container.partition)
  containerSessions.delete(container.partition)

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
  e.returnValue = containerRegistry.containers
})

ipc.handle('containers:list', function () {
  return containerRegistry.containers
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

ipc.handle('containers:remove', function (e, id) {
  return removeContainer(id)
})

/* bridge for the container manager page (sandboxed, so it goes through postMessage + preload) */

ipc.handle('containers:page', function (e, payload) {
  var senderURL
  try {
    senderURL = e.senderFrame.url
  } catch (err) {
    return null
  }
  if (!senderURL || !senderURL.startsWith('min://app/pages/containers/')) {
    return null
  }

  if (!payload || typeof payload.op !== 'string') {
    return null
  }

  if (payload.op === 'list') {
    return containerRegistry.containers
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
    return removeContainer(payload.args.id)
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
      setTimeout(resolve, 5000)
    })
  ]).then(function () {
    app.quit()
  })
})

loadContainersRegistry()
