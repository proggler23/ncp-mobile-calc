/**
 * Offline data upkeep. Generation data chunks are content-hashed, so after an app update the
 * chunks a user downloaded earlier ("download for offline") are different files than the new
 * build requests; the old cache entries cannot be reused safely. When the user had downloaded all
 * generations, they are fetched again in the background after an update (while online).
 */
const DOWNLOADED_KEY = 'ncp:all-gens-downloaded'
const STALE_KEY = 'ncp:gens-stale'

function flag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function setFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

/** The user downloaded every generation: remember it (and that the cached copies are current). */
export function markAllDownloaded(): void {
  setFlag(DOWNLOADED_KEY, true)
  setFlag(STALE_KEY, false)
}

export function hasDownloadedAll(): boolean {
  return flag(DOWNLOADED_KEY)
}

export function isDownloadStale(): boolean {
  return flag(DOWNLOADED_KEY) && flag(STALE_KEY)
}

/** Marks the downloads stale when a new service worker takes over an already controlled page. */
export function watchServiceWorkerUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const hadController = !!navigator.serviceWorker.controller
  if (!hadController) return // first install: nothing was cached by an older build
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (flag(DOWNLOADED_KEY)) setFlag(STALE_KEY, true)
  })
}

let running: Promise<void> | undefined

/**
 * Re-fetches all generations when they went stale after an app update and the device is online.
 * `prefetch` fetches one generation; failures keep the stale flag so a later start retries.
 */
export function refreshStaleDownloads(
  gens: readonly string[],
  prefetch: (gen: string) => Promise<void>,
  online: boolean = typeof navigator === 'undefined' || navigator.onLine !== false,
): Promise<void> {
  if (!online || !isDownloadStale()) return Promise.resolve()
  running ??= (async () => {
    try {
      for (const g of gens) await prefetch(g)
      setFlag(STALE_KEY, false)
    } catch {
      /* stays stale; retried on the next start */
    } finally {
      running = undefined
    }
  })()
  return running
}
