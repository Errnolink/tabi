const tabActions = require('tabActions.js')
const overview = require('overview/overview.js')

function makeDropTarget (el, taskId) {
  el.addEventListener('dragover', function (e) {
    if (e.dataTransfer.types.includes('application/x-tabi-tab')) {
      e.preventDefault()
      el.classList.add('drop-over')
    }
  })
  el.addEventListener('dragleave', function (e) {
    if (!el.contains(e.relatedTarget)) {
      el.classList.remove('drop-over')
    }
  })
  el.addEventListener('drop', function (e) {
    const tabId = e.dataTransfer.getData('application/x-tabi-tab')
    el.classList.remove('drop-over')
    if (!tabId) {
      return
    }
    e.preventDefault()
    overview.moveTab(tabId, taskId || tasks.get(tasks.add({}, tasks.getLength())).id)
  })
}

function moveTab (tabId, targetTaskId) {
  tabActions.moveToTask(tabId, targetTaskId)
  overview.relayout()
}

module.exports = { makeDropTarget, moveTab }
