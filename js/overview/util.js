const settings = require('util/settings/settings.js')
const keyMapModule = require('util/keyMap.js')

const MIN_COLUMN = 250
const GAP = 16
const CARD_META = 62
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const motion = {
  get spatial () { return curve('--spring-spatial') },
  get spatialFast () { return curve('--spring-spatial-fast') },
  get effects () { return curve('--spring-effects') }
}

function curve (name) {
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'ease-out'
}

function canMorph () {
  return typeof document.startViewTransition === 'function' && !reduceMotion.matches
}

function nextFrame () {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

function hostOf (url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch (e) {
    return ''
  }
}

function cardAspect (tab) {
  const aspect = tab.thumbAspect
  if (typeof aspect === 'number' && isFinite(aspect) && aspect > 0) {
    return Math.min(2.4, Math.max(0.5, aspect))
  }
  return 16 / 10
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

module.exports = { MIN_COLUMN, GAP, CARD_META, reduceMotion, motion, curve, canMorph, nextFrame, hostOf, cardAspect, shortcutLabel, withShortcut }
