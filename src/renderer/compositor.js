import { createCameraEnhance } from './camera-enhance.js'

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

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox
 * @param {number} oy
 * @param {number} side
 * @param {'circle' | 'square'} shape
 */
function clipBubble(ctx, ox, oy, side, shape) {
  ctx.beginPath()
  if (shape === 'square') {
    ctx.rect(ox, oy, side, side)
  } else {
    const r = side / 2
    ctx.arc(ox + r, oy + r, r, 0, Math.PI * 2)
  }
  ctx.clip()
}

const sharpScratch = document.createElement('canvas')
const maskScratch = document.createElement('canvas')
const sharpScratchCtx = sharpScratch.getContext('2d', { alpha: true })
const maskScratchCtx = maskScratch.getContext('2d', { alpha: true })

if (sharpScratchCtx) {
  sharpScratchCtx.imageSmoothingEnabled = true
  sharpScratchCtx.imageSmoothingQuality = 'high'
}
if (maskScratchCtx) {
  maskScratchCtx.imageSmoothingEnabled = true
  maskScratchCtx.imageSmoothingQuality = 'high'
}

/**
 * @param {number} sw
 * @param {number} sh
 * @param {number} dw
 * @param {number} dh
 * @param {number} zoom01
 */
function frameScale(sw, sh, dw, dh, zoom01) {
  const contain = Math.min(dw / sw, dh / sh)
  const cover = Math.max(dw / sw, dh / sh)
  const t = Math.min(1, Math.max(0, zoom01))
  return contain + (cover - contain) * t
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} size
 */
function ensureSquare(canvas, size) {
  const edge = Math.max(1, Math.round(size))
  if (canvas.width !== edge || canvas.height !== edge) {
    canvas.width = edge
    canvas.height = edge
  }
  return edge
}

/**
 * Opaque center, transparent rim, along the sharp rectangle only.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} feather
 */
function fillRectFeather(ctx, x, y, w, h, feather) {
  const f = Math.min(feather, w / 2, h / 2)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  if (f <= 0) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(x, y, w, h)
    return
  }

  ctx.fillStyle = '#fff'
  ctx.fillRect(x + f, y + f, Math.max(0, w - f * 2), Math.max(0, h - f * 2))

  const top = ctx.createLinearGradient(0, y, 0, y + f)
  top.addColorStop(0, 'rgba(255,255,255,0)')
  top.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = top
  ctx.fillRect(x + f, y, Math.max(0, w - f * 2), f)

  const bottom = ctx.createLinearGradient(0, y + h - f, 0, y + h)
  bottom.addColorStop(0, 'rgba(255,255,255,1)')
  bottom.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = bottom
  ctx.fillRect(x + f, y + h - f, Math.max(0, w - f * 2), f)

  const left = ctx.createLinearGradient(x, 0, x + f, 0)
  left.addColorStop(0, 'rgba(255,255,255,0)')
  left.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = left
  ctx.fillRect(x, y + f, f, Math.max(0, h - f * 2))

  const right = ctx.createLinearGradient(x + w - f, 0, x + w, 0)
  right.addColorStop(0, 'rgba(255,255,255,1)')
  right.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = right
  ctx.fillRect(x + w - f, y + f, f, Math.max(0, h - f * 2))

  /**
   * @param {number} cx
   * @param {number} cy
   * @param {number} rx
   * @param {number} ry
   */
  function corner(cx, cy, rx, ry) {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, f)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(Math.min(cx, rx), Math.min(cy, ry), f, f)
  }

  corner(x + f, y + f, x, y)
  corner(x + w - f, y + f, x + w, y)
  corner(x + f, y + h - f, x, y + h)
  corner(x + w - f, y + h - f, x + w, y + h)
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} source
 * @param {number} sw
 * @param {number} sh
 * @param {number} side
 * @param {number} zoom01
 * @param {number} featherPx
 */
function drawSharpZoomed(ctx, source, sw, sh, side, zoom01, featherPx) {
  const placed = (target) => {
    const scale = frameScale(sw, sh, target, target, zoom01)
    const dw = sw * scale
    const dh = sh * scale
    return {
      dw,
      dh,
      ox: (target - dw) / 2,
      oy: (target - dh) / 2,
      covers: dw >= target - 0.5 && dh >= target - 0.5
    }
  }

  const direct = placed(side)
  if (featherPx <= 0 || direct.covers || !sharpScratchCtx || !maskScratchCtx) {
    ctx.drawImage(source, direct.ox, direct.oy, direct.dw, direct.dh)
    return
  }

  const edge = ensureSquare(sharpScratch, side)
  ensureSquare(maskScratch, side)
  const local = placed(edge)
  sharpScratchCtx.save()
  sharpScratchCtx.globalCompositeOperation = 'source-over'
  sharpScratchCtx.clearRect(0, 0, edge, edge)
  sharpScratchCtx.drawImage(source, local.ox, local.oy, local.dw, local.dh)
  maskScratchCtx.save()
  maskScratchCtx.globalCompositeOperation = 'source-over'
  fillRectFeather(maskScratchCtx, local.ox, local.oy, local.dw, local.dh, featherPx)
  maskScratchCtx.restore()
  sharpScratchCtx.globalCompositeOperation = 'destination-in'
  sharpScratchCtx.drawImage(maskScratch, 0, 0)
  sharpScratchCtx.restore()
  ctx.drawImage(sharpScratch, 0, 0, side, side)
}

/**
 * Mirror the webcam. Blur fills the bubble; the sharp frame sits at the zoom level
 * and fades along its rectangle into that fill.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLVideoElement} video
 * @param {{ sharp: HTMLCanvasElement, blur: HTMLCanvasElement } | null} plates
 * @param {number} dx
 * @param {number} dy
 * @param {number} dw
 * @param {number} dh
 * @param {'circle' | 'square'} shape
 * @param {number} zoom01
 * @param {number} featherPx
 */
function drawCameraBubble(ctx, video, plates, dx, dy, dw, dh, shape, zoom01, featherPx) {
  const side = Math.min(dw, dh)
  const ox = dx + (dw - side) / 2
  const oy = dy + (dh - side) / 2

  ctx.save()
  clipBubble(ctx, ox, oy, side, shape)
  ctx.translate(ox + side, oy)
  ctx.scale(-1, 1)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const fill = plates?.blur ?? plates?.sharp ?? video
  const fillW = plates?.blur ? plates.blur.width : plates?.sharp ? plates.sharp.width : video.videoWidth
  const fillH = plates?.blur ? plates.blur.height : plates?.sharp ? plates.sharp.height : video.videoHeight
  if (fillW && fillH) {
    drawSourceInRect(ctx, fill, fillW, fillH, 0, 0, side, side, 'cover')
  } else {
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(0, 0, side, side)
  }

  const source = plates?.sharp ?? video
  const sw = plates?.sharp ? plates.sharp.width : video.videoWidth
  const sh = plates?.sharp ? plates.sharp.height : video.videoHeight
  drawSharpZoomed(ctx, source, sw, sh, side, zoom01, featherPx)
  ctx.restore()
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

  /** @type {{ enhance: boolean, shape: 'circle' | 'square', brightness: number, blur: number, clarity: number, zoom: number }} */
  cameraLook = {
    enhance: true,
    shape: 'circle',
    brightness: 1.15,
    blur: 6,
    clarity: 1.08,
    zoom: 0
  }

  /** @type {ReturnType<typeof createCameraEnhance>} */
  cameraEnhance

  constructor() {
    this.cameraEnhance = createCameraEnhance()
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
      if (layer.type === 'camera') {
        const look = this.cameraLook
        const plates = this.cameraEnhance.render(video, {
          enhance: look.enhance,
          brightness: look.brightness,
          blur: look.blur,
          clarity: look.clarity
        })
        drawCameraBubble(
          this.ctx,
          video,
          plates,
          dx,
          dy,
          dw,
          dh,
          look.shape,
          look.zoom / 100,
          look.blur
        )
        continue
      }

      const fit = layer.fit ?? 'contain'

      this.ctx.save()
      if (layer.mask === 'circle') {
        clipCircle(this.ctx, dx, dy, dw, dh)
      }
      this.ctx.imageSmoothingEnabled = true
      this.ctx.imageSmoothingQuality = 'high'
      drawSourceInRect(this.ctx, video, video.videoWidth, video.videoHeight, dx, dy, dw, dh, fit)
      this.ctx.restore()
      if (this.ctx) {
        this.ctx.imageSmoothingQuality = 'low'
      }
    }
  }

  /**
   * @param {{ enhance?: boolean, shape?: 'circle' | 'square', brightness?: number, blur?: number, clarity?: number, zoom?: number }} look
   */
  setCameraLook(look) {
    this.cameraLook = {
      enhance: look.enhance ?? this.cameraLook.enhance,
      shape: look.shape === 'square' ? 'square' : look.shape === 'circle' ? 'circle' : this.cameraLook.shape,
      brightness: look.brightness ?? this.cameraLook.brightness,
      blur: look.blur ?? this.cameraLook.blur,
      clarity: look.clarity ?? this.cameraLook.clarity,
      zoom: look.zoom ?? this.cameraLook.zoom
    }
  }

  getOutputStream() {
    return this.outputStream
  }
}
