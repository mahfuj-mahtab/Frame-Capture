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
  const cameraEditHint = document.getElementById('camera-edit-hint')
  const cameraOverlay = document.getElementById('camera-overlay')
  const cameraResize = document.getElementById('camera-resize')
  const cameraEnhance = document.getElementById('camera-enhance')
  const shapeCircle = document.getElementById('shape-circle')
  const shapeSquare = document.getElementById('shape-square')
  const cameraLookSliders = document.getElementById('camera-look-sliders')
  const cameraBrightness = document.getElementById('camera-brightness')
  const cameraBlur = document.getElementById('camera-blur')
  const cameraClarity = document.getElementById('camera-clarity')
  const cameraZoom = document.getElementById('camera-zoom')

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
    fieldCamera,
    cameraEditHint,
    cameraOverlay,
    cameraResize,
    cameraEnhance,
    shapeCircle,
    shapeSquare,
    cameraLookSliders,
    cameraBrightness,
    cameraBlur,
    cameraClarity,
    cameraZoom
  }

  /**
   * @param {import('./layouts.js').CameraLook} look
   */
  function applyCameraLookControls(look) {
    if (cameraEnhance instanceof HTMLInputElement) cameraEnhance.checked = look.enhance
    shapeCircle?.classList.toggle('is-active', look.shape === 'circle')
    shapeSquare?.classList.toggle('is-active', look.shape === 'square')
    if (cameraBrightness instanceof HTMLInputElement) {
      cameraBrightness.value = String(Math.round(look.brightness * 100))
      cameraBrightness.disabled = !look.enhance
    }
    if (cameraBlur instanceof HTMLInputElement) {
      cameraBlur.value = String(Math.round(look.blur))
      cameraBlur.disabled = !look.enhance
    }
    if (cameraClarity instanceof HTMLInputElement) {
      cameraClarity.value = String(Math.round(look.clarity * 100))
      cameraClarity.disabled = !look.enhance
    }
    if (cameraZoom instanceof HTMLInputElement) {
      cameraZoom.value = String(Math.round(look.zoom))
    }
    cameraLookSliders?.classList.toggle('is-disabled', !look.enhance)
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
    const showCamera = layoutNeedsCamera(layout)
    fieldCamera?.classList.toggle('hidden', !showCamera)
    cameraEditHint?.classList.toggle('hidden', !showCamera)
    if (!showCamera) setCameraOverlayVisible(false)
  }

  function setCameraOverlayVisible(show) {
    cameraOverlay?.classList.toggle('hidden', !show)
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
    setCameraOverlayVisible,
    applyCameraLookControls,
    showRecBadge,
    updateRecTimer,
    lockDeviceControls,
    setRecordDisabled,
    setStopDisabled,
    showRecordingControls
  }
}
