const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const builder = require('electron-builder')
const Arch = builder.Arch
const createPackage = require('./createPackage.js')
const { zipPackage } = require('./buildTabi.js')
const packageFile = require('./../package.json')

const repo = 'Errnolink/tabi'
const version = packageFile.version
const tag = 'v' + version
const distDir = 'dist/app'
const installerName = 'Tabi-Setup-' + version + '.exe'
const notesName = 'tabi-v' + version + '-notes.md'

function quoteArg (arg) {
  return /\s/.test(arg) ? '"' + arg + '"' : arg
}

function assertAsset (name) {
  if (!fs.existsSync(path.join(distDir, name))) {
    throw new Error('missing release artifact ' + distDir + '/' + name)
  }
}

function tagExists () {
  try {
    execFileSync('git', ['rev-parse', '-q', '--verify', 'refs/tags/' + tag], { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}

function releaseExists () {
  try {
    execFileSync('gh', ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}

function writeNotes () {
  const notesPath = distDir + '/' + notesName
  if (!fs.existsSync(notesPath)) {
    fs.writeFileSync(notesPath, 'Tabi ' + version + '\n\n- Bug fixes and improvements.\n')
  }
  return notesPath
}

async function build () {
  console.log('building Tabi ' + version + ' (NSIS installer + portable zip)')

  const packagePath = await createPackage('win32', { arch: Arch.x64, nsis: true })
  const zipPath = await zipPackage(packagePath)

  assertAsset(installerName)
  assertAsset(installerName + '.blockmap')
  assertAsset('latest.yml')
  assertAsset(path.basename(zipPath))

  if (tagExists()) {
    throw new Error('tag ' + tag + ' already exists locally — bump the version in package.json before releasing')
  }
  if (releaseExists()) {
    throw new Error('release ' + tag + ' already exists on GitHub — bump the version in package.json before releasing')
  }

  const notesPath = writeNotes()

  const args = [
    'release', 'create', tag,
    installerName,
    'latest.yml',
    installerName + '.blockmap',
    path.basename(zipPath),
    '--repo', repo,
    '--title', 'Tabi ' + version,
    '--notes-file', notesPath
  ]

  console.log('\nTo publish this release, run:\n')
  console.log('gh ' + args.map(quoteArg).join(' ') + '\n')

  if (process.argv.includes('--publish')) {
    execFileSync('gh', args, { stdio: 'inherit' })
  }
}

build().catch(function (e) {
  console.error(e.message || e)
  process.exit(1)
})
