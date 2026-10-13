function stopStream(stream) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function mediaDelay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Time for PipeWire/Chromium to release capture after track.stop() (Linux). */
export const PIPEWIRE_RELEASE_MS = 280

/** Electron desktop capture via chromeMediaSource (reliable on Linux). */
export async function captureDesktopBySourceId(sourceId) {
  const attempts = [
    {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: 30
        }
      }
    },
    {
      audio: false,
      video: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 30
      }
    }
  ]

  let lastError = null
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      lastError = err
    }
  }

  await window.recorderApi.setDisplaySourceId(sourceId)
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  } catch (err) {
    throw lastError ?? err
  }
}

/**
 * @param {{ id: string; name: string }[]} sources
 * @returns {string | null}
 */
export function pickAutoScreenSourceId(sources) {
  if (!sources.length) return null
  const screen = sources.find((s) => s.id.startsWith('screen:'))
  return screen?.id ?? sources[0].id
}

export class SourceManager {
  /** @type {MediaStream | null} */
  cameraStream = null

  /** @type {MediaStream | null} */
  displayStream = null

  /** @type {MediaStream | null} */
  micStream = null

  /** @type {(() => void) | null} */
  onScreenEnded = null

  /** Serializes capture start/stop to avoid PipeWire thread-loop re-entry on Linux. */
  #chain = Promise.resolve()

  #enqueue(task) {
    const run = this.#chain.then(task, task)
    this.#chain = run.catch(() => {})
    return run
  }

  stopAll() {
    stopStream(this.cameraStream)
    stopStream(this.displayStream)
    stopStream(this.micStream)
    this.cameraStream = null
    this.displayStream = null
    this.micStream = null
  }

  async stopAllAsync() {
    return this.#enqueue(async () => {
      this.stopAll()
      await mediaDelay(PIPEWIRE_RELEASE_MS)
    })
  }

  /**
   * @param {{ deviceId?: string }} options
   */
  async startCamera(options = {}) {
    const { deviceId } = options
    return this.#enqueue(async () => {
      stopStream(this.cameraStream)
      this.cameraStream = null
      await mediaDelay(PIPEWIRE_RELEASE_MS)
      const constraints = {
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId } } : true
      }
      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints)
      return this.cameraStream
    })
  }

  /**
   * @param {string} sourceId
   */
  async startScreen(sourceId) {
    return this.#enqueue(async () => {
      stopStream(this.displayStream)
      this.displayStream = null
      await mediaDelay(PIPEWIRE_RELEASE_MS)
      this.displayStream = await captureDesktopBySourceId(sourceId)
      this.displayStream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          this.onScreenEnded?.()
        }
      })
      return this.displayStream
    })
  }

  /**
   * @param {{ deviceId?: string }} options
   */
  async startMic(options = {}) {
    const { deviceId } = options
    return this.#enqueue(async () => {
      stopStream(this.micStream)
      this.micStream = null
      await mediaDelay(120)
      const constraints = deviceId
        ? { audio: { deviceId: { exact: deviceId } } }
        : { audio: true }
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch {
        this.micStream = null
      }
      return this.micStream
    })
  }

  /**
   * Stop everything, then start sources in a PipeWire-friendly order (mic → camera → screen).
   * @param {{
   *   needsCamera: boolean
   *   needsScreen: boolean
   *   needsMic: boolean
   *   cameraDeviceId?: string
   *   micDeviceId?: string
   *   screenSourceId: string | null
   * }} spec
   */
  async acquire(spec) {
    return this.#enqueue(async () => {
      this.stopAll()
      await mediaDelay(PIPEWIRE_RELEASE_MS)

      if (spec.needsMic) {
        const constraints = spec.micDeviceId
          ? { audio: { deviceId: { exact: spec.micDeviceId } } }
          : { audio: true }
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch {
          this.micStream = null
        }
        await mediaDelay(120)
      }

      if (spec.needsCamera) {
        const constraints = {
          audio: false,
          video: spec.cameraDeviceId
            ? { deviceId: { exact: spec.cameraDeviceId } }
            : true
        }
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch {
          this.cameraStream = null
        }
        await mediaDelay(PIPEWIRE_RELEASE_MS)
      }

      if (spec.needsScreen) {
        if (!spec.screenSourceId) {
          throw new Error('No screen source')
        }
        this.displayStream = await captureDesktopBySourceId(spec.screenSourceId)
        this.displayStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            this.onScreenEnded?.()
          }
        })
      }
    })
  }

  getCameraVideoTrack() {
    return this.cameraStream?.getVideoTracks()[0] ?? null
  }

  getScreenVideoTrack() {
    return this.displayStream?.getVideoTracks()[0] ?? null
  }

  getMicAudioTracks() {
    return this.micStream ? [...this.micStream.getAudioTracks()] : []
  }
}
