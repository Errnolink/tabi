/* global ipc */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

const SUBMENU_DELAY = 140
const EDGE = 8

let layer = null
let stack = []
let session = null
let lastPointer = { x: 0, y: 0 }

window.addEventListener('pointerdown', function (e) {
  lastPointer = { x: e.clientX, y: e.clientY }
}, true)
window.addEventListener('contextmenu', function (e) {
  lastPointer = { x: e.clientX, y: e.clientY }
}, true)

function normalize (sections) {
  if (!Array.isArray(sections)) {
    return []
  }
  if (sections.length && !Array.isArray(sections[0])) {
    const grouped = [[]]
    sections.forEach(function (item) {
      if (item.type === 'separator') {
        grouped.push([])
      } else {
        grouped[grouped.length - 1].push(item)
      }
    })
    sections = grouped
  }
  return sections.map(section => section.filter(item => item && item.type !== 'separator' && item.visible !== false)).filter(section => section.length)
}

function runRole (role) {
  ipc.send('menu-role', role.toLowerCase())
}

function ensureLayer () {
  if (layer) {
    return layer
  }
  layer = document.createElement('div')
  layer.id = 'menu-layer'
  layer.hidden = true
  layer.addEventListener('pointerdown', function (e) {
    if (e.target === layer) {
      e.preventDefault()
      glassMenu.close()
    }
  })
  layer.addEventListener('contextmenu', function (e) {
    e.preventDefault()
    if (e.target === layer) {
      glassMenu.close()
    }
  })
  document.body.appendChild(layer)
  return layer
}

function buildPanel (sections, depth) {
  const panel = document.createElement('div')
  panel.className = 'gm'
  panel.setAttribute('role', 'menu')
  const highlight = document.createElement('div')
  highlight.className = 'gm-highlight'
  panel.appendChild(highlight)

  const entries = []
  let index = 0
  sections.forEach(function (section, s) {
    if (s > 0) {
      const sep = document.createElement('div')
      sep.className = 'gm-sep'
      panel.appendChild(sep)
    }
    section.forEach(function (item) {
      const el = document.createElement('div')
      el.className = 'gm-item'
      el.setAttribute('role', 'menuitem')
      el.style.setProperty('--i', index++)
      const enabled = item.enabled !== false
      if (!enabled) {
        el.classList.add('disabled')
      }

      const lead = document.createElement('span')
      lead.className = 'gm-lead'
      if (item.swatch) {
        lead.classList.add('gm-swatch')
        lead.style.setProperty('--swatch', item.swatch)
      } else if (item.type === 'checkbox' || item.type === 'radio') {
        if (item.checked) {
          lead.className += ' i carbon:checkmark'
        }
      } else if (item.icon) {
        lead.className += ' i ' + item.icon
      }
      el.appendChild(lead)

      const label = document.createElement('span')
      label.className = 'gm-label'
      label.textContent = item.label || ''
      el.appendChild(label)

      if (item.submenu) {
        const arrow = document.createElement('span')
        arrow.className = 'gm-arrow i carbon:chevron-right'
        el.appendChild(arrow)
      } else if (item.swatch && item.checked) {
        const check = document.createElement('span')
        check.className = 'gm-arrow i carbon:checkmark'
        el.appendChild(check)
      } else if (item.accelerator) {
        const key = document.createElement('span')
        key.className = 'gm-key'
        key.textContent = item.accelerator
        el.appendChild(key)
      }

      const entry = { el, item, enabled, depth }
      entries.push(entry)

      el.addEventListener('pointerenter', function () {
        glassMenu.focusEntry(panel, entry)
        if (enabled && item.submenu) {
          glassMenu.scheduleSubmenu(entry)
        } else {
          glassMenu.scheduleSubmenu(null, depth)
        }
      })
      el.addEventListener('pointerdown', e => e.preventDefault())
      el.addEventListener('click', function (e) {
        e.stopPropagation()
        if (!enabled) {
          return
        }
        if (item.submenu) {
          glassMenu.openSubmenu(entry)
        } else {
          glassMenu.activate(item)
        }
      })
      panel.appendChild(el)
    })
  })
  panel._entries = entries
  panel._highlight = highlight
  return panel
}

function place (panel, x, y, anchor) {
  panel.style.left = '0px'
  panel.style.top = '0px'
  const rect = panel.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = x
  let top = y
  let originX = 'left'
  let originY = 'top'
  if (anchor) {
    left = anchor.right - 4
    top = anchor.top - 6
    if (left + rect.width > vw - EDGE) {
      left = anchor.left - rect.width + 4
      originX = 'right'
    }
  } else if (left + rect.width > vw - EDGE) {
    left = Math.max(EDGE, x - rect.width)
    originX = 'right'
  }
  if (top + rect.height > vh - EDGE) {
    top = anchor ? Math.max(EDGE, vh - EDGE - rect.height) : Math.max(EDGE, y - rect.height)
    originY = 'bottom'
  }
  panel.style.left = Math.round(Math.max(EDGE, left)) + 'px'
  panel.style.top = Math.round(Math.max(EDGE, top)) + 'px'
  panel.style.transformOrigin = originX + ' ' + originY
}

const glassMenu = {
  isOpen: function () {
    return !!session
  },

  open: function (sections, options) {
    options = options || {}
    const normalized = normalize(sections)
    if (!normalized.length) {
      return
    }
    glassMenu.begin(options)
    const x = typeof options.x === 'number' ? options.x : lastPointer.x
    const y = typeof options.y === 'number' ? options.y : lastPointer.y
    glassMenu.pushPanel(normalized, x, y, null)
  },

  openPanel: function (content, options) {
    options = options || {}
    glassMenu.begin(options)
    const panel = document.createElement('div')
    panel.className = 'gm gm-panel' + (options.className ? ' ' + options.className : '')
    if (reduceMotion.matches) {
      panel.classList.add('no-motion')
    }
    panel._entries = []
    panel.appendChild(content)
    layer.appendChild(panel)
    place(panel, options.x, options.y, null)
    stack.push({ panel, focused: null, custom: true })
    return panel
  },

  begin: function (options) {
    if (session) {
      glassMenu.close(true)
    }
    ensureLayer()
    session = {
      onClose: options.onClose,
      raised: options.raise !== false,
      submenuTimer: null
    }
    if (session.raised) {
      require('uiLayer.js').raise('menu')
    }
    layer.hidden = false
    stack = []
    window.addEventListener('keydown', glassMenu.onKeyDown, true)
    window.addEventListener('blur', glassMenu.onBlur)
  },

  pushPanel: function (sections, x, y, anchor) {
    const panel = buildPanel(sections, stack.length)
    if (reduceMotion.matches) {
      panel.classList.add('no-motion')
    }
    layer.appendChild(panel)
    place(panel, x, y, anchor)
    stack.push({ panel, focused: null })
    return panel
  },

  focusEntry: function (panel, entry) {
    const level = stack.find(l => l.panel === panel)
    if (!level) {
      return
    }
    panel._entries.forEach(e => e.el.classList.toggle('focused', e === entry))
    level.focused = entry
    const h = panel._highlight
    if (!entry || !entry.enabled) {
      h.classList.remove('shown')
      return
    }
    const wasShown = h.classList.contains('shown')
    h.classList.toggle('instant', !wasShown)
    h.style.transform = 'translateY(' + entry.el.offsetTop + 'px)'
    h.style.height = entry.el.offsetHeight + 'px'
    h.classList.add('shown')
  },

  scheduleSubmenu: function (entry, depth) {
    clearTimeout(session.submenuTimer)
    session.submenuTimer = setTimeout(function () {
      if (entry) {
        glassMenu.openSubmenu(entry)
      } else {
        glassMenu.truncate(depth + 1)
      }
    }, SUBMENU_DELAY)
  },

  truncate: function (length) {
    while (stack.length > length) {
      const level = stack.pop()
      level.panel.remove()
    }
  },

  openSubmenu: function (entry) {
    if (!session) {
      return
    }
    const owner = stack[entry.depth]
    if (stack[entry.depth + 1] && stack[entry.depth + 1].source === entry) {
      return
    }
    glassMenu.truncate(entry.depth + 1)
    const panel = glassMenu.pushPanel(normalize(entry.item.submenu), 0, 0, entry.el.getBoundingClientRect())
    stack[stack.length - 1].source = entry
    owner.panel.classList.add('has-child')
    return panel
  },

  activate: function (item) {
    glassMenu.close()
    if (item.role) {
      runRole(item.role)
    } else if (typeof item.click === 'function') {
      item.click()
    }
  },

  onBlur: function () {
    glassMenu.close()
  },

  onKeyDown: function (e) {
    if (!session) {
      return
    }
    const level = stack[stack.length - 1]
    if (level.custom) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        glassMenu.close()
      }
      return
    }
    const entries = level.panel._entries.filter(entry => entry.enabled)
    const current = level.focused && level.focused.enabled ? entries.indexOf(level.focused) : -1
    let handled = true
    if (e.key === 'ArrowDown') {
      glassMenu.focusEntry(level.panel, entries[(current + 1) % entries.length])
    } else if (e.key === 'ArrowUp') {
      glassMenu.focusEntry(level.panel, entries[(current - 1 + entries.length) % entries.length])
    } else if (e.key === 'ArrowRight' && level.focused && level.focused.item.submenu) {
      const panel = glassMenu.openSubmenu(level.focused)
      if (panel) {
        glassMenu.focusEntry(panel, panel._entries.find(entry => entry.enabled))
      }
    } else if (e.key === 'ArrowLeft' && stack.length > 1) {
      glassMenu.truncate(stack.length - 1)
    } else if (e.key === 'Escape') {
      if (stack.length > 1) {
        glassMenu.truncate(stack.length - 1)
      } else {
        glassMenu.close()
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (level.focused && level.focused.enabled) {
        if (level.focused.item.submenu) {
          const panel = glassMenu.openSubmenu(level.focused)
          if (panel) {
            glassMenu.focusEntry(panel, panel._entries.find(entry => entry.enabled))
          }
        } else {
          glassMenu.activate(level.focused.item)
        }
      }
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const match = entries.find((entry, i) => i > current && (entry.item.label || '').toLowerCase().startsWith(e.key.toLowerCase())) ||
        entries.find(entry => (entry.item.label || '').toLowerCase().startsWith(e.key.toLowerCase()))
      if (match) {
        glassMenu.focusEntry(level.panel, match)
      }
    } else if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
      glassMenu.close()
      handled = false
    }
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  },

  close: function (immediate) {
    if (!session) {
      return
    }
    const ended = session
    session = null
    clearTimeout(ended.submenuTimer)
    window.removeEventListener('keydown', glassMenu.onKeyDown, true)
    window.removeEventListener('blur', glassMenu.onBlur)
    const panels = stack.map(level => level.panel)
    stack = []
    const finish = function () {
      panels.forEach(panel => panel.remove())
      if (!session) {
        layer.hidden = true
        if (ended.raised) {
          require('uiLayer.js').lower('menu')
        }
      }
      if (ended.onClose) {
        ended.onClose()
      }
    }
    if (immediate || reduceMotion.matches) {
      finish()
      return
    }
    panels.forEach(panel => panel.classList.add('closing'))
    setTimeout(finish, 130)
  }
}

module.exports = glassMenu
