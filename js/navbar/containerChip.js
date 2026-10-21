const containers = require('containers.js')
const glassMenu = require('glassMenu.js')
const browserUI = require('browserUI.js')

const chip = document.getElementById('omnibox-container')

function selectedTab () {
  return window.tabs && tabs.getSelected() ? tabs.get(tabs.getSelected()) : null
}

function update () {
  const tab = selectedTab()
  const container = tab && !tab.private ? containers.get(tab.containerId) : null
  if (!container || containers.isDefault(container.id)) {
    chip.hidden = true
    return
  }
  chip.hidden = false
  chip.textContent = container.name
  chip.style.setProperty('--chip-color', container.color)
  chip.title = container.name + ' · Container (click to switch or manage)'
}

function showChipPopover () {
  const tab = selectedTab()
  if (!tab) {
    return
  }
  const currentId = containers.sanitizeContainerId(tab.containerId)
  const currentContainer = containers.get(currentId)

  const popover = document.createElement('div')
  popover.className = 'container-chip-panel'

  const head = document.createElement('div')
  head.className = 'container-chip-head'
  const dot = document.createElement('span')
  dot.className = 'container-chip-dot'
  dot.style.backgroundColor = currentContainer.color
  const title = document.createElement('span')
  title.className = 'container-chip-title'
  title.textContent = currentContainer.name
  const badge = document.createElement('span')
  badge.className = 'container-chip-badge'
  badge.textContent = l('containersActiveBadge') || 'Active Container'
  head.append(dot, title, badge)

  const desc = document.createElement('div')
  desc.className = 'container-chip-desc'
  desc.textContent = l('containersExplanationShort') || 'Separate cookies and logins, so you can be signed in to several accounts at once.'

  const section = document.createElement('div')
  section.className = 'container-chip-section'
  const sectionTitle = document.createElement('div')
  sectionTitle.className = 'container-chip-section-title'
  sectionTitle.textContent = l('containersSwitchHeading') || 'Switch container for this tab:'
  const switchNote = document.createElement('div')
  switchNote.className = 'container-chip-note'
  switchNote.textContent = l('containersSwitchNote') || 'Moving to another container reloads the tab logged out.'
  section.append(sectionTitle, switchNote)

  const list = document.createElement('div')
  list.className = 'container-chip-list'

  containers.list().forEach(function (container) {
    const isCurrent = container.id === currentId
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'container-chip-item' + (isCurrent ? ' current' : '')

    const itemDot = document.createElement('span')
    itemDot.className = 'container-chip-item-dot'
    itemDot.style.backgroundColor = container.color

    const itemName = document.createElement('span')
    itemName.className = 'container-chip-item-name'
    itemName.textContent = container.name

    item.append(itemDot, itemName)

    if (isCurrent) {
      const tag = document.createElement('span')
      tag.className = 'container-chip-item-current i carbon:checkmark'
      item.appendChild(tag)
    } else {
      item.addEventListener('click', function () {
        glassMenu.close()
        containers.reopenTabInContainer(tab.id, container.id)
      })
    }

    list.appendChild(item)
  })
  section.appendChild(list)

  const actions = document.createElement('div')
  actions.className = 'container-chip-actions'

  const newBtn = document.createElement('button')
  newBtn.type = 'button'
  newBtn.className = 'container-chip-action-btn'
  newBtn.innerHTML = '<i class="i carbon:add"></i><span>' + (l('newContainerQuick') || 'New Container…') + '</span>'
  newBtn.addEventListener('click', function () {
    glassMenu.close()
    const rect = chip.getBoundingClientRect()
    containers.promptCreate({ x: Math.round(rect.left), y: Math.round(rect.bottom + 6) }, function (newContainer) {
      if (newContainer) {
        containers.reopenTabInContainer(tab.id, newContainer.id)
      }
    })
  })

  const manageBtn = document.createElement('button')
  manageBtn.type = 'button'
  manageBtn.className = 'container-chip-action-btn'
  manageBtn.innerHTML = '<i class="i carbon:settings"></i><span>' + (l('manageContainers') || 'Manage Containers…') + '</span>'
  manageBtn.addEventListener('click', function () {
    glassMenu.close()
    browserUI.addTab(tabs.add({ url: 'min://app/pages/containers/index.html' }), { enterEditMode: false })
  })

  actions.append(newBtn, manageBtn)
  popover.append(head, desc, section, actions)

  const rect = chip.getBoundingClientRect()
  glassMenu.openPanel(popover, {
    x: Math.round(rect.left),
    y: Math.round(rect.bottom + 6)
  })
}

function initialize () {
  chip.addEventListener('click', function (e) {
    e.stopPropagation()
    showChipPopover()
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
