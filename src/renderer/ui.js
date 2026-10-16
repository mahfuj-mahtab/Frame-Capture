import { layoutNeedsCamera } from './layouts.js'

export function createUi() {
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

  const els = {
    compositorPreview,
    previewWrap,
    placeholderText,
    statusEl,
    recBadge,
    recTimer,
    recordBtn,
    stopBtn,
    layoutSelect,
    cameraSelect,
    micSelect,
    screenSelect,
    refreshSourcesBtn,
    startScreenPreviewBtn,
    fieldCamera
  }

  function setStatus(text, className = '') {
    statusEl.textContent = text
    statusEl.className = `sidebar-status${className ? ` ${className}` : ''}`
  }

  function setPreviewHasStream(has) {
    previewWrap?.classList.toggle('has-stream', has)
    compositorPreview?.classList.toggle('hidden', !has)
  }

  function setPlaceholder(text) {
    if (placeholderText) placeholderText.textContent = text
  }

  /**
   * @param {import('./layouts.js').LayoutDefinition} layout
   */
  function updateDeviceFieldsVisibility(layout) {
    fieldCamera?.classList.toggle('hidden', !layoutNeedsCamera(layout))
  }

  function showRecBadge(show) {
    recBadge?.classList.toggle('hidden', !show)
  }

  function formatElapsed(ms) {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function updateRecTimer(ms) {
    if (recTimer) recTimer.textContent = formatElapsed(ms)
  }

  function lockDeviceControls(locked, cameraDisabled) {
    layoutSelect.disabled = locked
    cameraSelect.disabled = cameraDisabled
    screenSelect.disabled = locked
    refreshSourcesBtn.disabled = locked
    startScreenPreviewBtn.disabled = locked
    micSelect.disabled = locked
  }

  function setRecordDisabled(disabled) {
    recordBtn.disabled = disabled
  }

  function setStopDisabled(disabled) {
    stopBtn.disabled = disabled
  }

  function showRecordingControls(recording) {
    recordBtn.classList.toggle('hidden', recording)
    stopBtn.classList.toggle('hidden', !recording)
  }

  return {
    els,
    setStatus,
    setPreviewHasStream,
    setPlaceholder,
    updateDeviceFieldsVisibility,
    showRecBadge,
    updateRecTimer,
    lockDeviceControls,
    setRecordDisabled,
    setStopDisabled,
    showRecordingControls
  }
}
