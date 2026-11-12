import { GEN_META } from '../bridge/gens'
import { NO_REGULATION } from '../data/types'
import type { DataGenId, PresetId, SavedSetLike } from '../bridge/types'
import type { CommonSet } from '../data/types'
import type { CalcInput, CalcResult } from '../engine/types'
import { detectLang } from '../i18n'
import type {
  CustomSet,
  Format,
  Lang,
  SavedSet,
  Settings,
  StoredMatchup,
  Team,
} from '../storage/types'
import { DEFAULT_SETTINGS } from '../storage/types'
import {
  SIDE_OPTIONS,
  emptyField,
  sanitizeField,
  toFieldInput,
  type SideFlag,
  type UiField,
} from './field'
import type { ShareWarning, DecodeFailure } from '../share/codec'
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

/** Everything a shared-calc load replaces, so "Undo" can put it back exactly. */
export interface MatchupSnapshot {
  gen: DataGenId
  format: Format
  regulation: string
  regulations: Partial<Record<DataGenId, string>>
  mine?: SavedSetLike
  opp?: SavedSetLike
  mineTeamIndex?: number
  oppPreset: PresetId | null
  field: UiField
  direction: Direction
  lastChanged: Side
}

export type ShareNotice =
  | { kind: 'loaded'; id: number; warnings: ShareWarning[]; undo: MatchupSnapshot }
  | { kind: 'error'; reason: 'offline' | DecodeFailure }

export interface AppState {
  status: 'booting' | 'loading' | 'ready' | 'error'
  /** True once the bridge/engine of the first generation is loaded. */
  booted: boolean
  error?: string
  lang: Lang
  gen: DataGenId
  format: Format
  /** Active regulation of `gen` (resolved: a regulation id of the generation or "none"). */
  regulation: string
  /** Saved regulation choice per generation (see `setRegulation`). */
  regulations: Partial<Record<DataGenId, string>>
  /** The active team (any generation). */
  team?: Team
  /** All saved teams / custom sets (every generation), newest first. */
  teams: Team[]
  customSets: CustomSet[]
  /** The wanted generation could not be loaded (typically: offline and never downloaded). */
  genNotice?: { gen: DataGenId; offline: boolean }
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
  /** Which side's Pokemon was set / changed most recently (decides auto weather/terrain ties). */
  lastChanged: Side
  /** Persisting the matchup failed (shown once, until dismissed). */
  storageNotice?: boolean
  /** Result of opening a shared-calc link (shown until dismissed / timed out). */
  shareNotice?: ShareNotice
  /** Move row a shared link pointed at: `MoveResults` expands it (`nonce` remounts the rows). */
  focusMove?: { direction: Direction; index: number; nonce: number }
}

const initialState = (): AppState => ({
  status: 'booting',
  booted: false,
  lang: detectLang(),
  gen: DEFAULT_SETTINGS.gen,
  format: DEFAULT_SETTINGS.format,
  regulation: NO_REGULATION,
  regulations: {},
  teams: [],
  customSets: [],
  oppPreset: null,
  oppHasCommon: false,
  field: emptyField(),
  direction: 'forward',
  lastChanged: 'opp',
})

export const store = createStore<AppState>(initialState())

const tokens = { mine: 0, opp: 0, gen: 0, common: 0 }
let initPromise: Promise<void> | undefined

/** Test helper: back to the pristine state. */
export function resetStore(): void {
  store.replace(initialState())
  initPromise = undefined
  clearTimeout(persistTimer)
  pending = undefined
  seen = undefined
  tokens.mine = tokens.opp = tokens.gen = tokens.common = 0
  persistWarned = false
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
      { abilityPriority: s.lastChanged === 'mine' ? 'attacker' : 'defender' },
    )
    return { calc: { result: engine.calculate(input), input, warnings }, calcError: undefined }
  } catch (e) {
    return { calc: undefined, calcError: e instanceof Error ? e.message : String(e) }
  }
}

/** Apply a state patch and recalculate (cheap and synchronous once the engine is prepared). */
export function commit(patch: Partial<AppState>): void {
  const next = { ...store.get(), ...patch }
  store.set({ ...patch, ...computeCalc(next) })
}

/** Storage (zod + idb) is loaded on demand, not in the first-paint bundle. */
export async function getRepository() {
  return (await import('../storage')).getRepository()
}

async function persist(
  patch: Partial<{
    lang: Lang
    gen: DataGenId
    format: Format
    regulations: Partial<Record<DataGenId, string>>
  }>,
) {
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
  try {
    const repo = await getRepository()
    settings = await repo.getSettings()
    await reloadLibrary()
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
  let gen = settings.gen
  const meta = GEN_META[gen]
  let format = meta.formats.includes(settings.format) ? settings.format : meta.defaultFormat
  const regulations = settings.regulations ?? {}
  store.set({ status: 'loading', lang: settings.lang, gen, format, regulations })
  try {
    await prepareLib(gen)
  } catch (e) {
    // The saved generation is not available (offline and never downloaded): fall back to the
    // bundled default generation and tell the user.
    if (gen === DEFAULT_SETTINGS.gen) return bootFailed(e)
    try {
      await prepareLib(DEFAULT_SETTINGS.gen)
    } catch {
      return bootFailed(e)
    }
    store.set({ genNotice: { gen, offline: isOffline() } })
    gen = DEFAULT_SETTINGS.gen
    const fb = GEN_META[gen]
    format = fb.formats.includes(format) ? format : fb.defaultFormat
    store.set({ gen, format })
  }
  const saved = await loadStoredMatchup(gen)
  commit({
    status: 'ready',
    booted: true,
    regulation: getLib().bridge.resolveRegulationId(gen, regulations[gen]),
    ...saved,
  })
  if (store.get().calcError && (saved.mine || saved.opp)) await discardBrokenMatchup(gen)
  const { team, mine } = store.get()
  if (!mine && team && team.gen === gen && team.members.length > 0) selectTeamMember(0)
  if (store.get().opp) void refreshCommon()
  seen = snapshotKey(store.get())
}

/**
 * The restored matchup makes the engine throw (corrupt or hostile data that got persisted):
 * start this generation from a blank matchup and overwrite the stored one, so the next reload
 * does not hit the same failure again.
 */
async function discardBrokenMatchup(gen: DataGenId): Promise<void> {
  console.warn('The saved matchup could not be calculated; starting from a blank matchup instead')
  commit({
    mine: undefined,
    opp: undefined,
    mineTeamIndex: undefined,
    oppPreset: null,
    field: emptyField(),
  })
  try {
    await (
      await getRepository()
    ).setMatchup(gen, {
      field: emptyField() as unknown as Record<string, unknown>,
      oppPreset: null,
      savedAt: Date.now(),
    })
  } catch {
    /* storage unavailable: nothing persisted either */
  }
}

function bootFailed(e: unknown): void {
  store.set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** Reload the saved teams, custom sets and the active team from storage. */
export async function reloadLibrary(): Promise<void> {
  try {
    const repo = await getRepository()
    const [teams, customSets, team] = await Promise.all([
      repo.listTeams(),
      repo.listCustomSets(),
      repo.getActiveTeam(),
    ])
    store.set({ teams, customSets, team })
  } catch {
    /* storage unavailable */
  }
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

/** Select the regulation of the current generation (persisted per generation). */
export function setRegulation(id: string): void {
  const { gen, regulations } = store.get()
  const regulation = getLib().bridge.resolveRegulationId(gen, id)
  const next = { ...regulations, [gen]: regulation }
  // Builds that are not legal any more stay as they are (the cards show a marker).
  commit({ regulation, regulations: next })
  void persist({ regulations: next })
  void refreshCommon()
}

export async function setGen(gen: DataGenId): Promise<void> {
  const prev = store.get()
  if (gen === prev.gen || prev.status === 'loading') return
  void flushMatchup()
  const token = ++tokens.gen
  store.set({ status: 'loading', genNotice: undefined })
  try {
    await prepareLib(gen)
  } catch (e) {
    // Stay on the current generation (its data is loaded) and explain why.
    void e
    store.set({ status: 'ready', genNotice: { gen, offline: isOffline() } })
    return
  }
  if (token !== tokens.gen) return
  const meta = GEN_META[gen]
  const from = GEN_META[prev.gen]
  const format = meta.formats.includes(prev.format) ? prev.format : meta.defaultFormat
  const saved = await loadStoredMatchup(gen, format)
  if (token !== tokens.gen) return
  const mine = prev.mine && sanitizeSet(from, gen, prev.mine)
  const opp = prev.opp && sanitizeSet(from, gen, prev.opp)
  ++tokens.mine
  ++tokens.opp
  commit({
    status: 'ready',
    error: undefined,
    gen,
    format,
    regulation: getLib().bridge.resolveRegulationId(gen, prev.regulations[gen]),
    mine,
    opp,
    mineTeamIndex: undefined,
    oppPreset: null,
    field: sanitizeField(meta, prev.field, format),
    ...saved,
  })
  void persist({ gen, format })
  void refreshCommon()
}

export function dismissGenNotice(): void {
  store.set({ genNotice: undefined })
}

// ---------------------------------------------------------------------------------------------
// Matchup persistence (per generation)
// ---------------------------------------------------------------------------------------------

const PERSIST_DELAY_MS = 400
const SIDE_KEYS: string[] = [...SIDE_OPTIONS.map((o) => o.key), 'spikes']
const PRESET_IDS: readonly string[] = [
  'neutral',
  'physDef',
  'specDef',
  'physAtk',
  'specAtk',
  'common',
]
let persistTimer: ReturnType<typeof setTimeout> | undefined
let pending: { gen: DataGenId; value: StoredMatchup } | undefined
let seen: string | undefined
let seenRefs: unknown[] = []
let persistWarned = false

function snapshotKey(s: AppState): string {
  seenRefs = [s.gen, s.mine, s.opp, s.field, s.oppPreset, s.mineTeamIndex, s.team?.uid]
  return 'k'
}

function refsChanged(s: AppState): boolean {
  const next = [s.gen, s.mine, s.opp, s.field, s.oppPreset, s.mineTeamIndex, s.team?.uid]
  return next.some((v, i) => v !== seenRefs[i])
}

function toStored(s: AppState): StoredMatchup {
  return {
    ...(s.mine ? { mine: s.mine as unknown as Record<string, unknown> } : {}),
    ...(s.opp ? { opp: s.opp as unknown as Record<string, unknown> } : {}),
    field: s.field as unknown as Record<string, unknown>,
    oppPreset: s.oppPreset,
    ...(s.team && s.mineTeamIndex !== undefined
      ? { teamUid: s.team.uid, mineTeamIndex: s.mineTeamIndex }
      : {}),
    savedAt: Date.now(),
  }
}

/** Writes the pending matchup immediately (also called when the page is hidden). */
export async function flushMatchup(): Promise<void> {
  clearTimeout(persistTimer)
  const p = pending
  pending = undefined
  if (!p) return
  try {
    await (await getRepository()).setMatchup(p.gen, p.value)
  } catch (e) {
    // Storage unavailable / full / rejected: the matchup just is not restored next time. Tell the
    // developer always and the user once.
    console.warn('Could not save the matchup', e)
    if (!persistWarned) {
      persistWarned = true
      store.set({ storageNotice: true })
    }
  }
}

export function dismissStorageNotice(): void {
  store.set({ storageNotice: undefined })
}

store.subscribe(() => {
  const s = store.get()
  if (!s.booted || s.status !== 'ready' || seen === undefined || !refsChanged(s)) return
  snapshotKey(s)
  pending = { gen: s.gen, value: toStored(s) }
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => void flushMatchup(), PERSIST_DELAY_MS)
})

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushMatchup()
  })
  window.addEventListener('pagehide', () => void flushMatchup())
}

/** Checks a stored build against the loaded generation (unknown species -> undefined). */
function validateStored(gen: DataGenId, raw: Record<string, unknown> | undefined) {
  if (!raw) return undefined
  const set = { ...raw } as unknown as SavedSetLike
  const b = getLib().bridge.getBridge(gen)
  if (!b.kinds.species.byId.has(set.speciesId)) return undefined
  const keep = (id: string) => b.kinds.moves.byId.has(id)
  const moveIds: string[] = []
  const overrides: SavedSetLike['moveOverrides'] = []
  set.moveIds.forEach((id, i) => {
    if (!keep(id)) return
    moveIds.push(id)
    overrides.push(set.moveOverrides?.[i] ?? undefined)
  })
  set.moveIds = moveIds
  if (overrides.some(Boolean)) set.moveOverrides = overrides
  else delete set.moveOverrides
  if (set.itemId && !b.kinds.items.byId.has(set.itemId)) delete set.itemId
  if (set.abilityId && !b.kinds.abilities.byId.has(set.abilityId)) delete set.abilityId
  return set
}

/** Patch restoring the last matchup of `gen` (empty when none was saved). */
async function loadStoredMatchup(
  gen: DataGenId,
  format: Format = store.get().format,
): Promise<Partial<AppState>> {
  let stored: StoredMatchup | undefined
  try {
    stored = await (await getRepository()).getMatchup(gen)
  } catch {
    return {}
  }
  if (!stored) return {}
  const meta = GEN_META[gen]
  const mine = validateStored(gen, stored.mine)
  const opp = validateStored(gen, stored.opp)
  const f = stored.field ?? {}
  const base = emptyField()
  const pick = (o: unknown, keys: string[]) =>
    Object.fromEntries(
      Object.entries((o ?? {}) as Record<string, unknown>).filter(([k]) => keys.includes(k)),
    )
  const field: UiField = {
    ...base,
    ...(typeof f.weather === 'string' ? { weather: f.weather as UiField['weather'] } : {}),
    ...(typeof f.terrain === 'string' ? { terrain: f.terrain as UiField['terrain'] } : {}),
    gravity: f.gravity === true,
    neutralizingGas: f.neutralizingGas === true,
    auras: { ...base.auras, ...pick(f.auras, Object.keys(base.auras)) },
    ruin: { ...base.ruin, ...pick(f.ruin, Object.keys(base.ruin)) },
    mine: pick(f.mine, SIDE_KEYS) as UiField['mine'],
    opp: pick(f.opp, SIDE_KEYS) as UiField['opp'],
  }
  const team = store.get().team
  const idx = stored.mineTeamIndex
  const fromTeam =
    mine &&
    idx !== undefined &&
    team?.uid === stored.teamUid &&
    team?.gen === gen &&
    team?.members[idx]?.speciesId === mine.speciesId
  const preset = PRESET_IDS.includes(stored.oppPreset ?? '') ? (stored.oppPreset as PresetId) : null
  return {
    mine,
    opp,
    mineTeamIndex: fromTeam ? idx : undefined,
    oppPreset: opp ? preset : null,
    field: sanitizeField(meta, field, format),
  }
}

// ---------------------------------------------------------------------------------------------
// Pokemon selection
// ---------------------------------------------------------------------------------------------

async function loadSets(gen: DataGenId, speciesId: string): Promise<CommonSet[] | undefined> {
  try {
    return await getLib().bridge.loadCommonSets(gen, speciesId, store.get().regulation)
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
    commit({
      opp: set,
      oppPreset: common ? 'common' : 'neutral',
      oppHasCommon: !!sets?.length,
      lastChanged: 'opp',
    })
  } else {
    commit({ mine: set, mineTeamIndex: undefined, lastChanged: 'mine' })
  }
}

export function selectTeamMember(index: number): void {
  const { team, gen } = store.get()
  const member = team?.members[index]
  if (!team || !member || team.gen !== gen) return
  if (!getLib().bridge.getBridge(gen).kinds.species.byId.has(member.speciesId)) return
  ++tokens.mine
  commit({ mine: savedToSet(member), mineTeamIndex: index, lastChanged: 'mine' })
}

export function savedToSet(m: SavedSet): SavedSetLike {
  const { uid: _uid, gen: _gen, ...rest } = m
  void _uid
  void _gen
  return rest
}

/** Use one of the user's saved sets for the opponent. */
export function applyCustomSet(cs: CustomSet): void {
  const cur = store.get()
  if (cs.gen !== cur.gen) return
  ++tokens.opp
  commit({
    opp: { speciesId: cs.speciesId, ...structuredClone(cs.set) },
    oppPreset: null,
    lastChanged: 'opp',
  })
  void refreshCommon()
}

export async function applyOppPreset(preset: PresetId): Promise<void> {
  const { gen, opp } = store.get()
  if (!opp) return
  const token = ++tokens.opp
  const next = await getLib().bridge.applyPresetAsync(gen, opp, preset, store.get().regulation)
  const cur = store.get()
  // Discard when anything wrote the opponent meanwhile (species change, edit, swap, ...).
  if (!next || token !== tokens.opp || cur.opp !== opp || cur.gen !== gen) return
  commit({ opp: next, oppPreset: preset, lastChanged: 'opp' })
}

/** Edit one side's build (used by the editor sheet). */
export function updateSet(side: Side, fn: (s: SavedSetLike) => SavedSetLike): void {
  const cur = store.get()[side]
  if (!cur) return
  const next = fn(cur)
  ++tokens[side]
  const abilityChanged =
    next.speciesId !== cur.speciesId ||
    next.abilityId !== cur.abilityId ||
    next.abilityOn !== cur.abilityOn
  const last = abilityChanged ? { lastChanged: side } : {}
  if (side === 'opp') {
    commit({ opp: next, oppPreset: null, ...last })
    if (next.speciesId !== cur.speciesId) void refreshCommon()
  } else {
    commit({
      mine: next,
      ...last,
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
  ++tokens.mine
  ++tokens.opp
  commit({
    mine: s.opp,
    opp: s.mine,
    mineTeamIndex: undefined,
    oppPreset: null,
    // The same physical Pokemon keeps its priority for the auto weather / terrain.
    lastChanged: s.lastChanged === 'mine' ? 'opp' : 'mine',
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
  ++tokens.mine
  ++tokens.opp
  commit({ mine, opp, mineTeamIndex: undefined, oppPreset: null, lastChanged: 'opp' })
  void refreshCommon()
}

// ---------------------------------------------------------------------------------------------
// Shared calcs (state/share.ts builds the snapshots)
// ---------------------------------------------------------------------------------------------

export function snapshotMatchup(s: AppState = store.get()): MatchupSnapshot {
  return {
    gen: s.gen,
    format: s.format,
    regulation: s.regulation,
    regulations: s.regulations,
    mine: s.mine,
    opp: s.opp,
    mineTeamIndex: s.mineTeamIndex,
    oppPreset: s.oppPreset,
    field: s.field,
    direction: s.direction,
    lastChanged: s.lastChanged,
  }
}

export type ApplyOutcome = 'ok' | 'offline' | 'invalid'

/**
 * Switch to `gen` (awaiting its data) and replace the whole matchup. `make` runs once the
 * generation is loaded (so it can validate against its data); `undefined` aborts and keeps the
 * current state. Used for opening shared links and for their "Undo".
 */
export async function applyMatchupSnapshot(
  gen: DataGenId,
  make: () => MatchupSnapshot | undefined,
): Promise<ApplyOutcome> {
  await flushMatchup()
  const token = ++tokens.gen
  const before = store.get()
  store.set({ status: 'loading', genNotice: undefined })
  try {
    await prepareLib(gen)
  } catch {
    store.set({ status: before.booted ? 'ready' : before.status })
    return 'offline'
  }
  if (token !== tokens.gen) return 'invalid'
  let snap: MatchupSnapshot | undefined
  try {
    snap = make()
  } catch {
    snap = undefined
  }
  if (!snap) {
    store.set({ status: 'ready' })
    return 'invalid'
  }
  ++tokens.mine
  ++tokens.opp
  ++tokens.common
  commit({
    status: 'ready',
    error: undefined,
    gen: snap.gen,
    format: snap.format,
    regulation: snap.regulation,
    regulations: snap.regulations,
    mine: snap.mine,
    opp: snap.opp,
    mineTeamIndex: snap.mineTeamIndex,
    oppPreset: snap.oppPreset,
    field: snap.field,
    direction: snap.direction,
    lastChanged: snap.lastChanged,
    focusMove: undefined,
  })
  void persist({ gen: snap.gen, format: snap.format, regulations: snap.regulations })
  void refreshCommon()
  return 'ok'
}

/** What the loaded-notice was shown for; the notice (and its Undo) lasts until this changes. */
function noticeRefs(s: AppState): unknown[] {
  return [s.gen, s.format, s.mine, s.opp, s.field]
}
let loadedRefs: unknown[] = []

export function setShareNotice(shareNotice: ShareNotice | undefined): void {
  if (shareNotice?.kind === 'loaded') loadedRefs = noticeRefs(store.get())
  store.set({ shareNotice })
}

// The loaded-notice stays until dismissed or until the user makes their next change to the matchup.
store.subscribe(() => {
  const s = store.get()
  if (s.shareNotice?.kind !== 'loaded') return
  const next = noticeRefs(s)
  if (next.some((v, i) => v !== loadedRefs[i])) store.set({ shareNotice: undefined })
})

export function setFocusMove(focus: { direction: Direction; index: number } | undefined): void {
  store.set({ focusMove: focus && { ...focus, nonce: (store.get().focusMove?.nonce ?? 0) + 1 } })
}
