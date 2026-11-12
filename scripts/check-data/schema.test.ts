// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { countsOf, validateGen, VersionSchema } from './schema'

const G = path.resolve(import.meta.dirname, '../../src/data/generated')
const loadReg = (gen: string) =>
  JSON.parse(readFileSync(path.join(G, gen, 'regulations.json'), 'utf8'))
const load = (gen: string) => ({
  dex: JSON.parse(readFileSync(path.join(G, gen, 'dex.json'), 'utf8')),
  learnsets: JSON.parse(readFileSync(path.join(G, gen, 'learnsets.json'), 'utf8')),
  sets: JSON.parse(readFileSync(path.join(G, gen, 'sets.json'), 'utf8')),
})

describe('generated data schema', () => {
  it('accepts the committed champions and sv data', () => {
    for (const gen of ['champions', 'sv']) expect(validateGen(gen, load(gen)).errors).toEqual([])
  })
  it('accepts version.json', () => {
    const v = JSON.parse(readFileSync(path.join(G, 'version.json'), 'utf8'))
    expect(VersionSchema.safeParse(v).success).toBe(true)
  })
  it('rejects structural damage', () => {
    const f = load('champions')
    f.dex.species[0].bs = [1, 2, 3]
    expect(validateGen('champions', f).errors.join()).toContain('dex.json')
  })
  it('detects dangling references', () => {
    const f = load('champions')
    const sid = Object.keys(f.learnsets)[0]!
    f.learnsets[sid].push('notamove')
    expect(validateGen('champions', f).errors.join()).toContain('dangling')
  })
  it('detects a gen/folder mismatch', () => {
    expect(validateGen('sv', load('champions')).errors.join()).toContain('meta.gen')
  })
  it('accepts every committed generation (known quirks are warnings only)', () => {
    for (const gen of [
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
    ])
      expect(validateGen(gen, load(gen)).errors, gen).toEqual([])
  })
  it('validates regulations.json against the dex of its generation', () => {
    for (const gen of ['champions', 'sv'])
      expect(validateGen(gen, { ...load(gen), regulations: loadReg(gen) }).errors, gen).toEqual([])
  })
  it('rejects broken regulations (dangling ids, reserved id, two defaults)', () => {
    const f = { ...load('champions'), regulations: loadReg('champions') }
    f.regulations.regulations[0].species.push('notaspecies')
    f.regulations.regulations[1].default = true
    f.regulations.regulations[2].id = 'none'
    const errors = validateGen('champions', f).errors.join('\n')
    expect(errors).toContain('not in the dex')
    expect(errors).toContain('exactly one regulation')
    expect(errors).toContain('reserved')
  })
  it('requires manual regulations to say whether they are verified', () => {
    const f = { ...load('champions'), regulations: loadReg('champions') }
    delete f.regulations.regulations[0].verified
    expect(validateGen('champions', f).errors.join()).toContain('verified')
  })
  it('counts entities', () => {
    const c = countsOf(load('champions'))
    expect(c.species).toBeGreaterThan(300)
    expect(c.sets).toBeGreaterThan(100)
  })
})
