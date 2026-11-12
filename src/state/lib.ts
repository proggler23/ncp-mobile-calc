/**
 * Lazy access to the bridge + engine. Nothing here is imported statically, so the data tables and
 * the NCP scripts stay out of the initial bundle.
 */
import type { DataGenId } from '../bridge/types'

type BridgeModule = typeof import('../bridge')
type EngineModule = typeof import('../engine')
export interface Lib {
  bridge: BridgeModule
  engine: EngineModule
}

let lib: Lib | undefined

/** Loads the bridge/engine code and prepares `gen` (data, name maps, NCP scripts). */
export async function prepareLib(gen: DataGenId): Promise<Lib> {
  const [bridge, engine] = await Promise.all([import('../bridge'), import('../engine')])
  await bridge.prepareBridge(gen)
  lib = { bridge, engine }
  return lib
}

export function getLib(): Lib {
  if (!lib) throw new Error('Bridge not loaded')
  return lib
}
