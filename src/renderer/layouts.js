/** @typedef {'camera' | 'screen'} LayerType */
/** @typedef {'cover' | 'contain'} FitMode */
/** @typedef {'circle'} LayerMask */

/**
 * @typedef {object} LayoutLayer
 * @property {string} id
 * @property {LayerType} type
 * @property {{ x: number; y: number; w: number; h: number }} rect
 * @property {number} zIndex
 * @property {FitMode} [fit]
 * @property {LayerMask} [mask]
 */

/**
 * @typedef {object} LayoutDefinition
 * @property {string} id
 * @property {string} name
 * @property {{ width: number; height: number }} canvas
 * @property {{ source: 'mic' }} audio
 * @property {LayoutLayer[]} layers
 */

export const CANVAS = { width: 1920, height: 1080 }

/** @type {LayoutDefinition} */
export const LAYOUT_SCREEN_ONLY = {
  id: 'screen-only',
  name: 'Screen share',
  canvas: { ...CANVAS },
  audio: { source: 'mic' },
  layers: [
    {
      id: 'screen-main',
      type: 'screen',
      rect: { x: 0, y: 0, w: 1, h: 1 },
      zIndex: 0,
      fit: 'contain'
    }
  ]
}

/** @type {LayoutDefinition} */
export const LAYOUT_SCREEN_WEBCAM = {
  id: 'screen-webcam',
  name: 'Screen + webcam',
  canvas: { ...CANVAS },
  audio: { source: 'mic' },
  layers: [
    {
      id: 'screen-main',
      type: 'screen',
      rect: { x: 0, y: 0, w: 1, h: 1 },
      zIndex: 0,
      fit: 'contain'
    },
    {
      id: 'cam-pip',
      type: 'camera',
      rect: { x: 0.03, y: 0.72, w: 0.18, h: 0.18 },
      zIndex: 1,
      fit: 'cover',
      mask: 'circle'
    }
  ]
}

export const LAYOUTS = [LAYOUT_SCREEN_ONLY, LAYOUT_SCREEN_WEBCAM]
export const DEFAULT_LAYOUT_ID = LAYOUT_SCREEN_ONLY.id
const STORAGE_KEY = 'video-recorder-layout-id'
const CAMERA_RECT_KEY = 'video-recorder-camera-rect'
const CAMERA_ENHANCE_KEY = 'video-recorder-camera-enhance'
const MIN_CAMERA_DIAMETER_PX = 64

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} NormRect
 */

/**
 * @param {LayoutDefinition} layout
 * @returns {LayoutDefinition}
 */
export function cloneLayout(layout) {
  return structuredClone(layout)
}

/**
 * @param {LayoutDefinition} layout
 * @returns {LayoutLayer | null}
 */
export function cameraLayer(layout) {
  return layout.layers.find((layer) => layer.type === 'camera') ?? null
}

/**
 * @param {unknown} value
 * @returns {value is NormRect}
 */
function isNormRect(value) {
  if (!value || typeof value !== 'object') return false
  const rect = /** @type {NormRect} */ (value)
  return [rect.x, rect.y, rect.w, rect.h].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    rect.w > 0 &&
    rect.h > 0
}

/**
 * Keep a circle mask as a pixel-square box inside the canvas.
 * @param {NormRect} rect
 * @param {{ width: number, height: number }} canvas
 * @returns {NormRect}
 */
export function clampCircleRect(rect, canvas) {
  const dw = rect.w * canvas.width
  const dh = rect.h * canvas.height
  const minD = Math.min(MIN_CAMERA_DIAMETER_PX, canvas.width, canvas.height)
  const maxD = Math.min(canvas.width, canvas.height)
  const d = Math.min(Math.max(Math.min(dw, dh), minD), maxD)
  const half = d / 2
  let cx = rect.x * canvas.width + dw / 2
  let cy = rect.y * canvas.height + dh / 2
  cx = Math.min(Math.max(cx, half), canvas.width - half)
  cy = Math.min(Math.max(cy, half), canvas.height - half)
  return {
    x: (cx - half) / canvas.width,
    y: (cy - half) / canvas.height,
    w: d / canvas.width,
    h: d / canvas.height
  }
}

/**
 * Match the circle the compositor actually draws (inscribed in the stored box).
 * @param {NormRect} rect
 * @param {{ width: number, height: number }} canvas
 * @returns {NormRect}
 */
export function normalizeCircleRect(rect, canvas) {
  return clampCircleRect(rect, canvas)
}

/**
 * @returns {NormRect | null}
 */
export function loadCameraRect() {
  try {
    const raw = localStorage.getItem(CAMERA_RECT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isNormRect(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * @param {NormRect} rect
 */
export function storeCameraRect(rect) {
  try {
    localStorage.setItem(CAMERA_RECT_KEY, JSON.stringify(rect))
  } catch {
    /* ignore */
  }
}

/**
 * Clone a layout and apply the saved camera circle when this layout has one.
 * @param {string} id
 * @returns {LayoutDefinition}
 */
export function createActiveLayout(id) {
  const layout = cloneLayout(getLayoutById(id))
  const layer = cameraLayer(layout)
  if (!layer || layer.mask !== 'circle') return layout
  const stored = loadCameraRect()
  layer.rect = stored
    ? clampCircleRect(stored, layout.canvas)
    : normalizeCircleRect(layer.rect, layout.canvas)
  return layout
}

/**
 * @param {string} id
 * @returns {LayoutDefinition}
 */
export function getLayoutById(id) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUT_SCREEN_ONLY
}

export function getStoredLayoutId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    if (id && LAYOUTS.some((l) => l.id === id)) return id
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT_ID
}

/**
 * @param {string} id
 */
export function storeLayoutId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

/**
 * @param {LayoutDefinition} layout
 */
export function layoutNeedsCamera(layout) {
  return layout.layers.some((l) => l.type === 'camera')
}

/** @typedef {'circle' | 'square'} CameraShape */

/**
 * @typedef {object} CameraLook
 * @property {boolean} enhance
 * @property {CameraShape} shape
 * @property {number} brightness
 * @property {number} blur
 * @property {number} clarity
 * @property {number} zoom
 */

export const DEFAULT_CAMERA_LOOK = {
  enhance: true,
  shape: /** @type {CameraShape} */ ('circle'),
  brightness: 1.15,
  blur: 6,
  clarity: 1.08,
  zoom: 0
}

const CAMERA_LOOK_KEY = 'video-recorder-camera-look'

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * @param {unknown} value
 * @returns {CameraLook}
 */
export function normalizeCameraLook(value) {
  const look = { ...DEFAULT_CAMERA_LOOK }
  if (!value || typeof value !== 'object') return look
  const raw = /** @type {Partial<CameraLook>} */ (value)
  if (typeof raw.enhance === 'boolean') look.enhance = raw.enhance
  if (raw.shape === 'square' || raw.shape === 'circle') look.shape = raw.shape
  if (typeof raw.brightness === 'number' && Number.isFinite(raw.brightness)) {
    look.brightness = clampNumber(raw.brightness, 0.8, 1.6)
  }
  if (typeof raw.blur === 'number' && Number.isFinite(raw.blur)) {
    look.blur = clampNumber(raw.blur, 0, 24)
  }
  if (typeof raw.clarity === 'number' && Number.isFinite(raw.clarity)) {
    look.clarity = clampNumber(raw.clarity, 0.9, 1.4)
  }
  if (typeof raw.zoom === 'number' && Number.isFinite(raw.zoom)) {
    look.zoom = clampNumber(raw.zoom, 0, 100)
  }
  return look
}

/**
 * @returns {CameraLook}
 */
export function loadCameraLook() {
  try {
    const raw = localStorage.getItem(CAMERA_LOOK_KEY)
    if (raw) return normalizeCameraLook(JSON.parse(raw))
    const legacy = localStorage.getItem(CAMERA_ENHANCE_KEY)
    if (legacy === '0') return { ...DEFAULT_CAMERA_LOOK, enhance: false }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CAMERA_LOOK }
}

/**
 * @param {CameraLook} look
 */
export function storeCameraLook(look) {
  try {
    localStorage.setItem(CAMERA_LOOK_KEY, JSON.stringify(normalizeCameraLook(look)))
  } catch {
    /* ignore */
  }
}

export function loadCameraEnhance() {
  try {
    const raw = localStorage.getItem(CAMERA_ENHANCE_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

/**
 * @param {boolean} enabled
 */
export function storeCameraEnhance(enabled) {
  try {
    localStorage.setItem(CAMERA_ENHANCE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}
