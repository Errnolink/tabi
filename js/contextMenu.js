const remoteMenu = require('remoteMenuRenderer.js')
const searchbar = require('searchbar/searchbar.js')

module.exports = {
  initialize: function () {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()

      var inputMenu = [
        [
          { label: l('undo'), accelerator: 'Ctrl+Z', role: 'undo', target: 'ui' },
          { label: l('redo'), accelerator: 'Ctrl+Shift+Z', role: 'redo', target: 'ui' }
        ],
        [
          { label: l('cut'), accelerator: 'Ctrl+X', role: 'cut', target: 'ui' },
          { label: l('copy'), accelerator: 'Ctrl+C', role: 'copy', target: 'ui' },
          { label: l('paste'), accelerator: 'Ctrl+V', role: 'paste', target: 'ui' }
        ],
        [
          { label: l('selectAll'), accelerator: 'Ctrl+A', role: 'selectall', target: 'ui' }
        ]
      ]

      let node = e.target

      while (node) {
        if (node.nodeName.match(/^(input|textarea)$/i) || node.isContentEditable) {
          if (node.id === 'tab-editor-input') {
            inputMenu[1].push({
              label: l('pasteAndGo'),
              click: function () {
                searchbar.openURL(electron.clipboard.readText())
              }
            })
          }
          const input = node
          remoteMenu.open(inputMenu, undefined, undefined, {
            keepFocus: true,
            onClose: () => input.focus()
          })
          break
        }
        node = node.parentNode
      }
    })
  }
}
