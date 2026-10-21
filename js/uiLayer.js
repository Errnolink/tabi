/* global ipc */

/* the UI view normally sits under the page; anything drawn over the page (menus, omnibox suggestions) raises it */
const holders = new Set()

const uiLayer = {
  raise: function (reason) {
    const wasEmpty = holders.size === 0
    holders.add(reason)
    if (wasEmpty) {
      document.body.classList.add('ui-raised')
      ipc.send('menu-raise')
    }
  },
  lower: function (reason) {
    if (!holders.delete(reason) || holders.size > 0) {
      return
    }
    document.body.classList.remove('ui-raised')
    ipc.send('menu-lower')
  },
  isRaised: function () {
    return holders.size > 0
  }
}

module.exports = uiLayer
