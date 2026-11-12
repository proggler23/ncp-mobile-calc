import { z } from 'zod'
import { GEN_IDS } from '../data/types'
import { LIMITS } from './types'
import type { CustomSet, SavedSet, Settings, Team } from './types'

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
