import { GEN_IDS, type GenId, type GenInfo, type StatKey } from './types'

const STATS_RBY: readonly StatKey[] = ['at', 'df', 'sl', 'sp']
const STATS_GSC: readonly StatKey[] = ['at', 'df', 'sa', 'sd', 'sp']

const INFO: Record<GenId, GenInfo> = {
  1: {
    id: 1,
    label: 'RBY',
    page: 'index',
    stats: STATS_RBY,
    statSystem: 'dvs',
    hasAbilities: false,
    hasItems: false,
    hasNatDex: false,
    singlesOnly: false,
  },
  2: {
    id: 2,
    label: 'GSC',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'dvs',
    hasAbilities: false,
    hasItems: true,
    hasNatDex: false,
    singlesOnly: false,
  },
  3: {
    id: 3,
    label: 'ADV',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'evs-ivs',
    hasAbilities: true,
    hasItems: true,
    hasNatDex: false,
    singlesOnly: false,
  },
  4: {
    id: 4,
    label: 'DPP',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'evs-ivs',
    hasAbilities: true,
    hasItems: true,
    hasNatDex: false,
    singlesOnly: false,
  },
  5: {
    id: 5,
    label: 'B/W',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'evs-ivs',
    hasAbilities: true,
    hasItems: true,
    hasNatDex: false,
    singlesOnly: false,
  },
  6: {
    id: 6,
    label: 'ORAS',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'evs-ivs',
    hasAbilities: true,
    hasItems: true,
    hasNatDex: false,
    singlesOnly: false,
  },
  7: {
    id: 7,
    label: 'USUM',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'evs-ivs',
    hasAbilities: true,
    hasItems: true,
    hasNatDex: false,
    singlesOnly: false,
  },
  7.5: {
    id: 7.5,
    label: 'LGP/E',
    page: 'lgpe',
    stats: STATS_GSC,
    statSystem: 'avs',
    hasAbilities: false,
    hasItems: false,
    hasNatDex: false,
    singlesOnly: false,
  },
  8: {
    id: 8,
    label: 'SWSH',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'evs-ivs',
    hasAbilities: true,
    hasItems: true,
    hasNatDex: true,
    singlesOnly: false,
  },
  9: {
    id: 9,
    label: 'S/V',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'evs-ivs',
    hasAbilities: true,
    hasItems: true,
    hasNatDex: true,
    singlesOnly: false,
  },
  9.5: {
    id: 9.5,
    label: 'Z-A',
    page: 'za',
    stats: STATS_GSC,
    statSystem: 'evs-ivs',
    hasAbilities: false,
    hasItems: true,
    hasNatDex: false,
    singlesOnly: true,
  },
  10: {
    id: 10,
    label: 'Champions',
    page: 'index',
    stats: STATS_GSC,
    statSystem: 'stat-points',
    hasAbilities: true,
    hasItems: true,
    hasNatDex: true,
    singlesOnly: false,
  },
}

/** All generations NCP supports, in order. */
export function listGens(): GenInfo[] {
  return GEN_IDS.map((g) => ({ ...INFO[g] }))
}

export function getGenInfo(gen: GenId): GenInfo {
  const info = INFO[gen]
  if (!info) throw new Error(`Unsupported generation: ${String(gen)}`)
  return info
}
