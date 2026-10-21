/*
Bridges the container manager page (sandboxed min:// page) to the main process
containers IPC. Requests travel page -> postMessage -> ipc.invoke; change
broadcasts travel the other way.
*/

var electron = require('electron')
var ipc = electron.ipcRenderer

const CONTAINERS_PAGE_PREFIX = 'containersPage:'

window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('min://')) {
    return
  }
  var data = e.data
  if (!data || typeof data.message !== 'string' || !data.message.startsWith(CONTAINERS_PAGE_PREFIX)) {
    return
  }
  if (data.message === CONTAINERS_PAGE_PREFIX + 'result' || data.message === CONTAINERS_PAGE_PREFIX + 'changed') {
    return
  }

  ipc.invoke('containers:page', { op: data.message.slice(CONTAINERS_PAGE_PREFIX.length), id: data.id, args: data.args }).then(function (result) {
    window.postMessage({ message: CONTAINERS_PAGE_PREFIX + 'result', id: data.id, result: result }, window.location.toString())
  }).catch(function (err) {
    window.postMessage({ message: CONTAINERS_PAGE_PREFIX + 'result', id: data.id, error: String(err) }, window.location.toString())
  })
})

ipc.on('containers-page-changed', function (e, state) {
  window.postMessage({ message: CONTAINERS_PAGE_PREFIX + 'changed', state: state }, window.location.toString())
})
