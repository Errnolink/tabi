/* global ipc */

const glassMenu = require('glassMenu.js')

function refocusPage () {
  try {
    const webviews = require('webviews.js')
    if (webviews && typeof webviews.focus === 'function') {
      webviews.focus()
    }
  } catch (e) {}
}

function nativeToTemplate (items) {
  return items.map(function (item) {
    if (item.type === 'separator') {
      return { type: 'separator' }
    }
    return {
      label: item.label,
      type: item.type,
      checked: item.checked,
      enabled: item.enabled,
      accelerator: item.accelerator,
      submenu: item.submenu ? nativeToTemplate(item.submenu) : null,
      click: item.submenu ? null : () => ipc.send('menu-native-click', item.nativeId)
    }
  })
}

function open (menuTemplate, x, y, extraData) {
  const sections = menuTemplate.map(section => section.slice())
  const fromPage = extraData && extraData.tabId != null
  const options = {
    x,
    y,
    onClose: function () {
      if (extraData && typeof extraData.onClose === 'function') {
        extraData.onClose()
      }
      if (!extraData || !extraData.keepFocus) {
        refocusPage()
      }
    }
  }
  if (fromPage && extraData.contextMenuParams) {
    ipc.invoke('menu-extension-items', { tabId: extraData.tabId, contextMenuParams: extraData.contextMenuParams }).then(function (items) {
      if (items.length) {
        sections.push(nativeToTemplate(items))
      }
      glassMenu.open(sections, options)
    })
    return
  }
  glassMenu.open(sections, options)
}

function openAppMenu (x, y) {
  ipc.invoke('menu-app-items').then(function (items) {
    glassMenu.open(nativeToTemplate(items), { x, y, onClose: refocusPage })
  })
}

module.exports = { open, openAppMenu }
