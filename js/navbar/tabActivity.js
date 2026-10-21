/* fades out tabs that are inactive */

var tabBar = require('navbar/tabBar.js')

var tabActivity = {
  minFadeAge: 330000,
  refresh: function () {
    requestAnimationFrame(function () {
      var tabSet = tabs.get()
      var selected = tabs.getSelected()
      var time = Date.now()

      tabSet.forEach(function (tab) {
        var el = tabBar.getTab(tab.id)
        if (!el) {
          return
        }
        if (selected === tab.id) { // never fade the current tab
          el.classList.remove('fade')
          return
        }
        if (time - tab.lastActivity > tabActivity.minFadeAge) { // the tab has been inactive for greater than minActivity, and it is not currently selected
          el.classList.add('fade')
        } else {
          el.classList.remove('fade')
        }
      })
    })
  },
  initialize: function () {
    setInterval(tabActivity.refresh, 7500)

    tasks.on('tab-selected', this.refresh)
  }
}

module.exports = tabActivity
