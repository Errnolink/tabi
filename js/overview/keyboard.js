const overview = require('overview/overview.js')

function onKeyDown (e) {
  const active = document.activeElement
  const onCard = active && active.classList && active.classList.contains('ov-card')
  if (e.key === 'Escape') {
    e.preventDefault()
    if (overview.query && document.activeElement === overview.search) {
      overview.search.value = ''
      overview.query = ''
      overview.relayout()
    } else {
      overview.hide()
    }
    return
  }
  if (!onCard) {
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    overview.hide(active.dataset.tab)
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    const cards = overview.visibleCards()
    const next = cards[cards.indexOf(active) + 1] || cards[cards.indexOf(active) - 1]
    overview.closeTab(active.dataset.tab, active)
    if (next) {
      setTimeout(() => { const card = overview.cardFor(next.dataset.tab); if (card) card.focus() }, 240)
    }
  } else if (e.key.startsWith('Arrow')) {
    e.preventDefault()
    overview.moveFocus(active, e.key)
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    overview.search.focus()
  }
}

function moveFocus (from, key) {
  const a = from.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best = null
  let bestScore = Infinity
  overview.visibleCards().forEach(function (card) {
    if (card === from) {
      return
    }
    const b = card.getBoundingClientRect()
    const dx = b.left + b.width / 2 - ax
    const dy = b.top + b.height / 2 - ay
    const forward = key === 'ArrowRight' ? dx : key === 'ArrowLeft' ? -dx : key === 'ArrowDown' ? dy : -dy
    const side = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx)
    if (forward <= 4) {
      return
    }
    const score = forward + side * 2.2
    if (score < bestScore) {
      bestScore = score
      best = card
    }
  })
  if (best) {
    best.focus()
    best.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
}

module.exports = { onKeyDown, moveFocus }
