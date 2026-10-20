const settings = require('util/settings/settings.js')

const TOOLBAR_HEIGHT = 52
const GUTTER = 8
const PAGE_RADIUS = 14
const RAIL_WIDTH = 64
const MIN_SIDEBAR = 200
const MAX_SIDEBAR = 480
const DEFAULT_SIDEBAR = 268
const BUCKET_HUES = [278, 150, 345, 38, 205, 18, 320, 95]

function clampWidth (width) {
  if (typeof width !== 'number' || !isFinite(width)) {
    return DEFAULT_SIDEBAR
  }
  return Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, Math.round(width)))
}

const shellLayout = {
  toolbarHeight: TOOLBAR_HEIGHT,
  gutter: GUTTER,
  pageRadius: PAGE_RADIUS,
  railWidth: RAIL_WIDTH,
  bucketHue: function (index) {
    return BUCKET_HUES[index % BUCKET_HUES.length]
  },
  sidebarWidth: clampWidth(settings.get('sidebarWidth')),
  collapsed: settings.get('sidebarCollapsed') === true,
  listeners: [],
  effectiveSidebarWidth: function () {
    return shellLayout.collapsed ? RAIL_WIDTH : shellLayout.sidebarWidth
  },
  pageRect: function () {
    const left = shellLayout.effectiveSidebarWidth()
    return {
      x: left,
      y: TOOLBAR_HEIGHT,
      width: Math.max(0, window.innerWidth - left - GUTTER),
      height: Math.max(0, window.innerHeight - TOOLBAR_HEIGHT - GUTTER)
    }
  },
  apply: function () {
    const root = document.documentElement.style
    root.setProperty('--toolbar-height', TOOLBAR_HEIGHT + 'px')
    root.setProperty('--gutter', GUTTER + 'px')
    root.setProperty('--page-radius', PAGE_RADIUS + 'px')
    root.setProperty('--rail-width', RAIL_WIDTH + 'px')
    root.setProperty('--sidebar-width', shellLayout.effectiveSidebarWidth() + 'px')
    document.body.classList.toggle('sidebar-collapsed', shellLayout.collapsed)
  },
  onChange: function (fn) {
    shellLayout.listeners.push(fn)
  },
  emit: function (options) {
    shellLayout.listeners.forEach(fn => fn(options || {}))
  },
  setSidebarWidth: function (width, persist) {
    shellLayout.sidebarWidth = clampWidth(width)
    shellLayout.apply()
    if (persist) {
      settings.set('sidebarWidth', shellLayout.sidebarWidth)
    }
    shellLayout.emit({ animate: false })
  },
  setCollapsed: function (collapsed) {
    shellLayout.collapsed = collapsed
    settings.set('sidebarCollapsed', collapsed)
    shellLayout.apply()
    shellLayout.emit({ animate: true })
  }
}

shellLayout.apply()

module.exports = shellLayout
