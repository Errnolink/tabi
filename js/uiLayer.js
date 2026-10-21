/* global ipc */

const holders = new Set()
const passiveHolders = new Set()

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
    const shouldFocus = holders.size > passiveHolders.size
    if (wasEmpty) {
      document.body.classList.add('ui-raised')
      ipc.send('menu-raise', { focus: shouldFocus })
    }
  },
  lower: function (reason) {
    const wasPassive = passiveHolders.has(reason)
    passiveHolders.delete(reason)
    if (!holders.delete(reason) || holders.size > 0) {
      return
    }
    document.body.classList.remove('ui-raised')
    ipc.send('menu-lower', { refocus: wasPassive })
  },
  isRaised: function () {
    return holders.size > 0
  }
}

module.exports = uiLayer
