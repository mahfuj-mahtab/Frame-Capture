const MAX_EDGE = 960

/**
 * @typedef {object} CameraGrade
 * @property {boolean} enhance
 * @property {number} brightness
 * @property {number} blur
 * @property {number} clarity
 */

/**
 * Graded sharp frame plus a uniform blur plate.
 * The blur plate fills leftover space; edge blending happens in the compositor.
 * @returns {{ render: (video: HTMLVideoElement, grade: CameraGrade) => { sharp: HTMLCanvasElement, blur: HTMLCanvasElement } | null }}
 */
export function createCameraEnhance() {
  const sharp = document.createElement('canvas')
  const blur = document.createElement('canvas')
  const sharpCtx = sharp.getContext('2d', { alpha: true })
  const blurCtx = blur.getContext('2d', { alpha: false })

  if (sharpCtx) {
    sharpCtx.imageSmoothingEnabled = true
    sharpCtx.imageSmoothingQuality = 'high'
  }
  if (blurCtx) {
    blurCtx.imageSmoothingEnabled = true
    blurCtx.imageSmoothingQuality = 'high'
  }

  /**
   * @param {number} vw
   * @param {number} vh
   */
  function fitSize(vw, vh) {
    const edge = Math.max(vw, vh)
    if (edge <= MAX_EDGE) return { w: vw, h: vh }
    const scale = MAX_EDGE / edge
    return {
      w: Math.max(1, Math.round(vw * scale)),
      h: Math.max(1, Math.round(vh * scale))
    }
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} w
   * @param {number} h
   */
  function ensureSize(canvas, w, h) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
  }

  /**
   * @param {CameraGrade} grade
   */
  function filterFor(grade) {
    if (!grade.enhance) return 'none'
    const brightness = grade.brightness.toFixed(2)
    const contrast = grade.clarity.toFixed(2)
    return `brightness(${brightness}) contrast(${contrast}) saturate(1.12)`
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {CameraGrade} grade
   * @returns {{ sharp: HTMLCanvasElement, blur: HTMLCanvasElement } | null}
   */
  function render(video, grade) {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh || !sharpCtx || !blurCtx) return null

    const { w, h } = fitSize(vw, vh)
    ensureSize(sharp, w, h)
    ensureSize(blur, w, h)
    const blurPx = Math.round(grade.blur)

    sharpCtx.save()
    sharpCtx.globalCompositeOperation = 'source-over'
    sharpCtx.clearRect(0, 0, w, h)
    sharpCtx.filter = filterFor(grade)
    sharpCtx.drawImage(video, 0, 0, w, h)
    sharpCtx.filter = 'none'
    sharpCtx.restore()

    blurCtx.save()
    blurCtx.filter = 'none'
    blurCtx.drawImage(video, 0, 0, w, h)
    if (blurPx > 0) {
      const brightness = grade.enhance ? Math.min(grade.brightness, 1.2).toFixed(2) : '1.00'
      const saturate = grade.enhance ? '1.05' : '1.00'
      blurCtx.filter = `blur(${blurPx}px) brightness(${brightness}) saturate(${saturate})`
      blurCtx.drawImage(video, -blurPx, -blurPx, w + blurPx * 2, h + blurPx * 2)
      blurCtx.filter = 'none'
    }
    blurCtx.restore()

    return { sharp, blur }
  }

  return { render }
}
