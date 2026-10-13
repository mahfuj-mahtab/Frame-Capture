import { Compositor } from './compositor.js'
import { fetchDesktopSources, invalidateDesktopSourcesCache } from './desktop-sources.js'
import {
  getLayoutById,
  getStoredLayoutId,
  layoutNeedsCamera,
  storeLayoutId
} from './layouts.js'
import { SourceManager } from './source-manager.js'

const compositorPreview = document.getElementById('compositor-preview')
const previewWrap = document.querySelector('.preview-wrap')
const placeholderText = document.querySelector('.placeholder-text')
const statusEl = document.getElementById('status')
const recBadge = document.getElementById('rec-badge')
const recTimer = document.getElementById('rec-timer')
const recordBtn = document.getElementById('record-btn')
const stopBtn = document.getElementById('stop-btn')
const layoutSelect = document.getElementById('layout-select')
const cameraSelect = document.getElementById('camera-select')
const micSelect = document.getElementById('mic-select')
const screenSelect = document.getElementById('screen-select')
const refreshSourcesBtn = document.getElementById('refresh-sources')
const startScreenPreviewBtn = document.getElementById('start-screen-preview')
const fieldCamera = document.querySelector('.field-camera')

const sourceManager = new SourceManager()
const compositor = new Compositor()

/** @type {import('./layouts.js').LayoutDefinition} */
let currentLayout = getLayoutById(getStoredLayoutId())

/** @type {MediaRecorder | null} */
let mediaRecorder = null

/** @type {Blob[]} */
let recordedChunks = []

let recordingStartTime = 0
/** @type {number | null} */
let timerInterval = null
let isRecording = false
let previewGeneration = 0
/** @type {number | null} */
let deviceChangeDebounce = null

function setStatus(text, className = '') {
  statusEl.textContent = text
  statusEl.className = `sidebar-status${className ? ` ${className}` : ''}`
}

function setPreviewHasStream(has) {
  previewWrap?.classList.toggle('has-stream', has)
  compositorPreview?.classList.toggle('hidden', !has)
}

function setControlsDisabled(disabled) {
  const locked = disabled || isRecording
  layoutSelect.disabled = locked
  cameraSelect.disabled = locked || !layoutNeedsCamera(currentLayout)
  screenSelect.disabled = locked
  refreshSourcesBtn.disabled = locked
  startScreenPreviewBtn.disabled = locked
  micSelect.disabled = locked
  recordBtn.disabled = disabled || isRecording || !canRecord()
  stopBtn.disabled = !isRecording
}

function updateDeviceFieldsVisibility() {
  fieldCamera?.classList.toggle('hidden', !layoutNeedsCamera(currentLayout))
}

function showRecBadge(show) {
  recBadge?.classList.toggle('hidden', !show)
}

function updateRecTimer(ms) {
  if (recTimer) recTimer.textContent = formatElapsed(ms)
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function cameraDeviceAvailable() {
  return [...cameraSelect.options].some((o) => Boolean(o.value))
}

async function populateDeviceLists() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const cameras = devices.filter((d) => d.kind === 'videoinput')
  const mics = devices.filter((d) => d.kind === 'audioinput')

  cameraSelect.innerHTML = ''
  if (!cameras.length) {
    cameraSelect.add(new Option('No camera found', ''))
  } else {
    cameras.forEach((d, i) => {
      cameraSelect.add(new Option(d.label || `Camera ${i + 1}`, d.deviceId))
    })
  }

  micSelect.innerHTML = ''
  if (!mics.length) {
    micSelect.add(new Option('No microphone found', ''))
  } else {
    mics.forEach((d, i) => {
      micSelect.add(new Option(d.label || `Microphone ${i + 1}`, d.deviceId))
    })
  }

  cameraSelect.disabled = false
  micSelect.disabled = false
  screenSelect.disabled = false
  refreshSourcesBtn.disabled = false
  startScreenPreviewBtn.disabled = false
}

async function populateScreenSources(force = false) {
  if (force) invalidateDesktopSourcesCache()
  screenSelect.innerHTML = ''
  screenSelect.add(new Option('Loading…', ''))
  screenSelect.disabled = true

  try {
    const sources = await fetchDesktopSources(force)
    screenSelect.innerHTML = ''
    if (!sources?.length) {
      screenSelect.add(new Option('No sources — click Refresh list', ''))
      return
    }
    screenSelect.add(new Option('Select display or window…', ''))
    for (const s of sources) {
      screenSelect.add(new Option(s.name, s.id))
    }
    const prev = screenSelect.dataset.lastValue
    if (prev && [...screenSelect.options].some((o) => o.value === prev)) {
      screenSelect.value = prev
    }
  } catch (err) {
    screenSelect.innerHTML = ''
    screenSelect.add(new Option('Failed to load sources', ''))
    setStatus(`Screen sources: ${err.message}`, 'error')
  } finally {
    screenSelect.disabled = isRecording
  }
}

function buildPreviewStatus(partialScreen, partialCamera) {
  const parts = []
  if (partialScreen) parts.push('pick a screen and Share & preview')
  if (partialCamera && layoutNeedsCamera(currentLayout)) {
    parts.push('no camera')
  }
  if (parts.length === 0) return 'Ready'
  if (parts.length === 1 && parts[0] === 'no camera') {
    return 'No camera — screen still records'
  }
  return parts.join(' · ')
}

/**
 * @returns {Promise<{ partialScreen: boolean; partialCamera: boolean }>}
 */
async function acquireSourcesForLayout(layout) {
  let needsCamera = layoutNeedsCamera(layout)
  let partialScreen = false
  let partialCamera = false

  const screenSourceId = screenSelect.value || null
  if (!screenSourceId) {
    partialScreen = true
  }

  if (needsCamera && !cameraDeviceAvailable()) {
    needsCamera = false
    partialCamera = true
  }

  if (!partialScreen) {
    await sourceManager.acquire({
      needsCamera,
      needsScreen: true,
      needsMic: true,
      cameraDeviceId: cameraSelect.value || undefined,
      micDeviceId: micSelect.value || undefined,
      screenSourceId
    })
  } else {
    await sourceManager.stopAllAsync()
  }

  if (needsCamera && !sourceManager.getCameraVideoTrack()) {
    partialCamera = true
  }

  sourceManager.onScreenEnded = () => {
    if (!isRecording) {
      setStatus('Screen share ended', 'error')
      void teardownPreview()
    }
  }

  return { partialScreen, partialCamera }
}

async function startCompositorPreview(layout) {
  compositor.detach()
  if (!compositorPreview) return

  await compositor.attach(layout, sourceManager, { drawFps: 30, outputFps: 30 })
  compositorPreview.srcObject = compositor.getOutputStream()
  await compositorPreview.play().catch(() => {})
  setPreviewHasStream(true)
}

function releasePreviewConsumers() {
  compositor.detach()
  if (compositorPreview) compositorPreview.srcObject = null
}

async function teardownPreview() {
  releasePreviewConsumers()
  setPreviewHasStream(false)
  await sourceManager.stopAllAsync()
}

async function refreshPreview() {
  if (isRecording) return
  const generation = ++previewGeneration

  try {
    setControlsDisabled(true)
    updateDeviceFieldsVisibility()
    releasePreviewConsumers()

    if (generation !== previewGeneration) return

    const { partialScreen, partialCamera } = await acquireSourcesForLayout(currentLayout)
    if (generation !== previewGeneration) {
      await sourceManager.stopAllAsync()
      return
    }

    if (partialScreen) {
      setPreviewHasStream(false)
      setStatus(buildPreviewStatus(partialScreen, partialCamera))
      return
    }

    await startCompositorPreview(currentLayout)
    if (generation !== previewGeneration) {
      await sourceManager.stopAllAsync()
      releasePreviewConsumers()
      return
    }

    setStatus(buildPreviewStatus(partialScreen, partialCamera))
  } catch (err) {
    if (generation !== previewGeneration) return
    await teardownPreview()
    if (placeholderText) placeholderText.textContent = err.message || String(err)
    setStatus(err.message || String(err), 'error')
  } finally {
    if (generation !== previewGeneration) return
    setControlsDisabled(false)
  }
}

function canRecord() {
  const stream = compositor.getOutputStream()
  if (!stream) return false
  if (!sourceManager.getScreenVideoTrack()) return false
  if (layoutNeedsCamera(currentLayout) && !sourceManager.getCameraVideoTrack()) {
    return false
  }
  return stream.getVideoTracks().some((t) => t.readyState === 'live')
}

function pickRecorderMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

function suggestedFileName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `recording-${stamp}.webm`
}

function startRecordingTimer() {
  recordingStartTime = Date.now()
  showRecBadge(true)
  updateRecTimer(0)
  setStatus('Recording in progress…', 'recording')
  timerInterval = window.setInterval(() => {
    updateRecTimer(Date.now() - recordingStartTime)
  }, 500)
}

function stopRecordingTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  showRecBadge(false)
}

async function startRecording() {
  const stream = compositor.getOutputStream()
  if (!stream || !canRecord()) {
    setStatus('Start preview first (check devices)', 'error')
    return
  }

  const mimeType = pickRecorderMimeType()
  if (!mimeType) {
    setStatus('WebM recording not supported on this system', 'error')
    return
  }

  recordedChunks = []
  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000
  })

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data)
  }

  mediaRecorder.onstop = () => {
    void finalizeRecording(mimeType)
  }

  mediaRecorder.onerror = () => {
    setStatus('Recording error', 'error')
    isRecording = false
    stopRecordingTimer()
    setControlsDisabled(false)
    recordBtn.classList.remove('hidden')
    stopBtn.classList.add('hidden')
  }

  isRecording = true
  setControlsDisabled(true)
  recordBtn.classList.add('hidden')
  stopBtn.classList.remove('hidden')
  stopBtn.disabled = false

  mediaRecorder.start(1000)
  startRecordingTimer()
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  stopRecordingTimer()
  isRecording = false
  setControlsDisabled(false)
  recordBtn.classList.remove('hidden')
  stopBtn.classList.add('hidden')
  recordBtn.disabled = !canRecord()
}

async function finalizeRecording(mimeType) {
  setStatus('Saving…')

  const blob = new Blob(recordedChunks, { type: mimeType })
  recordedChunks = []
  mediaRecorder = null

  if (blob.size === 0) {
    setStatus('Recording empty — try again', 'error')
    return
  }

  try {
    const buffer = await blob.arrayBuffer()
    const result = await window.recorderApi.saveRecording(buffer, suggestedFileName())

    if (result.canceled) {
      setStatus('Save canceled')
    } else if (result.ok) {
      setStatus(`Saved to ${result.filePath}`)
    } else {
      setStatus('Could not save file', 'error')
    }
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, 'error')
  }
}

layoutSelect?.addEventListener('change', () => {
  const id = layoutSelect.value
  currentLayout = getLayoutById(id)
  storeLayoutId(id)
  void teardownPreview().then(() => {
    updateDeviceFieldsVisibility()
    void refreshPreview()
  })
})

cameraSelect.addEventListener('change', () => void refreshPreview())
micSelect.addEventListener('change', () => void refreshPreview())
refreshSourcesBtn.addEventListener('click', () => void populateScreenSources(true))
screenSelect.addEventListener('focus', () => {
  void populateScreenSources(false)
})
screenSelect.addEventListener('change', () => {
  screenSelect.dataset.lastValue = screenSelect.value
})
startScreenPreviewBtn.addEventListener('click', () => void refreshPreview())
recordBtn.addEventListener('click', () => void startRecording())
stopBtn.addEventListener('click', () => stopRecording())

navigator.mediaDevices?.addEventListener('devicechange', () => {
  if (deviceChangeDebounce !== null) clearTimeout(deviceChangeDebounce)
  deviceChangeDebounce = window.setTimeout(() => {
    deviceChangeDebounce = null
    void populateDeviceLists().then(() => refreshPreview())
  }, 400)
})

window.addEventListener('beforeunload', () => {
  compositor.detach()
  sourceManager.stopAll()
})

async function init() {
  layoutSelect.value = currentLayout.id
  updateDeviceFieldsVisibility()
  await populateDeviceLists()
  await populateScreenSources(false)
  setControlsDisabled(false)
}

void init()
