/**
 * Share format v2: a compact bit-packed binary (see docs/ARCHITECTURE.md "Sharing calcs"). This
 * module only converts between a payload and bytes; decoding produces the SAME intermediate
 * positional wire value as v1, which `codec.ts` then validates (zod schemas, caps, allowlists).
 *
 * Everything in the enum tables below is part of the wire format: append only, never reorder.
 * Reading is bounds-checked (a truncated input throws `BitError`, caught by the caller).
 */
import type { DataGenId, MoveOverride, SavedSetLike } from '../bridge/types'
import { safeDetail } from './detail'
import type { IdKind, IdTables } from './ids'
import type { ShareWarning, SharePayload } from './codec'
import type { UiField } from '../state/field'

export const V2_GENS = [
  'rby',
  'gsc',
  'adv',
  'dpp',
  'bw',
  'xy',
  'sm',
  'lgpe',
  'swsh',
  'sv',
  'za',
  'champions',
] as const satisfies readonly DataGenId[]
export const V2_NATURES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
] as const // prettier-ignore
export const V2_TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying',
  'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy', 'Stellar',
] as const // prettier-ignore
export const V2_STATUS = [
  'Healthy', 'Poisoned', 'Badly Poisoned', 'Burned', 'Paralyzed', 'Asleep', 'Drowsy', 'Frozen',
] as const // prettier-ignore
export const V2_WEATHER = [
  'Sun', 'Rain', 'Sand', 'Hail', 'Snow', 'Harsh Sun', 'Heavy Rain', 'Strong Winds',
] as const // prettier-ignore
export const V2_TERRAIN = ['Electric', 'Grassy', 'Misty', 'Psychic'] as const
export const V2_AURAS = ['fairy', 'dark', 'break'] as const
export const V2_RUIN = ['tablets', 'vessel', 'sword', 'beads'] as const
export const V2_CATEGORY = ['Physical', 'Special', 'Status'] as const
export const V2_PLEDGE = ['Fire Pledge', 'Grass Pledge', 'Water Pledge'] as const
export const V2_SIDE_KEYS = [
  'reflect', 'lightScreen', 'auroraVeil', 'helpingHand', 'friendGuard', 'tailwind', 'protect',
  'stealthRock', 'battery', 'powerSpot', 'steelySpirit', 'flowerGift', 'foresight', 'gMaxField',
  'saltCure', 'swamp', 'seaFire', 'charge', 'leechSeed', 'ingrain', 'curse', 'binding', 'aquaRing',
  'nightmare', 'weaknessPolicy', 'evoboost', 'geomancy', 'commander', 'redItem', 'blueItem',
] as const // prettier-ignore
const BOOST_KEYS = ['atk', 'def', 'spa', 'spd', 'spe'] as const
const SPREAD_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const
const OVERRIDE_FLAGS = ['crit', 'double', 'z', 'plus', 'stellar'] as const

export class BitError extends Error {
  override name = 'BitError'
}

// ---------------------------------------------------------------------------------------------
// bit streams
// ---------------------------------------------------------------------------------------------

export class BitWriter {
  private bytes: number[] = []
  private cur = 0
  private used = 0
  /** Append the low `bits` bits of `value` (most significant first). */
  write(value: number, bits: number): void {
    const v = Math.max(0, Math.min(Math.floor(value), 2 ** bits - 1))
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | (Math.floor(v / 2 ** i) & 1)
      if (++this.used === 8) {
        this.bytes.push(this.cur)
        this.cur = 0
        this.used = 0
      }
    }
  }
  flag(b: unknown): void {
    this.write(b ? 1 : 0, 1)
  }
  finish(): Uint8Array {
    const out = [...this.bytes]
    if (this.used) out.push(this.cur << (8 - this.used))
    return Uint8Array.from(out)
  }
}

export class BitReader {
  private pos = 0
  constructor(private readonly bytes: Uint8Array) {}
  get remaining(): number {
    return this.bytes.length * 8 - this.pos
  }
  /** Read `bits` (<= 24) bits; throws when the input is too short. */
  read(bits: number): number {
    if (bits > this.remaining) throw new BitError('truncated')
    let v = 0
    for (let i = 0; i < bits; i++) {
      const byte = this.bytes[this.pos >> 3]!
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1)
      this.pos++
    }
    return v
  }
  flag(): boolean {
    return this.read(1) === 1
  }
}

const bitsFor = (n: number): number => (n <= 0 ? 0 : 32 - Math.clz32(n))

// ---------------------------------------------------------------------------------------------
// encoding
// ---------------------------------------------------------------------------------------------

const enumIndex = (list: readonly string[], v: unknown): number =>
  typeof v === 'string' ? list.indexOf(v) : -1

function writeSpread(w: BitWriter, s: Record<string, number>, kind: 'ev' | 'iv' | 'sp'): void {
  const vals = SPREAD_KEYS.map((k) => Math.max(0, Math.round(s[k] ?? 0)))
  if (kind === 'ev') {
    const quad = vals.every((v) => v % 4 === 0 && v <= 252)
    w.flag(!quad)
    for (const v of vals) w.write(quad ? v / 4 : v, quad ? 6 : 8)
  } else for (const v of vals) w.write(v, kind === 'iv' ? 5 : 6)
}

const allEqual = (s: Record<string, number> | undefined, def: number): boolean =>
  !s || SPREAD_KEYS.every((k) => (s[k] ?? def) === def)

function writeOverride(w: BitWriter, o: MoveOverride): void {
  const num = (v: number | undefined, bits: number) => {
    w.flag(v !== undefined)
    if (v !== undefined) w.write(v, bits)
  }
  num(o.bp, 10)
  num(o.hits, 4)
  num(o.timesAffected, 4)
  num(o.opponentMoveIndex, 2)
  const en = (v: string | undefined, list: readonly string[], bits: number) => {
    const i = enumIndex(list, v)
    w.flag(i >= 0)
    if (i >= 0) w.write(i, bits)
  }
  en(o.type, V2_TYPES, 5)
  en(o.category, V2_CATEGORY, 2)
  en(o.pledge, V2_PLEDGE, 2)
  for (const f of OVERRIDE_FLAGS) w.flag(o[f])
}

const hasOverride = (o: MoveOverride | undefined | null): o is MoveOverride =>
  !!o &&
  (o.bp !== undefined ||
    o.hits !== undefined ||
    o.timesAffected !== undefined ||
    o.opponentMoveIndex !== undefined ||
    enumIndex(V2_TYPES, o.type) >= 0 ||
    enumIndex(V2_CATEGORY, o.category) >= 0 ||
    enumIndex(V2_PLEDGE, o.pledge) >= 0 ||
    OVERRIDE_FLAGS.some((f) => o[f]))

interface Ctx {
  w: BitWriter
  tables: IdTables | undefined
  width: number
  maxCode: number
}

/** An id: position + 1 in the table, or 0 followed by the spelled-out id. */
function writeEntity(c: Ctx, kind: IdKind, id: string): void {
  const at = c.tables?.index[kind].get(id)
  const code = at === undefined ? 0 : at + 1
  c.maxCode = Math.max(c.maxCode, code)
  c.w.write(code, c.width)
  if (code === 0) {
    const text = id.slice(0, 127)
    c.w.write(text.length, 7)
    for (let i = 0; i < text.length; i++) c.w.write(text.charCodeAt(i) & 0xff, 8)
  }
}

function writeSet(c: Ctx, s: SavedSetLike): void {
  const w = c.w
  writeEntity(c, 'species', s.speciesId)
  const moves = s.moveIds.slice(0, 7)
  w.write(moves.length, 3)
  for (const m of moves) writeEntity(c, 'moves', m)
  const nature = enumIndex(V2_NATURES, s.nature)
  const hasNature = nature >= 0 && s.nature !== 'Serious'
  const hasLevel = s.level !== undefined && s.level !== 50
  const tera = enumIndex(V2_TYPES, s.teraType)
  const hasEv = !allEqual(s.evs, 0)
  const hasIv = !allEqual(s.ivs, 31)
  const hasSp = !!s.statPoints && !allEqual(s.statPoints, 0)
  w.flag(hasLevel)
  w.flag(hasNature)
  w.flag(s.abilityId)
  w.flag(s.itemId)
  w.flag(tera >= 0)
  w.flag(s.gender === 'M' || s.gender === 'F')
  w.flag(hasEv)
  w.flag(hasIv)
  w.flag(hasSp)
  if (hasLevel) w.write((s.level ?? 50) - 1, 7)
  if (hasNature) w.write(nature, 5)
  if (s.abilityId) writeEntity(c, 'abilities', s.abilityId)
  if (s.itemId) writeEntity(c, 'items', s.itemId)
  if (tera >= 0) w.write(tera, 5)
  if (s.gender === 'M' || s.gender === 'F') w.flag(s.gender === 'F')
  if (hasEv) writeSpread(w, s.evs!, 'ev')
  if (hasIv) writeSpread(w, s.ivs!, 'iv')
  if (hasSp) writeSpread(w, s.statPoints!, 'sp')

  const status = enumIndex(V2_STATUS, s.status)
  const hasStatus = status > 0
  const boosts = BOOST_KEYS.map((k) => Math.max(-6, Math.min(6, Math.round(s.boosts?.[k] ?? 0))))
  const hasBoosts = boosts.some(Boolean)
  const overrides = (s.moveOverrides ?? []).slice(0, 4)
  const hasOverrides = overrides.some(hasOverride)
  const extra =
    hasStatus ||
    hasBoosts ||
    s.percentHP !== undefined ||
    s.curHP !== undefined ||
    s.abilityOn !== undefined ||
    s.terastallized ||
    s.dynamax ||
    s.gmax ||
    hasOverrides
  w.flag(extra)
  if (!extra) return
  w.flag(hasStatus)
  w.flag(hasBoosts)
  w.flag(s.percentHP !== undefined)
  w.flag(s.curHP !== undefined)
  w.flag(s.abilityOn !== undefined)
  w.flag(s.terastallized)
  w.flag(s.dynamax)
  w.flag(s.gmax)
  w.flag(hasOverrides)
  if (hasStatus) w.write(status, 3)
  if (hasBoosts) for (const b of boosts) w.write(b + 6, 4)
  if (s.percentHP !== undefined) {
    const tenths = Math.round(s.percentHP * 10)
    const exact = tenths / 10 === s.percentHP && tenths >= 0 && tenths <= 1000
    w.flag(!exact)
    if (exact) w.write(tenths, 10)
    else {
      const buf = new DataView(new ArrayBuffer(8))
      buf.setFloat64(0, s.percentHP)
      for (let i = 0; i < 4; i++) w.write(buf.getUint16(i * 2), 16)
    }
  }
  if (s.curHP !== undefined) w.write(s.curHP, 17)
  if (s.abilityOn !== undefined) w.flag(s.abilityOn)
  if (hasOverrides) {
    for (let i = 0; i < 4; i++) w.flag(hasOverride(overrides[i]))
    for (const o of overrides) if (hasOverride(o)) writeOverride(w, o)
  }
}

function writeSide(w: BitWriter, side: UiField['mine']): void {
  const keys = V2_SIDE_KEYS.map((k, i) => (side[k] ? i : -1)).filter((i) => i >= 0)
  const spikes = side.spikes ?? 0
  w.flag(keys.length > 0 || spikes > 0)
  if (!keys.length && !spikes) return
  w.write(spikes, 2)
  w.write(keys.length, 5)
  for (const i of keys) w.write(i, 5)
}

function writeField(w: BitWriter, f: UiField): void {
  w.write(f.weather === undefined ? 0 : f.weather === '' ? 1 : 2 + V2_WEATHER.indexOf(f.weather), 4)
  w.write(f.terrain === undefined ? 0 : f.terrain === '' ? 1 : 2 + V2_TERRAIN.indexOf(f.terrain), 3)
  w.flag(f.gravity)
  w.flag(f.neutralizingGas)
  for (const k of V2_AURAS) w.flag(f.auras[k])
  for (const k of V2_RUIN) w.flag(f.ruin[k])
  writeSide(w, f.mine)
  writeSide(w, f.opp)
}

const isEmptyField = (f: UiField): boolean =>
  f.weather === undefined &&
  f.terrain === undefined &&
  !f.gravity &&
  !f.neutralizingGas &&
  !V2_AURAS.some((k) => f.auras[k]) &&
  !V2_RUIN.some((k) => f.ruin[k]) &&
  !Object.values(f.mine).some(Boolean) &&
  !Object.values(f.opp).some(Boolean)

/** The plain (uncompressed) stream of a payload; its first bit is the "compressed" flag (0). */
export function encodeV2(p: SharePayload, tables: IdTables | undefined): Uint8Array {
  const gen = V2_GENS.indexOf(p.gen as (typeof V2_GENS)[number])
  if (gen < 0) throw new Error('unknown generation')
  const run = (width: number) => {
    const c: Ctx = { w: new BitWriter(), tables, width, maxCode: 0 }
    const w = c.w
    const hasReg = !!p.regulation && p.regulation !== 'none'
    const hasField = !isEmptyField(p.field)
    w.write(0, 1)
    w.write(gen, 4)
    w.flag(p.format !== 'singles')
    w.flag(hasReg)
    w.flag(hasField)
    w.flag(p.mine)
    w.flag(p.opp)
    w.flag(p.move)
    w.write(width, 4)
    if (hasReg) writeEntity(c, 'regulations', p.regulation)
    if (hasField) writeField(w, p.field)
    if (p.mine) writeSet(c, p.mine)
    if (p.opp) writeSet(c, p.opp)
    if (p.move) {
      w.flag(p.move.direction === 'reverse')
      w.write(p.move.index, 2)
    }
    return c
  }
  const probe = run(15)
  const width = bitsFor(probe.maxCode)
  return run(width).w.finish()
}

// ---------------------------------------------------------------------------------------------
// decoding (to the v1 positional wire value)
// ---------------------------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

interface RCtx {
  r: BitReader
  tables: IdTables | undefined
  width: number
  warnings: ShareWarning[]
}

type WarnKey = 'species' | 'move' | 'item' | 'ability' | 'regulation'
const WARN_OF: Record<IdKind, WarnKey> = {
  species: 'species',
  moves: 'move',
  items: 'item',
  abilities: 'ability',
  regulations: 'regulation',
}

/** An id, or `undefined` (after a warning) for a number the tables do not know. */
function readEntity(c: RCtx, kind: IdKind): string | undefined {
  const code = c.r.read(c.width)
  if (code === 0) {
    const len = c.r.read(7)
    let s = ''
    for (let i = 0; i < len; i++) s += String.fromCharCode(c.r.read(8))
    return s
  }
  const id = c.tables?.list[kind][code - 1]
  if (id === undefined) c.warnings.push({ key: WARN_OF[kind], detail: safeDetail(code) })
  return id
}

function readSpread(r: BitReader, kind: 'ev' | 'iv' | 'sp'): number[] {
  const raw = kind === 'ev' ? r.flag() : false
  return SPREAD_KEYS.map(() => {
    if (kind === 'ev') return raw ? r.read(8) : r.read(6) * 4
    return r.read(kind === 'iv' ? 5 : 6)
  })
}

function readOverride(r: BitReader, bad: () => void): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [k, bits] of [
    ['bp', 10],
    ['hits', 4],
    ['timesAffected', 4],
    ['opponentMoveIndex', 2],
  ] as const)
    if (r.flag()) out[k] = r.read(bits)
  for (const [k, list, bits] of [
    ['type', V2_TYPES, 5],
    ['category', V2_CATEGORY, 2],
    ['pledge', V2_PLEDGE, 2],
  ] as const) {
    if (!r.flag()) continue
    const v = list[r.read(bits)]
    if (v === undefined) bad()
    else out[k] = v
  }
  for (const f of OVERRIDE_FLAGS) if (r.flag()) out[f] = 1
  return out
}

/**
 * One set -> v1 set wire. `kept` receives the original slot of every move that survived (unknown
 * move numbers are dropped, which shifts the later slots). `undefined`: the set is not usable.
 */
function readSet(c: RCtx, which: string, kept: number[]): Json | undefined {
  const r = c.r
  let bad = false
  const flagBad = () => {
    bad = true
  }
  {
    const species = readEntity(c, 'species')
    const count = r.read(3)
    const moves: Json[] = []
    const slots: number[] = []
    for (let i = 0; i < count; i++) {
      const m = readEntity(c, 'moves')
      if (m !== undefined) {
        moves.push(m)
        slots.push(i)
      }
    }
    const [hasLevel, hasNature, hasAbility, hasItem, hasTera, hasGender, hasEv, hasIv, hasSp] =
      Array.from({ length: 9 }, () => r.flag())
    let level: Json = null
    let nature: Json = null
    let tera: Json = null
    let gender: Json = null
    if (hasLevel) level = r.read(7) + 1
    if (hasNature) {
      nature = V2_NATURES[r.read(5)] ?? null
      if (nature === null) flagBad()
    }
    const ability = hasAbility ? (readEntity(c, 'abilities') ?? null) : null
    const item = hasItem ? (readEntity(c, 'items') ?? null) : null
    if (hasTera) {
      const i = r.read(5)
      tera = V2_TYPES[i] ?? null
      if (tera === null) c.warnings.push({ key: 'tera', detail: safeDetail(i) })
    }
    if (hasGender) gender = r.flag() ? 'F' : 'M'
    const spreads: Json[] = [
      hasEv ? readSpread(r, 'ev') : 0,
      hasIv ? readSpread(r, 'iv') : 0,
      hasSp ? readSpread(r, 'sp') : 0,
    ]
    const extra: Record<string, Json> = {}
    if (r.flag()) {
      const [hStatus, hBoosts, hPct, hCur, hAbOn, tStat, dyn, gmax, hOver] = Array.from(
        { length: 9 },
        () => r.flag(),
      )
      if (hStatus) {
        const s = V2_STATUS[r.read(3)]
        if (s === undefined) flagBad()
        else extra.s = s
      }
      if (hBoosts) {
        const b = BOOST_KEYS.map(() => r.read(4) - 6)
        if (b.some((v) => v > 6)) flagBad()
        else extra.b = b
      }
      if (hPct) {
        if (r.flag()) {
          const buf = new DataView(new ArrayBuffer(8))
          for (let i = 0; i < 4; i++) buf.setUint16(i * 2, r.read(16))
          extra.h = buf.getFloat64(0)
        } else extra.h = r.read(10) / 10
      }
      if (hCur) extra.c = r.read(17)
      if (hAbOn) extra.a = r.flag() ? 1 : 0
      if (tStat) extra.t = 1
      if (dyn) extra.d = 1
      if (gmax) extra.g = 1
      if (hOver) {
        const present = Array.from({ length: 4 }, () => r.flag())
        const all: Json[] = present.map((p) => (p ? readOverride(r, flagBad) : null))
        // realign with the moves that survived
        extra.o = slots.map((s) => all[s] ?? null)
      }
    }
    if (bad) {
      c.warnings.push({ key: 'set', detail: which })
      return undefined
    }
    if (species === undefined) return undefined
    kept.push(...slots)
    return [
      species,
      level,
      nature,
      ability,
      item,
      moves,
      spreads,
      tera,
      gender,
      Object.keys(extra).length ? extra : null,
    ]
  }
}

function readSide(r: BitReader, warnings: ShareWarning[]): Json[] {
  const out: Json[] = []
  if (!r.flag()) return out
  const spikes = r.read(2)
  const n = r.read(5)
  if (spikes) out.push(spikes === 1 ? 'spikes' : `spikes${spikes}`)
  for (let i = 0; i < n; i++) {
    const k = V2_SIDE_KEYS[r.read(5)]
    if (k === undefined) warnings.push({ key: 'field' })
    else out.push(k)
  }
  return out
}

function readField(r: BitReader, warnings: ShareWarning[]): Json {
  const f: Record<string, Json> = {}
  const w = r.read(4)
  if (w === 1) f.w = ''
  else if (w >= 2) {
    const v = V2_WEATHER[w - 2]
    if (v === undefined) warnings.push({ key: 'field', detail: safeDetail(w) })
    else f.w = v
  }
  const t = r.read(3)
  if (t === 1) f.t = ''
  else if (t >= 2) {
    const v = V2_TERRAIN[t - 2]
    if (v === undefined) warnings.push({ key: 'field', detail: safeDetail(t) })
    else f.t = v
  }
  if (r.flag()) f.g = 1
  if (r.flag()) f.n = 1
  const a = V2_AURAS.filter(() => r.flag())
  const ru = V2_RUIN.filter(() => r.flag())
  if (a.length) f.a = a
  if (ru.length) f.r = ru
  const m = readSide(r, warnings)
  const o = readSide(r, warnings)
  if (m.length) f.m = m
  if (o.length) f.o = o
  return f
}

/** Peek the generation (needed before the id tables can be loaded). `undefined` when invalid. */
export function peekGen(bytes: Uint8Array): DataGenId | undefined {
  if (bytes.length === 0) return undefined
  const g = (bytes[0]! >> 3) & 0xf
  return V2_GENS[g]
}

/** Decode a plain stream into the v1 positional wire value (and pending warnings). */
export function decodeV2(
  bytes: Uint8Array,
  tables: IdTables | undefined,
  warnings: ShareWarning[],
): Json[] | undefined {
  const r = new BitReader(bytes)
  if (r.flag()) return undefined // a compressed container inside a container
  const gen = V2_GENS[r.read(4)]
  if (gen === undefined) return undefined
  const doubles = r.flag()
  const [hasReg, hasField, hasMine, hasOpp, hasMove] = Array.from({ length: 5 }, () => r.flag())
  const width = r.read(4)
  const c: RCtx = { r, tables, width, warnings }
  let regulation: Json = 0
  if (hasReg) {
    const id = readEntity(c, 'regulations')
    if (id !== undefined) regulation = id
  }
  const field: Json = hasField ? readField(r, warnings) : 0
  const mineKept: number[] = []
  const oppKept: number[] = []
  const mineRaw = hasMine ? readSet(c, 'mine', mineKept) : undefined
  const oppRaw = hasOpp ? readSet(c, 'opp', oppKept) : undefined
  let move: Json = 0
  if (hasMove) {
    const reverse = r.flag()
    const index = r.read(2)
    const kept = reverse ? oppKept : mineKept
    const slot = kept.indexOf(index)
    if ((reverse ? oppRaw : mineRaw) === undefined || slot < 0) warnings.push({ key: 'selection' })
    else move = [reverse ? 'r' : 'f', slot]
  }
  return [gen, regulation, doubles ? 'd' : 's', field, mineRaw ?? 0, oppRaw ?? 0, move]
}
