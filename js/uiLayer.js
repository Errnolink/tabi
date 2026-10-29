/* global ipc */

const holders = new Set()
const passiveHolders = new Set()
let generation = 0

function afterPaint (fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn))
}

const uiLayer = {
  raise: function (reason, options) {
    const passive = !!(options && options.focus === false)
    const wasEmpty = holders.size === 0
    holders.add(reason)
    if (passive) {
      passiveHolders.add(reason)
    } else {
      passiveHolders.delete(reason)
    }
    if (!wasEmpty) {
      return
    }
    const current = ++generation
    document.body.classList.add('ui-raised')
    afterPaint(function () {
      if (current !== generation || holders.size === 0) {
        return
      }
      document.body.classList.add('ui-on-top')
      ipc.send('menu-raise', { focus: holders.size > passiveHolders.size })
    })
  },
  lower: function (reason) {
    const wasPassive = passiveHolders.has(reason)
    passiveHolders.delete(reason)
    if (!holders.delete(reason) || holders.size > 0) {
      return
    }
    const current = ++generation
    document.body.classList.remove('ui-on-top')
    ipc.invoke('menu-lower', { refocus: wasPassive }).then(function () {
      afterPaint(function () {
        if (current === generation && holders.size === 0) {
          document.body.classList.remove('ui-raised')
        }
      })
    })
  },
  isRaised: function () {
    return holders.size > 0
  }
}

module.exports = uiLayer
