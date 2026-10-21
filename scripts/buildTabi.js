const fs = require('fs')
const path = require('path')
const archiver = require('archiver')
const builder = require('electron-builder')
const Arch = builder.Arch
const createPackage = require('./createPackage.js')
const packageFile = require('./../package.json')

async function zipPackage (packagePath) {
  fs.copyFileSync('LICENSE.txt', packagePath + '/LICENSE')

  // the portable zip must never carry an updater config, so the packaged app never checks for updates
  const appUpdateConfig = path.join(packagePath, 'resources', 'app-update.yml')
  if (fs.existsSync(appUpdateConfig)) {
    fs.unlinkSync(appUpdateConfig)
  }

  if (!fs.existsSync('dist/app')) {
    fs.mkdirSync('dist/app')
  }

  const outName = 'tabi-v' + packageFile.version + '-windows-x64'
  const output = fs.createWriteStream('dist/app/' + outName + '.zip')
  const archive = archiver('zip', {
    zlib: { level: 9 }
  })
  archive.directory(packagePath, outName)
  archive.pipe(output)
  await archive.finalize()

  return 'dist/app/' + outName + '.zip'
}

async function build () {
  const packagePath = await createPackage('win32', { arch: Arch.x64 })
  const zipPath = await zipPackage(packagePath)
  console.log('built ' + zipPath)
}

if (require.main === module) {
  build().catch(function (e) {
    console.error(e)
    process.exit(1)
  })
}

module.exports = { build, zipPackage }
