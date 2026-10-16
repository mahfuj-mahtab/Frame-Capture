/**
 * @param {{
 *   ui: ReturnType<import('./ui.js').createUi>
 *   compositor: import('./compositor.js').Compositor
 *   canRecord: () => boolean
 *   setIsRecording: (value: boolean) => void
 *   setControlsDisabled: (disabled: boolean) => void
 * }} deps
 */
export function createRecordingSession({
  ui,
  compositor,
  canRecord,
  setIsRecording,
  setControlsDisabled
}) {
  /** @type {MediaRecorder | null} */
  let mediaRecorder = null

  /** @type {Blob[]} */
  let recordedChunks = []

  let recordingStartTime = 0
  /** @type {number | null} */
  let timerInterval = null

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
    ui.showRecBadge(true)
    ui.updateRecTimer(0)
    ui.setStatus('Recording in progress…', 'recording')
    timerInterval = window.setInterval(() => {
      ui.updateRecTimer(Date.now() - recordingStartTime)
    }, 500)
  }

  function stopRecordingTimer() {
    if (timerInterval !== null) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    ui.showRecBadge(false)
  }

  async function finalizeRecording(mimeType) {
    ui.setStatus('Saving…')

    const blob = new Blob(recordedChunks, { type: mimeType })
    recordedChunks = []
    mediaRecorder = null

    if (blob.size === 0) {
      ui.setStatus('Recording empty — try again', 'error')
      return
    }

    try {
      const buffer = await blob.arrayBuffer()
      const result = await window.recorderApi.saveRecording(buffer, suggestedFileName())

      if (result.canceled) {
        ui.setStatus('Save canceled')
      } else if (result.ok) {
        ui.setStatus(`Saved to ${result.filePath}`)
      } else {
        ui.setStatus('Could not save file', 'error')
      }
    } catch (err) {
      ui.setStatus(`Save failed: ${err.message}`, 'error')
    }
  }

  async function startRecording() {
    const stream = compositor.getOutputStream()
    if (!stream || !canRecord()) {
      ui.setStatus('Start preview first (check devices)', 'error')
      return
    }

    const mimeType = pickRecorderMimeType()
    if (!mimeType) {
      ui.setStatus('WebM recording not supported on this system', 'error')
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
      ui.setStatus('Recording error', 'error')
      setIsRecording(false)
      stopRecordingTimer()
      setControlsDisabled(false)
      ui.showRecordingControls(false)
    }

    setIsRecording(true)
    setControlsDisabled(true)
    ui.showRecordingControls(true)
    ui.setStopDisabled(false)

    mediaRecorder.start(1000)
    startRecordingTimer()
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    stopRecordingTimer()
    setIsRecording(false)
    setControlsDisabled(false)
    ui.showRecordingControls(false)
    ui.setRecordDisabled(!canRecord())
  }

  return {
    startRecording,
    stopRecording
  }
}
