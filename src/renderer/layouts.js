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
