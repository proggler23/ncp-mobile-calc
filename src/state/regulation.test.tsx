import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { PokemonEditor } from '../features/editor/PokemonEditor'
import type { DataGenId, SavedSetLike } from '../bridge/types'
import { NO_REGULATION } from '../data/types'
import type { SavedSet } from '../storage/types'
import { emptySpread, getRepository } from '../storage'
import { resetAll } from '../test-utils'
import { initApp, resetStore, setGen, setRegulation, store } from './app'
import { abilityItems, itemItems, moveItems, speciesItems } from './catalog'
import { getLib, prepareLib } from './lib'
import { buildProblemsOf, regulationChoices, teamRegulation } from './regulation'
import { blankSet, legalAbilities } from './sets'
import { createTeam, importPasteAsTeam } from './teams'

beforeAll(async () => {
  await prepareLib('sv')
  await prepareLib('champions')
})
afterEach(cleanup)

const regs = (gen: DataGenId) => getLib().bridge.regulationsOf(gen)
const ids = (items: { id: string }[]) => new Set(items.map((i) => i.id))

/** Species ids of the generation that the engine has a distinct entity for. */
function engineSpecies(gen: DataGenId) {
  return ids(getLib().bridge.engineSpeciesList(gen))
}

describe('regulation lists of the pickers', () => {
  it('champions: items == legal items, species == legal species the engine can calculate', () => {
    const engine = engineSpecies('champions')
    const unfiltered = speciesItems('champions', 'en', NO_REGULATION)
    expect(regs('champions').map((r) => r.id)).toEqual(['regmc', 'regmb', 'regma'])
    for (const r of regs('champions')) {
      expect(itemItems('champions', 'en', r.id), r.id).toHaveLength(r.items.length)
      const species = speciesItems('champions', 'en', r.id)
      const expected = r.species.filter((s) => engine.has(s))
      expect(species, r.id).toHaveLength(expected.length)
      expect([...ids(species)].sort()).toEqual([...expected].sort())
      // everything the engine knows but is not legal is gone
      expect(species.length).toBeLessThan(unfiltered.length / 2)
      // legal species the engine cannot pick are only battle-only / cosmetic formes
      const missing = r.species.filter((x) => !engine.has(x))
      expect(missing.length, r.id).toBeLessThan(25)
      expect(missing.filter((x) => ['incineroar', 'garchomp', 'salamence'].includes(x))).toEqual([])
    }
    // the known numbers of the committed data (update when a regulation changes)
    expect(regs('champions').map((r) => itemItems('champions', 'en', r.id).length)).toEqual([
      166, 148, 117,
    ])
  })

  it('"No filter" keeps the previous behaviour: everything the engine knows incl. natDex', () => {
    expect(speciesItems('champions', 'en', NO_REGULATION).length).toBeGreaterThan(1000)
    expect(itemItems('champions', 'en', NO_REGULATION).length).toBeGreaterThan(300)
    expect(ids(speciesItems('champions', 'en', NO_REGULATION)).has('koraidon')).toBe(true)
    expect(ids(itemItems('champions', 'en', NO_REGULATION)).has('choiceband')).toBe(true)
    // an unknown regulation id behaves like "No filter" (the app resolves ids before)
    expect(speciesItems('champions', 'en', 'doesnotexist')).toHaveLength(
      speciesItems('champions', 'en').length,
    )
  })

  it('champions: restricted legendaries and Mythicals are never legal; Reg M-C adds Pokémon and items', () => {
    for (const r of ['regmc', 'regmb', 'regma']) {
      const sp = ids(speciesItems('champions', 'en', r))
      expect(sp.has('koraidon'), r).toBe(false)
      expect(sp.has('miraidon'), r).toBe(false)
      expect(sp.has('mew'), r).toBe(false)
      expect(sp.has('incineroar'), r).toBe(true)
      expect(sp.has('charizardmegax'), r).toBe(true)
    }
    const mc = ids(speciesItems('champions', 'en', 'regmc'))
    const mb = ids(speciesItems('champions', 'en', 'regmb'))
    expect(mc.has('salamence') && !mb.has('salamence')).toBe(true)
    expect(mc.has('salamencemega') && !mb.has('salamencemega')).toBe(true)
    expect(ids(itemItems('champions', 'en', 'regmc')).has('rockyhelmet')).toBe(true)
    expect(ids(itemItems('champions', 'en', 'regmb')).has('rockyhelmet')).toBe(false)
    for (const r of ['regmc', 'regmb', 'regma']) {
      expect(ids(itemItems('champions', 'en', r)).has('choiceband'), r).toBe(false)
      expect(ids(itemItems('champions', 'en', r)).has('sitrusberry'), r).toBe(true)
    }
  })

  it('sv: Reg I allows Restricted Legendaries (a team-level limit) but not Mythicals', () => {
    expect(regs('sv').map((r) => r.id)).toEqual(['regi', 'regg', 'regd', 'regc'])
    expect(regs('sv').find((r) => r.default)?.id).toBe('regi')
    const sp = ids(speciesItems('sv', 'en', 'regi'))
    expect(sp.has('koraidon')).toBe(true)
    expect(sp.has('mew')).toBe(false)
    expect(speciesItems('sv', 'en', 'regc').length).toBeLessThan(sp.size)
    expect(ids(speciesItems('sv', 'en', 'regc')).has('koraidon')).toBe(false)
  })

  it('moves are the learnset intersected with the regulation (incl. learnset changes)', () => {
    const moves = (sp: string, reg: string) =>
      new Set(moveItems('champions', sp, 'en', reg).items.map((m) => m.id))
    // Reg M-C: Slash is legal and learnable by Charizard; Reg M-B has no Slash at all
    expect(moves('charizard', 'regmc').has('slash')).toBe(true)
    expect(moves('charizard', 'regmb').has('slash')).toBe(false)
    expect(moves('charizard', NO_REGULATION).has('slash')).toBe(true)
    // Reg M-C removed Metal Burst / Mirror Coat from Archaludon
    expect(moves('archaludon', 'regmb').has('metalburst')).toBe(true)
    expect(moves('archaludon', 'regmc').has('metalburst')).toBe(false)
    // every offered move is in the regulation's move pool when the regulation has one
    const mb = new Set(regs('champions').find((r) => r.id === 'regmb')!.moves)
    expect(mb.size).toBeGreaterThan(0)
    for (const m of moves('garchomp', 'regmb')) expect(mb.has(m)).toBe(true)
    expect(moveItems('champions', 'garchomp', 'en', 'regmb').reliable).toBe(true)
  })
})

describe('abilities are strictly the species own', () => {
  it('lists only the species abilities (no full-pool fallback)', () => {
    expect(legalAbilities('champions', 'incineroar').sort()).toEqual(['blaze', 'intimidate'])
    const list = abilityItems('champions', 'en', legalAbilities('champions', 'incineroar'))
    expect(list.map((a) => a.id).sort()).toEqual(['blaze', 'intimidate'])
  })
  it('a species without ability data has none and the picker lists nothing', () => {
    const b = getLib().bridge.getBridge('champions')
    const known = new Set(b.data.species.map((s) => s.id))
    const noData = getLib()
      .bridge.engineSpeciesList('champions')
      .find((s) => !known.has(s.id))!
    expect(noData).toBeTruthy()
    expect(legalAbilities('champions', noData.id)).toEqual([])
    expect(abilityItems('champions', 'en', [])).toEqual([])
  })
  it('the editor shows the calculator default instead of a searchable pool', () => {
    const b = getLib().bridge.getBridge('champions')
    const known = new Set(b.data.species.map((s) => s.id))
    const noData = getLib()
      .bridge.engineSpeciesList('champions')
      .find((s) => !known.has(s.id))!
    const set: SavedSetLike = { speciesId: noData.id, moveIds: [] }
    render(
      <PokemonEditor gen="champions" value={set} onChange={() => {}} regulation={NO_REGULATION} />,
    )
    expect(screen.getByText('Default (from the calculator data)')).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Ability/ })).toBeNull()
    cleanup()
    render(
      <PokemonEditor
        gen="champions"
        value={blankSet('champions', 'incineroar')}
        onChange={() => {}}
        regulation="regmc"
      />,
    )
    expect(screen.getByRole('button', { name: /^Ability/ })).toBeVisible()
  })
})

describe('illegal builds are flagged, never dropped', () => {
  const member = (speciesId: string, over: Partial<SavedSet> = {}): SavedSet => ({
    uid: `m${speciesId}`,
    gen: 'champions',
    speciesId,
    level: 50,
    nature: 'Serious',
    moveIds: ['protect'],
    evs: emptySpread(0),
    ivs: emptySpread(31),
    statPoints: emptySpread(0),
    ...over,
  })
  it('buildProblemsOf names the illegal parts', () => {
    expect(buildProblemsOf('champions', 'regmc', member('incineroar'))).toBeUndefined()
    expect(buildProblemsOf('champions', 'regmb', member('salamence'))).toMatchObject({
      species: true,
    })
    expect(
      buildProblemsOf('champions', 'regmb', member('incineroar', { itemId: 'rockyhelmet' })),
    ).toMatchObject({ species: false, item: true })
    expect(
      buildProblemsOf('champions', 'regmb', member('charizard', { moveIds: ['slash', 'protect'] }))
        ?.moves,
    ).toEqual(['slash'])
    // "No filter" never flags
    expect(buildProblemsOf('champions', NO_REGULATION, member('koraidon'))).toBeUndefined()
  })

  beforeEach(async () => {
    await resetAll({ gen: 'champions' })
  })

  it('the team screen marks members that are not legal in the team regulation', async () => {
    const repo = await getRepository()
    await repo.createTeam({
      name: 'Old rules',
      gen: 'champions',
      regulation: 'regmb',
      members: [member('salamence'), member('incineroar')],
    })
    history.replaceState(null, '', '#/teams')
    render(<App />)
    await waitFor(() => expect(store.get().booted).toBe(true), { timeout: 20000 })
    fireEvent.click(await screen.findByRole('button', { name: 'Open Old rules' }))
    const list = await screen.findByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2) // nothing was deleted
    expect(within(items[0]!).getByText(/Not legal in Reg M-B/)).toBeVisible()
    expect(within(items[1]!).queryByText(/Not legal in/)).toBeNull()
    // the team's own regulation is shown and changeable
    expect(within(screen.getByRole('main')).getByLabelText('Regulation')).toHaveValue('regmb')
  })

  it('teams without a regulation (saved earlier) follow the active regulation', async () => {
    await initApp()
    const t = await createTeam('Legacy', 'champions')
    delete (t as { regulation?: string }).regulation
    expect(teamRegulation(t, 'regmb')).toBe('regmb')
    expect(teamRegulation({ ...t, regulation: 'regma' }, 'regmb')).toBe('regma')
    // an unknown stored id falls back to the active regulation
    expect(teamRegulation({ ...t, regulation: 'gone' }, 'regmb')).toBe('regmb')
  })

  it('new teams store the regulation selected at creation', async () => {
    await initApp()
    setRegulation('regmb')
    const t = await createTeam('New', 'champions')
    expect(t.regulation).toBe('regmb')
    expect((await (await getRepository()).getTeam(t.uid))?.regulation).toBe('regmb')
  })

  it('a team without the field validates (migration-safe) and survives a backup round trip', async () => {
    const repo = await getRepository()
    const a = await repo.createTeam({ name: 'No reg', gen: 'champions' })
    expect(a.regulation).toBeUndefined()
    const b = await repo.createTeam({ name: 'With reg', gen: 'champions', regulation: 'regma' })
    const backup = await repo.exportBackup()
    await repo.importBackup(backup, 'replace')
    expect((await repo.getTeam(b.uid))?.regulation).toBe('regma')
    expect((await repo.getTeam(a.uid))?.regulation).toBeUndefined()
  })

  it('paste import warns about illegal entries under the regulation but keeps them', async () => {
    await initApp()
    setRegulation('regmb')
    const paste = `Salamence @ Rocky Helmet
Ability: Intimidate
EVs: 32 HP / 32 Atk / 2 Spe
Adamant Nature
- Protect
- Slash

Incineroar @ Sitrus Berry
Ability: Intimidate
- Fake Out
`
    const out = await importPasteAsTeam('champions', paste, { name: 'P' })
    expect(out.imported).toBe(2)
    expect(out.team?.regulation).toBe('regmb')
    const w = out.warnings.join('\n')
    expect(w).toContain(
      'Salamence: not legal in Reg M-B (Pokémon, item Rocky Helmet, moves Slash). Kept anyway.',
    )
    expect(w).not.toContain('Incineroar')
    expect(out.team?.members.map((m) => m.speciesId)).toEqual(['salamence', 'incineroar'])
    // legal under Reg M-C: no regulation warning
    setRegulation('regmc')
    const ok = await importPasteAsTeam('champions', paste, { name: 'P2' })
    expect(ok.warnings.join('\n')).not.toContain('not legal')
  })

  it('common sets are only offered for species legal in the regulation', async () => {
    const { bridge } = getLib()
    expect(
      (await bridge.loadCommonSets('champions', 'salamence', 'regmc'))?.length,
    ).toBeGreaterThan(0)
    expect(await bridge.loadCommonSets('champions', 'salamence', 'regmb')).toBeUndefined()
    expect(
      (await bridge.loadCommonSets('champions', 'salamence', NO_REGULATION))?.length,
    ).toBeGreaterThan(0)
    expect(
      (await bridge.loadCommonSets('champions', 'incineroar', 'regmb'))?.length,
    ).toBeGreaterThan(0)
  })
})

describe('regulation selection and persistence', () => {
  beforeEach(async () => {
    await resetAll({ gen: 'champions' })
  })
  afterAll(() => resetStore())

  it('defaults to the regulation marked default, offers No filter last, and persists per gen', async () => {
    await initApp()
    expect(store.get().regulation).toBe('regmc')
    expect(regulationChoices('champions')).toEqual(['regmc', 'regmb', 'regma', 'none'])
    setRegulation('regmb')
    expect(store.get().regulation).toBe('regmb')
    await setGen('sv')
    expect(store.get().regulation).toBe('regi') // its own default, not regmb
    setRegulation('regg')
    setRegulation('bogus') // unknown ids resolve to the default
    expect(store.get().regulation).toBe('regi')
    setRegulation('regg')
    await setGen('gsc')
    expect(store.get().regulation).toBe(NO_REGULATION) // gens without regulations: No filter only
    expect(regulationChoices('gsc')).toEqual([NO_REGULATION])
    await waitFor(async () =>
      expect((await (await getRepository()).getSettings()).regulations).toEqual({
        champions: 'regmb',
        sv: 'regg',
      }),
    )
    // a new session restores both
    resetStore()
    await (await getRepository()).setSettings({ gen: 'champions' })
    await initApp()
    expect(store.get().regulation).toBe('regmb')
    await setGen('sv')
    expect(store.get().regulation).toBe('regg')
  })

  it('the top bar selector switches the regulation and the pickers follow', async () => {
    history.replaceState(null, '', '#/')
    render(<App />)
    await waitFor(() => expect(store.get().booted).toBe(true), { timeout: 20000 })
    const select = await screen.findByLabelText('Regulation')
    expect(select).toHaveValue('regmc')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Reg M-C', 'Reg M-B', 'Reg M-A', 'No filter'])
    fireEvent.change(select, { target: { value: 'regmb' } })
    expect(store.get().regulation).toBe('regmb')
    fireEvent.click(screen.getByRole('button', { name: /Choose my Pokémon/ }))
    const box = await screen.findByRole('searchbox')
    fireEvent.change(box, { target: { value: 'Salamence' } })
    expect(screen.queryByRole('button', { name: /Salamence/ })).toBeNull()
    fireEvent.change(box, { target: { value: 'Koraidon' } })
    expect(screen.queryByRole('button', { name: /Koraidon/ })).toBeNull()
    act(() => setRegulation('none'))
    fireEvent.change(box, { target: { value: 'Koraidon' } })
    expect(await screen.findByRole('button', { name: /Koraidon/ })).toBeVisible()
  })

  it('no selector for generations without regulations', async () => {
    await resetAll({ gen: 'champions' })
    await (await getRepository()).setSettings({ gen: 'gsc' })
    history.replaceState(null, '', '#/')
    render(<App />)
    await waitFor(() => expect(store.get().booted).toBe(true), { timeout: 20000 })
    expect(screen.queryByLabelText('Regulation')).toBeNull()
  })
})
