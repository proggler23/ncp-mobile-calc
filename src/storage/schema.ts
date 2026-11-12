import { z } from 'zod'
import { GEN_IDS } from '../data/types'
import { LIMITS, NATURE_NAMES } from './types'
import type { CustomSet, SavedSet, Settings, StoredMatchup, Team } from './types'

const id = z.string().min(1).max(LIMITS.maxIdLength)
/** Showdown ids (species, moves, items, abilities): lowercase alphanumerics only. */
const dexId = z
  .string()
  .max(LIMITS.maxIdLength)
  .regex(/^[a-z0-9]+$/)
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

/**
 * Per-stat bound only; the total cap depends on the generation (see `refineInvestment`): Awakening
 * Values (LGPE, gen 7.5) have no 510 total.
 */
const evs = spread(LIMITS.maxEv)
const ivs = spread(31)
const statPoints = spread(LIMITS.maxStatPoint).refine(
  (s) => total(s) <= LIMITS.maxStatPointTotal,
  'Stat Point total too high',
)

const genId = z.enum(GEN_IDS)

/** EV / AV caps of a generation: LGPE: <= 200 per stat, no total; others: <= 510 in total. */
function investmentError(
  gen: string | undefined,
  spreadValue: Record<string, number> | undefined,
): string | undefined {
  if (!spreadValue) return undefined
  if (gen === 'lgpe') {
    return Object.values(spreadValue).some((v) => v > LIMITS.maxAv) ? 'AV too high' : undefined
  }
  return total(spreadValue) > LIMITS.maxEvTotal ? 'EV total too high' : undefined
}

function refineInvestment(
  gen: string | undefined,
  spreadValue: Record<string, number> | undefined,
  ctx: z.RefinementCtx,
): void {
  const message = investmentError(gen, spreadValue)
  if (message) ctx.addIssue({ code: 'custom', message, path: ['evs'] })
}

const bodyShape = {
  nickname: name.optional(),
  level: z.number().int().min(1).max(100),
  nature: z.enum(NATURE_NAMES),
  abilityId: dexId.optional(),
  itemId: dexId.optional(),
  moveIds: z.array(dexId).max(LIMITS.maxMoves),
  evs,
  ivs,
  statPoints: statPoints.optional(),
  teraType: z.string().min(1).max(24).optional(),
  gender: z.enum(['M', 'F']).optional(),
  notes: z.string().max(LIMITS.maxNotesLength).optional(),
}

export const savedSetSchema = z
  .object({
    uid: id,
    gen: genId,
    speciesId: dexId,
    ...bodyShape,
  })
  .superRefine((s, ctx) => refineInvestment(s.gen, s.evs, ctx))

export const teamSchema = z.object({
  uid: id,
  name,
  gen: genId,
  regulation: dexId.optional(),
  members: z.array(savedSetSchema).max(LIMITS.maxMembers),
  createdAt: ts,
  updatedAt: ts,
})

export const customSetSchema = z
  .object({
    uid: id,
    name,
    gen: genId,
    speciesId: dexId,
    set: z.object(bodyShape),
    createdAt: ts,
    updatedAt: ts,
  })
  .superRefine((s, ctx) => refineInvestment(s.gen, s.set.evs, ctx))

export const settingsSchema = z.object({
  lang: z.enum(['de', 'en']),
  gen: genId,
  activeTeamUid: id.optional(),
  // A broken map falls back to "absent" (= default regulations) instead of voiding all settings.
  regulations: z.partialRecord(genId, dexId).optional().catch(undefined),
  format: z.enum(['singles', 'doubles']),
  // Device-local extras: a broken value falls back to "absent" instead of voiding all settings.
  supportNudge: z
    .object({
      state: z.enum(['pending', 'snoozed', 'done']),
      calcCount: z.number().int().min(0).max(1_000_000),
      snoozeCount: z.number().int().min(0).max(10),
      snoozedAt: ts.optional(),
      snoozedAtCount: z.number().int().min(0).max(1_000_000).optional(),
      triggered: z.boolean().optional(),
    })
    .optional()
    .catch(undefined),
  menuSeen: z.boolean().optional().catch(undefined),
  installPrompt: z
    .object({
      dismissCount: z.number().int().min(0).max(100),
      dismissedAt: ts.optional(),
      installed: z.boolean().optional(),
    })
    .optional()
    .catch(undefined),
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
export const matchupSetSchema = z.object({
  speciesId: dexId,
  moveIds: z.array(dexId).max(LIMITS.maxMoves),
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
  mine: matchupSetSchema.optional(),
  opp: matchupSetSchema.optional(),
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
  mineTeamIndex: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.maxMembers - 1)
    .optional(),
  savedAt: ts,
})

export type MatchupSet = z.infer<typeof matchupSetSchema>

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
const guardMatchup = guard(matchupSchema)
const guardMatchupSet = guard(matchupSetSchema)
/** One build with battle state (shared calcs); `gen` selects the EV / AV caps. */
export function parseMatchupSet(v: unknown, gen: string): MatchupSet | undefined {
  const s = guardMatchupSet(v)
  return s && !investmentError(gen, s.evs) ? s : undefined
}
/** `gen` (the generation the matchup belongs to) selects the EV / AV caps. */
export function parseMatchup(v: unknown, gen?: string): StoredMatchup | undefined {
  const m = guardMatchup(v)
  if (!m) return undefined
  if ([m.mine, m.opp].some((side) => investmentError(gen, side?.evs))) return undefined
  return m
}
