/* global ipc, windows, getView, getExtensionContextMenuItems, raiseUIView, lowerUIView, buildAppMenu */

const nativeMenuItems = new Map()
let nextNativeMenuItemId = 1

function formatAccelerator (accelerator) {
  if (!accelerator) {
    return null
  }
  const order = ['Ctrl', 'Alt', 'Shift']
  const parts = String(accelerator).split('+').map(function (part) {
    const lower = part.toLowerCase()
    if (/^(cmdorctrl|commandorcontrol|mod|ctrl|control|cmd|command)$/.test(lower)) {
      return 'Ctrl'
    }
    if (lower === 'option' || lower === 'alt') {
      return 'Alt'
    }
    if (lower === 'shift') {
      return 'Shift'
    }
    return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)
  })
  const mods = order.filter(m => parts.includes(m))
  const keys = parts.filter(p => !order.includes(p))
  return mods.concat(keys).join('+')
}

function serializeMenuItems (items) {
  return items.filter(item => item.visible !== false).map(function (item) {
    const id = nextNativeMenuItemId++
    nativeMenuItems.set(id, item)
    return {
      nativeId: id,
      type: item.type === 'separator' ? 'separator' : (item.type === 'checkbox' || item.type === 'radio' ? item.type : 'normal'),
      label: item.label,
      enabled: item.enabled !== false,
      checked: !!item.checked,
      accelerator: formatAccelerator(item.accelerator),
      submenu: item.submenu ? serializeMenuItems(item.submenu.items) : null
    }
  })
}

ipc.on('menu-raise', function (e) {
  const entry = windows.windowFromContents(e.sender)
  if (entry) {
    raiseUIView(entry.win)
    e.sender.focus()
  }
})

ipc.on('menu-lower', function (e) {
  const entry = windows.windowFromContents(e.sender)
  if (entry) {
    lowerUIView(entry.win)
  }
})

ipc.handle('menu-extension-items', function (e, data) {
  nativeMenuItems.clear()
  const view = getView(data.tabId)
  if (!view) {
    return []
  }
  return serializeMenuItems(getExtensionContextMenuItems(view.webContents, data.contextMenuParams))
})

let appMenu = null

function resetAppMenuCache () {
  appMenu = null
}

ipc.handle('menu-app-items', function () {
  nativeMenuItems.clear()
  if (!appMenu) {
    appMenu = buildAppMenu({ secondary: true })
  }
  return serializeMenuItems(appMenu.items)
})

ipc.on('menu-native-click', function (e, nativeId) {
  const item = nativeMenuItems.get(nativeId)
  const entry = windows.windowFromContents(e.sender)
  if (item && entry) {
    item.click({ triggeredByAccelerator: false }, entry.win, e.sender)
  }
})

const menuRoleMethods = { undo: 'undo', redo: 'redo', cut: 'cut', copy: 'copy', paste: 'paste', pasteandmatchstyle: 'pasteAndMatchStyle', selectall: 'selectAll', delete: 'delete' }

ipc.on('menu-role', function (e, role) {
  const method = menuRoleMethods[role]
  if (method) {
    e.sender[method]()
  }
})
