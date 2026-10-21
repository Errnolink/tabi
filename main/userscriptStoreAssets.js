/* Fetches @require sources and @resource bodies declared in a header. Both are
   restricted to https and fetched at install/update time so nothing is loaded
   from the network at injection time. */

function userscriptStoreResourceEntry (line) {
  var match = /^(\S+)\s+(\S+)$/.exec(String(line).trim())
  if (!match) {
    return null
  }
  return { name: match[1], url: match[2] }
}

function userscriptStoreFetchAssets (features) {
  var requires = (features.require || []).map(function (url) { return String(url).trim() }).filter(Boolean)
  var resources = (features.resource || []).map(userscriptStoreResourceEntry).filter(Boolean)
  var urls = requires.concat(resources.map(function (entry) { return entry.url }))
  for (var i = 0; i < urls.length; i++) {
    if (!/^https:\/\//i.test(urls[i])) {
      return Promise.reject(new Error('insecure @require/@resource URL: ' + urls[i]))
    }
  }
  return Promise.all([
    Promise.all(requires.map(function (url) {
      return userscriptStoreFetchText(url).then(function (text) {
        return { url: url, text: text }
      })
    })),
    Promise.all(resources.map(function (entry) {
      return net.fetch(entry.url).then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status)
        }
        return res.arrayBuffer().then(function (buffer) {
          return {
            name: entry.name,
            url: entry.url,
            mime: (res.headers.get('content-type') || 'text/plain').split(';')[0].trim() || 'text/plain',
            buffer: Buffer.from(buffer)
          }
        })
      })
    }))
  ]).then(function (results) {
    return { requires: results[0], resources: results[1] }
  })
}

function userscriptStoreRemoveAssetFiles (id) {
  var requirePrefix = id + '.require.'
  var resourcePrefix = id + '.resource.'
  var files
  try {
    files = fs.readdirSync(userscriptStoreDir)
  } catch (e) {
    return
  }
  files.forEach(function (filename) {
    if (filename.startsWith(requirePrefix) || filename.startsWith(resourcePrefix)) {
      try {
        fs.unlinkSync(path.join(userscriptStoreDir, filename))
      } catch (e) { }
    }
  })
}

function userscriptStoreWriteAssetFiles (id, assets) {
  userscriptStoreRemoveAssetFiles(id)
  assets.requires.forEach(function (entry, index) {
    fs.writeFileSync(path.join(userscriptStoreDir, id + '.require.' + index + '.js'), entry.text)
  })
  assets.resources.forEach(function (entry, index) {
    fs.writeFileSync(path.join(userscriptStoreDir, id + '.resource.' + index + '.b64'), entry.buffer.toString('base64'))
  })
}

/* Reads the stored @require sources and @resource bodies for an installed script.
   Missing files are skipped so a partial store still runs the script itself. */
function userscriptStoreReadAssets (meta) {
  var requires = []
  var resources = {}
  ;(meta.requires || []).forEach(function (url, index) {
    try {
      var text = fs.readFileSync(path.join(userscriptStoreDir, meta.id + '.require.' + index + '.js'), 'utf-8')
      if (text) {
        requires.push(text)
      }
    } catch (e) { }
  })
  ;(meta.resources || []).forEach(function (entry, index) {
    try {
      var base64 = fs.readFileSync(path.join(userscriptStoreDir, meta.id + '.resource.' + index + '.b64'), 'utf-8')
      if (base64) {
        resources[entry.name] = {
          text: Buffer.from(base64, 'base64').toString('utf-8'),
          base64: base64.trim(),
          mime: entry.mime || 'text/plain'
        }
      }
    } catch (e) { }
  })
  return { requires: requires, resources: resources }
}
