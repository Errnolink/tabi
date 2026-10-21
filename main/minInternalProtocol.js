const { pathToFileURL } = require('url')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'min',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
])

function registerBundleProtocol (ses) {
  ses.protocol.handle('min', async (req) => {
    const parsed = new URL(req.url)
    const host = parsed.host
    let pathname = parsed.pathname
    const searchParams = parsed.searchParams

    if (pathname.charAt(0) === '/') {
      pathname = pathname.substring(1)
    }

    if (host !== 'app') {
      return new Response('bad', {
        status: 400,
        headers: { 'content-type': 'text/html' }
      })
    }

    if (pathname === 'pdf-file') {
      const targetUrl = searchParams.get('url')
      if (targetUrl && targetUrl.startsWith('file://') && /\.pdf$/i.test(new URL(targetUrl).pathname)) {
        return net.fetch(targetUrl)
      }
      return new Response('bad', { status: 400 })
    }

    // NB, this checks for paths that escape the bundle, e.g.
    // app://bundle/../../secret_file.txt
    const pathToServe = path.resolve(__dirname, pathname)
    const relativePath = path.relative(__dirname, pathToServe)
    const isSafe = relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)

    if (!isSafe) {
      return new Response('bad', {
        status: 400,
        headers: { 'content-type': 'text/html' }
      })
    }
    const res = await net.fetch(pathToFileURL(pathToServe).toString())
    if (pathname.endsWith('.mjs')) {
      const headers = new Headers(res.headers)
      headers.set('content-type', 'text/javascript')
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: headers
      })
    }
    return res
  })
}

app.on('session-created', (ses) => {
  if (ses !== session.defaultSession) {
    registerBundleProtocol(ses)
  }
})
