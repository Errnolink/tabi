const fs = require('fs')
const archiver = require('archiver')
const builder = require('electron-builder')
const Arch = builder.Arch
const createPackage = require('./createPackage.js')
const packageFile = require('./../package.json')

async function build () {
  const packagePath = await createPackage('win32', { arch: Arch.x64 })

  fs.copyFileSync('LICENSE.txt', packagePath + '/LICENSE')

  if (!fs.existsSync('dist/app')) {
    fs.mkdirSync('dist/app')
  }

  const outName = 'xb-v' + packageFile.version + '-windows-x64'
  const output = fs.createWriteStream('dist/app/' + outName + '.zip')
  const archive = archiver('zip', {
    zlib: { level: 9 }
  })
  archive.directory(packagePath, outName)
  archive.pipe(output)
  await archive.finalize()

  console.log('built dist/app/' + outName + '.zip')
}

build().catch(function (e) {
  console.error(e)
  process.exit(1)
})
