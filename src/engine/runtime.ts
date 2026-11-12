import { FormState } from './sandbox/jquery-stub'
import { createSandbox, type Runtime } from './sandbox/loader'
import type { GenId } from './types'

let corePromise: Promise<Runtime> | null = null
let core: Runtime | null = null
let zaPromise: Promise<void> | null = null

/** Loads the vendored NCP data + engine scripts once (separate lazy chunks) and evaluates them. */
export function loadCore(): Promise<Runtime> {
  if (!corePromise) {
    const p = (async () => {
      const [{ DATA_SCRIPTS }, { LOGIC_SCRIPTS }] = await Promise.all([
        import('./sources/data'),
        import('./sources/logic'),
      ])
      const rt = createSandbox([...DATA_SCRIPTS, ...LOGIC_SCRIPTS], new FormState())
      core = rt
      return rt
    })()
    corePromise = p
    // A failed load (e.g. an offline chunk fetch) must not be cached forever: allow a retry.
    p.catch(() => {
      if (corePromise === p) corePromise = null
    })
  }
  return corePromise
}

/** Loads the Legends Z-A specific scripts into the running sandbox (once). */
function loadZA(rt: Runtime): Promise<void> {
  if (!zaPromise) {
    const p = import('./sources/za').then(({ ZA_SCRIPTS }) => {
      for (const script of ZA_SCRIPTS) rt.evalScript(script)
      rt.zaLoaded = true
    })
    zaPromise = p
    p.catch(() => {
      if (zaPromise === p) zaPromise = null
    })
  }
  return zaPromise
}

/**
 * Makes `calculate()` usable for `gen` by lazily loading what it needs. Call (and await) this
 * before the first `calculate()` of a generation. Cheap on repeated calls.
 */
export async function prepare(gen: GenId): Promise<void> {
  const rt = await loadCore()
  if (gen === 9.5) await loadZA(rt)
}

/** The running sandbox, or throws if `prepare(gen)` has not completed. */
export function getRuntime(gen: GenId): Runtime {
  if (!core) throw new Error('Engine not loaded: await prepare(gen) before calculate()')
  if (gen === 9.5 && !core.zaLoaded) {
    throw new Error('Z-A data not loaded: await prepare(9.5) before calculate()')
  }
  return core
}
