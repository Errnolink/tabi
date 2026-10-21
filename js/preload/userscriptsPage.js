var USERSCRIPTS_PAGE_PREFIX = 'userscriptsPage:'

window.addEventListener('message', function (e) {
  var data = e.data
  if (!data || typeof data !== 'object') {
    return
  }
  if (data.__xbGMResult) {
    return
  }
  if (data.__xbGM) {
    ipc.send('userscript-gm-request', {
      scriptId: String(data.__xbGM.scriptId || ''),
      call: String(data.__xbGM.call || ''),
      args: data.__xbGM.args,
      cbId: String(data.__xbGM.cbId || '')
    })
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

ipc.on('userscript-gm-result', function (e, payload) {
  window.postMessage({ __xbGMResult: payload }, '*')
})

ipc.on('userscript-store-page-changed', function (e, state) {
  if (window.location.toString().startsWith('min://app/pages/userscripts')) {
    window.postMessage({ message: USERSCRIPTS_PAGE_PREFIX + 'changed', state: state }, window.location.toString())
  }
})
