// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { lookupDe, mergeNames, nameKey, speciesDe, tableFromCsv } from './names'
import type { NamesFile } from './names'

const snapshot: NamesFile = {
  meta: { source: 'test', date: '2026-01-02' },
  species: { charizard: 'Glurak', garchomp: 'Garados' },
  moves: { hiddenpower: 'Kraftreserve', tackle: 'Tackle', protect: 'Schutzschild' },
  abilities: { asone: 'Einssein', levitate: 'Schwebe' },
  items: { leek: 'Lauchstange', stick: 'Lauchstange', leftovers: 'Überreste' },
}

describe('names snapshot + overrides merge', () => {
  it('uses the snapshot and records its date', () => {
    const t = mergeNames(snapshot)
    expect(t.snapshotDate).toBe('2026-01-02')
    expect(lookupDe(t, 'species', 'Charizard')).toEqual({ de: 'Glurak', how: 'native' })
  })
  it('lets overrides win over the snapshot', () => {
    const t = mergeNames(snapshot, {
      species: { charizard: 'Feuerdrache' },
      items: { stick: 'Stab' },
    })
    expect(lookupDe(t, 'species', 'Charizard')).toEqual({ de: 'Feuerdrache', how: 'override' })
    expect(lookupDe(t, 'items', 'Stick')).toEqual({ de: 'Stab', how: 'override' })
    expect(lookupDe(t, 'species', 'Garchomp').how).toBe('native')
  })
  it('adds names for entities missing from the snapshot via overrides', () => {
    const t = mergeNames(snapshot, { moves: { newmove: 'Neuer Angriff' } })
    expect(lookupDe(t, 'moves', 'New Move')).toEqual({ de: 'Neuer Angriff', how: 'override' })
  })
  it('falls back to English for unknown entities (reported as fallback)', () => {
    const t = mergeNames(snapshot)
    expect(lookupDe(t, 'moves', 'Brand New Move')).toEqual({
      de: 'Brand New Move',
      how: 'fallback',
    })
  })
  it('derives typed Hidden Power, parenthesised abilities and formes', () => {
    const t = mergeNames(snapshot)
    expect(lookupDe(t, 'moves', 'Hidden Power Fire')).toEqual({
      de: 'Kraftreserve (Fire)',
      how: 'derived',
    })
    expect(lookupDe(t, 'abilities', 'As One (Glastrier)')).toEqual({
      de: 'Einssein',
      how: 'derived',
    })
    expect(speciesDe(t, 'Charizard-Mega-X', 'Charizard', 'Mega-X').de).toBe('Mega-Glurak X')
  })
  it('tolerates a snapshot without some kinds and absent overrides', () => {
    const t = mergeNames({ species: {}, moves: {}, abilities: {}, items: {} })
    expect(t.snapshotDate).toBe('')
    expect(lookupDe(t, 'items', 'Leftovers').how).toBe('fallback')
  })
})

describe('PokeAPI CSV -> table (used only by --update-names)', () => {
  const csv = [
    'item_id,local_language_id,name',
    '1,9,Leek',
    '1,6,Lauchstange',
    '2,9,Poké Ball',
    '2,6,Pokéball',
    '3,9,Nothing German',
  ].join('\n')
  it('joins English and German names on the normalized key', () => {
    const t = tableFromCsv(csv)
    expect(t.get('leek')).toBe('Lauchstange')
    expect(t.get('pokeball')).toBe('Pokéball')
    expect(t.has('nothinggerman')).toBe(false)
  })
  it('applies aliases (Showdown "Stick" is PokeAPI "Leek")', () => {
    expect(tableFromCsv(csv, { stick: 'leek' }).get('stick')).toBe('Lauchstange')
  })
  it('normalizes gender symbols', () => {
    expect(nameKey('Nidoran♀')).toBe('nidoranf')
  })
})
