import { layoutNeedsCamera } from './layouts.js'

/**
 * @param {{
 *   ui: ReturnType<import('./ui.js').createUi>
 *   devices: ReturnType<import('./device-lists.js').createDeviceLists>
 *   sourceManager: import('./source-manager.js').SourceManager
 *   compositor: import('./compositor.js').Compositor
 *   getLayout: () => import('./layouts.js').LayoutDefinition
 *   getIsRecording: () => boolean
 *   setControlsDisabled: (disabled: boolean) => void
 * }} deps
 */
export function createPreviewSession({
  ui,
  devices,
  sourceManager,
  compositor,
  getLayout,
  getIsRecording,
  setControlsDisabled
}) {
  const { compositorPreview, cameraSelect, micSelect, screenSelect } = ui.els
  let previewGeneration = 0

  function buildPreviewStatus(partialScreen, partialCamera) {
    const parts = []
    if (partialScreen) parts.push('pick a screen and Share & preview')
    if (partialCamera && layoutNeedsCamera(getLayout())) {
      parts.push('no camera')
    }
    if (parts.length === 0) return 'Ready'
    if (parts.length === 1 && parts[0] === 'no camera') {
      return 'No camera — screen still records'
    }
    return parts.join(' · ')
  }

  /**
   * @param {import('./layouts.js').LayoutDefinition} layout
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

    if (needsCamera && !devices.cameraDeviceAvailable()) {
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
      if (!getIsRecording()) {
        ui.setStatus('Screen share ended', 'error')
        void teardownPreview()
      }
    }

    return { partialScreen, partialCamera }
  }

  /**
   * @param {import('./layouts.js').LayoutDefinition} layout
   */
  async function startCompositorPreview(layout) {
    compositor.detach()
    if (!compositorPreview) return

    await compositor.attach(layout, sourceManager, { drawFps: 30, outputFps: 30 })
    compositorPreview.srcObject = compositor.getOutputStream()
    await compositorPreview.play().catch(() => {})
    ui.setPreviewHasStream(true)
  }

  function releasePreviewConsumers() {
    compositor.detach()
    if (compositorPreview) compositorPreview.srcObject = null
  }

  async function teardownPreview() {
    releasePreviewConsumers()
    ui.setPreviewHasStream(false)
    await sourceManager.stopAllAsync()
  }

  async function refreshPreview() {
    if (getIsRecording()) return
    const generation = ++previewGeneration

    try {
      setControlsDisabled(true)
      ui.updateDeviceFieldsVisibility(getLayout())
      releasePreviewConsumers()

      if (generation !== previewGeneration) return

      const { partialScreen, partialCamera } = await acquireSourcesForLayout(getLayout())
      if (generation !== previewGeneration) {
        await sourceManager.stopAllAsync()
        return
      }

      if (partialScreen) {
        ui.setPreviewHasStream(false)
        ui.setStatus(buildPreviewStatus(partialScreen, partialCamera))
        return
      }

      await startCompositorPreview(getLayout())
      if (generation !== previewGeneration) {
        await sourceManager.stopAllAsync()
        releasePreviewConsumers()
        return
      }

      ui.setStatus(buildPreviewStatus(partialScreen, partialCamera))
    } catch (err) {
      if (generation !== previewGeneration) return
      await teardownPreview()
      ui.setPlaceholder(err.message || String(err))
      ui.setStatus(err.message || String(err), 'error')
    } finally {
      if (generation !== previewGeneration) return
      setControlsDisabled(false)
    }
  }

  function canRecord() {
    const stream = compositor.getOutputStream()
    if (!stream) return false
    if (!sourceManager.getScreenVideoTrack()) return false
    if (layoutNeedsCamera(getLayout()) && !sourceManager.getCameraVideoTrack()) {
      return false
    }
    return stream.getVideoTracks().some((t) => t.readyState === 'live')
  }

  return {
    canRecord,
    refreshPreview,
    teardownPreview,
    releasePreviewConsumers
  }
}
