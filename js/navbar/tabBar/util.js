const settings = require('util/settings/settings.js')
const urlParser = require('util/urlParser.js')
const keyMapModule = require('util/keyMap.js')

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function cssVar (name) {
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function shortcutLabel (action) {
  const binding = keyMapModule.userKeyMap(settings.get('keyMap'))[action]
  const combo = Array.isArray(binding) ? binding[0] : binding
  if (!combo || typeof combo !== 'string') {
    return ''
  }
  return combo.split('+').map(function (part) {
    if (part === 'mod') {
      return window.platformType === 'mac' ? 'Cmd' : 'Ctrl'
    }
    if (part === 'shift') {
      return 'Shift'
    }
    if (part === 'option' || part === 'alt') {
      return window.platformType === 'mac' ? 'Option' : 'Alt'
    }
    if (part === 'super') {
      return window.platformType === 'mac' ? 'Cmd' : 'Win'
    }
    return part.charAt(0).toUpperCase() + part.slice(1)
  }).join('+')
}

function withShortcut (label, action) {
  const keys = shortcutLabel(action)
  if (!keys) {
    return label.replace(/\s*\(%s\)/, '')
  }
  return label.replace('%s', keys)
}

const motion = {
  spatial: null,
  spatialFast: null,
  effects: null,
  load: function () {
    motion.spatial = cssVar('--spring-spatial') || 'cubic-bezier(.2,.9,.3,1)'
    motion.spatialFast = cssVar('--spring-spatial-fast') || motion.spatial
    motion.effects = cssVar('--spring-effects') || 'ease-out'
  }
}

function browserUI () {
  return require('browserUI.js')
}

function findTab (tabId) {
  const task = tasks.getTaskContainingTab(tabId)
  return task ? { task, tab: task.tabs.get(tabId) } : null
}

function isNewTabUrl (url) {
  return !url || url === urlParser.parse('min://newtab')
}

function tabTitle (tab) {
  if (isNewTabUrl(tab.url)) {
    return l('newTabLabel')
  }
  return (tab.title || (tab.loaded ? tab.url : '') || tab.url || l('newTabLabel')).substring(0, 300)
}

function bucketName (task, index) {
  return task.name || l('defaultTaskName').replace('%n', index + 1)
}

module.exports = { reduceMotion, cssVar, shortcutLabel, withShortcut, motion, browserUI, findTab, isNewTabUrl, tabTitle, bucketName }
