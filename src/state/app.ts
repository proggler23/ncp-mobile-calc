import { GEN_META } from '../bridge/gens'
import type { DataGenId, PresetId, SavedSetLike } from '../bridge/types'
import type { CommonSet } from '../data/types'
import type { CalcInput, CalcResult } from '../engine/types'
import { detectLang } from '../i18n'
import type { Format, Lang, SavedSet, Settings, Team } from '../storage/types'
import { DEFAULT_SETTINGS } from '../storage/types'
import { emptyField, sanitizeField, toFieldInput, type SideFlag, type UiField } from './field'
import { getLib, prepareLib } from './lib'
import { blankSet, changeSpecies, sanitizeSet } from './sets'
import { createStore } from './store'

export type Side = 'mine' | 'opp'
export type Direction = 'forward' | 'reverse'

export interface CalcState {
  result: CalcResult
  input: CalcInput
  warnings: string[]
}

export interface AppState {
  status: 'booting' | 'loading' | 'ready' | 'error'
  /** True once the bridge/engine of the first generation is loaded. */
  booted: boolean
  error?: string
  lang: Lang
  gen: DataGenId
  format: Format
  team?: Team
  mine?: SavedSetLike
  opp?: SavedSetLike
  /** Index of the selected team chip (when `mine` came from the team). */
  mineTeamIndex?: number
  /** Preset the opponent currently matches (`null` after manual edits). */
  oppPreset: PresetId | null
  oppHasCommon: boolean
  field: UiField
  direction: Direction
  calc?: CalcState
  calcError?: string
}

const initialState = (): AppState => ({
  status: 'booting',
  booted: false,
  lang: detectLang(),
  gen: DEFAULT_SETTINGS.gen,
  format: DEFAULT_SETTINGS.format,
  oppPreset: null,
  oppHasCommon: false,
  field: emptyField(),
  direction: 'forward',
})

export const store = createStore<AppState>(initialState())

const tokens = { mine: 0, opp: 0, gen: 0, common: 0 }
let initPromise: Promise<void> | undefined

/** Test helper: back to the pristine state. */
export function resetStore(): void {
  store.replace(initialState())
  initPromise = undefined
  tokens.mine = tokens.opp = tokens.gen = tokens.common = 0
}

// ---------------------------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------------------------

function computeCalc(s: AppState): Pick<AppState, 'calc' | 'calcError'> {
  if (s.status === 'booting' || s.status === 'error' || !s.mine || !s.opp) {
    return { calc: undefined, calcError: undefined }
  }
  try {
    const { bridge, engine } = getLib()
    const { input, warnings } = bridge.toEngineInputDetailed(
      s.gen,
      s.mine,
      s.opp,
      toFieldInput(s.field, s.format),
    )
    return { calc: { result: engine.calculate(input), input, warnings }, calcError: undefined }
  } catch (e) {
    return { calc: undefined, calcError: e instanceof Error ? e.message : String(e) }
  }
}

/** Apply a state patch and recalculate (cheap and synchronous once the engine is prepared). */
function commit(patch: Partial<AppState>): void {
  const next = { ...store.get(), ...patch }
  store.set({ ...patch, ...computeCalc(next) })
}

/** Storage (zod + idb) is loaded on demand, not in the first-paint bundle. */
async function getRepository() {
  return (await import('../storage')).getRepository()
}

async function persist(patch: Partial<{ lang: Lang; gen: DataGenId; format: Format }>) {
  try {
    await (await getRepository()).setSettings(patch)
  } catch {
    /* storage unavailable (private mode): the app still works, just without persistence */
  }
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------

const LANG_INIT_KEY = 'ncp:lang-init'

export function initApp(): Promise<void> {
  initPromise ??= boot()
  return initPromise
}

async function boot(): Promise<void> {
  let settings: Settings = { ...DEFAULT_SETTINGS, lang: store.get().lang }
  let team: Team | undefined
  try {
    const repo = await getRepository()
    settings = await repo.getSettings()
    team = await repo.getActiveTeam()
    let known = false
    try {
      known = localStorage.getItem(LANG_INIT_KEY) !== null
      if (!known) localStorage.setItem(LANG_INIT_KEY, '1')
    } catch {
      known = true
    }
    if (!known) {
      settings = await repo.setSettings({ lang: detectLang() })
    }
  } catch {
    /* storage unavailable: defaults (and the detected language) apply */
  }
  const meta = GEN_META[settings.gen]
  const format = meta.formats.includes(settings.format) ? settings.format : meta.defaultFormat
  store.set({ status: 'loading', lang: settings.lang, gen: settings.gen, format, team })
  try {
    await prepareLib(settings.gen)
  } catch (e) {
    store.set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    return
  }
  commit({ status: 'ready', booted: true })
  if (team && team.gen === settings.gen && team.members.length > 0) selectTeamMember(0)
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export function setLang(lang: Lang): void {
  store.set({ lang })
  void persist({ lang })
}

export function setFormat(format: Format): void {
  const meta = GEN_META[store.get().gen]
  if (!meta.formats.includes(format)) return
  commit({ format, field: sanitizeField(meta, store.get().field, format) })
  void persist({ format })
}

export async function setGen(gen: DataGenId): Promise<void> {
  const prev = store.get()
  if (gen === prev.gen || prev.status === 'loading') return
  const token = ++tokens.gen
  store.set({ status: 'loading' })
  try {
    await prepareLib(gen)
  } catch (e) {
    store.set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    return
  }
  if (token !== tokens.gen) return
  const meta = GEN_META[gen]
  const from = GEN_META[prev.gen]
  const format = meta.formats.includes(prev.format) ? prev.format : meta.defaultFormat
  const mine = prev.mine && sanitizeSet(from, gen, prev.mine)
  const opp = prev.opp && sanitizeSet(from, gen, prev.opp)
  commit({
    status: 'ready',
    error: undefined,
    gen,
    format,
    mine,
    opp,
    mineTeamIndex: undefined,
    oppPreset: null,
    field: sanitizeField(meta, prev.field, format),
  })
  void persist({ gen, format })
  void refreshCommon()
}

// ---------------------------------------------------------------------------------------------
// Pokemon selection
// ---------------------------------------------------------------------------------------------

async function loadSets(gen: DataGenId, speciesId: string): Promise<CommonSet[] | undefined> {
  try {
    return await getLib().bridge.loadCommonSets(gen, speciesId)
  } catch {
    return undefined // generation without usage data
  }
}

async function refreshCommon(): Promise<void> {
  const { gen, opp } = store.get()
  const token = ++tokens.common
  const sets = opp ? await loadSets(gen, opp.speciesId) : undefined
  if (token === tokens.common) store.set({ oppHasCommon: !!sets?.length })
}

/** Choose a species for a side: its top usage ("Common") set when known, else a neutral build. */
export async function pickSpecies(side: Side, speciesId: string): Promise<void> {
  const gen = store.get().gen
  const token = ++tokens[side]
  const sets = await loadSets(gen, speciesId)
  if (token !== tokens[side] || store.get().gen !== gen) return
  const { bridge } = getLib()
  const blank = blankSet(gen, speciesId)
  const common = sets?.length ? bridge.applyPreset(gen, blank, 'common', sets) : undefined
  const set = common ?? bridge.applyPreset(gen, blank, 'neutral')
  if (side === 'opp') {
    ++tokens.common
    commit({ opp: set, oppPreset: common ? 'common' : 'neutral', oppHasCommon: !!sets?.length })
  } else {
    commit({ mine: set, mineTeamIndex: undefined })
  }
}

export function selectTeamMember(index: number): void {
  const { team, gen } = store.get()
  const member = team?.members[index]
  if (!team || !member || team.gen !== gen) return
  if (!getLib().bridge.getBridge(gen).kinds.species.byId.has(member.speciesId)) return
  commit({ mine: savedToSet(member), mineTeamIndex: index })
}

export function savedToSet(m: SavedSet): SavedSetLike {
  const { uid: _uid, gen: _gen, ...rest } = m
  void _uid
  void _gen
  return rest
}

export async function applyOppPreset(preset: PresetId): Promise<void> {
  const { gen, opp } = store.get()
  if (!opp) return
  const speciesId = opp.speciesId
  const next = await getLib().bridge.applyPresetAsync(gen, opp, preset)
  const cur = store.get()
  if (!next || cur.opp?.speciesId !== speciesId || cur.gen !== gen) return
  commit({ opp: next, oppPreset: preset })
}

/** Edit one side's build (used by the editor sheet). */
export function updateSet(side: Side, fn: (s: SavedSetLike) => SavedSetLike): void {
  const cur = store.get()[side]
  if (!cur) return
  const next = fn(cur)
  if (side === 'opp') {
    commit({ opp: next, oppPreset: null })
    if (next.speciesId !== cur.speciesId) void refreshCommon()
  } else {
    commit({
      mine: next,
      ...(next.speciesId !== cur.speciesId ? { mineTeamIndex: undefined } : {}),
    })
  }
}

export function setSpecies(side: Side, speciesId: string): void {
  const gen = store.get().gen
  updateSet(side, (s) => changeSpecies(gen, s, speciesId))
}

/** Exchange the two Pokemon (and the field effects that belong to their sides). */
export function swapSides(): void {
  const s = store.get()
  commit({
    mine: s.opp,
    opp: s.mine,
    mineTeamIndex: undefined,
    oppPreset: null,
    field: { ...s.field, mine: s.field.opp, opp: s.field.mine },
  })
  void refreshCommon()
}

// ---------------------------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------------------------

export function patchField(fn: (f: UiField) => UiField): void {
  commit({ field: fn(store.get().field) })
}

export function setSideFlag(side: Side, key: SideFlag, on: boolean): void {
  patchField((f) => {
    const next = { ...f[side] }
    if (on) next[key] = true
    else delete next[key]
    return { ...f, [side]: next }
  })
}

export function setSpikes(side: Side, layers: 0 | 1 | 2 | 3): void {
  patchField((f) => {
    const next = { ...f[side] }
    if (layers) next.spikes = layers
    else delete next.spikes
    return { ...f, [side]: next }
  })
}

export function resetField(): void {
  commit({ field: emptyField() })
}

export function setDirection(direction: Direction): void {
  store.set({ direction })
}

/** Replace both builds at once (deep links, tests, Phase 5b "load matchup"). */
export function setMatchup(mine: SavedSetLike | undefined, opp: SavedSetLike | undefined): void {
  commit({ mine, opp, mineTeamIndex: undefined, oppPreset: null })
  void refreshCommon()
}
