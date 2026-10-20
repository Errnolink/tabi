const containers = require('containers.js')
const remoteMenu = require('remoteMenuRenderer.js')

const chip = document.getElementById('omnibox-container')

function selectedTab () {
  return window.tabs && tabs.getSelected() ? tabs.get(tabs.getSelected()) : null
}

function update () {
  const tab = selectedTab()
  const container = tab && !tab.private ? containers.get(tab.containerId || 'default') : null
  if (!container || container.id === 'default') {
    chip.hidden = true
    return
  }
  chip.hidden = false
  chip.textContent = container.name
  chip.style.setProperty('--chip-color', container.color)
  chip.title = container.name
}

function initialize () {
  chip.addEventListener('click', function (e) {
    e.stopPropagation()
    const tab = selectedTab()
    if (!tab) {
      return
    }
    const rect = chip.getBoundingClientRect()
    remoteMenu.open([
      containers.list().map(container => ({
        label: container.name,
        swatch: container.color,
        checked: container.id === (tab.containerId || 'default'),
        click: () => {
          if (container.id !== (tab.containerId || 'default')) {
            containers.reopenTabInContainer(tab.id, container.id)
          }
        }
      }))
    ], Math.round(rect.left), Math.round(rect.bottom + 6))
  })
  tasks.on('tab-selected', update)
  tasks.on('task-selected', update)
  tasks.on('tab-updated', function (id, key) {
    if (key === 'containerId' && window.tabs && id === tabs.getSelected()) {
      update()
    }
  })
  containers.on('changed', update)
}

module.exports = { initialize }
