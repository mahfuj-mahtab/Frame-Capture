import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  session
} from 'electron'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
// SUID chrome-sandbox is not configured for copies under node_modules (needs root chmod 4755).
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** @type {string | null} Source id chosen in renderer for the next display-media request */
let pendingDisplaySourceId = null

/** @type {BrowserWindow | null} */
let mainWindow = null

/** Serialize desktopCapturer.getSources (Wayland portal allows one session at a time). */
let desktopSourcesChain = Promise.resolve()

/** @type {Map<string, { sources: import('electron').DesktopCapturerSource[]; fetchedAt: number }>} */
const desktopSourcesCacheByMode = new Map()

const DESKTOP_SOURCES_CACHE_MS = 5000

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {import('electron').DesktopCapturerSource} source
 * @param {number} index
 */
function formatSourceName(source, index) {
  const raw = typeof source.name === 'string' ? source.name.trim() : ''
  if (raw) return raw
  if (source.id.startsWith('screen:')) {
    const part = source.id.split(':')[1]
    return part ? `Display ${part}` : `Display ${index + 1}`
  }
  return `Window ${index + 1}`
}

/**
 * @param {{ forUiList?: boolean }} [options]
 */
async function fetchDesktopCapturerSources(options = {}) {
  const forUiList = Boolean(options.forUiList)
  const cacheKey = forUiList ? 'ui' : 'capture'
  const now = Date.now()
  const cached = desktopSourcesCacheByMode.get(cacheKey)
  if (cached && now - cached.fetchedAt < DESKTOP_SOURCES_CACHE_MS) {
    return cached.sources
  }

  const run = async () => {
    let lastErr = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await delay(500 * attempt)
        }
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: forUiList ? { width: 150, height: 150 } : { width: 0, height: 0 }
        })
        desktopSourcesCacheByMode.set(cacheKey, { sources, fetchedAt: Date.now() })
        return sources
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr ?? new Error('Failed to get sources')
  }

  desktopSourcesChain = desktopSourcesChain.then(run, run)
  return desktopSourcesChain
}

function resolvePreloadPath() {
  const mjs = join(__dirname, '../preload/index.mjs')
  if (existsSync(mjs)) return mjs
  return join(__dirname, '../preload/index.js')
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 520,
    backgroundColor: '#0e0f12',
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupSessionPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = new Set(['media', 'display-capture', 'videoCapture', 'audioCapture'])
    callback(allowed.has(permission))
  })
}

function setupDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const sourceId = pendingDisplaySourceId
    pendingDisplaySourceId = null

    try {
      const sources = await fetchDesktopCapturerSources()

      let source = sourceId ? sources.find((s) => s.id === sourceId) ?? null : null
      if (!source && sources.length > 0) {
        source = sources.find((s) => s.id.startsWith('screen:')) ?? sources[0]
      }

      if (!source) {
        callback({})
        return
      }

      callback({
        video: source,
        audio: request.audioRequested ? 'loopback' : undefined
      })
    } catch (err) {
      console.error('displayMediaRequestHandler:', err)
      callback({})
    }
  })
}

function setupIpc() {
  ipcMain.handle('get-desktop-sources', async () => {
    try {
      const sources = await fetchDesktopCapturerSources({ forUiList: true })
      return {
        ok: true,
        sources: sources.map((s, index) => ({
          id: s.id,
          name: formatSourceName(s, index),
          displayId: s.display_id
        }))
      }
    } catch (err) {
      console.error('get-desktop-sources:', err)
      return {
        ok: false,
        sources: [],
        error:
          process.platform === 'linux'
            ? 'Screen list unavailable. Grant screen recording permission, close other captures, then click Refresh list.'
            : err?.message || 'Failed to get sources'
      }
    }
  })

  ipcMain.handle('set-display-source-id', (_event, sourceId) => {
    pendingDisplaySourceId = sourceId || null
  })

  ipcMain.handle('save-recording', async (_event, buffer, suggestedName) => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save recording',
      defaultPath: suggestedName || 'recording.webm',
      filters: [{ name: 'WebM video', extensions: ['webm'] }]
    })

    if (canceled || !filePath) {
      return { ok: false, canceled: true }
    }

    await writeFile(filePath, Buffer.from(buffer))
    return { ok: true, filePath }
  })
}

app.whenReady().then(() => {
  setupSessionPermissions()
  setupDisplayMediaHandler()
  setupIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
