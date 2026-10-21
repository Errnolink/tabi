const Sortable = require('sortablejs')
const { webUtils } = require('electron')
const settings = require('util/settings/settings.js')
const containers = require('containers.js')
const tabHoverCard = require('navbar/tabHoverCard.js')
const state = require('navbar/tabBar/state.js')
const util = require('navbar/tabBar/util.js')
const tabBar = require('navbar/tabBar.js')

const leaving = state.leaving

function attachSortable (list) {
  return Sortable.create(list, {
    group: 'tabi-tabs',
    animation: 260,
    easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.05)',
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 4,
    ghostClass: 'tab-ghost',
    chosenClass: 'tab-chosen',
    dragClass: 'tab-drag',
    filter: '.tab-close, .tab-audio',
    preventOnFilter: false,
    onStart: function () {
      tabHoverCard.hide()
      state.flags.dragging = true
      document.body.classList.add('sidebar-dragging')
    },
    onEnd: function (e) {
      state.flags.dragging = false
      document.body.classList.remove('sidebar-dragging')
      tabBar.commitDrop(e)
    }
  })
}

function commitDrop (e) {
  const tabId = e.item.getAttribute('data-tab')
  const fromTask = tasks.get(e.from.getAttribute('data-task'))
  const toTask = tasks.get(e.to.getAttribute('data-task'))
  if (!fromTask || !toTask) {
    tabBar.render()
    return
  }
  const oldIndex = fromTask.tabs.getIndex(tabId)
  if (oldIndex === -1) {
    tabBar.render()
    return
  }
  const moved = fromTask.tabs.splice(oldIndex, 1)[0]
  const order = Array.from(e.to.children).filter(c => c.classList.contains('tab-item') && !leaving.has(c.getAttribute('data-tab')))
  const newIndex = Math.max(0, order.indexOf(e.item))
  toTask.tabs.splice(newIndex, 0, moved)

  if (fromTask.id !== toTask.id) {
    if (moved.selected) {
      moved.selected = false
      const next = fromTask.tabs.get().slice().sort((a, b) => b.lastActivity - a.lastActivity)[0]
      if (next) {
        fromTask.tabs.setSelected(next.id)
      }
    }
    if (fromTask.tabs.count() === 0) {
      util.browserUI().closeTask(fromTask.id)
    }
    util.browserUI().switchToTask(toTask.id)
    util.browserUI().switchToTab(tabId)
  }
  tabBar.render()
}

function bindContainerDrops (container) {
  container.addEventListener('dragover', function (e) {
    e.preventDefault()
  })
  container.addEventListener('drop', function (e) {
    e.preventDefault()
    tabHoverCard.hide()
    const data = e.dataTransfer
    const bucketEl = e.target.closest('.bucket')
    const taskId = bucketEl ? bucketEl.getAttribute('data-task') : tasks.getSelected().id
    if (tasks.getSelected().id !== taskId) {
      util.browserUI().switchToTask(taskId)
    }
    const openInBackground = !settings.get('openTabsInForeground')
    if (data && data.files && data.files.length > 0) {
      for (let i = 0; i < data.files.length; i++) {
        let filePath = ''
        try {
          filePath = webUtils.getPathForFile(data.files[i])
        } catch (err) {}
        if (!filePath) {
          continue
        }
        const fileUrl = 'file://' + filePath
        const selected = tabs.get(tabs.getSelected())
        const newTab = tabs.add({
          url: fileUrl,
          private: selected ? selected.private : false,
          containerId: containers.containerForNewTab(taskId)
        })
        util.browserUI().addTab(newTab, {
          enterEditMode: false,
          openInBackground: openInBackground
        })
      }
    } else {
      const text = data ? data.getData('text') : ''
      if (text) {
        const selected = tabs.get(tabs.getSelected())
        const newTab = tabs.add({
          url: text,
          private: selected ? selected.private : false,
          containerId: containers.containerForNewTab(taskId)
        })
        util.browserUI().addTab(newTab, {
          enterEditMode: false,
          openInBackground: openInBackground
        })
      }
    }
  })
}

module.exports = { attachSortable, commitDrop, bindContainerDrops }
