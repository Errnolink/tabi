const shellLayout = require('shellLayout.js')
const state = require('navbar/tabBar/state.js')
const util = require('navbar/tabBar/util.js')
const tabBar = require('navbar/tabBar.js')

let renderQueued = false
let indicatorPlaced = false
let currentTaskId = null

function render () {
  renderQueued = false
  if (!tabBar.containerInner || typeof tasks === 'undefined' || !tasks.getSelected || !tasks.getSelected()) {
    return
  }
  if (state.flags.dragging) {
    return
  }

  const animate = indicatorPlaced && !util.reduceMotion.matches
  const before = new Map()
  if (animate) {
    state.rows.forEach(function (row, id) {
      if (row.el.isConnected && !state.leaving.has(id)) {
        before.set(id, row.el.getBoundingClientRect().top)
      }
    })
  }

  const selectedTask = tasks.getSelected()
  currentTaskId = selectedTask.id
  const liveTabIds = new Set()
  const liveTaskIds = new Set()
  const entering = []

  let bucketCursor = tabBar.indicator.nextSibling
  tasks.forEach(function (task, index) {
    liveTaskIds.add(task.id)
    const bucket = state.buckets.get(task.id) || tabBar.createBucket(task.id)
    if (bucket.el !== bucketCursor) {
      tabBar.containerInner.insertBefore(bucket.el, bucketCursor)
    }
    bucketCursor = bucket.el.nextSibling

    bucket.el.style.setProperty('--bucket-hue', shellLayout.bucketHue(index))
    bucket.el.classList.toggle('is-current', task.id === selectedTask.id)
    if (task.id === selectedTask.id) {
      setAmbientHue(bucket.el)
    }
    bucket.el.classList.toggle('collapsed', !!task.collapsed)
    if (state.flags.renamingTaskId !== task.id) {
      const name = util.bucketName(task, index)
      if (bucket.name.textContent !== name) {
        bucket.name.textContent = name
      }
    }
    bucket.count.textContent = String(task.tabs.count())

    if (!task.collapsed) {
      let rowCursor = bucket.list.firstChild
      task.tabs.get().forEach(function (tab) {
        liveTabIds.add(tab.id)
        let row = state.rows.get(tab.id)
        const isNew = !row
        if (!row) {
          row = tabBar.createRow(tab.id)
        }
        while (rowCursor && state.leaving.has(rowCursor.getAttribute('data-tab'))) {
          rowCursor = rowCursor.nextSibling
        }
        if (row.el !== rowCursor) {
          bucket.list.insertBefore(row.el, rowCursor)
        } else {
          rowCursor = rowCursor.nextSibling
        }
        tabBar.updateTab(tab.id)
        if (isNew && animate) {
          entering.push(row.el)
        }
      })
    } else if (bucket.rowsFoldable) {
      task.tabs.get().forEach(function (tab) {
        liveTabIds.add(tab.id)
      })
    }
  })

  state.rows.forEach(function (row, id) {
    if (!liveTabIds.has(id) && !state.leaving.has(id)) {
      row.el.remove()
      state.rows.delete(id)
    }
  })
  state.buckets.forEach(function (bucket, id) {
    if (!liveTaskIds.has(id)) {
      bucket.sortable.destroy()
      state.buckets.delete(id)
      if (animate) {
        const el = bucket.el
        el.style.overflow = 'hidden'
        el.style.pointerEvents = 'none'
        el.animate([
          { height: el.offsetHeight + 'px', opacity: 1 },
          { height: '0px', opacity: 0, transform: 'translateX(-14px)' }
        ], { duration: 320, easing: util.motion.spatial, fill: 'forwards' }).onfinish = () => el.remove()
      } else {
        bucket.el.remove()
      }
    }
  })

  if (animate) {
    state.rows.forEach(function (row, id) {
      if (!before.has(id)) {
        return
      }
      const dy = before.get(id) - row.el.getBoundingClientRect().top
      if (Math.abs(dy) > 0.5) {
        row.el.animate([
          { transform: 'translateY(' + dy + 'px)' },
          { transform: 'translateY(0)' }
        ], { duration: 420, easing: util.motion.spatial })
      }
    })
    entering.forEach(function (el) {
      el.animate([
        { opacity: 0, transform: 'translateX(-10px) scale(0.94)' },
        { opacity: 1, transform: 'none' }
      ], { duration: 360, easing: util.motion.spatialFast })
    })
  }

  tabBar.placeIndicator(animate)
}

function scheduleRender () {
  if (!renderQueued) {
    renderQueued = true
    requestAnimationFrame(tabBar.render)
  }
}

function placeIndicator (animate) {
  const indicator = tabBar.indicator
  const selected = typeof tabs !== 'undefined' && tabs ? tabs.getSelected() : null
  const row = selected ? state.rows.get(selected) : null
  const bucketEl = row ? row.el.closest('.bucket') : null
  if (!row || !row.el.isConnected || (bucketEl && bucketEl.classList.contains('collapsed'))) {
    indicator.classList.add('hidden')
    return
  }
  state.rows.forEach(r => r.el.classList.toggle('active', r === row))
  row.el.setAttribute('aria-selected', 'true')

  const scroller = tabBar.containerInner
  const top = row.el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  const height = row.el.offsetHeight
  indicator.style.setProperty('--bucket-hue', bucketEl ? bucketEl.style.getPropertyValue('--bucket-hue') : shellLayout.bucketHue(0))

  const wasHidden = indicator.classList.contains('hidden')
  indicator.classList.toggle('no-motion', !animate || wasHidden || !indicatorPlaced)
  indicator.style.transform = 'translateY(' + top + 'px)'
  indicator.style.height = height + 'px'
  indicator.classList.remove('hidden')
  indicatorPlaced = true

  const rowRect = row.el.getBoundingClientRect()
  const viewRect = scroller.getBoundingClientRect()
  if (rowRect.top < viewRect.top + 8 || rowRect.bottom > viewRect.bottom - 8) {
    row.el.scrollIntoView({ block: 'nearest', behavior: util.reduceMotion.matches ? 'auto' : 'smooth' })
  }
}

function removeTab (tabId) {
  const row = state.rows.get(tabId)
  if (!row || !row.el.isConnected || util.reduceMotion.matches) {
    if (row) {
      row.el.remove()
      state.rows.delete(tabId)
    }
    return
  }
  state.leaving.add(tabId)
  state.rows.delete(tabId)
  const el = row.el
  el.classList.add('leaving')
  el.classList.remove('active')
  const height = el.offsetHeight
  const anim = el.animate([
    { height: height + 'px', opacity: 1, transform: 'none' },
    { height: '0px', opacity: 0, transform: 'translateX(-14px) scale(0.92)', marginTop: '0px', marginBottom: '0px' }
  ], { duration: 300, easing: util.motion.spatial, fill: 'forwards' })
  anim.onfinish = function () {
    el.remove()
    state.leaving.delete(tabId)
    tabBar.placeIndicator(true)
  }
}

function setAmbientHue (bucketEl) {
  const hue = bucketEl.style.getPropertyValue('--bucket-hue')
  if (hue && document.body.style.getPropertyValue('--ambient-hue') !== hue) {
    document.body.style.setProperty('--ambient-hue', hue)
  }
}

function updateAll () {
  tabBar.render()
}

function addTab (tabId) {
  tabBar.render()
}

function taskSwitched (taskId) {
  const task = tasks.get(taskId)
  if (!task) {
    return
  }
  const bucket = state.buckets.get(taskId)
  if (bucket) {
    state.buckets.forEach(function (b) {
      b.el.classList.toggle('is-current', b === bucket)
    })
    setAmbientHue(bucket.el)
  }
  if (currentTaskId && currentTaskId !== taskId) {
    const previous = state.buckets.get(currentTaskId)
    if (previous) {
      previous.list.querySelectorAll('.tab-permissions').forEach(function (el) {
        el.textContent = ''
      })
    }
  }
  currentTaskId = taskId
  task.tabs.get().forEach(function (tab) {
    if (state.rows.has(tab.id)) {
      tabBar.updateTab(tab.id)
    }
  })
  tabBar.placeIndicator(!util.reduceMotion.matches)
}

module.exports = { render, scheduleRender, placeIndicator, removeTab, updateAll, addTab, taskSwitched }
