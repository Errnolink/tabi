const webviews = require('webviews.js')
const browserUI = require('browserUI.js')
const tabEditor = require('navbar/tabEditor.js')
const focusMode = require('focusMode.js')
const modalMode = require('modalMode.js')
const thumbnailStore = require('thumbnailStore.js')
const util = require('overview/util.js')
const cards = require('overview/cards.js')
const overview = require('overview/overview.js')

function swapCardThumb (tabId) {
  if (!overview.isShown) {
    return
  }
  const owner = tasks.getTaskContainingTab(tabId)
  const tab = owner ? owner.tabs.get(tabId) : null
  const card = tab ? overview.cardFor(tabId) : null
  if (!card) {
    return
  }
  thumbnailStore.forget(tabId)
  const img = card.querySelector('.ov-thumb img')
  if (img) {
    cards.loadThumb(tab, img)
  }
}

function applyFreshPreview (tabId, promise) {
  promise.then(function () {
    overview.swapCardThumb(tabId)
  })
}

async function show () {
  if (overview.isShown || overview.busy) {
    return
  }
  if (focusMode.enabled()) {
    focusMode.warn()
    return
  }
  if (modalMode.enabled()) {
    return
  }
  overview.busy = true
  tabEditor.hide()

  const placeholder = document.getElementById('webview-placeholder')
  const selected = tabs.getSelected()
  const morph = util.canMorph() && !!selected && webviews.hasViewForTab(selected)
  if (morph) {
    overview.applyFreshPreview(selected, overview.freshPreview(selected))
  }
  document.body.classList.add('overview-morph')
  webviews.requestPlaceholder('overview')
  if (morph) {
    await util.nextFrame()
  }

  overview.isShown = true
  overview.query = ''
  overview.search.value = ''
  document.body.classList.add('overview-is-shown')
  document.body.setAttribute('data-context', 'overview')
  document.getElementById('overview-button').classList.add('active')

  const reveal = function () {
    overview.el.hidden = false
    overview.render()
    overview.el.classList.add('entering')
    const card = overview.cardFor(tabs.getSelected())
    if (card) {
      card.scrollIntoView({ block: 'nearest' })
      if (morph) {
        placeholder.style.viewTransitionName = ''
        card.style.contentVisibility = 'visible'
        card.querySelector('.ov-thumb').style.viewTransitionName = 'tabi-page'
      }
    }
    document.body.classList.add('ov-settled')
  }

  if (morph) {
    placeholder.style.viewTransitionName = 'tabi-page'
    const transition = document.startViewTransition(reveal)
    await transition.finished.catch(() => {})
    overview.el.querySelectorAll('.ov-thumb').forEach(t => { t.style.viewTransitionName = '' })
  } else {
    reveal()
  }
  const current = overview.cardFor(tabs.getSelected()) || overview.visibleCards()[0]
  if (current) {
    current.focus({ preventScroll: true })
  } else {
    overview.search.focus()
  }
  setTimeout(() => overview.el.classList.remove('entering'), 700)
  overview.busy = false
}

async function hide (targetTabId) {
  if (!overview.isShown || overview.busy) {
    return
  }
  overview.busy = true
  const targetId = targetTabId || tabs.getSelected()
  const found = targetId ? tasks.getTaskContainingTab(targetId) : null
  const card = targetId ? overview.cardFor(targetId) : null
  const thumb = card ? card.querySelector('.ov-thumb') : null
  const thumbImg = thumb && !thumb.classList.contains('empty') ? thumb.querySelector('img') : null
  const placeholder = document.getElementById('webview-placeholder')
  const morph = util.canMorph() && thumbImg && thumbImg.src

  const conclude = function () {
    overview.el.hidden = true
    document.body.classList.remove('ov-settled')
    overview.isShown = false
    document.body.classList.remove('overview-is-shown')
    document.body.removeAttribute('data-context')
    document.getElementById('overview-button').classList.remove('active')
    if (found) {
      if (tasks.getSelected().id !== found.id) {
        browserUI.switchToTask(found.id)
      }
      browserUI.switchToTab(targetId)
    }
    if (morph) {
      placeholder.src = thumbImg.src
      placeholder.hidden = false
      placeholder.style.viewTransitionName = 'tabi-page'
    }
  }

  if (morph) {
    thumb.style.viewTransitionName = 'tabi-page'
    const transition = document.startViewTransition(conclude)
    await transition.finished.catch(() => {})
    placeholder.style.viewTransitionName = ''
  } else {
    conclude()
  }
  webviews.hidePlaceholder('overview')
  document.body.classList.remove('overview-morph')
  overview.content.textContent = ''
  overview.busy = false
}

function freshPreview (tabId) {
  return new Promise(function (resolve) {
    const waiter = {
      id: tabId,
      resolve: function (ok) {
        if (overview.previewWaiter === waiter) {
          overview.previewWaiter = null
          resolve(ok)
        }
      }
    }
    overview.previewWaiter = waiter
    webviews.captureTab(tabId, { forceCapture: true })
    setTimeout(function () {
      const owner = tasks.getTaskContainingTab(tabId)
      const tab = owner && owner.tabs.get(tabId)
      waiter.resolve(!!(tab && tab.thumbAspect))
    }, 300)
  })
}

module.exports = { swapCardThumb, applyFreshPreview, show, hide, freshPreview }
