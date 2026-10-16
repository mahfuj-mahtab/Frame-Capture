import { fetchDesktopSources, invalidateDesktopSourcesCache } from './desktop-sources.js'

/**
 * @param {{
 *   ui: ReturnType<import('./ui.js').createUi>
 *   getIsRecording: () => boolean
 * }} deps
 */
export function createDeviceLists({ ui, getIsRecording }) {
  const { cameraSelect, micSelect, screenSelect, refreshSourcesBtn, startScreenPreviewBtn } = ui.els

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
      ui.setStatus(`Screen sources: ${err.message}`, 'error')
    } finally {
      screenSelect.disabled = getIsRecording()
    }
  }

  return {
    cameraDeviceAvailable,
    populateDeviceLists,
    populateScreenSources
  }
}
