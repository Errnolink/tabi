var USERSCRIPTS_PAGE_PREFIX = 'userscriptsPage:'

var GM_WORLD_ID = 977

try {
  if (window.top === window && electron.contextBridge) {
    electron.contextBridge.exposeInIsolatedWorld(GM_WORLD_ID, '__tabiGM__', {
      request: function (payload) {
        return ipc.invoke('userscript-gm-request', payload)
      }
    })
  }
} catch (e) { }

window.addEventListener('message', function (e) {
  var data = e.data
  if (!data || typeof data !== 'object') {
    return
  }
  if (!window.location.toString().startsWith('min://app/pages/userscripts/')) {
    return
  }
  if (!e.origin.startsWith('min://')) {
    return
  }
  if (typeof data.message !== 'string' || !data.message.startsWith(USERSCRIPTS_PAGE_PREFIX)) {
    return
  }
  if (data.message === USERSCRIPTS_PAGE_PREFIX + 'result' || data.message === USERSCRIPTS_PAGE_PREFIX + 'changed') {
    return
  }
  ipc.invoke('userscriptStore:page', { op: data.message.slice(USERSCRIPTS_PAGE_PREFIX.length), id: data.id, args: data.args }).then(function (result) {
    window.postMessage({ message: USERSCRIPTS_PAGE_PREFIX + 'result', id: data.id, result: result }, window.location.toString())
  }).catch(function (err) {
    window.postMessage({ message: USERSCRIPTS_PAGE_PREFIX + 'result', id: data.id, error: String(err) }, window.location.toString())
  })
})

ipc.on('userscript-store-page-changed', function (e, state) {
  if (window.location.toString().startsWith('min://app/pages/userscripts')) {
    window.postMessage({ message: USERSCRIPTS_PAGE_PREFIX + 'changed', state: state }, window.location.toString())
  }
})
