/*
Bridges the tab-import page (sandboxed min:// page) to the main process
import IPC. Requests travel page -> postMessage -> ipc.invoke, same pattern
as the container manager page bridge.
*/

var electron = require('electron')
var ipc = electron.ipcRenderer

const IMPORT_PAGE_PREFIX = 'importPage:'

window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('min://')) {
    return
  }
  var data = e.data
  if (!data || typeof data.message !== 'string' || !data.message.startsWith(IMPORT_PAGE_PREFIX)) {
    return
  }
  if (data.message === IMPORT_PAGE_PREFIX + 'result') {
    return
  }

  var op = data.message.slice(IMPORT_PAGE_PREFIX.length)

  var request
  if (op === 'sources') {
    request = ipc.invoke('import:sources')
  } else if (op === 'read') {
    request = ipc.invoke('import:read', data.args && data.args.id, { includeBookmarks: !!(data.args && data.args.includeBookmarks) })
  } else {
    request = ipc.invoke('import:page', { op: op, id: data.id, args: data.args })
  }

  request.then(function (result) {
    window.postMessage({ message: IMPORT_PAGE_PREFIX + 'result', id: data.id, result: result }, window.location.toString())
  }).catch(function (err) {
    window.postMessage({ message: IMPORT_PAGE_PREFIX + 'result', id: data.id, error: String(err) }, window.location.toString())
  })
})
