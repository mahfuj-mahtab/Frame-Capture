/** @typedef {{ id: string; name: string; displayId?: string }} DesktopSource */

/** @type {DesktopSource[] | null} */
let cachedSources = null

/** @type {number} */
let cachedAt = 0

const CACHE_MS = 8000

/** @type {Promise<DesktopSource[]> | null} */
let inFlight = null

/**
 * @param {boolean} [force]
 * @returns {Promise<DesktopSource[]>}
 */
export async function fetchDesktopSources(force = false) {
  const now = Date.now()
  if (!force && cachedSources && now - cachedAt < CACHE_MS) {
    return cachedSources
  }

  if (inFlight) {
    return inFlight
  }

  inFlight = (async () => {
    try {
      const result = await window.recorderApi.getDesktopSources()
      if (!result.ok) {
        throw new Error(result.error || 'Failed to get screen sources')
      }
      cachedSources = result.sources ?? []
      cachedAt = Date.now()
      return cachedSources
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export function invalidateDesktopSourcesCache() {
  cachedSources = null
  cachedAt = 0
}
