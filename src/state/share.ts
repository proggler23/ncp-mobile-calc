/** Sharing calcs: message text, link building and opening / undoing shared links. */
import { GEN_META } from '../bridge/gens'
import type { DataGenId, SavedSetLike } from '../bridge/types'
import { moveLine } from '../features/matchup/ko'
import type { MoveResult } from '../engine/types'
import { trackShareOpen } from '../analytics'
import { translate } from '../i18n'
import type { Lang } from '../storage/types'
import type { DecodeFailure, Direction, ShareWarning, SharePayload } from '../share/codec'
import {
  applyMatchupSnapshot,
  initApp,
  setFocusMove,
  setShareNotice,
  snapshotMatchup,
  store,
  type AppState,
  type MatchupSnapshot,
} from './app'
import { sanitizeField } from './field'
import { fieldSummary } from './fieldSummary'
import { getLib } from './lib'
import { regulationName } from './regulation'
import { replaceRoute } from './route'

export const SHARE_TITLE = 'NCP Mobile Calc'

export interface MoveRef {
  direction: Direction
  /** Index into the result rows (move slot) of that direction. */
  index: number
}

export interface ShareContent {
  title: string
  /** Lines 1-2 (result and context). */
  text: string
  url: string
  /** Lines 1-3 (result, context, link), ready to paste. */
  full: string
}

/**
 * v2 (token `2<data>`): `https://host/base/#c2<data>`; v1 (token `v1.<data>`): `.../#/c/v1.<data>`.
 * (`BASE_URL` is the Vite base, `/` or `/repo/`.)
 */
export function shareUrl(token: string): string {
  const base = `${globalThis.location.origin}${import.meta.env.BASE_URL}`
  return token.startsWith('2') ? `${base}#c${token}` : `${base}#/c/${token}`
}

export function buildSharePayload(s: AppState, move?: MoveRef): SharePayload {
  return {
    gen: s.gen,
    regulation: s.regulation,
    format: s.format,
    field: s.field,
    mine: s.mine,
    opp: s.opp,
    move,
  }
}

/** "Reg M-C · Doubles · ☀ Sun · Mine: Tailwind" (the generation label stands in for "No filter"). */
export function contextLine(s: AppState, lang: Lang): string {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(lang, key, vars)
  const sum = fieldSummary(t, s.gen, s.format, s.field, s.calc?.input.field)
  const reg =
    s.regulation === 'none' ? GEN_META[s.gen].label : regulationName(s.gen, s.regulation, lang)
  return [
    reg,
    t(s.format === 'doubles' ? 'field.doubles' : 'field.singles'),
    ...sum.effects,
    ...(sum.mine ? [`${t('card.mine')}: ${sum.mine}`] : []),
    ...(sum.opp ? [`${t('card.opp')}: ${sum.opp}`] : []),
  ].join(' · ')
}

/** Build the share message for one result row of the current matchup. */
export async function prepareShare(row: MoveResult, move: MoveRef): Promise<ShareContent> {
  const s = store.get()
  const { encodeShare } = await import('../share/codec')
  const url = shareUrl(await encodeShare(buildSharePayload(s, move)))
  const text = `${moveLine(row)}\n${contextLine(s, s.lang)}`
  return { title: SHARE_TITLE, text, url, full: `${text}\n${url}` }
}

// ---------------------------------------------------------------------------------------------
// Opening a shared link
// ---------------------------------------------------------------------------------------------

/** Drop what the loaded generation does not know; moves keep their overrides aligned. */
function validate(
  gen: DataGenId,
  raw: SavedSetLike | undefined,
  warnings: ShareWarning[],
): { set: SavedSetLike; kept: number[] } | undefined {
  if (!raw) return undefined
  const b = getLib().bridge.getBridge(gen)
  const meta = b.meta
  if (!b.kinds.species.byId.has(raw.speciesId)) {
    warnings.push({ key: 'species', detail: raw.speciesId })
    return undefined
  }
  const set: SavedSetLike = { ...raw }
  const moveIds: string[] = []
  const overrides: SavedSetLike['moveOverrides'] = []
  const kept: number[] = []
  raw.moveIds.forEach((id, i) => {
    if (!b.kinds.moves.byId.has(id)) {
      warnings.push({ key: 'move', detail: id })
      return
    }
    kept.push(i)
    moveIds.push(id)
    overrides.push(raw.moveOverrides?.[i] ?? undefined)
  })
  set.moveIds = moveIds
  if (overrides.some(Boolean)) set.moveOverrides = overrides
  else delete set.moveOverrides
  if (set.itemId && (!meta.hasItems || !b.kinds.items.byId.has(set.itemId))) {
    warnings.push({ key: 'item', detail: set.itemId })
    delete set.itemId
  }
  if (set.abilityId && (!meta.hasAbilities || !b.kinds.abilities.byId.has(set.abilityId))) {
    warnings.push({ key: 'ability', detail: set.abilityId })
    delete set.abilityId
  }
  if (!meta.hasTera) {
    if (set.teraType) warnings.push({ key: 'tera', detail: set.teraType })
    delete set.teraType
    delete set.terastallized
  }
  if (!meta.hasDynamax) {
    delete set.dynamax
    delete set.gmax
  }
  return { set, kept }
}

function snapshotOf(payload: SharePayload, warnings: ShareWarning[]) {
  const { gen } = payload
  const { bridge } = getLib()
  const cur = store.get()
  const mine = validate(gen, payload.mine, warnings)
  const opp = validate(gen, payload.opp, warnings)
  if (!mine && !opp) return undefined
  const regulation = bridge.resolveRegulationId(gen, payload.regulation)
  if (regulation !== payload.regulation)
    warnings.push({ key: 'regulation', detail: payload.regulation })
  // The shared row: its slot moves when earlier moves of that build were dropped.
  let focus: MoveRef | undefined
  if (payload.move) {
    const side = payload.move.direction === 'forward' ? mine : opp
    const slot = side?.kept.indexOf(payload.move.index) ?? -1
    if (slot >= 0) focus = { direction: payload.move.direction, index: slot }
    else warnings.push({ key: 'selection' })
  }
  const snapshot: MatchupSnapshot = {
    gen,
    format: payload.format,
    regulation,
    regulations: { ...cur.regulations, [gen]: regulation },
    mine: mine?.set,
    opp: opp?.set,
    mineTeamIndex: undefined,
    oppPreset: null,
    field: sanitizeField(GEN_META[gen], payload.field, payload.format),
    direction: focus?.direction ?? cur.direction,
    lastChanged: 'opp',
  }
  return { snapshot, focus }
}

let inFlight: string | undefined
let noticeId = 0

/**
 * Open a link token (`2<payload>` or `v1.<payload>`): clears the hash (so a reload does not apply it again), waits
 * for the app, decodes with full validation, switches generation / regulation / format, replaces
 * the matchup and announces it with an Undo. Never throws; on failure the state is untouched.
 */
export async function openSharedLink(token: string): Promise<void> {
  if (inFlight === token) return
  inFlight = token
  replaceRoute('/')
  const fail = (reason: 'offline' | DecodeFailure) => setShareNotice({ kind: 'error', reason })
  try {
    await initApp()
    if (!store.get().booted) return fail('offline')
    const { decodeShare } = await import('../share/codec')
    const res = await decodeShare(token)
    if (!res.ok) return fail(res.reason)
    const before = snapshotMatchup()
    const warnings = [...res.warnings]
    let focus: MoveRef | undefined
    const outcome = await applyMatchupSnapshot(res.payload.gen, () => {
      const r = snapshotOf(res.payload, warnings)
      focus = r?.focus
      return r?.snapshot
    })
    if (outcome === 'offline') return fail('offline')
    if (outcome !== 'ok') return fail('data')
    if (store.get().calcError) {
      // The linked matchup makes the engine throw: put the previous one back instead of keeping it.
      console.warn('Shared calc could not be calculated; restoring the previous matchup')
      await applyMatchupSnapshot(before.gen, () => before)
      return fail('data')
    }
    setFocusMove(focus)
    setShareNotice({ kind: 'loaded', id: ++noticeId, warnings, undo: before })
    trackShareOpen()
  } catch {
    fail('data')
  } finally {
    inFlight = undefined
  }
}

/** "Undo" of a shared-calc load: puts the previous generation / regulation / format / matchup back. */
export async function undoSharedLoad(): Promise<void> {
  const n = store.get().shareNotice
  if (n?.kind !== 'loaded') return
  setShareNotice(undefined)
  await applyMatchupSnapshot(n.undo.gen, () => n.undo)
}
