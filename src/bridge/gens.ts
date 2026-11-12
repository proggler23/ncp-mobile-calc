import type { Format } from '../storage/types'
import type { DataGenId, EngineGenId } from './types'

export interface BridgeGenMeta {
  /** Data / storage generation id. */
  id: DataGenId
  /** Engine generation id. */
  engineGen: EngineGenId
  label: string
  /** Battle formats the original page offers for this generation. */
  formats: readonly Format[]
  defaultFormat: Format
  /** Champions: Stat Points instead of EVs/IVs. */
  usesStatPoints: boolean
  hasAbilities: boolean
  hasItems: boolean
  hasTera: boolean
  hasDynamax: boolean
  /** Mega Evolution is part of the (default) dex. National Dex tables add Megas to gens 8/9. */
  hasMega: boolean
  hasZMoves: boolean
  /** NCP offers a separate National Dex data set. */
  hasNatDex: boolean
}

const both: readonly Format[] = ['singles', 'doubles']
const singles: readonly Format[] = ['singles']

function meta(
  id: DataGenId,
  engineGen: EngineGenId,
  label: string,
  o: Partial<BridgeGenMeta> = {},
): BridgeGenMeta {
  return {
    id,
    engineGen,
    label,
    formats: both,
    defaultFormat: 'doubles',
    usesStatPoints: false,
    hasAbilities: true,
    hasItems: true,
    hasTera: false,
    hasDynamax: false,
    hasMega: false,
    hasZMoves: false,
    hasNatDex: false,
    ...o,
  }
}

export const GEN_META: Record<DataGenId, BridgeGenMeta> = {
  rby: meta('rby', 1, 'RBY', { hasAbilities: false, hasItems: false }),
  gsc: meta('gsc', 2, 'GSC', { hasAbilities: false }),
  adv: meta('adv', 3, 'ADV'),
  dpp: meta('dpp', 4, 'DPP'),
  bw: meta('bw', 5, 'B/W'),
  xy: meta('xy', 6, 'ORAS', { hasMega: true }),
  sm: meta('sm', 7, 'USUM', { hasMega: true, hasZMoves: true }),
  lgpe: meta('lgpe', 7.5, 'LGP/E', {
    defaultFormat: 'singles',
    hasAbilities: false,
    hasItems: false,
    hasMega: true,
  }),
  swsh: meta('swsh', 8, 'SWSH', { hasDynamax: true, hasNatDex: true }),
  sv: meta('sv', 9, 'S/V', { hasTera: true, hasNatDex: true }),
  za: meta('za', 9.5, 'Z-A', {
    formats: singles,
    defaultFormat: 'singles',
    hasAbilities: false,
    hasMega: true,
  }),
  champions: meta('champions', 10, 'Champions', {
    usesStatPoints: true,
    hasMega: true,
    hasNatDex: true,
  }),
}

export const GEN_DATA_IDS = Object.keys(GEN_META) as DataGenId[]

/** Bidirectional generation id map: data/storage string id <-> engine numeric id. */
export const GEN_MAP = {
  toEngine: Object.fromEntries(Object.values(GEN_META).map((m) => [m.id, m.engineGen])) as Record<
    DataGenId,
    EngineGenId
  >,
  fromEngine: new Map<EngineGenId, DataGenId>(
    Object.values(GEN_META).map((m) => [m.engineGen, m.id]),
  ),
}

export function toEngineGen(id: DataGenId): EngineGenId {
  return GEN_MAP.toEngine[id]
}

export function fromEngineGen(gen: EngineGenId): DataGenId {
  const id = GEN_MAP.fromEngine.get(gen)
  if (!id) throw new Error(`Unknown engine generation ${String(gen)}`)
  return id
}

export function genMeta(id: DataGenId): BridgeGenMeta {
  return GEN_META[id]
}
