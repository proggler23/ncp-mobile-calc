// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RegulationsFile } from '../../src/data/types'
import { GENS } from './config'
import { loadRawGen } from './dex-sources'
import type { RawGen } from './dex-sources'
import {
  applyManual,
  buildRegulations,
  deriveFromShowdown,
  loadManual,
  manualExtras,
  parseManual,
} from './regulations'
import type { ManualFile } from './regulations'

const cfg = (id: string) => GENS.find((g) => g.id === id)!
const G = path.resolve(import.meta.dirname, '../../src/data/generated')
const committed = (gen: string) =>
  JSON.parse(readFileSync(path.join(G, gen, 'regulations.json'), 'utf8')) as RegulationsFile

const known = (species: string[], items: string[], moves: string[]) => ({
  species: new Set(species),
  items: new Set(items),
  moves: new Set(moves),
})

/** A tiny RawGen: only the id lists matter for the derivation. */
const fakeRaw = (species: string[], items: string[], moves: string[]): RawGen =>
  ({
    species: species.map((id) => ({ id })),
    items: items.map((id) => ({ id })),
    moves: moves.map((id) => ({ id })),
  }) as unknown as RawGen

describe('deriveFromShowdown (champions)', () => {
  // The champions mod dex is what the real build starts from.
  it('keeps Megas, drops Restricted Legendaries / Mythicals and non-standard items', async () => {
    const raw = await loadRawGen(cfg('champions'))
    const d = deriveFromShowdown('[Gen 9 Champions] VGC 2026 Reg M-B', raw)
    expect(d.species).toContain('charizardmegax')
    expect(d.species).toContain('incineroar')
    expect(d.species).not.toContain('koraidon')
    expect(d.species).not.toContain('mew')
    expect(d.items).toContain('charizarditex')
    expect(d.items).toContain('sitrusberry')
    expect(d.items).not.toContain('rockyhelmet') // not in Reg M-B (added by M-C)
    expect(d.items).not.toContain('choiceband')
    expect(d.items).toHaveLength(148)
    expect(d.species.length).toBeGreaterThan(300)
  })

  it('Reg M-A is a strict subset of Reg M-B (own Showdown mod)', async () => {
    const raw = await loadRawGen(cfg('champions'))
    const a = deriveFromShowdown('[Gen 9 Champions] VGC 2026 Reg M-A', raw)
    const b = deriveFromShowdown('[Gen 9 Champions] VGC 2026 Reg M-B', raw)
    expect(a.species.length).toBeLessThan(b.species.length)
    const bs = new Set(b.species)
    expect(a.species.filter((s) => !bs.has(s))).toEqual([])
    const bi = new Set(b.items)
    expect(a.items.filter((s) => !bi.has(s))).toEqual([])
  })

  it('rejects an unknown format', () => {
    expect(() => deriveFromShowdown('[Gen 9] No Such Format', fakeRaw([], [], []))).toThrow(
      /does not exist/,
    )
  })

  it('sv: Reg I allows restricted legends (limit is team-level) but not Mythicals; Reg C is smaller', async () => {
    const raw = await loadRawGen(cfg('sv'))
    const i = deriveFromShowdown('[Gen 9] VGC 2025 Reg I', raw)
    const c = deriveFromShowdown('[Gen 9] VGC 2023 Reg C', raw)
    expect(i.species).toContain('koraidon')
    expect(i.species).not.toContain('mew')
    expect(c.species).not.toContain('koraidon') // Paldea Pokedex only
    expect(c.species.length).toBeLessThan(i.species.length)
  })
})

describe('manual regulations', () => {
  const k = known(['a', 'b', 'c'], ['x', 'y'], ['m1', 'm2', 'm3'])
  const base = { species: ['a', 'b'], items: ['x'], moves: ['m1', 'm2'] }
  const man = { verified: true, source: 'test' }

  it('adds and removes relative to the base', () => {
    const r = applyManual(
      base,
      { ...man, addSpecies: ['c'], removeSpecies: ['a'], addItems: ['y'], addMoves: ['m3'] },
      k,
      't',
    )
    expect(r).toEqual({ species: ['b', 'c'], items: ['x', 'y'], moves: ['m1', 'm2', 'm3'] })
  })
  it('a full list replaces the base list', () => {
    expect(applyManual(base, { ...man, species: ['c'] }, k, 't').species).toEqual(['c'])
  })
  it('without a base every move is allowed unless listed', () => {
    const r = applyManual(undefined, { ...man, species: ['a'], items: ['x'] }, k, 't')
    expect(r.moves).toEqual(['m1', 'm2', 'm3'])
  })
  it('rejects ids that are not in the dex', () => {
    expect(() => applyManual(base, { ...man, addSpecies: ['zzz'] }, k, 't')).toThrow(
      /not in the dex/,
    )
  })

  const configs = [
    { id: 'one', label: { en: 'One', de: 'Eins' }, format: '[Gen 9 Champions] VGC 2026 Reg M-B' },
    { id: 'two', label: { en: 'Two', de: 'Zwei' }, default: true },
  ]
  const raw = fakeRaw(
    ['incineroar', 'salamence'],
    ['sitrusberry', 'rockyhelmet'],
    ['protect', 'slash'],
  )
  const manual = (m: Record<string, unknown>): ManualFile => ({
    gens: { champions: { two: { ...man, ...m } as never } },
  })

  it('buildRegulations merges a manual regulation on top of a derived base', () => {
    const r = buildRegulations(
      'champions',
      configs,
      raw,
      manual({ base: 'one', addSpecies: ['salamence'], addItems: ['rockyhelmet'] }),
    )!
    const [one, two] = r.file.regulations
    expect(one).toMatchObject({ id: 'one', source: 'showdown', species: ['incineroar'] })
    expect(one!.items).toEqual(['sitrusberry'])
    expect(two).toMatchObject({ id: 'two', source: 'manual', verified: true, default: true })
    expect(two!.species).toEqual(['incineroar', 'salamence'])
    expect(two!.items).toEqual(['rockyhelmet', 'sitrusberry'])
  })
  it('emits moves only when the pool is restricted and carries learnset deltas', () => {
    const r = buildRegulations(
      'champions',
      configs,
      raw,
      manual({ base: 'one', addMoves: ['slash'], learnsets: { add: { incineroar: ['slash'] } } }),
    )!
    const [one, two] = r.file.regulations
    expect(two!.moves).toBeUndefined() // every dex move is allowed again
    expect(one!.moves).toEqual(['protect']) // Showdown: slash is not legal in Reg M-B
    expect(two!.learnsets).toEqual({ add: { incineroar: ['slash'] } })
  })
  it('requires exactly one default and a known base / config entry', () => {
    expect(() =>
      buildRegulations(
        'champions',
        configs.map((c) => ({ ...c, default: false })),
        raw,
        { gens: {} },
      ),
    ).toThrow(/default/)
    expect(() => buildRegulations('champions', configs, raw, manual({ base: 'nope' }))).toThrow(
      /unknown base/,
    )
    expect(() =>
      buildRegulations('champions', configs.slice(0, 1), raw, {
        gens: { champions: { ghost: { ...man, species: ['incineroar'] } } },
      }),
    ).toThrow(/not listed in config/)
  })
  it('a regulation without Showdown format needs a manual entry', () => {
    expect(() => buildRegulations('champions', configs, raw, { gens: {} })).toThrow(
      /no Showdown format/,
    )
  })
  it('flags unverified manual regulations in the notes', () => {
    const r = buildRegulations('champions', configs, raw, manual({ base: 'one', verified: false }))!
    expect(r.notes.join()).toContain('NOT verified')
    expect(r.file.regulations[1]!.verified).toBe(false)
  })

  it('parseManual validates the schema', () => {
    expect(() => parseManual({})).toThrow(/gens/)
    expect(() => parseManual({ gens: { champions: { regx: { source: 's' } } } })).toThrow(
      /verified/,
    )
    expect(() =>
      parseManual({ gens: { champions: { regx: { ...man, addSpecies: ['Bad Id'] } } } }),
    ).toThrow(/array of ids/)
    expect(parseManual({ gens: { _c: {}, champions: { _doc: 'x', regx: man } } }).gens).toEqual({
      champions: { regx: man },
    })
  })

  it('manualExtras collects entities needed by manual regulations', () => {
    const e = manualExtras(
      manual({
        addSpecies: ['salamence'],
        addItems: ['rockyhelmet'],
        addMoves: ['slash'],
        learnsets: { add: { a: ['courtchange'] } },
      }),
      'champions',
    )
    expect(e).toEqual({
      species: ['salamence'],
      items: ['rockyhelmet'],
      moves: ['slash', 'courtchange'],
    })
  })
})

describe('committed manual.json / regulations.json', () => {
  it('Reg M-C is Reg M-B plus documented additions (verified, manual source)', async () => {
    const manual = await loadManual()
    const mc = manual.gens.champions?.regmc
    expect(mc).toMatchObject({ base: 'regmb', verified: true })
    expect(mc!.source).toContain('965a535')
    const f = committed('champions')
    const [c, b, a] = f.regulations
    expect([c!.id, b!.id, a!.id]).toEqual(['regmc', 'regmb', 'regma'])
    expect(c).toMatchObject({ source: 'manual', default: true })
    expect(b).toMatchObject({ source: 'showdown' })
    const bs = new Set(b!.species)
    expect(b!.species.every((s) => c!.species.includes(s))).toBe(true) // nothing removed
    expect(c!.species.filter((s) => !bs.has(s))).toHaveLength(mc!.addSpecies!.length)
    expect(c!.items).toHaveLength(b!.items.length + mc!.addItems!.length)
    expect(c!.items).toContain('rockyhelmet')
    expect(b!.items).not.toContain('rockyhelmet')
    expect(f.regulations.filter((r) => r.default)).toHaveLength(1)
  })
  it('config and committed files agree on the regulation ids and default', () => {
    for (const g of GENS.filter((x) => x.regulations)) {
      const f = committed(g.id)
      expect(f.regulations.map((r) => r.id)).toEqual(g.regulations!.map((r) => r.id))
      expect(f.regulations.find((r) => r.default)!.id).toBe(
        g.regulations!.find((r) => r.default)!.id,
      )
    }
  })
  it('the committed build is reproducible from Showdown + manual.json', async () => {
    const manual = await loadManual()
    const raw = await loadRawGen(cfg('champions'), manualExtras(manual, 'champions'))
    const built = buildRegulations('champions', cfg('champions').regulations, raw, manual)!
    expect(built.file).toEqual(committed('champions'))
  })
})
