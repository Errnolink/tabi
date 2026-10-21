/* GM API relay: @storage value persistence for injected scripts and the
   xmlhttpRequest/openInTab/clipboard calls they make through the preload bridge. */

var gmInflightRequests = new Map()

var gmValuesCache = {}
var gmValuesFlushTimers = {}
const GM_VALUES_FLUSH_DELAY = 500

function gmReadValues (id) {
  if (gmValuesCache[id]) {
    return gmValuesCache[id]
  }
  var values = {}
  try {
    var data = JSON.parse(fs.readFileSync(path.join(userscriptStoreDir, id + '.values.json'), 'utf-8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      values = data
    }
  } catch (e) { }
  gmValuesCache[id] = values
  return values
}

function gmWriteValuesFile (file, values) {
  var tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(values))
  fs.renameSync(tmp, file)
}

function gmFlushValuesSync (id) {
  var values = gmValuesCache[id]
  if (!values) {
    return
  }
  try {
    gmWriteValuesFile(path.join(userscriptStoreDir, id + '.values.json'), values)
  } catch (e) { }
}

function gmFlushValues (id) {
  if (gmValuesFlushTimers[id]) {
    clearTimeout(gmValuesFlushTimers[id])
    delete gmValuesFlushTimers[id]
  }
  var values = gmValuesCache[id]
  if (!values) {
    return Promise.resolve()
  }
  var file = path.join(userscriptStoreDir, id + '.values.json')
  var tmp = file + '.tmp'
  return fs.promises.writeFile(tmp, JSON.stringify(values)).then(function () {
    return fs.promises.rename(tmp, file)
  }).catch(function () { })
}

function gmScheduleValuesFlush (id) {
  delete userscriptStorePayloadCache[id]
  if (gmValuesFlushTimers[id]) {
    return
  }
  gmValuesFlushTimers[id] = setTimeout(function () {
    delete gmValuesFlushTimers[id]
    gmFlushValues(id)
  }, GM_VALUES_FLUSH_DELAY)
}

function gmFlushAllValuesSync () {
  Object.keys(gmValuesCache).forEach(function (id) {
    if (gmValuesFlushTimers[id]) {
      clearTimeout(gmValuesFlushTimers[id])
      delete gmValuesFlushTimers[id]
    }
    gmFlushValuesSync(id)
  })
}

function gmHeadersToObject (headers) {
  var result = {}
  var entries = headers.entries()
  var item = entries.next()
  while (!item.done) {
    if (result[item.value[0]] === undefined) {
      result[item.value[0]] = item.value[1]
    }
    item = entries.next()
  }
  return result
}

function gmFormatResponse (details, result) {
  var responseType = details.responseType || 'text'
  var response = {
    status: result.status,
    statusText: result.statusText,
    responseHeaders: result.headers,
    finalUrl: result.finalUrl
  }
  if (responseType === 'arraybuffer') {
    response.response = new Uint8Array(result.buffer)
  } else {
    response.responseText = Buffer.from(result.buffer).toString('utf-8')
    if (responseType === 'json') {
      try {
        response.response = JSON.parse(response.responseText)
      } catch (e) { }
    }
  }
  return response
}

function gmPerformRequest (e, payload, frameURL, args) {
  var meta = userscriptStoreCache[payload.scriptId]
  var reqId = args[0]
  var details = args[1] || {}
  var target
  try {
    target = new URL(details.url)
  } catch (err) {
    return Promise.resolve({ ok: false, data: { error: 'invalid URL' } })
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return Promise.resolve({ ok: false, data: { error: 'unsupported protocol' } })
  }
  var sameHost = false
  try {
    sameHost = new URL(frameURL).hostname === target.hostname
  } catch (err) { }
  if (!sameHost && !userscriptMeta.connectAllowed(meta.connect, target.hostname)) {
    return Promise.resolve({ ok: false, data: { error: 'blocked by @connect' } })
  }
  var key = e.sender.id + ':' + payload.scriptId + ':' + reqId
  var controller = new AbortController()
  gmInflightRequests.set(key, controller)
  var timedOut = false
  var timer = null
  if (details.timeout > 0) {
    timer = setTimeout(function () {
      timedOut = true
      controller.abort()
    }, details.timeout)
  }
  var method = String(details.method || 'GET').toUpperCase()
  var init = { method: method, signal: controller.signal }
  if (details.headers && typeof details.headers === 'object') {
    init.headers = details.headers
  }
  if (details.data != null && method !== 'GET' && method !== 'HEAD') {
    init.body = details.data
  }
  return e.sender.session.fetch(details.url, init).then(function (res) {
    return res.arrayBuffer().then(function (buffer) {
      return {
        status: res.status,
        statusText: res.statusText,
        finalUrl: res.url,
        headers: gmHeadersToObject(res.headers),
        buffer: buffer
      }
    })
  }).then(function (result) {
    clearTimeout(timer)
    gmInflightRequests.delete(key)
    return { ok: true, data: gmFormatResponse(details, result) }
  }).catch(function (err) {
    clearTimeout(timer)
    gmInflightRequests.delete(key)
    if (timedOut) {
      return { ok: true, data: { timedOut: true } }
    }
    return { ok: false, data: { error: String((err && err.message) || err) } }
  })
}

ipc.handle('userscript-gm-request', function (e, payload) {
  if (!payload || typeof payload.scriptId !== 'string' || typeof payload.call !== 'string') {
    return { ok: false, data: { error: 'invalid request' } }
  }
  var frameURL = ''
  try {
    if (!e.senderFrame || e.senderFrame !== e.sender.mainFrame) {
      return { ok: false, data: { error: 'not allowed from this frame' } }
    }
    frameURL = e.senderFrame.url
  } catch (err) {
    return { ok: false, data: { error: 'not allowed from this frame' } }
  }
  var meta = userscriptStoreCache[payload.scriptId]
  if (!meta || meta.enabled === false) {
    return { ok: false, data: { error: 'unknown userscript' } }
  }
  if (!frameURL || !userscriptMeta.matchesUrl(meta, frameURL)) {
    return { ok: false, data: { error: 'userscript is not active on this page' } }
  }
  var granted = userscriptMeta.grantList(meta.grants)
  var args = Array.isArray(payload.args) ? payload.args : []
  switch (payload.call) {
    case 'setValue':
      if (!granted.setValue) {
        return { ok: false, data: { error: 'not granted' } }
      }
      var values = gmReadValues(meta.id)
      if (args.length < 2 || args[1] === undefined) {
        delete values[args[0]]
      } else {
        values[args[0]] = args[1]
      }
      gmScheduleValuesFlush(meta.id)
      return { ok: true, data: null }
    case 'deleteValue':
      if (!granted.deleteValue) {
        return { ok: false, data: { error: 'not granted' } }
      }
      var stored = gmReadValues(meta.id)
      delete stored[args[0]]
      gmScheduleValuesFlush(meta.id)
      return { ok: true, data: null }
    case 'openInTab':
      if (!granted.openInTab) {
        return { ok: false, data: { error: 'not granted' } }
      }
      var targetURL = String(args[0] || '')
      if (!/^https?:\/\//i.test(targetURL)) {
        return { ok: false, data: { error: 'unsupported URL' } }
      }
      sendIPCToWindow(windows.getCurrent(), 'addTab', { url: targetURL })
      return { ok: true, data: null }
    case 'setClipboard':
      if (!granted.setClipboard) {
        return { ok: false, data: { error: 'not granted' } }
      }
      electron.clipboard.writeText(String(args[0] === undefined ? '' : args[0]))
      return { ok: true, data: null }
    case 'xmlhttpRequest':
      if (!granted.xmlhttpRequest) {
        return { ok: false, data: { error: 'not granted' } }
      }
      return gmPerformRequest(e, payload, frameURL, args)
    case 'abortRequest':
      var controller = gmInflightRequests.get(e.sender.id + ':' + payload.scriptId + ':' + args[0])
      if (controller) {
        controller.abort()
      }
      return { ok: true, data: null }
    default:
      return { ok: false, data: { error: 'unknown call' } }
  }
})

ipc.handle('userscriptStore:getValues', function (e, id) {
  return gmReadValues(String(id))
})
