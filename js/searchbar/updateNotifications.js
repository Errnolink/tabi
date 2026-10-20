var searchbarPlugins = require('searchbar/searchbarPlugins.js')

function initialize () {
  searchbarPlugins.register('updateNotifications', {
    index: 11,
    trigger: function (text) {
      return false
    },
    showResults: function () {}
  })
}

module.exports = { initialize }
