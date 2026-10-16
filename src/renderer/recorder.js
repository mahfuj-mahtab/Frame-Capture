import { Compositor } from './compositor.js'
import { createDeviceLists } from './device-lists.js'
import {
  getLayoutById,
  getStoredLayoutId,
  layoutNeedsCamera,
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
let currentLayout = getLayoutById(getStoredLayoutId())
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

function setControlsDisabled(disabled) {
  const locked = disabled || isRecording
  ui.lockDeviceControls(locked, locked || !layoutNeedsCamera(currentLayout))
  ui.setRecordDisabled(disabled || isRecording || !preview.canRecord())
  ui.setStopDisabled(!isRecording)
}

hooks.setControlsDisabled = setControlsDisabled

const { layoutSelect, cameraSelect, micSelect, screenSelect, refreshSourcesBtn, startScreenPreviewBtn, recordBtn, stopBtn } =
  ui.els

layoutSelect?.addEventListener('change', () => {
  const id = layoutSelect.value
  currentLayout = getLayoutById(id)
  storeLayoutId(id)
  void preview.teardownPreview().then(() => {
    ui.updateDeviceFieldsVisibility(currentLayout)
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
  await devices.populateDeviceLists()
  await devices.populateScreenSources(false)
  setControlsDisabled(false)
}

void init()
