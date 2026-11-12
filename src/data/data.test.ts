import { describe, expect, it } from 'vitest'
import { canLearn, GEN_IDS, loadGenData, loadSets, normalizeSearch, searchSpecies } from './index'
import type { GenData } from './index'

describe('normalizeSearch', () => {
  it('strips diacritics, case, and punctuation', () => {
    expect(normalizeSearch('Pokémon')).toBe('pokemon')
    expect(normalizeSearch('Flabébé')).toBe('flabebe')
    expect(normalizeSearch('Kapu-Riki')).toBe('kapuriki')
    expect(normalizeSearch("Farfetch'd")).toBe('farfetchd')
    expect(normalizeSearch('Mr. Mime')).toBe('mrmime')
  })
  it('handles German umlauts and eszett', () => {
    expect(normalizeSearch('Größe')).toBe('grosse')
    expect(normalizeSearch('Fiaro Überkraft')).toBe('fiarouberkraft')
    expect(normalizeSearch('Straußeck')).toBe('strausseck')
  })
})

describe('generated data', () => {
  it('loads every gen with consistent structure', async () => {
    for (const gen of GEN_IDS) {
      const data = await loadGenData(gen)
      expect(data.meta.gen).toBe(gen)
      expect(data.species.length).toBeGreaterThan(100)
      expect(data.search.species).toHaveLength(data.species.length)
      const s = data.species[0]!
      expect(s.id).toMatch(/^[a-z0-9]+$/)
      expect(s.en).toBeTruthy()
      expect(s.de).toBeTruthy()
      expect(s.bs).toHaveLength(6)
      const sets = await data.loadSets()
      expect(typeof sets).toBe('object')
    }
  }, 30000)

  it('rejects unknown gens', async () => {
    await expect(loadGenData('nope' as never)).rejects.toThrow()
  })
})

describe('search', () => {
  let sv: GenData
  beforeAll(async () => {
    sv = await loadGenData('sv')
  })

  const first = (q: string, lang?: 'en' | 'de') => searchSpecies(sv, q, lang)[0]?.id

  it('finds Charizard by German and English name', () => {
    expect(first('glurak')).toBe('charizard')
    expect(first('charizard')).toBe('charizard')
    expect(first('glurak', 'en')).not.toBe('charizard')
  })
  it('finds Flutter Mane (Sand-Man) style and accented names', () => {
    expect(first('flabebe')).toBe('flabebe')
    expect(first('Flabébé')).toBe('flabebe')
  })
  it('finds DE/EN names of Talonflame and Tapu Koko', () => {
    expect(first('Fiaro')).toBe('talonflame')
    expect(first('Talonflame')).toBe('talonflame')
  })
  it('finds Tapu Koko by German and English name (sm; not in sv)', async () => {
    const sm = await loadGenData('sm')
    expect(searchSpecies(sm, 'Kapu-Riki')[0]?.id).toBe('tapukoko')
    expect(searchSpecies(sm, 'Tapu Koko')[0]?.id).toBe('tapukoko')
  })
  it('ranks prefix matches before substring matches', async () => {
    const sm = await loadGenData('sm')
    const hits = searchSpecies(sm, 'koko')
    const ranks = hits.map((h) => h.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(hits.some((h) => h.id === 'tapukoko' && h.rank === 2)).toBe(true)
    const chi = searchSpecies(sv, 'chi')
    expect(chi[0]?.rank).toBe(1)
  })
  it('returns nothing for empty queries', () => {
    expect(searchSpecies(sv, '   ')).toEqual([])
  })
})

describe('learnsets', () => {
  it('Incineroar learns Fake Out in sv, but not Surf', async () => {
    const sv = await loadGenData('sv')
    expect(canLearn(sv, 'incineroar', 'fakeout')).toBe(true)
    expect(canLearn(sv, 'incineroar', 'surf')).toBe(false)
    const list = sv.learnsets.incineroar!
    expect(list).toEqual([...list].sort())
  })
  it('includes moves inherited from prevolutions', async () => {
    const sv = await loadGenData('sv')
    expect(canLearn(sv, 'incineroar', 'ember')).toBe(true) // Litten line
  })
})

describe('common sets', () => {
  it('has structured sets with at most 3 entries', async () => {
    const sets = await loadSets('sv')
    const inc = sets.incineroar
    expect(inc?.length).toBeGreaterThan(0)
    expect(inc!.length).toBeLessThanOrEqual(3)
    for (const set of inc!) {
      expect(set.moves.length).toBeLessThanOrEqual(4)
      expect(Object.keys(set.evs).sort()).toEqual(['atk', 'def', 'hp', 'spa', 'spd', 'spe'])
      expect(set.usagePct).toBeGreaterThan(0)
      expect(set.format).toMatch(/^gen9vgc/)
      expect(set.month).toMatch(/^\d{4}-\d{2}$/)
      expect(Object.keys(set)).not.toContain('description')
    }
  })
  it('champions sets use Stat Points (max 32 each, 66 total)', async () => {
    const data = await loadGenData('champions')
    expect(data.meta.statPoints).toBe(true)
    const sets = await loadSets('champions')
    for (const list of Object.values(sets)) {
      for (const s of list) {
        const vals = Object.values(s.evs)
        expect(Math.max(...vals)).toBeLessThanOrEqual(32)
        expect(vals.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(66)
      }
    }
  })
  it('gens without VGC usage data have empty sets', async () => {
    expect(await loadSets('rby')).toEqual({})
    expect(await loadSets('lgpe')).toEqual({})
  })
})
