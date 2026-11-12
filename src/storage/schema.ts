import { z } from 'zod'
import { GEN_IDS } from '../data/types'
import { LIMITS } from './types'
import type { CustomSet, SavedSet, Settings, StoredMatchup, Team } from './types'

const id = z.string().min(1).max(LIMITS.maxIdLength)
const name = z.string().max(LIMITS.maxNameLength)
const ts = z.number().int().nonnegative().max(8.64e15)

const spread = (max: number) =>
  z.object({
    hp: z.number().int().min(0).max(max),
    atk: z.number().int().min(0).max(max),
    def: z.number().int().min(0).max(max),
    spa: z.number().int().min(0).max(max),
    spd: z.number().int().min(0).max(max),
    spe: z.number().int().min(0).max(max),
  })

const total = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0)

const evs = spread(LIMITS.maxEv).refine((s) => total(s) <= LIMITS.maxEvTotal, 'EV total too high')
const ivs = spread(31)
const statPoints = spread(LIMITS.maxStatPoint).refine(
  (s) => total(s) <= LIMITS.maxStatPointTotal,
  'Stat Point total too high',
)

const genId = z.enum(GEN_IDS)

const bodyShape = {
  nickname: name.optional(),
  level: z.number().int().min(1).max(100),
  nature: z.string().min(1).max(24),
  abilityId: id.optional(),
  itemId: id.optional(),
  moveIds: z.array(id).max(LIMITS.maxMoves),
  evs,
  ivs,
  statPoints: statPoints.optional(),
  teraType: z.string().min(1).max(24).optional(),
  gender: z.enum(['M', 'F']).optional(),
  notes: z.string().max(LIMITS.maxNotesLength).optional(),
}

export const savedSetSchema = z.object({
  uid: id,
  gen: genId,
  speciesId: id,
  ...bodyShape,
})

export const teamSchema = z.object({
  uid: id,
  name,
  gen: genId,
  members: z.array(savedSetSchema).max(LIMITS.maxMembers),
  createdAt: ts,
  updatedAt: ts,
})

export const customSetSchema = z.object({
  uid: id,
  name,
  gen: genId,
  speciesId: id,
  set: z.object(bodyShape),
  createdAt: ts,
  updatedAt: ts,
})

export const settingsSchema = z.object({
  lang: z.enum(['de', 'en']),
  gen: genId,
  activeTeamUid: id.optional(),
  format: z.enum(['singles', 'doubles']),
})

const small = z.number().int().min(-1000).max(100_000)
const moveOverride = z
  .object({
    bp: small.optional(),
    type: z.string().max(24).optional(),
    category: z.enum(['Physical', 'Special', 'Status']).optional(),
    crit: z.boolean().optional(),
    hits: small.optional(),
    double: z.boolean().optional(),
    z: z.boolean().optional(),
    plus: z.boolean().optional(),
    stellar: z.boolean().optional(),
    pledge: z.string().max(24).optional(),
    timesAffected: small.optional(),
    opponentMoveIndex: small.optional(),
  })
  .nullable()

/** A build including its battle state (status, boosts, HP, ...), as held by the matchup screen. */
const matchupSet = z.object({
  speciesId: id,
  moveIds: z.array(id).max(LIMITS.maxMoves),
  level: bodyShape.level.optional(),
  nature: bodyShape.nature.optional(),
  abilityId: bodyShape.abilityId,
  itemId: bodyShape.itemId,
  evs: evs.optional(),
  ivs: ivs.optional(),
  statPoints: statPoints.optional(),
  teraType: bodyShape.teraType,
  nickname: bodyShape.nickname,
  gender: bodyShape.gender,
  notes: bodyShape.notes,
  status: z
    .enum([
      'Healthy',
      'Poisoned',
      'Badly Poisoned',
      'Burned',
      'Paralyzed',
      'Asleep',
      'Drowsy',
      'Frozen',
    ])
    .optional(),
  boosts: z
    .object(
      Object.fromEntries(
        ['atk', 'def', 'spa', 'spd', 'spe'].map((k) => [
          k,
          z.number().int().min(-6).max(6).optional(),
        ]),
      ),
    )
    .optional(),
  percentHP: z.number().min(0).max(100).optional(),
  curHP: z.number().int().min(0).max(100_000).optional(),
  abilityOn: z.boolean().optional(),
  terastallized: z.boolean().optional(),
  dynamax: z.boolean().optional(),
  gmax: z.boolean().optional(),
  moveOverrides: z.array(moveOverride).max(LIMITS.maxMoves).optional(),
})

const flags = z.record(z.string().max(32), z.union([z.boolean(), z.number().int().min(0).max(9)]))

export const matchupSchema = z.object({
  mine: matchupSet.optional(),
  opp: matchupSet.optional(),
  field: z
    .object({
      weather: z.string().max(24).optional(),
      terrain: z.string().max(24).optional(),
      gravity: z.boolean().optional(),
      neutralizingGas: z.boolean().optional(),
      auras: flags.optional(),
      ruin: flags.optional(),
      mine: flags.optional(),
      opp: flags.optional(),
    })
    .optional(),
  oppPreset: z.string().max(16).nullable().optional(),
  teamUid: id.optional(),
  mineTeamIndex: z.number().int().min(0).max(LIMITS.maxMembers).optional(),
  savedAt: ts,
})

export const backupSchemaVersion = 1
export const BACKUP_APP_ID = 'ncp-mobile-calc'

/** Each guard returns the parsed value or undefined (never throws) for untrusted input. */
function guard<T>(schema: z.ZodType<T>) {
  return (v: unknown): T | undefined => {
    const r = schema.safeParse(v)
    return r.success ? r.data : undefined
  }
}

export const parseSavedSet: (v: unknown) => SavedSet | undefined = guard(savedSetSchema)
export const parseTeam: (v: unknown) => Team | undefined = guard(teamSchema)
export const parseCustomSet: (v: unknown) => CustomSet | undefined = guard(customSetSchema)
export const parseSettings: (v: unknown) => Settings | undefined = guard(settingsSchema)
export const parseMatchup: (v: unknown) => StoredMatchup | undefined = guard(matchupSchema)
