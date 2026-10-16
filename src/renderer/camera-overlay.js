import { cameraLayer, clampCircleRect } from './layouts.js'

/**
 * @param {{
 *   ui: ReturnType<import('./ui.js').createUi>
 *   getLayout: () => import('./layouts.js').LayoutDefinition
 *   onRectChange: (rect: import('./layouts.js').NormRect, persist: boolean) => void
 *   getShape: () => import('./layouts.js').CameraShape
 * }} deps
 */
export function createCameraOverlay({ ui, getLayout, onRectChange, getShape }) {
  const { cameraOverlay, cameraResize, compositorPreview, previewWrap } = ui.els

  /** @type {'move' | 'resize' | null} */
  let mode = null

  /**
   * @type {{
   *   pointerX: number
   *   pointerY: number
   *   rect: import('./layouts.js').NormRect
   * } | null}
   */
  let dragOrigin = null

  /**
   * Letterboxed picture inside the preview, relative to the wrap.
   * @returns {{ x: number, y: number, w: number, h: number } | null}
   */
  function contentBox() {
    if (!compositorPreview || !previewWrap) return null
    const videoBounds = compositorPreview.getBoundingClientRect()
    const wrapBounds = previewWrap.getBoundingClientRect()
    const vw = compositorPreview.videoWidth
    const vh = compositorPreview.videoHeight
    if (!vw || !vh || !videoBounds.width || !videoBounds.height) return null
    const scale = Math.min(videoBounds.width / vw, videoBounds.height / vh)
    const w = vw * scale
    const h = vh * scale
    return {
      x: videoBounds.left - wrapBounds.left + (videoBounds.width - w) / 2,
      y: videoBounds.top - wrapBounds.top + (videoBounds.height - h) / 2,
      w,
      h
    }
  }

  /**
   * @param {PointerEvent} event
   * @returns {{ x: number, y: number } | null}
   */
  function pointerNorm(event) {
    const box = contentBox()
    if (!box || !previewWrap) return null
    const wrapBounds = previewWrap.getBoundingClientRect()
    return {
      x: (event.clientX - wrapBounds.left - box.x) / box.w,
      y: (event.clientY - wrapBounds.top - box.y) / box.h
    }
  }

  function sync() {
    if (!cameraOverlay) return
    const layout = getLayout()
    const layer = cameraLayer(layout)
    const showing = Boolean(previewWrap?.classList.contains('has-stream'))
    const box = contentBox()
    if (!layer || !showing || !box) {
      ui.setCameraOverlayVisible(false)
      return
    }
    const { rect } = layer
    cameraOverlay.classList.toggle('is-square', getShape() === 'square')
    cameraOverlay.style.left = `${box.x + rect.x * box.w}px`
    cameraOverlay.style.top = `${box.y + rect.y * box.h}px`
    cameraOverlay.style.width = `${rect.w * box.w}px`
    cameraOverlay.style.height = `${rect.h * box.h}px`
    ui.setCameraOverlayVisible(true)
  }

  /**
   * @param {import('./layouts.js').NormRect} rect
   * @param {boolean} persist
   */
  function applyRect(rect, persist) {
    const next = clampCircleRect(rect, getLayout().canvas)
    onRectChange(next, persist)
    sync()
  }

  /**
   * @param {PointerEvent} event
   */
  function onPointerDown(event) {
    if (event.button !== 0 || !cameraOverlay) return
    const layer = cameraLayer(getLayout())
    const pointer = pointerNorm(event)
    if (!layer || !pointer) return
    mode = event.target === cameraResize ? 'resize' : 'move'
    dragOrigin = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      rect: { ...layer.rect }
    }
    cameraOverlay.classList.toggle('is-dragging', mode === 'move')
    cameraOverlay.classList.toggle('is-resizing', mode === 'resize')
    cameraOverlay.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  /**
   * @param {PointerEvent} event
   */
  function onPointerMove(event) {
    if (!mode || !dragOrigin) return
    const pointer = pointerNorm(event)
    if (!pointer) return
    const { rect } = dragOrigin
    if (mode === 'move') {
      applyRect(
        {
          x: rect.x + (pointer.x - dragOrigin.pointerX),
          y: rect.y + (pointer.y - dragOrigin.pointerY),
          w: rect.w,
          h: rect.h
        },
        false
      )
      return
    }

    const canvas = getLayout().canvas
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    const px = (pointer.x - cx) * canvas.width
    const py = (pointer.y - cy) * canvas.height
    const diameter = Math.max(Math.hypot(px, py) * 2, 1)
    applyRect(
      {
        x: cx - diameter / 2 / canvas.width,
        y: cy - diameter / 2 / canvas.height,
        w: diameter / canvas.width,
        h: diameter / canvas.height
      },
      false
    )
  }

  /**
   * @param {PointerEvent} event
   */
  function endDrag(event) {
    if (!mode || !cameraOverlay) return
    mode = null
    dragOrigin = null
    cameraOverlay.classList.remove('is-dragging', 'is-resizing')
    const layer = cameraLayer(getLayout())
    if (layer) onRectChange({ ...layer.rect }, true)
    if (cameraOverlay.hasPointerCapture(event.pointerId)) {
      cameraOverlay.releasePointerCapture(event.pointerId)
    }
  }

  cameraOverlay?.addEventListener('pointerdown', onPointerDown)
  cameraOverlay?.addEventListener('pointermove', onPointerMove)
  cameraOverlay?.addEventListener('pointerup', endDrag)
  cameraOverlay?.addEventListener('pointercancel', endDrag)

  if (previewWrap && typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => sync())
    resizeObserver.observe(previewWrap)
  }
  compositorPreview?.addEventListener('resize', sync)
  compositorPreview?.addEventListener('loadedmetadata', sync)

  if (previewWrap && typeof MutationObserver !== 'undefined') {
    const classObserver = new MutationObserver(() => sync())
    classObserver.observe(previewWrap, { attributes: true, attributeFilter: ['class'] })
  }

  return { sync }
}
