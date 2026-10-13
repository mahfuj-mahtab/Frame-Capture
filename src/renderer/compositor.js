/** @typedef {import('./layouts.js').LayoutDefinition} LayoutDefinition */
/** @typedef {import('./layouts.js').LayoutLayer} LayoutLayer */
/** @typedef {import('./source-manager.js').SourceManager} SourceManager */

const BACKGROUND = '#0a0b0d'

/**
 * @param {LayoutLayer} layer
 * @param {SourceManager} sourceManager
 */
function getLayerVideoTrack(layer, sourceManager) {
  if (layer.type === 'camera') return sourceManager.getCameraVideoTrack()
  if (layer.type === 'screen') return sourceManager.getScreenVideoTrack()
  return null
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} source
 * @param {number} sw
 * @param {number} sh
 * @param {number} dx
 * @param {number} dy
 * @param {number} dw
 * @param {number} dh
 * @param {'cover' | 'contain'} fit
 */
function drawSourceInRect(ctx, source, sw, sh, dx, dy, dw, dh, fit) {
  if (!sw || !sh) return

  if (fit === 'contain') {
    const scale = Math.min(dw / sw, dh / sh)
    const dwScaled = sw * scale
    const dhScaled = sh * scale
    const ox = dx + (dw - dwScaled) / 2
    const oy = dy + (dh - dhScaled) / 2
    ctx.drawImage(source, ox, oy, dwScaled, dhScaled)
    return
  }

  const scale = Math.max(dw / sw, dh / sh)
  const scaledW = sw * scale
  const scaledH = sh * scale
  const sx = (scaledW - dw) / 2
  const sy = (scaledH - dh) / 2
  const srcX = sx / scale
  const srcY = sy / scale
  const srcW = dw / scale
  const srcH = dh / scale
  ctx.drawImage(source, srcX, srcY, srcW, srcH, dx, dy, dw, dh)
}

function drawVideoInRect(ctx, video, dx, dy, dw, dh, fit) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return
  drawSourceInRect(ctx, video, vw, vh, dx, dy, dw, dh, fit)
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} dx
 * @param {number} dy
 * @param {number} dw
 * @param {number} dh
 */
function clipCircle(ctx, dx, dy, dw, dh) {
  const cx = dx + dw / 2
  const cy = dy + dh / 2
  const r = Math.min(dw, dh) / 2
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
}

export class Compositor {
  /** @type {HTMLCanvasElement} */
  canvas

  /** @type {CanvasRenderingContext2D} */
  ctx

  /** @type {Map<string, HTMLVideoElement>} */
  layerVideos = new Map()

  /** @type {number | null} */
  rafId = null

  /** @type {LayoutDefinition | null} */
  layout = null

  /** @type {SourceManager | null} */
  sourceManager = null

  /** @type {MediaStream | null} */
  outputStream = null

  targetDrawFps = 30
  outputCaptureFps = 30
  lastDrawMs = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true
      this.ctx.imageSmoothingQuality = 'low'
    }
  }

  /**
   * @param {LayoutDefinition} layout
   * @param {SourceManager} sourceManager
   * @param {{ drawFps?: number; outputFps?: number }} [options]
   */
  async attach(layout, sourceManager, options = {}) {
    this.detach()
    this.layout = layout
    this.sourceManager = sourceManager
    this.targetDrawFps = options.drawFps ?? 30
    this.outputCaptureFps = options.outputFps ?? 30

    const { width, height } = layout.canvas
    this.canvas.width = width
    this.canvas.height = height

    for (const layer of layout.layers) {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.autoplay = true
      const track = getLayerVideoTrack(layer, sourceManager)
      if (track) {
        video.srcObject = new MediaStream([track])
        await video.play().catch(() => {})
      }
      this.layerVideos.set(layer.id, video)
    }

    this.outputStream = this.canvas.captureStream(this.outputCaptureFps)
    for (const t of sourceManager.getMicAudioTracks()) {
      this.outputStream.addTrack(t)
    }

    this.drawFrame()
    this.tick()
  }

  detach() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    for (const video of this.layerVideos.values()) {
      video.srcObject = null
    }
    this.layerVideos.clear()
    this.outputStream = null
    this.layout = null
    this.sourceManager = null
    this.lastDrawMs = 0
  }

  tick() {
    if (document.hidden) {
      this.rafId = requestAnimationFrame(() => this.tick())
      return
    }
    const now = performance.now()
    const minDelta = 1000 / this.targetDrawFps
    if (now - this.lastDrawMs >= minDelta) {
      this.drawFrame()
      this.lastDrawMs = now
    }
    this.rafId = requestAnimationFrame(() => this.tick())
  }

  drawFrame() {
    if (!this.layout || !this.ctx) return
    const { width, height } = this.layout.canvas
    this.ctx.fillStyle = BACKGROUND
    this.ctx.fillRect(0, 0, width, height)

    const sorted = [...this.layout.layers].sort((a, b) => a.zIndex - b.zIndex)
    for (const layer of sorted) {
      const video = this.layerVideos.get(layer.id)
      if (!video || video.readyState < 2) continue

      const dx = layer.rect.x * width
      const dy = layer.rect.y * height
      const dw = layer.rect.w * width
      const dh = layer.rect.h * height
      const fit = layer.fit ?? (layer.type === 'screen' ? 'contain' : 'cover')

      const scaled =
        layer.type === 'screen'
          ? true
          : video.videoWidth !== dw || video.videoHeight !== dh

      this.ctx.save()
      if (layer.mask === 'circle') {
        clipCircle(this.ctx, dx, dy, dw, dh)
      }
      this.ctx.imageSmoothingEnabled = true
      this.ctx.imageSmoothingQuality = scaled ? 'high' : 'low'
      drawVideoInRect(this.ctx, video, dx, dy, dw, dh, fit)
      this.ctx.restore()
      if (this.ctx) {
        this.ctx.imageSmoothingQuality = 'low'
      }
    }
  }

  getOutputStream() {
    return this.outputStream
  }
}
