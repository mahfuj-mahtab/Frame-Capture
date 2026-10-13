/**
 * Electron's install.js uses extract-zip, which can fail when the project path
 * contains spaces (only partial dist/, no path.txt). This script verifies the
 * binary and falls back to system `unzip` when needed.
 */
const { spawnSync } = require('child_process')
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')

const electronDir = join(__dirname, '../node_modules/electron')
const pathTxt = join(electronDir, 'path.txt')
const distDir = join(electronDir, 'dist')
const platformPath = process.platform === 'win32' ? 'electron.exe' : 'electron'
const electronBin = join(distDir, platformPath)

function readElectronVersion() {
  return readFileSync(join(distDir, 'version'), 'utf8').trim().replace(/^v/, '')
}

function normalizePathTxt() {
  if (!existsSync(pathTxt)) {
    return
  }
  const raw = readFileSync(pathTxt, 'utf8')
  const trimmed = raw.trim()
  if (trimmed && trimmed !== raw) {
    writeFileSync(pathTxt, trimmed)
  }
}

function isElectronReady() {
  normalizePathTxt()
  if (!existsSync(pathTxt) || !existsSync(electronBin)) {
    return false
  }
  try {
    const { version } = require(join(electronDir, 'package.json'))
    return readElectronVersion() === version
  } catch {
    return false
  }
}

function runDefaultInstall() {
  spawnSync(process.execPath, [join(electronDir, 'install.js')], {
    cwd: electronDir,
    stdio: 'inherit',
    env: process.env
  })
}

async function installWithUnzip() {
  const { downloadArtifact } = require('@electron/get')
  const { version } = require(join(electronDir, 'package.json'))
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch
  })

  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })

  const unzip = spawnSync('unzip', ['-q', zipPath, '-d', distDir], { stdio: 'inherit' })
  if (unzip.status !== 0) {
    throw new Error('unzip failed; install the unzip package on your system')
  }

  writeFileSync(pathTxt, platformPath)
}

async function main() {
  if (!existsSync(electronDir)) {
    return
  }

  if (isElectronReady()) {
    return
  }

  runDefaultInstall()
  if (isElectronReady()) {
    return
  }

  console.log('Electron binary incomplete — retrying with unzip (common when the project path has spaces)…')
  await installWithUnzip()

  if (!isElectronReady()) {
    console.error('Could not install Electron. Try moving the project to a path without spaces.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
