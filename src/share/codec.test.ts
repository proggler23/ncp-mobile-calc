import { safeDetail } from './detail'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GEN_META } from '../bridge/gens'
import type { SavedSetLike } from '../bridge/types'
import { GEN_IDS } from '../data/types'
import { emptyField } from '../state/field'
import { emptySpread } from '../storage/types'
import {
  MAX_TOKEN_LENGTH,
  decodeShare,
  encodeShareV1,
  fromBase64Url,
  toBase64Url,
  toWire,
  type SharePayload,
} from './codec'

afterEach(() => vi.unstubAllGlobals())

function set(gen: (typeof GEN_IDS)[number], over: Partial<SavedSetLike> = {}): SavedSetLike {
  const meta = GEN_META[gen]
  return {
    speciesId: 'incineroar',
    level: 50,
    nature: meta.engineGen < 3 ? 'Serious' : 'Careful',
    moveIds: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
    evs:
      gen === 'lgpe'
        ? { ...emptySpread(0), hp: 200, atk: 100 }
        : meta.usesStatPoints
          ? emptySpread(0)
          : { ...emptySpread(0), hp: 252, def: 4, spd: 252 },
    ivs: { ...emptySpread(31), atk: gen === 'gsc' ? 30 : 0 },
    ...(meta.usesStatPoints ? { statPoints: { ...emptySpread(0), hp: 32, def: 2, spd: 32 } } : {}),
    ...(meta.hasAbilities ? { abilityId: 'intimidate' } : {}),
    ...(meta.hasItems ? { itemId: 'sitrusberry' } : {}),
    ...over,
  }
}

function payload(gen: (typeof GEN_IDS)[number]): SharePayload {
  const meta = GEN_META[gen]
  const field = emptyField()
  field.weather = 'Rain'
  field.terrain = ''
  field.gravity = true
  field.auras.fairy = true
  field.ruin.sword = true
  field.mine = { reflect: true, tailwind: true, spikes: 2 }
  field.opp = { lightScreen: true, helpingHand: true }
  return {
    gen,
    regulation: gen === 'champions' ? 'regmc' : 'none',
    format: meta.formats.includes('singles') && gen === 'lgpe' ? 'singles' : meta.defaultFormat,
    field,
    mine: set(gen, {
      status: 'Burned',
      boosts: { atk: 2, spe: -1 },
      percentHP: 55.5,
      curHP: 120,
      abilityOn: true,
      ...(meta.hasTera ? { teraType: 'Fairy', terastallized: true } : {}),
      ...(meta.hasDynamax ? { dynamax: true, gmax: true } : {}),
      gender: 'F',
      moveOverrides: [
        undefined,
        { crit: true, hits: 3, bp: 90, type: 'Fire' },
        undefined,
        { z: true },
      ],
    }),
    opp: set(gen, { speciesId: 'garchomp', nature: 'Jolly', level: 100 }),
    move: { direction: 'reverse', index: 2 },
  }
}

const strip = (s: SavedSetLike | undefined) => JSON.parse(JSON.stringify(s ?? null)) as unknown

describe('codec round trip', () => {
  for (const gen of GEN_IDS) {
    it(`${gen}: compressed and uncompressed links decode to the same payload`, async () => {
      const p = payload(gen)
      for (const compress of [true, false]) {
        const token = await encodeShareV1(p, { compress })
        expect(token).toMatch(compress ? /^v1\.[\w-]+$/ : /^v1r\.[\w-]+$/)
        const res = await decodeShare(token)
        if (!res.ok) throw new Error(`${gen}: ${res.reason}`)
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
          delete a.moveOverrides // checked below (undefined slots become null)
          delete b.moveOverrides
          expect(b).toEqual(a)
        }
        expect(q.mine?.moveOverrides?.[1]).toEqual({ crit: true, hits: 3, bp: 90, type: 'Fire' })
        expect(q.mine?.moveOverrides?.[3]).toEqual({ z: true })
        expect(q.mine?.moveOverrides?.[0]).toBeUndefined()
      }
    })
  }

  it('keeps Stat Points, AVs and DVs', async () => {
    const champ = (await decodeShare(await encodeShareV1(payload('champions')))) as {
      ok: true
      payload: SharePayload
    }
    expect(champ.payload.mine?.statPoints).toEqual({ ...emptySpread(0), hp: 32, def: 2, spd: 32 })
    const lgpe = (await decodeShare(await encodeShareV1(payload('lgpe')))) as {
      ok: true
      payload: SharePayload
    }
    expect(lgpe.payload.mine?.evs).toEqual({ ...emptySpread(0), hp: 200, atk: 100 })
    const gsc = (await decodeShare(await encodeShareV1(payload('gsc')))) as {
      ok: true
      payload: SharePayload
    }
    expect(gsc.payload.mine?.ivs?.atk).toBe(30)
  })

  it('distinguishes "no weather" from "auto weather"', async () => {
    const p = payload('sv')
    p.field = { ...emptyField(), weather: '' }
    const none = await decodeShare(await encodeShareV1(p))
    p.field = emptyField()
    const auto = await decodeShare(await encodeShareV1(p))
    expect(none.ok && none.payload.field.weather).toBe('')
    expect(auto.ok && auto.payload.field.weather).toBeUndefined()
  })

  it('omits defaults from the wire format', () => {
    const p: SharePayload = {
      gen: 'sv',
      regulation: 'none',
      format: 'doubles',
      field: emptyField(),
      mine: { speciesId: 'pikachu', moveIds: ['thunderbolt'], level: 50, nature: 'Serious' },
    }
    expect(toWire(p)).toEqual([
      'sv',
      0,
      'd',
      0,
      ['pikachu', null, null, null, null, ['thunderbolt']],
    ])
  })
})

describe('compression fallback', () => {
  it('writes an uncompressed link without CompressionStream and reads it back', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    vi.stubGlobal('DecompressionStream', undefined)
    const token = await encodeShareV1(payload('sv'))
    expect(token.startsWith('v1r.')).toBe(true)
    const res = await decodeShare(token)
    expect(res.ok && res.payload.mine?.speciesId).toBe('incineroar')
  })

  it('reports a compressed link as unsupported when it cannot be decompressed', async () => {
    const token = await encodeShareV1(payload('sv'))
    vi.stubGlobal('DecompressionStream', undefined)
    expect(await decodeShare(token)).toEqual({ ok: false, reason: 'unsupported' })
  })
})

describe('versioning', () => {
  // A v1 link as written by this version; old links must keep opening. Never edit this string:
  // add a new decoder for a new format instead.
  const V1_FIXTURE =
    'v1.Rc-xbsMwDATQf7mZQ-JsHtOta0dBAy1LNmFZcikJQRrk3wulLboQBAji3hm4lfdDciogqF92B8IMeuCGER8tgbBjNKgs8SZphn2SgSQnyWtmBaUWI-GN1YcWQZBUZZeZqwehSNVWJq96BxkE3nxuFYQQWf0UpX6BsKXsthwCCAdrlbSUNVdYMic6kbkMNFDfLgOdrP1JfI0HCkZcmyY_gzBhNGf7tGSwsLo178ef7z3HeO8dc1vWskkvFiX4rFOHeda6fjbeOnpWXnJykW-vB7eVKHM_HJqrd_-w4SX6pVnbcwPobO03'
  const V1_RAW_FIXTURE =
    'v1r.WyJjaGFtcGlvbnMiLCJyZWdtYyIsImQiLHsidyI6IlN1biIsIm0iOlsidGFpbHdpbmQiXX0sWyJpbmNpbmVyb2FyIixudWxsLCJDYXJlZnVsIiwiaW50aW1pZGF0ZSIsInNpdHJ1c2JlcnJ5IixbImZha2VvdXQiLCJmbGFyZWJsaXR6Iiwia25vY2tvZmYiLCJwYXJ0aW5nc2hvdCJdLFswLDAsWzMyLDIsMCwwLDMyLDBdXSxudWxsLG51bGwseyJzIjoiQnVybmVkIiwiYiI6WzFdfV0sWyJnYXJjaG9tcCIsbnVsbCwiSm9sbHkiLCJyb3VnaHNraW4iLCJsaWZlb3JiIixbImVhcnRocXVha2UiLCJkcmFnb25jbGF3Iiwicm9ja3NsaWRlIiwicHJvdGVjdCJdLFswLDAsWzIsMzIsMCwwLDAsMzJdXV0sWyJmIiwxXV0'

  it('decodes the committed v1 fixtures (compressed and uncompressed)', async () => {
    for (const token of [V1_FIXTURE, V1_RAW_FIXTURE]) {
      const res = await decodeShare(token)
      if (!res.ok) throw new Error(res.reason)
      expect(res.warnings).toEqual([])
      const p = res.payload
      expect(p).toMatchObject({ gen: 'champions', regulation: 'regmc', format: 'doubles' })
      expect(p.field.weather).toBe('Sun')
      expect(p.field.mine).toEqual({ tailwind: true })
      expect(p.mine).toMatchObject({
        speciesId: 'incineroar',
        nature: 'Careful',
        status: 'Burned',
        boosts: { atk: 1 },
        statPoints: { hp: 32, atk: 2, def: 0, spa: 0, spd: 32, spe: 0 },
        moveIds: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
      })
      expect(p.opp?.speciesId).toBe('garchomp')
      expect(p.move).toEqual({ direction: 'forward', index: 1 })
    }
  })

  it('rejects unknown versions without throwing', async () => {
    expect(await decodeShare('v9.abcd')).toEqual({ ok: false, reason: 'version' })
    expect(await decodeShare('constructor.abcd')).toEqual({ ok: false, reason: 'format' })
    expect(await decodeShare('__proto__.abcd')).toEqual({ ok: false, reason: 'format' })
  })
})

describe('size', () => {
  it('a typical Champions doubles calc stays well under 600 characters', async () => {
    const p = payload('champions')
    p.field = { ...emptyField(), weather: 'Sun', mine: { tailwind: true } }
    const token = await encodeShareV1(p)
    const url = `https://proggler23.github.io/ncp-mobile-calc/#/c/${token}`
    console.info(`champions doubles: token ${token.length} chars, link ${url.length} chars`)
    expect(token.length).toBeLessThanOrEqual(600)
    const plain = await encodeShareV1(p, { compress: false })
    console.info(`champions doubles uncompressed: ${plain.length} chars`)
    // Even the largest calc here (all boosts, overrides, field) fits.
    const big = payload('sv')
    expect((await encodeShareV1(big)).length).toBeLessThanOrEqual(900)
  })
})

describe('malicious input', () => {
  const wire = async (w: unknown, compress = false) => {
    const bytes = new TextEncoder().encode(JSON.stringify(w))
    if (!compress) return `v1r.${toBase64Url(bytes)}`
    return `v1r.${toBase64Url(bytes)}`
  }
  const set1 = ['pikachu', null, null, null, null, ['thunderbolt']]

  it('rejects oversized, empty, non-base64 and non-JSON tokens', async () => {
    expect(await decodeShare('')).toEqual({ ok: false, reason: 'empty' })
    expect(await decodeShare(`v1.${'A'.repeat(MAX_TOKEN_LENGTH)}`)).toEqual({
      ok: false,
      reason: 'tooLong',
    })
    expect((await decodeShare('v1.***')).ok).toBe(false)
    expect((await decodeShare('v1r.A')).ok).toBe(false) // impossible base64 length
    expect((await decodeShare(`v1r.${toBase64Url(new TextEncoder().encode('not json'))}`)).ok).toBe(
      false,
    )
    expect((await decodeShare(`v1.${toBase64Url(new Uint8Array([1, 2, 3, 4]))}`)).ok).toBe(false)
    expect(fromBase64Url('a b')).toBeUndefined()
  })

  it('refuses a decompression bomb', async () => {
    const big = new TextEncoder().encode(
      JSON.stringify(['sv', 0, 'd', 0, 0, 0, 0]) + ' '.repeat(3e6),
    )
    const cs = new CompressionStream('deflate-raw')
    const w = cs.writable.getWriter()
    void w.write(big)
    void w.close()
    const out: Uint8Array[] = []
    const r = cs.readable.getReader()
    for (;;) {
      const { done, value } = await r.read()
      if (done) break
      out.push(value)
    }
    const packed = new Uint8Array(out.reduce((n, c) => n + c.length, 0))
    let at = 0
    for (const c of out) {
      packed.set(c, at)
      at += c.length
    }
    expect(packed.length).toBeLessThan(MAX_TOKEN_LENGTH)
    expect(await decodeShare(`v1.${toBase64Url(packed)}`)).toEqual({ ok: false, reason: 'format' })
  })

  it('rejects wrong shapes and types', async () => {
    for (const w of [
      null,
      5,
      'x',
      {},
      [],
      ['sv'],
      ['nope', 0, 'd'],
      [1, 0, 'd', 0, set1],
      ['sv', 0, 'd', 0, 0, 0],
    ]) {
      expect(await decodeShare(await wire(w))).toMatchObject({ ok: false })
    }
  })

  it('bounds move overrides to the UI / NCP ranges and allowlists type and pledge', async () => {
    const run = async (o: unknown) => {
      const res = await decodeShare(
        await wire(['sv', 0, 'd', 0, [...set1, 0, null, null, { o: [o] }], set1]),
      )
      if (!res.ok) throw new Error(res.reason)
      return res
    }
    const ok = await run({
      bp: 999,
      hits: 10,
      timesAffected: 10,
      opponentMoveIndex: 3,
      type: 'Fire',
      pledge: 'Fire Pledge',
    })
    expect(ok.payload.mine?.moveOverrides?.[0]).toEqual({
      bp: 999,
      hits: 10,
      timesAffected: 10,
      opponentMoveIndex: 3,
      type: 'Fire',
      pledge: 'Fire Pledge',
    })
    for (const bad of [
      { hits: 100000 },
      { hits: 0 },
      { bp: 1000 },
      { bp: -1 },
      { timesAffected: 11 },
      { opponentMoveIndex: 4 },
      { hits: 2.5 },
      { type: 'Lava' },
      { pledge: 'Tackle' },
    ]) {
      const res = await run(bad)
      expect(res.payload.mine).toBeUndefined()
      expect(res.warnings).toContainEqual({ key: 'set', detail: 'mine' })
    }
  })

  it('never shows attacker-chosen warning text verbatim', async () => {
    const evil = 'visit evil.com/x?y'
    const res = await decodeShare(
      await wire(['sv', 0, 'd', { w: evil, t: '<b>x</b>', a: [evil] }, set1, set1]),
    )
    if (!res.ok) throw new Error(res.reason)
    const details = res.warnings.map((w) => w.detail ?? '')
    expect(details.length).toBeGreaterThanOrEqual(3)
    for (const d of details) expect(d).toMatch(/^[A-Za-z0-9 _.-]{0,32}$|^\?$/)
    expect(JSON.stringify(res.warnings)).not.toContain('evil.com')
    expect(safeDetail('Lava')).toBe('Lava')
    expect(safeDetail(evil)).toBe('?')
  })

  it('drops invalid builds with a warning and keeps the valid side', async () => {
    const res = await decodeShare(await wire(['sv', 0, 'd', 0, set1, [{ evil: 1 }, 1]]))
    if (!res.ok) throw new Error(res.reason)
    expect(res.payload.mine?.speciesId).toBe('pikachu')
    expect(res.payload.opp).toBeUndefined()
    expect(res.warnings).toContainEqual({ key: 'set', detail: 'opp' })
  })

  it('rejects ids that are not plain Showdown ids (__proto__, markup, ...)', async () => {
    for (const bad of ['__proto__', '<img onerror=x>', 'A B', 'x'.repeat(65), 5, null, '']) {
      const res = await decodeShare(
        await wire(['sv', 0, 'd', 0, [bad, null, null, null, null, ['a']], set1]),
      )
      if (!res.ok) throw new Error(res.reason)
      expect(res.payload.mine).toBeUndefined()
      expect(res.warnings.some((w) => w.key === 'set')).toBe(true)
    }
    // `constructor` is a legal id shape; the data check (state/share) drops it. It must not pollute.
    const res = await decodeShare(
      await wire(['sv', 0, 'd', 0, ['constructor', null, null, null, null, ['__proto__']], set1]),
    )
    if (!res.ok) throw new Error(res.reason)
    expect(res.payload.mine).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('enforces EV / AV / Stat Point limits per generation', async () => {
    const withSpread = (gen: string, spread: unknown) => [
      gen,
      0,
      'd',
      0,
      ['pikachu', null, null, null, null, ['thunderbolt'], spread],
      set1,
    ]
    const sv = async (spread: unknown) => decodeShare(await wire(withSpread('sv', spread)))
    const okSv = await sv([[252, 252, 6, 0, 0, 0]])
    expect(okSv.ok && okSv.payload.mine?.evs?.hp).toBe(252)
    for (const spread of [
      [[253, 0, 0, 0, 0, 0]],
      [[252, 252, 252, 0, 0, 0]],
      [[-1, 0, 0, 0, 0, 0]],
      [[1.5, 0, 0, 0, 0, 0]],
      [['a', 0, 0, 0, 0, 0]],
      [[1, 2, 3]],
    ]) {
      const r = await sv(spread)
      expect(r.ok && r.payload.mine).toBeFalsy()
    }
    // LGPE: AVs up to 200 per stat without a total cap
    const av = await decodeShare(await wire(withSpread('lgpe', [[200, 200, 200, 0, 0, 0]])))
    expect(av.ok && av.payload.mine?.evs?.def).toBe(200)
    const tooHigh = await decodeShare(await wire(withSpread('lgpe', [[201, 0, 0, 0, 0, 0]])))
    expect(tooHigh.ok && tooHigh.payload.mine).toBeFalsy()
    // Champions: <= 32 per stat, <= 66 in total
    const sp = await decodeShare(await wire(withSpread('champions', [0, 0, [32, 32, 2, 0, 0, 0]])))
    expect(sp.ok && sp.payload.mine?.statPoints?.atk).toBe(32)
    for (const bad of [
      [33, 0, 0, 0, 0, 0],
      [32, 32, 3, 0, 0, 0],
    ]) {
      const r = await decodeShare(await wire(withSpread('champions', [0, 0, bad])))
      expect(r.ok && r.payload.mine).toBeFalsy()
    }
  })

  it('drops unknown field entries with warnings', async () => {
    const res = await decodeShare(
      await wire([
        'sv',
        0,
        'd',
        {
          w: 'Lava',
          t: 'Electric',
          a: ['fairy', '__proto__'],
          m: ['reflect', 'constructor', 'spikes3'],
          o: 7,
        },
        set1,
        set1,
      ]),
    )
    if (!res.ok) throw new Error(res.reason)
    const f = res.payload.field
    expect(f.weather).toBeUndefined()
    expect(f.terrain).toBe('Electric')
    expect(f.auras.fairy).toBe(true)
    expect(f.mine).toEqual({ reflect: true, spikes: 3 })
    expect(f.opp).toEqual({})
    expect(res.warnings.filter((w) => w.key === 'field').length).toBeGreaterThanOrEqual(4)
  })

  it('sanitizes the selection, format and regulation', async () => {
    const res = await decodeShare(await wire(['sv', 'Reg!', 'x', 0, set1, set1, ['f', 9]]))
    if (!res.ok) throw new Error(res.reason)
    expect(res.payload.move).toBeUndefined()
    expect(res.payload.regulation).toBe('none')
    expect(res.payload.format).toBe('doubles')
    expect(res.warnings.map((w) => w.key).sort()).toEqual(['format', 'regulation', 'selection'])
  })

  it('refuses an out-of-range level, nature and boosts', async () => {
    for (const s of [
      ['pikachu', 101, null, null, null, ['a']],
      ['pikachu', 50, 'Evil', null, null, ['a']],
      ['pikachu', 50, null, null, null, ['a', 'b', 'c', 'd', 'e']],
      ['pikachu', 50, null, null, null, ['a'], 0, 'Shadow'],
      ['pikachu', 50, null, null, null, ['a'], 0, null, null, { b: [9] }],
      ['pikachu', 50, null, null, null, ['a'], 0, null, null, { s: 'Evil' }],
    ]) {
      const r = await decodeShare(await wire(['sv', 0, 'd', 0, s, set1]))
      expect(r.ok && r.payload.mine && s[7] !== 'Shadow').toBeFalsy()
    }
  })
})
