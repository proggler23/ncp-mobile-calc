/**
 * Share-link codec (pure: no DOM, no app state). Tokens:
 *
 *   2<base64url>      v2 (current): bit-packed binary with numeric ids (see ./v2.ts), deflate-raw
 *                     only when that is shorter. Link: `#c2<base64url>`.
 *   v1.<base64url>    v1: positional JSON, deflate-raw compressed. Link: `#/c/v1.<...>`.
 *   v1r.<base64url>   v1 not compressed (platform without CompressionStream)
 *
 * Old links must keep decoding: never change what a version tag means, add a new decoder and let
 * `encodeShare` write the new tag. v2 decodes to the v1 positional wire value below, so both share
 * one validation path.
 *
 * v1 wire format (trailing `null`s trimmed, defaults omitted):
 *   [gen, regulation|0, "s"|"d", field|0, mine|0, opp|0, [direction "f"|"r", moveIndex]|0]
 *   set   = [speciesId, level|null, nature|null, abilityId|null, itemId|null, [moveIds],
 *            [evs|0, ivs|0, statPoints|0]|0, teraType|null, "M"|"F"|null, extra|null]
 *   extra = { s: status, b: [atk,def,spa,spd,spe], h: percentHP, c: curHP, a: 1|0 (abilityOn),
 *             t: terastallized, d: dynamax, g: gmax, o: [moveOverride|null, ...] }
 *   field = { w: weather, t: terrain, g: gravity, n: neutralizingGas, a: [auras], r: [ruin],
 *             m: [flags of my side], o: [flags of the opponent's side] }
 * Everything decoded is untrusted: it is whitelisted, run through the storage zod schemas, and
 * whatever does not fit is dropped with a warning. `decodeShare` never throws.
 */
import { GEN_META } from '../bridge/gens'
import type { DataGenId, MoveOverride, SavedSetLike } from '../bridge/types'
import { GEN_IDS } from '../data/types'
import { own } from '../own'
import { safeDetail } from './detail'
import { emptyField, SIDE_OPTIONS, type UiField } from '../state/field'
import { loadIdTables } from './ids'
import { parseMatchupSet } from '../storage/schema'
import { decodeV2, encodeV2, peekGen } from './v2'
import { emptySpread, TYPE_NAMES, type Format, type StatSpread } from '../storage/types'

export const SHARE_VERSION = 'v1'
/** Longest token accepted (characters, version tag included). */
export const MAX_TOKEN_LENGTH = 4096
/** Longest v2 token accepted. */
export const MAX_TOKEN_LENGTH_V2 = 2048
/** Longest decompressed JSON accepted (a zip-bomb guard). */
export const MAX_JSON_BYTES = 16 * 1024
/** Longest decompressed v2 stream accepted (a real calc needs well under 200 bytes). */
export const MAX_V2_BYTES = 2048

export type Direction = 'forward' | 'reverse'

export interface SharePayload {
  gen: DataGenId
  /** Resolved regulation id or `none`. */
  regulation: string
  format: Format
  field: UiField
  mine?: SavedSetLike
  opp?: SavedSetLike
  /** The move row that was shared (index into the result rows of `direction`). */
  move?: { direction: Direction; index: number }
}

export type ShareWarningKey =
  | 'set' // a build did not validate
  | 'field' // a field entry is unknown
  | 'format'
  | 'regulation'
  | 'species'
  | 'move'
  | 'item'
  | 'ability'
  | 'tera'
  | 'selection'

export interface ShareWarning {
  key: ShareWarningKey
  /** Offending value (never trusted markup: shown as plain text only). */
  detail?: string
}

export type DecodeFailure = 'empty' | 'tooLong' | 'format' | 'version' | 'unsupported' | 'data'

export type DecodeResult =
  | { ok: true; payload: SharePayload; warnings: ShareWarning[] }
  | { ok: false; reason: DecodeFailure }

// ---------------------------------------------------------------------------------------------
// base64url + compression
// ---------------------------------------------------------------------------------------------

export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** `undefined` for anything that is not valid unpadded base64url. */
export function fromBase64Url(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined
  try {
    const bin = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return undefined
  }
}

async function runStream(
  data: Uint8Array,
  ts: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
  limit: number,
): Promise<Uint8Array> {
  const writer = ts.writable.getWriter()
  writer.write(data as BufferSource).catch(() => undefined)
  writer.close().catch(() => undefined)
  const reader = ts.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      void reader.cancel().catch(() => undefined)
      throw new Error('too large')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

export const canCompress = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

// ---------------------------------------------------------------------------------------------
// v1 wire format
// ---------------------------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
const STATUS_ORDER = ['atk', 'def', 'spa', 'spd', 'spe'] as const
const SPREAD_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const
const OVERRIDE_NUMBERS = ['bp', 'hits', 'timesAffected', 'opponentMoveIndex'] as const
const OVERRIDE_FLAGS = ['crit', 'double', 'z', 'plus', 'stellar'] as const
const OVERRIDE_TEXT = ['type', 'category', 'pledge'] as const
const WEATHERS = [
  'Sun',
  'Rain',
  'Sand',
  'Hail',
  'Snow',
  'Harsh Sun',
  'Heavy Rain',
  'Strong Winds',
] as const
const TERRAINS = ['Electric', 'Grassy', 'Misty', 'Psychic'] as const
const AURAS = ['fairy', 'dark', 'break'] as const
const RUIN = ['tablets', 'vessel', 'sword', 'beads'] as const
const DEFAULT_LEVEL = 50
const DEFAULT_NATURE = 'Serious'
const SIDE_KEYS: readonly string[] = SIDE_OPTIONS.map((o) => o.key)

/** Remove trailing `null`s; an empty array becomes `0` (the "absent" marker for positions). */
function trim(list: Json[]): Json[] {
  let n = list.length
  while (n > 0 && (list[n - 1] === null || list[n - 1] === 0)) n--
  return list.slice(0, n)
}

const spreadList = (s: StatSpread | undefined, def: number): Json =>
  s && SPREAD_KEYS.some((k) => s[k] !== def) ? SPREAD_KEYS.map((k) => s[k]) : 0

function encodeOverride(o: MoveOverride | undefined): Json {
  if (!o) return null
  const out: Record<string, Json> = {}
  for (const k of OVERRIDE_NUMBERS) if (o[k] !== undefined) out[k] = o[k]
  for (const k of OVERRIDE_FLAGS) if (o[k]) out[k] = 1
  for (const k of OVERRIDE_TEXT) if (o[k] !== undefined) out[k] = o[k]
  return Object.keys(out).length ? out : null
}

function encodeSet(s: SavedSetLike | undefined): Json {
  if (!s) return 0
  const extra: Record<string, Json> = {}
  if (s.status && s.status !== 'Healthy') extra.s = s.status
  const boosts = STATUS_ORDER.map((k) => s.boosts?.[k] ?? 0)
  if (boosts.some(Boolean)) extra.b = trim(boosts)
  if (s.percentHP !== undefined) extra.h = s.percentHP
  if (s.curHP !== undefined) extra.c = s.curHP
  if (s.abilityOn !== undefined) extra.a = s.abilityOn ? 1 : 0
  if (s.terastallized) extra.t = 1
  if (s.dynamax) extra.d = 1
  if (s.gmax) extra.g = 1
  const overrides = trim((s.moveOverrides ?? []).map(encodeOverride))
  if (overrides.length) extra.o = overrides
  const spreads = trim([spreadList(s.evs, 0), spreadList(s.ivs, 31), spreadList(s.statPoints, 0)])
  return trim([
    s.speciesId,
    s.level !== undefined && s.level !== DEFAULT_LEVEL ? s.level : null,
    s.nature && s.nature !== DEFAULT_NATURE ? s.nature : null,
    s.abilityId ?? null,
    s.itemId ?? null,
    s.moveIds,
    spreads.length ? spreads : 0,
    s.teraType ?? null,
    s.gender ?? null,
    Object.keys(extra).length ? extra : null,
  ])
}

function sideList(side: UiField['mine']): Json {
  const out: string[] = []
  for (const [k, v] of Object.entries(side)) {
    if (!v) continue
    if (k === 'spikes') out.push(v === 1 ? 'spikes' : `spikes${String(v)}`)
    else out.push(k)
  }
  return out
}

function encodeField(f: UiField): Json {
  const out: Record<string, Json> = {}
  if (f.weather !== undefined) out.w = f.weather
  if (f.terrain !== undefined) out.t = f.terrain
  if (f.gravity) out.g = 1
  if (f.neutralizingGas) out.n = 1
  const on = <K extends string>(o: Record<K, boolean>, keys: readonly K[]) =>
    keys.filter((k) => o[k])
  const a = on(f.auras, AURAS)
  const r = on(f.ruin, RUIN)
  if (a.length) out.a = a
  if (r.length) out.r = r
  const m = sideList(f.mine) as Json[]
  const o = sideList(f.opp) as Json[]
  if (m.length) out.m = m
  if (o.length) out.o = o
  return Object.keys(out).length ? out : 0
}

/** The JSON-able v1 wire value of a payload. */
export function toWire(p: SharePayload): Json[] {
  return trim([
    p.gen,
    p.regulation && p.regulation !== 'none' ? p.regulation : 0,
    p.format === 'singles' ? 's' : 'd',
    encodeField(p.field),
    encodeSet(p.mine),
    encodeSet(p.opp),
    p.move ? [p.move.direction === 'forward' ? 'f' : 'r', p.move.index] : 0,
  ])
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** `undefined`: absent (default); `null`: present but malformed. */
function readSpread(v: unknown, def: number): StatSpread | undefined | null {
  if (v === 0 || v === null || v === undefined) return undefined
  if (!Array.isArray(v) || v.length !== 6) return null
  const out = emptySpread(def)
  SPREAD_KEYS.forEach((k, i) => (out[k] = v[i] as number))
  return out
}

function readOverride(v: unknown): MoveOverride | undefined {
  if (!isObj(v)) return undefined
  const out: Record<string, unknown> = {}
  for (const k of OVERRIDE_NUMBERS) if (typeof v[k] === 'number') out[k] = v[k]
  for (const k of OVERRIDE_FLAGS) if (v[k] === 1 || v[k] === true) out[k] = true
  for (const k of OVERRIDE_TEXT) if (typeof v[k] === 'string') out[k] = v[k]
  return out as MoveOverride
}

function decodeSet(
  raw: unknown,
  gen: DataGenId,
  which: string,
  warnings: ShareWarning[],
): SavedSetLike | undefined {
  if (raw === 0 || raw === null || raw === undefined) return undefined
  const bad = () => {
    warnings.push({ key: 'set', detail: which })
    return undefined
  }
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 10) return bad()
  const [species, level, nature, ability, item, moves, spread, tera, gender, extra] =
    raw as unknown[]
  if (!Array.isArray(moves) || moves.length > 4) return bad()
  const meta = GEN_META[gen]
  const spreads = Array.isArray(spread) ? spread : []
  const evs = readSpread(spreads[0], 0)
  const ivs = readSpread(spreads[1], 31)
  const points = readSpread(spreads[2], 0)
  if (evs === null || ivs === null || points === null) return bad()
  const candidate: Record<string, unknown> = {
    speciesId: species,
    moveIds: moves,
    level: level ?? DEFAULT_LEVEL,
    nature: nature ?? DEFAULT_NATURE,
    evs: evs ?? emptySpread(0),
    ivs: ivs ?? emptySpread(31),
  }
  if (meta.usesStatPoints) candidate.statPoints = points ?? emptySpread(0)
  if (ability !== null && ability !== undefined) candidate.abilityId = ability
  if (item !== null && item !== undefined) candidate.itemId = item
  if (tera !== null && tera !== undefined) {
    if ((TYPE_NAMES as readonly unknown[]).includes(tera)) candidate.teraType = tera
    else warnings.push({ key: 'tera', detail: safeDetail(tera) })
  }
  if (gender !== null && gender !== undefined) candidate.gender = gender
  if (isObj(extra)) {
    const e = extra
    if (typeof e.s === 'string') candidate.status = e.s
    if (Array.isArray(e.b)) {
      const boosts: Record<string, unknown> = {}
      STATUS_ORDER.forEach((k, i) => {
        if (e.b instanceof Array && e.b[i]) boosts[k] = e.b[i]
      })
      candidate.boosts = boosts
    }
    if (e.h !== undefined) candidate.percentHP = e.h
    if (e.c !== undefined) candidate.curHP = e.c
    if (e.a !== undefined) candidate.abilityOn = e.a === 1 || e.a === true
    if (e.t) candidate.terastallized = true
    if (e.d) candidate.dynamax = true
    if (e.g) candidate.gmax = true
    if (Array.isArray(e.o)) candidate.moveOverrides = e.o.map((o) => readOverride(o) ?? null)
  }
  const parsed = parseMatchupSet(candidate, gen)
  if (!parsed) return bad()
  const set = parsed as SavedSetLike
  if (set.moveOverrides) {
    // zod turns `null` entries into `null`; the app uses `undefined`.
    set.moveOverrides = set.moveOverrides.map((o) => o ?? undefined)
  }
  return set
}

function readFlags(v: unknown, allowed: readonly string[], warnings: ShareWarning[]) {
  const out: Record<string, true | 1 | 2 | 3> = {}
  if (v === undefined) return out
  if (!Array.isArray(v)) {
    warnings.push({ key: 'field' })
    return out
  }
  for (const k of v.slice(0, 64)) {
    const spikes = typeof k === 'string' ? /^spikes([123])?$/.exec(k) : null
    if (spikes) out.spikes = Number(spikes[1] ?? 1) as 1 | 2 | 3
    else if (typeof k === 'string' && allowed.includes(k)) out[k] = true
    else warnings.push({ key: 'field', detail: safeDetail(k) })
  }
  return out
}

function decodeField(raw: unknown, warnings: ShareWarning[]): UiField {
  const f = emptyField()
  if (raw === 0 || raw === null || raw === undefined) return f
  if (!isObj(raw)) {
    warnings.push({ key: 'field' })
    return f
  }
  if (typeof raw.w === 'string') {
    if (raw.w === '' || (WEATHERS as readonly string[]).includes(raw.w)) {
      f.weather = raw.w as UiField['weather']
    } else warnings.push({ key: 'field', detail: safeDetail(raw.w) })
  }
  if (typeof raw.t === 'string') {
    if (raw.t === '' || (TERRAINS as readonly string[]).includes(raw.t)) {
      f.terrain = raw.t as UiField['terrain']
    } else warnings.push({ key: 'field', detail: safeDetail(raw.t) })
  }
  f.gravity = raw.g === 1 || raw.g === true
  f.neutralizingGas = raw.n === 1 || raw.n === true
  const auras = readFlags(raw.a, AURAS, warnings)
  for (const k of AURAS) f.auras[k] = auras[k] === true
  const ruin = readFlags(raw.r, RUIN, warnings)
  for (const k of RUIN) f.ruin[k] = ruin[k] === true
  f.mine = readFlags(raw.m, SIDE_KEYS, warnings) as UiField['mine']
  f.opp = readFlags(raw.o, SIDE_KEYS, warnings) as UiField['opp']
  return f
}

function decodeV1(wire: unknown, warnings: ShareWarning[]): SharePayload | undefined {
  if (!Array.isArray(wire) || wire.length < 3 || wire.length > 7) return undefined
  const [gen, reg, fmt, field, mine, opp, move] = wire as unknown[]
  if (typeof gen !== 'string' || !(GEN_IDS as readonly string[]).includes(gen)) return undefined
  const g = gen as DataGenId
  const meta = GEN_META[g]
  let format: Format = fmt === 's' ? 'singles' : 'doubles'
  if (fmt !== 's' && fmt !== 'd') warnings.push({ key: 'format' })
  if (!meta.formats.includes(format)) format = meta.defaultFormat
  let regulation = 'none'
  if (reg !== 0 && reg !== undefined && reg !== null) {
    if (typeof reg === 'string' && /^[a-z0-9]{1,64}$/.test(reg)) regulation = reg
    else warnings.push({ key: 'regulation', detail: safeDetail(reg) })
  }
  const payload: SharePayload = {
    gen: g,
    regulation,
    format,
    field: decodeField(field, warnings),
    mine: decodeSet(mine, g, 'mine', warnings),
    opp: decodeSet(opp, g, 'opp', warnings),
  }
  if (Array.isArray(move)) {
    const [d, i] = move as unknown[]
    if (
      (d === 'f' || d === 'r') &&
      Number.isInteger(i) &&
      (i as number) >= 0 &&
      (i as number) < 4
    ) {
      payload.move = { direction: d === 'f' ? 'forward' : 'reverse', index: i as number }
    } else warnings.push({ key: 'selection' })
  }
  return payload
}

const DECODERS: Record<
  string,
  (wire: unknown, warnings: ShareWarning[]) => SharePayload | undefined
> = { v1: decodeV1 }

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/** Serialize a payload to a v2 link token (`2<base64url>`). Compresses only when that is shorter. */
export async function encodeShare(
  payload: SharePayload,
  opts: { compress?: boolean } = {},
): Promise<string> {
  const plain = encodeV2(payload, await loadIdTables(payload.gen))
  let best = plain
  if (opts.compress !== false && canCompress()) {
    try {
      const packed = await runStream(plain, new CompressionStream('deflate-raw'), MAX_V2_BYTES)
      if (packed.length + 1 < plain.length) {
        best = new Uint8Array(packed.length + 1)
        best[0] = 0x80
        best.set(packed, 1)
      }
    } catch {
      /* keep the plain form */
    }
  }
  return `2${toBase64Url(best)}`
}

/** Serialize a payload to a v1 link token (`v1.<base64url>`); kept for tests and tooling. */
export async function encodeShareV1(
  payload: SharePayload,
  opts: { compress?: boolean } = {},
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(toWire(payload)))
  if (opts.compress !== false && canCompress()) {
    try {
      const packed = await runStream(bytes, new CompressionStream('deflate-raw'), MAX_JSON_BYTES)
      return `${SHARE_VERSION}.${toBase64Url(packed)}`
    } catch {
      /* fall through to the uncompressed form */
    }
  }
  return `${SHARE_VERSION}r.${toBase64Url(bytes)}`
}

/** Finish a decoded wire value: shared by every version. */
function finish(
  wire: unknown,
  decoder: (wire: unknown, warnings: ShareWarning[]) => SharePayload | undefined,
  warnings: ShareWarning[],
): DecodeResult {
  const payload = decoder(wire, warnings)
  if (!payload) return { ok: false, reason: 'data' }
  if (!payload.mine && !payload.opp) return { ok: false, reason: 'data' }
  if (payload.move && (!payload.mine || !payload.opp)) delete payload.move
  return { ok: true, payload, warnings }
}

async function decodeBinary(data: string): Promise<DecodeResult> {
  let bytes = fromBase64Url(data)
  if (!bytes || bytes.length === 0) return { ok: false, reason: 'format' }
  if (bytes[0]! & 0x80) {
    if (typeof DecompressionStream === 'undefined') return { ok: false, reason: 'unsupported' }
    try {
      bytes = await runStream(
        bytes.subarray(1),
        new DecompressionStream('deflate-raw'),
        MAX_V2_BYTES,
      )
    } catch {
      return { ok: false, reason: 'format' }
    }
  }
  const gen = peekGen(bytes)
  if (!gen) return { ok: false, reason: 'data' }
  const warnings: ShareWarning[] = []
  try {
    const wire = decodeV2(bytes, await loadIdTables(gen), warnings)
    if (!wire) return { ok: false, reason: 'data' }
    return finish(wire, decodeV1, warnings)
  } catch {
    return { ok: false, reason: 'format' } // truncated or malformed
  }
}

/** Parse and validate a link token. Never throws. */
export async function decodeShare(token: string): Promise<DecodeResult> {
  try {
    if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'empty' }
    if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'tooLong' }
    if (token.startsWith('2')) {
      if (token.length > MAX_TOKEN_LENGTH_V2) return { ok: false, reason: 'tooLong' }
      return await decodeBinary(token.slice(1))
    }
    const m = /^(v\d{1,3})(r?)\.([A-Za-z0-9_-]*)$/.exec(token)
    if (!m) return { ok: false, reason: 'format' }
    const decoder = own(DECODERS, m[1])
    if (!decoder) return { ok: false, reason: 'version' }
    let bytes = fromBase64Url(m[3]!)
    if (!bytes) return { ok: false, reason: 'format' }
    if (m[2] !== 'r') {
      if (typeof DecompressionStream === 'undefined') return { ok: false, reason: 'unsupported' }
      try {
        bytes = await runStream(bytes, new DecompressionStream('deflate-raw'), MAX_JSON_BYTES)
      } catch {
        return { ok: false, reason: 'format' }
      }
    } else if (bytes.length > MAX_JSON_BYTES) return { ok: false, reason: 'tooLong' }
    let wire: unknown
    try {
      wire = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
      return { ok: false, reason: 'format' }
    }
    return finish(wire, decoder, [])
  } catch {
    return { ok: false, reason: 'format' }
  }
}
