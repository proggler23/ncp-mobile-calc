import { afterEach, describe, expect, it, vi } from 'vitest'
import { GEN_META } from '../bridge/gens'
import type { DataGenId, SavedSetLike } from '../bridge/types'
import { GEN_IDS } from '../data/types'
import { emptyField, SIDE_OPTIONS } from '../state/field'
import { emptySpread, NATURE_NAMES, TYPE_NAMES } from '../storage/types'
import {
  MAX_TOKEN_LENGTH_V2,
  decodeShare,
  encodeShare,
  encodeShareV1,
  fromBase64Url,
  toBase64Url,
  type SharePayload,
} from './codec'
import { loadIdTables, makeTables } from './ids'
import {
  BitReader,
  BitWriter,
  V2_GENS,
  V2_NATURES,
  V2_SIDE_KEYS,
  V2_TYPES,
  decodeV2,
  encodeV2,
} from './v2'

afterEach(() => vi.unstubAllGlobals())

const ORIGIN = 'https://proggler23.github.io/ncp-mobile-calc/'
const strip = (s: SavedSetLike | undefined) => JSON.parse(JSON.stringify(s ?? null)) as unknown

async function ids(gen: DataGenId) {
  const t = (await loadIdTables(gen))!
  return {
    species: [t.list.species[10]!, t.list.species[20]!],
    moves: t.list.moves.slice(5, 9),
    item: t.list.items[3],
    ability: t.list.abilities[3],
    regulation: t.list.regulations[0],
  }
}

async function payload(gen: DataGenId): Promise<SharePayload> {
  const meta = GEN_META[gen]
  const x = await ids(gen)
  const field = emptyField()
  field.weather = 'Rain'
  field.terrain = ''
  field.gravity = true
  field.neutralizingGas = true
  field.auras.fairy = true
  field.ruin.sword = true
  field.mine = { reflect: true, tailwind: true, spikes: 2 }
  field.opp = { lightScreen: true, helpingHand: true, spikes: 3 }
  const build = (over: Partial<SavedSetLike>): SavedSetLike => ({
    speciesId: x.species[0]!,
    level: 50,
    nature: meta.engineGen < 3 ? 'Serious' : 'Careful',
    moveIds: x.moves,
    evs:
      gen === 'lgpe'
        ? { ...emptySpread(0), hp: 200, atk: 100 }
        : meta.usesStatPoints
          ? emptySpread(0)
          : { ...emptySpread(0), hp: 252, def: 4, spd: 252 },
    ivs: { ...emptySpread(31), atk: gen === 'gsc' ? 30 : 0 },
    ...(meta.usesStatPoints ? { statPoints: { ...emptySpread(0), hp: 32, def: 2, spd: 32 } } : {}),
    ...(meta.hasAbilities && x.ability ? { abilityId: x.ability } : {}),
    ...(meta.hasItems && x.item ? { itemId: x.item } : {}),
    ...over,
  })
  return {
    gen,
    regulation: x.regulation && gen === 'champions' ? x.regulation : 'none',
    format: meta.formats.includes('singles') && gen === 'lgpe' ? 'singles' : meta.defaultFormat,
    field,
    mine: build({
      status: 'Burned',
      boosts: { atk: 2, spe: -1, def: -6, spa: 6 },
      percentHP: 55.5,
      curHP: 120,
      abilityOn: true,
      ...(meta.hasTera ? { teraType: 'Stellar', terastallized: true } : {}),
      ...(meta.hasDynamax ? { dynamax: true, gmax: true } : {}),
      gender: 'F',
      // the "spelled out" fallback: an id that no table has
      moveIds: [...x.moves.slice(0, 3), 'notinanytable'],
      moveOverrides: [
        undefined,
        { crit: true, hits: 3, bp: 90, type: 'Fire' },
        undefined,
        { z: true, plus: true },
      ],
    }),
    opp: build({ speciesId: x.species[1]!, nature: 'Jolly', level: 100, gender: 'M' }),
    move: { direction: 'reverse', index: 2 },
  }
}

async function ok(token: string) {
  const res = await decodeShare(token)
  if (!res.ok) throw new Error(res.reason)
  return res
}

describe('v2 round trip', () => {
  for (const gen of GEN_IDS) {
    it(`${gen}: compressed and uncompressed tokens decode to the same payload`, async () => {
      const p = await payload(gen)
      for (const compress of [true, false]) {
        const token = await encodeShare(p, { compress })
        expect(token).toMatch(/^2[\w-]+$/)
        const res = await ok(token)
        expect(res.warnings).toEqual([])
        const q = res.payload
        expect(q.gen).toBe(gen)
        expect(q.regulation).toBe(p.regulation)
        expect(q.format).toBe(p.format)
        expect(q.field).toEqual(p.field)
        expect(q.move).toEqual(p.move)
        for (const side of ['mine', 'opp'] as const) {
          const a = strip(p[side]) as Record<string, unknown>
          const b = strip(q[side]) as Record<string, unknown>
          delete a.moveOverrides
          delete b.moveOverrides
          expect(b).toEqual(a)
        }
        expect(q.mine?.moveOverrides?.[1]).toEqual({ crit: true, hits: 3, bp: 90, type: 'Fire' })
        expect(q.mine?.moveOverrides?.[3]).toEqual({ z: true, plus: true })
        expect(q.mine?.moveOverrides?.[0]).toBeUndefined()
      }
    })
  }

  it('keeps every override at its bound, singles and both directions', async () => {
    const p = await payload('sv')
    p.format = 'singles'
    p.mine!.moveOverrides = [
      {
        bp: 999,
        hits: 10,
        timesAffected: 10,
        opponentMoveIndex: 3,
        type: 'Stellar',
        category: 'Status',
        pledge: 'Water Pledge',
        crit: true,
        double: true,
        z: true,
        plus: true,
        stellar: true,
      },
      { bp: 0, hits: 1, timesAffected: 0, opponentMoveIndex: 0, pledge: 'Fire Pledge' },
    ]
    for (const move of [
      { direction: 'forward', index: 0 },
      { direction: 'reverse', index: 3 },
      undefined,
    ] as const) {
      p.move = move
      const q = (await ok(await encodeShare(p))).payload
      expect(q.mine?.moveOverrides?.slice(0, 2)).toEqual(p.mine!.moveOverrides)
      expect(q.move).toEqual(move)
      expect(q.format).toBe('singles')
    }
  })

  it('keeps odd values exactly (EVs not multiple of 4, HP with many decimals, curHP, level)', async () => {
    const p = await payload('sv')
    p.mine = {
      ...p.mine!,
      evs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
      ivs: { hp: 0, atk: 1, def: 2, spa: 30, spd: 31, spe: 17 },
      level: 1,
      percentHP: 33.333333,
      curHP: 100000,
    }
    p.opp = { ...p.opp!, level: 100, percentHP: 0, evs: { ...emptySpread(0), hp: 252 } }
    const q = (await ok(await encodeShare(p))).payload
    expect(q.mine).toMatchObject({
      evs: p.mine.evs,
      ivs: p.mine.ivs,
      level: 1,
      percentHP: 33.333333,
      curHP: 100000,
    })
    expect(q.opp?.percentHP).toBe(0)
  })

  it('distinguishes "no weather/terrain" from "auto"', async () => {
    const p = await payload('sv')
    p.field = { ...emptyField(), weather: '', terrain: '' }
    const none = (await ok(await encodeShare(p))).payload.field
    p.field = emptyField()
    const auto = (await ok(await encodeShare(p))).payload.field
    expect(none.weather).toBe('')
    expect(none.terrain).toBe('')
    expect(auto.weather).toBeUndefined()
    expect(auto.terrain).toBeUndefined()
  })

  it('only compresses when that is shorter, and works without CompressionStream', async () => {
    const p = await payload('sv')
    const plain = fromBase64Url((await encodeShare(p, { compress: false })).slice(1))!
    const auto = fromBase64Url((await encodeShare(p)).slice(1))!
    expect(plain[0]! & 0x80).toBe(0)
    expect(auto.length).toBeLessThanOrEqual(plain.length)
    vi.stubGlobal('CompressionStream', undefined)
    vi.stubGlobal('DecompressionStream', undefined)
    const t = await encodeShare(p)
    expect((await ok(t)).payload.mine?.speciesId).toBe(p.mine!.speciesId)
  })

  it('a compressed token needs DecompressionStream', async () => {
    // Highly repetitive spelled-out ids compress well, forcing the compressed form.
    const p = await payload('sv')
    p.mine = { ...p.mine!, moveIds: ['a'.repeat(60), 'a'.repeat(60), 'a'.repeat(60)] }
    const token = await encodeShare(p)
    expect(fromBase64Url(token.slice(1))![0]! & 0x80).toBe(0x80)
    expect((await ok(token)).payload.mine?.moveIds[0]).toBe('a'.repeat(60))
    vi.stubGlobal('DecompressionStream', undefined)
    expect(await decodeShare(token)).toEqual({ ok: false, reason: 'unsupported' })
  })
})

describe('v2 wire tables', () => {
  it('stay in step with the app enums (append-only)', () => {
    expect(V2_GENS).toEqual(GEN_IDS.slice(0, V2_GENS.length))
    expect(V2_NATURES).toEqual(NATURE_NAMES.slice(0, V2_NATURES.length))
    expect(V2_NATURES.length).toBe(NATURE_NAMES.length)
    expect(V2_TYPES).toEqual(TYPE_NAMES.slice(0, V2_TYPES.length))
    expect(V2_TYPES.length).toBe(TYPE_NAMES.length)
    expect(V2_GENS.length).toBe(GEN_IDS.length)
    for (const o of SIDE_OPTIONS) expect(V2_SIDE_KEYS).toContain(o.key)
    expect(V2_SIDE_KEYS.length).toBeLessThanOrEqual(32)
  })

  it('pins example bytes so the format cannot change silently', async () => {
    const p: SharePayload = {
      gen: 'champions',
      regulation: 'regmc',
      format: 'doubles',
      field: { ...emptyField(), weather: 'Sun', mine: { tailwind: true } },
      mine: {
        speciesId: 'incineroar',
        level: 50,
        nature: 'Careful',
        moveIds: ['fakeout', 'flareblitz'],
        evs: emptySpread(0),
        ivs: emptySpread(31),
        statPoints: { ...emptySpread(0), hp: 32, spd: 32 },
        abilityId: 'intimidate',
        itemId: 'sitrusberry',
      },
      opp: { speciesId: 'garchomp', moveIds: ['earthquake'], level: 50, nature: 'Serious' },
      move: { direction: 'forward', index: 1 },
    }
    expect(await encodeShare(p)).toBe(V2_FIXTURE)
  })

  it('decodes the committed v2 fixture (never edit the string; add a new version instead)', async () => {
    const res = await ok(V2_FIXTURE)
    expect(res.warnings).toEqual([])
    expect(res.payload).toMatchObject({ gen: 'champions', regulation: 'regmc', format: 'doubles' })
    expect(res.payload.field.weather).toBe('Sun')
    expect(res.payload.mine).toMatchObject({
      speciesId: 'incineroar',
      nature: 'Careful',
      abilityId: 'intimidate',
      itemId: 'sitrusberry',
      moveIds: ['fakeout', 'flareblitz'],
      statPoints: { hp: 32, atk: 0, def: 0, spa: 0, spd: 32, spe: 0 },
    })
    expect(res.payload.opp?.speciesId).toBe('garchomp')
    expect(res.payload.move).toEqual({ direction: 'forward', index: 1 })
  })
})

describe('v2 size', () => {
  it('a typical Champions doubles calc is a short link', async () => {
    const x = await ids('champions')
    const p = await payload('champions')
    p.mine = {
      speciesId: 'incineroar',
      level: 50,
      nature: 'Careful',
      abilityId: 'intimidate',
      itemId: 'sitrusberry',
      moveIds: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
      evs: emptySpread(0),
      ivs: emptySpread(31),
      statPoints: { ...emptySpread(0), hp: 32, def: 2, spd: 32 },
      status: 'Burned',
      boosts: { atk: 1 },
    }
    p.opp = {
      speciesId: 'garchomp',
      level: 50,
      nature: 'Jolly',
      abilityId: 'roughskin',
      itemId: 'lifeorb',
      moveIds: ['earthquake', 'dragonclaw', 'rockslide', 'protect'],
      evs: emptySpread(0),
      ivs: emptySpread(31),
      statPoints: { ...emptySpread(0), atk: 2, spd: 32, spe: 32 },
    }
    p.field = { ...emptyField(), weather: 'Sun', mine: { tailwind: true } }
    p.move = { direction: 'forward', index: 1 }
    void x
    const token = await encodeShare(p)
    const link = `${ORIGIN}#c${token}`
    const v1 = `${ORIGIN}#/c/${await encodeShareV1(p)}`
    console.info(`champions typical: v2 link ${link.length} chars (v1: ${v1.length})`)
    expect(link.length).toBeLessThanOrEqual(180)
    expect(v1.length).toBeGreaterThan(link.length)
    expect((await ok(token)).warnings).toEqual([])

    // The full-featured scenario of the round-trip tests stays short as well.
    const rich = await payload('champions')
    rich.field = { ...emptyField(), weather: 'Sun', mine: { tailwind: true } }
    const richLink = `${ORIGIN}#c${await encodeShare(rich)}`
    console.info(`champions with status/boost/hp/overrides: ${richLink.length} chars`)
    expect(richLink.length).toBeLessThanOrEqual(180)

    const sv = await payload('sv')
    const svLink = `${ORIGIN}#c${await encodeShare(sv)}`
    console.info(`sv with tera, overrides, full field: ${svLink.length} chars`)
    expect(svLink.length).toBeLessThanOrEqual(180)

    const rby = await payload('rby')
    const rbyLink = `${ORIGIN}#c${await encodeShare(rby)}`
    console.info(`rby: ${rbyLink.length} chars`)
    expect(rbyLink.length).toBeLessThanOrEqual(180)
  })
})

// ---------------------------------------------------------------------------------------------
// untrusted input
// ---------------------------------------------------------------------------------------------

/** Hand-craft a v2 stream (id width 0: every id is spelled out). */
function craft(build: (w: BitWriter) => void): string {
  const w = new BitWriter()
  build(w)
  return `2${toBase64Url(w.finish())}`
}
const spell = (w: BitWriter, id: string) => {
  w.write(id.length, 7)
  for (const ch of id) w.write(ch.charCodeAt(0), 8)
}
/** header: not compressed, gen index, doubles, flags (reg, field, mine, opp, move), width 0 */
const header = (w: BitWriter, gen: number, flags: [number, number, number, number, number]) => {
  w.write(0, 1)
  w.write(gen, 4)
  w.write(1, 1)
  for (const f of flags) w.write(f, 1)
  w.write(0, 4)
}
/** a minimal set: species, one move, no flags, no extras */
const bareSet = (w: BitWriter, mods: { nature?: number; flags?: number[] } = {}) => {
  w.write(0, 0)
  spell(w, 'pikachu') // code 0 (0 bits) + name
  w.write(1, 3)
  spell(w, 'thunderbolt')
  const f = mods.flags ?? []
  for (let i = 0; i < 9; i++) w.write(f[i] ?? 0, 1)
  if (mods.nature !== undefined) w.write(mods.nature, 5)
  w.write(0, 1) // no extra
}

describe('v2 malicious input', () => {
  it('decodes a hand-crafted minimal token', async () => {
    const t = craft((w) => {
      header(w, 9, [0, 0, 1, 1, 0])
      bareSet(w)
      bareSet(w)
    })
    const res = await ok(t)
    expect(res.payload.mine).toMatchObject({ speciesId: 'pikachu', moveIds: ['thunderbolt'] })
    expect(res.payload.gen).toBe('sv')
  })

  it('rejects out-of-range enums with a warning instead of crashing', async () => {
    // nature index 31 (only 25 exist) -> the build is dropped, the other side stays
    const t = craft((w) => {
      header(w, 9, [0, 0, 1, 1, 0])
      bareSet(w, { flags: [0, 1], nature: 31 })
      bareSet(w)
    })
    const res = await ok(t)
    expect(res.payload.mine).toBeUndefined()
    expect(res.payload.opp?.speciesId).toBe('pikachu')
    expect(res.warnings).toContainEqual({ key: 'set', detail: 'mine' })
    // generation index 15 (12 exist), no usable matchup
    expect(await decodeShare(craft((w) => header(w, 15, [0, 0, 1, 1, 0])))).toMatchObject({
      ok: false,
    })
    // tera type 31 -> warning, build kept
    const tera = craft((w) => {
      header(w, 9, [0, 0, 1, 1, 0])
      w.write(0, 0)
      spell(w, 'pikachu')
      w.write(0, 3)
      for (const f of [0, 0, 0, 0, 1, 0, 0, 0, 0]) w.write(f, 1)
      w.write(31, 5)
      w.write(0, 1)
      bareSet(w)
    })
    const r2 = await ok(tera)
    expect(r2.payload.mine?.teraType).toBeUndefined()
    expect(r2.warnings).toContainEqual({ key: 'tera', detail: '31' })
    // boosts raw 15 -> -6+15 = 9 out of range
    const boost = craft((w) => {
      header(w, 9, [0, 0, 1, 1, 0])
      w.write(0, 0)
      spell(w, 'pikachu')
      w.write(0, 3)
      for (let i = 0; i < 9; i++) w.write(0, 1)
      w.write(1, 1)
      for (const f of [0, 1, 0, 0, 0, 0, 0, 0, 0]) w.write(f, 1)
      for (let i = 0; i < 5; i++) w.write(15, 4)
      bareSet(w)
    })
    expect((await ok(boost)).warnings).toContainEqual({ key: 'set', detail: 'mine' })
    // field: weather 15 and terrain 7 (unknown) -> warnings, side index 31 unknown
    const field = craft((w) => {
      header(w, 9, [0, 1, 1, 0, 0])
      w.write(15, 4)
      w.write(7, 3)
      w.write(0, 1 + 1 + 3 + 4)
      w.write(1, 1)
      w.write(0, 2)
      w.write(1, 5)
      w.write(31, 5)
      w.write(0, 1)
      bareSet(w)
    })
    const r3 = await ok(field)
    expect(r3.warnings.filter((x) => x.key === 'field')).toHaveLength(3)
    expect(r3.payload.field.weather).toBeUndefined()
  })

  it('values over the zod caps are rejected like in v1 (EV total, Stat Points, overrides)', async () => {
    const spread = (w: BitWriter, v: number[], bits: number) => v.forEach((x) => w.write(x, bits))
    // Stat Points of 63 each (champions): caps reject the build
    const sp = craft((w) => {
      header(w, 11, [0, 0, 1, 1, 0])
      w.write(0, 0)
      spell(w, 'pikachu')
      w.write(0, 3)
      for (const f of [0, 0, 0, 0, 0, 0, 0, 0, 1]) w.write(f, 1)
      spread(w, [63, 63, 63, 63, 63, 63], 6)
      w.write(0, 1)
      bareSet(w)
    })
    expect((await ok(sp)).warnings).toContainEqual({ key: 'set', detail: 'mine' })
    // EVs 255 each
    const ev = craft((w) => {
      header(w, 9, [0, 0, 1, 1, 0])
      w.write(0, 0)
      spell(w, 'pikachu')
      w.write(0, 3)
      for (const f of [0, 0, 0, 0, 0, 0, 1, 0, 0]) w.write(f, 1)
      w.write(1, 1)
      spread(w, [255, 255, 255, 255, 255, 255], 8)
      w.write(0, 1)
      bareSet(w)
    })
    expect((await ok(ev)).warnings).toContainEqual({ key: 'set', detail: 'mine' })
    // override bp 1023 / hits 15 / hits 0
    for (const [bp, hits] of [
      [1023, 1],
      [10, 15],
      [10, 0],
    ] as const) {
      const o = craft((w) => {
        header(w, 9, [0, 0, 1, 1, 0])
        w.write(0, 0)
        spell(w, 'pikachu')
        w.write(1, 3)
        spell(w, 'thunderbolt')
        for (let i = 0; i < 9; i++) w.write(0, 1)
        w.write(1, 1)
        for (const f of [0, 0, 0, 0, 0, 0, 0, 0, 1]) w.write(f, 1)
        w.write(0b1000, 4)
        w.write(1, 1)
        w.write(bp, 10)
        w.write(1, 1)
        w.write(hits, 4)
        w.write(0, 5) // timesAffected, opponent move, type, category, pledge: absent
        w.write(0, 5) // flags
        bareSet(w)
      })
      expect((await ok(o)).warnings).toContainEqual({ key: 'set', detail: 'mine' })
    }
  })

  it('drops unknown numbers with warnings and keeps the rest (move slots stay aligned)', async () => {
    const real = (await loadIdTables('sv'))!
    const fake = makeTables({
      species: [...real.list.species, 'zzfakemon'],
      moves: [...real.list.moves, 'zzfakemove'],
      items: [...real.list.items, 'zzfakeitem'],
      abilities: [...real.list.abilities, 'zzfakeability'],
      regulations: [...real.list.regulations, 'zzfakereg'],
    })
    const p = await payload('sv')
    p.regulation = 'zzfakereg'
    p.mine = {
      ...p.mine!,
      moveIds: ['zzfakemove', real.list.moves[1]!, real.list.moves[2]!],
      moveOverrides: [{ bp: 1 }, { bp: 2 }, { bp: 3 }],
      itemId: 'zzfakeitem',
      abilityId: 'zzfakeability',
    }
    p.opp = { ...p.opp!, speciesId: 'zzfakemon' }
    p.move = { direction: 'forward', index: 2 }
    const bytes = encodeV2(p, fake)
    const res = decodeV2(bytes, real, [])
    expect(res).toBeTruthy()
    const token = `2${toBase64Url(bytes)}`
    const out = await ok(token)
    expect(out.payload.opp).toBeUndefined()
    expect(out.payload.mine?.moveIds).toEqual([real.list.moves[1], real.list.moves[2]])
    expect(out.payload.mine?.moveOverrides).toEqual([{ bp: 2 }, { bp: 3 }])
    expect(out.payload.mine?.itemId).toBeUndefined()
    expect(out.payload.mine?.abilityId).toBeUndefined()
    expect(out.payload.move).toBeUndefined() // opp is gone, so no row selection
    const kinds = out.warnings.map((w) => w.key).sort()
    expect(kinds).toEqual(['ability', 'item', 'move', 'regulation', 'species'])
    for (const w of out.warnings) expect(w.detail).toMatch(/^\d+$/)
    // the selected row follows its move when an earlier one is dropped
    p.opp = { ...p.opp!, speciesId: real.list.species[3]! }
    const out2 = await ok(`2${toBase64Url(encodeV2(p, fake))}`)
    expect(out2.payload.move).toEqual({ direction: 'forward', index: 1 })
  })

  it('never reads past the end: every truncation of a valid token is an error or a clean decode', async () => {
    const token = await encodeShare(await payload('sv'), { compress: false })
    const bytes = fromBase64Url(token.slice(1))!
    let failed = 0
    for (let n = 0; n < bytes.length; n++) {
      const res = await decodeShare(`2${toBase64Url(bytes.subarray(0, n))}`)
      if (!res.ok) failed++
    }
    expect(failed).toBeGreaterThan(bytes.length / 2)
    const r = new BitReader(new Uint8Array(1))
    expect(() => r.read(9)).toThrow()
    expect(r.read(8)).toBe(0)
    expect(() => r.read(1)).toThrow()
  })

  it('rejects oversized, empty and non-base64 tokens', async () => {
    expect(await decodeShare('2')).toEqual({ ok: false, reason: 'format' })
    expect(await decodeShare('2%%%')).toEqual({ ok: false, reason: 'format' })
    expect(await decodeShare('2A')).toEqual({ ok: false, reason: 'format' })
    expect(await decodeShare(`2${'A'.repeat(MAX_TOKEN_LENGTH_V2)}`)).toEqual({
      ok: false,
      reason: 'tooLong',
    })
    expect(await decodeShare(`2${'A'.repeat(MAX_TOKEN_LENGTH_V2 - 1)}`)).not.toEqual({
      ok: false,
      reason: 'tooLong',
    })
  })

  it('refuses a decompression bomb', async () => {
    const zeros = new Uint8Array(1_000_000)
    const cs = new CompressionStream('deflate-raw')
    const w = cs.writable.getWriter()
    void w.write(zeros)
    void w.close()
    const chunks: Uint8Array[] = []
    const rd = cs.readable.getReader()
    for (;;) {
      const { done, value } = await rd.read()
      if (done) break
      chunks.push(value)
    }
    const packed = new Uint8Array(1 + chunks.reduce((a, c) => a + c.length, 0))
    packed[0] = 0x80
    let at = 1
    for (const c of chunks) {
      packed.set(c, at)
      at += c.length
    }
    const token = `2${toBase64Url(packed)}`
    expect(token.length).toBeLessThan(MAX_TOKEN_LENGTH_V2)
    expect(await decodeShare(token)).toEqual({ ok: false, reason: 'format' })
  })

  it('survives 1000 random tokens without throwing', async () => {
    let seed = 0x2468ace
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    const good = await encodeShare(await payload('champions'), { compress: false })
    const goodBytes = fromBase64Url(good.slice(1))!
    for (let i = 0; i < 1000; i++) {
      let bytes: Uint8Array
      if (i % 2) {
        bytes = Uint8Array.from({ length: Math.floor(rnd() * 120) }, () => Math.floor(rnd() * 256))
      } else {
        // a valid token with a few flipped bits
        bytes = Uint8Array.from(goodBytes)
        for (let k = 0; k < 1 + (i % 4); k++) {
          bytes[Math.floor(rnd() * bytes.length)]! ^= 1 << Math.floor(rnd() * 8)
        }
        if (i % 8 === 0) bytes[0] = (bytes[0]! & 0x7f) | 0x80
      }
      const res = await decodeShare(`2${toBase64Url(bytes)}`)
      expect(typeof res.ok).toBe('boolean')
      if (res.ok)
        for (const w of res.warnings) expect(w.detail ?? '').toMatch(/^[A-Za-z0-9 _.-]*$|^\?$/)
    }
  })

  it('never shows attacker-chosen text in a warning', async () => {
    const t = craft((w) => {
      header(w, 9, [0, 0, 1, 0, 0])
      w.write(0, 0)
      spell(w, 'pikachu')
      w.write(0, 3)
      for (const f of [0, 0, 0, 0, 1, 0, 0, 0, 0]) w.write(f, 1)
      w.write(30, 5)
      w.write(0, 1)
      bareSet(w)
    })
    const res = await ok(t)
    for (const w of res.warnings) expect(w.detail).toMatch(/^[0-9]+$/)
    // spelled-out ids with markup fail validation and are reported as a set warning only
    const bad = craft((w) => {
      header(w, 9, [0, 0, 1, 1, 0])
      w.write(0, 0)
      spell(w, '<img src=x>')
      w.write(0, 3)
      for (let i = 0; i < 9; i++) w.write(0, 1)
      w.write(0, 1)
      bareSet(w)
    })
    const r2 = await ok(bad)
    expect(r2.payload.mine).toBeUndefined()
    expect(r2.warnings).toContainEqual({ key: 'set', detail: 'mine' })
  })
})

describe('v1 links keep working', () => {
  it('round-trips through the v1 encoder (kept for old tokens)', async () => {
    const p = await payload('champions')
    const res = await ok(await encodeShareV1(p))
    expect(res.payload.mine?.speciesId).toBe(p.mine!.speciesId)
    expect(res.payload.move).toEqual(p.move)
  })
})

// A v2 link as written by this version (champions Reg M-C; Incineroar vs Garchomp).
const V2_FIXTURE = '2X_ACQAECVTqRo3DdWkYAAAIAD2X0ACA'
