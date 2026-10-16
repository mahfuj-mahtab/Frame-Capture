import { createCameraOverlay } from './camera-overlay.js'
import { Compositor } from './compositor.js'
import { createDeviceLists } from './device-lists.js'
import {
  cameraLayer,
  createActiveLayout,
  getStoredLayoutId,
  layoutNeedsCamera,
  loadCameraLook,
  normalizeCameraLook,
  storeCameraLook,
  storeCameraRect,
  storeLayoutId
} from './layouts.js'
import { createPreviewSession } from './preview-session.js'
import { createRecordingSession } from './recording-session.js'
import { SourceManager } from './source-manager.js'
import { createUi } from './ui.js'

const ui = createUi()
const sourceManager = new SourceManager()
const compositor = new Compositor()

/** @type {import('./layouts.js').LayoutDefinition} */
let currentLayout = createActiveLayout(getStoredLayoutId())
let isRecording = false
/** @type {number | null} */
let deviceChangeDebounce = null

const devices = createDeviceLists({
  ui,
  getIsRecording: () => isRecording
})

const hooks = {
  /** @param {boolean} _disabled */
  setControlsDisabled(_disabled) {}
}

const preview = createPreviewSession({
  ui,
  devices,
  sourceManager,
  compositor,
  getLayout: () => currentLayout,
  getIsRecording: () => isRecording,
  setControlsDisabled: (disabled) => hooks.setControlsDisabled(disabled)
})

const recording = createRecordingSession({
  ui,
  compositor,
  canRecord: () => preview.canRecord(),
  setIsRecording: (value) => {
    isRecording = value
  },
  setControlsDisabled: (disabled) => hooks.setControlsDisabled(disabled)
})

/**
 * @param {import('./layouts.js').NormRect} rect
 * @param {boolean} persist
 */
function applyCameraRect(rect, persist) {
  const layer = cameraLayer(currentLayout)
  if (!layer) return
  layer.rect = { ...rect }
  if (persist) storeCameraRect(layer.rect)
}

/** @type {import('./layouts.js').CameraLook} */
let cameraLook = loadCameraLook()
compositor.setCameraLook(cameraLook)

const cameraOverlay = createCameraOverlay({
  ui,
  getLayout: () => currentLayout,
  onRectChange: applyCameraRect,
  getShape: () => cameraLook.shape
})

/**
 * @param {Partial<import('./layouts.js').CameraLook>} partial
 */
function applyCameraLook(partial) {
  cameraLook = normalizeCameraLook({ ...cameraLook, ...partial })
  compositor.setCameraLook(cameraLook)
  ui.applyCameraLookControls(cameraLook)
  cameraOverlay.sync()
  storeCameraLook(cameraLook)
}

function setControlsDisabled(disabled) {
  const locked = disabled || isRecording
  ui.lockDeviceControls(locked, locked || !layoutNeedsCamera(currentLayout))
  ui.setRecordDisabled(disabled || isRecording || !preview.canRecord())
  ui.setStopDisabled(!isRecording)
}

hooks.setControlsDisabled = setControlsDisabled

const {
  layoutSelect,
  cameraSelect,
  cameraEnhance,
  shapeCircle,
  shapeSquare,
  cameraBrightness,
  cameraBlur,
  cameraClarity,
  cameraZoom,
  micSelect,
  screenSelect,
  refreshSourcesBtn,
  startScreenPreviewBtn,
  recordBtn,
  stopBtn
} = ui.els

ui.applyCameraLookControls(cameraLook)

cameraEnhance?.addEventListener('change', () => {
  if (!(cameraEnhance instanceof HTMLInputElement)) return
  applyCameraLook({ enhance: cameraEnhance.checked })
})
shapeCircle?.addEventListener('click', () => applyCameraLook({ shape: 'circle' }))
shapeSquare?.addEventListener('click', () => applyCameraLook({ shape: 'square' }))
cameraBrightness?.addEventListener('input', () => {
  if (!(cameraBrightness instanceof HTMLInputElement)) return
  applyCameraLook({ brightness: Number(cameraBrightness.value) / 100 })
})
cameraBlur?.addEventListener('input', () => {
  if (!(cameraBlur instanceof HTMLInputElement)) return
  applyCameraLook({ blur: Number(cameraBlur.value) })
})
cameraClarity?.addEventListener('input', () => {
  if (!(cameraClarity instanceof HTMLInputElement)) return
  applyCameraLook({ clarity: Number(cameraClarity.value) / 100 })
})
cameraZoom?.addEventListener('input', () => {
  if (!(cameraZoom instanceof HTMLInputElement)) return
  applyCameraLook({ zoom: Number(cameraZoom.value) })
})

layoutSelect?.addEventListener('change', () => {
  const id = layoutSelect.value
  currentLayout = createActiveLayout(id)
  storeLayoutId(id)
  void preview.teardownPreview().then(() => {
    ui.updateDeviceFieldsVisibility(currentLayout)
    cameraOverlay.sync()
    void preview.refreshPreview()
  })
})

cameraSelect.addEventListener('change', () => void preview.refreshPreview())
micSelect.addEventListener('change', () => void preview.refreshPreview())
refreshSourcesBtn.addEventListener('click', () => void devices.populateScreenSources(true))
screenSelect.addEventListener('focus', () => {
  void devices.populateScreenSources(false)
})
screenSelect.addEventListener('change', () => {
  screenSelect.dataset.lastValue = screenSelect.value
})
startScreenPreviewBtn.addEventListener('click', () => void preview.refreshPreview())
recordBtn.addEventListener('click', () => void recording.startRecording())
stopBtn.addEventListener('click', () => recording.stopRecording())

navigator.mediaDevices?.addEventListener('devicechange', () => {
  if (deviceChangeDebounce !== null) clearTimeout(deviceChangeDebounce)
  deviceChangeDebounce = window.setTimeout(() => {
    deviceChangeDebounce = null
    void devices.populateDeviceLists().then(() => preview.refreshPreview())
  }, 400)
})

window.addEventListener('beforeunload', () => {
  compositor.detach()
  sourceManager.stopAll()
})

async function init() {
  layoutSelect.value = currentLayout.id
  ui.updateDeviceFieldsVisibility(currentLayout)
  cameraOverlay.sync()
  await devices.populateDeviceLists()
  await devices.populateScreenSources(false)
  setControlsDisabled(false)
}

void init()
