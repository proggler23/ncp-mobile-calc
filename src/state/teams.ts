/**
 * Team / custom set actions. Everything goes through the storage repository and then refreshes the
 * app store (`reloadLibrary`), so the chips row, the teams screen and the opponent's "Saved" sets
 * always show what is stored. Only *set data* is ever written here: battle state (boosts, status,
 * HP, Tera/Dynamax toggles, move overrides) is stripped by `setToBody`.
 */
import type { DataGenId, SavedSetLike } from '../bridge/types'
import type { Key } from '../i18n'
import {
  StorageError,
  emptySpread,
  exportPaste,
  importPaste,
  newUid,
  type CustomSet,
  type SavedSet,
  type SetBody,
  type Team,
} from '../storage'
import { LIMITS } from '../storage/types'
import { getRepository, reloadLibrary, selectTeamMember, setGen, store } from './app'
import { getLib } from './lib'
import { blankSet } from './sets'

export { StorageError }

/** Translation key for a thrown storage error (or any unknown failure). */
export function errorKey(e: unknown): Key {
  if (e instanceof StorageError) {
    return e.code === 'limit'
      ? 'err.limit'
      : e.code === 'not-found'
        ? 'err.notFound'
        : 'err.invalid'
  }
  return 'err.storage'
}

/** The persistent part of a build: no boosts, status, HP, Tera/Dynamax state or move overrides. */
export function setToBody(gen: DataGenId, set: SavedSetLike): SetBody {
  const meta = getLib().bridge.GEN_META[gen]
  const body: SetBody = {
    level: set.level ?? 50,
    nature: set.nature ?? 'Serious',
    moveIds: set.moveIds.slice(0, LIMITS.maxMoves),
    evs:
      meta.usesStatPoints || meta.engineGen <= 2
        ? emptySpread(0)
        : { ...emptySpread(0), ...set.evs },
    ivs: { ...emptySpread(31), ...set.ivs },
  }
  if (set.nickname) body.nickname = set.nickname
  if (set.abilityId) body.abilityId = set.abilityId
  if (set.itemId) body.itemId = set.itemId
  if (meta.usesStatPoints) body.statPoints = { ...emptySpread(0), ...set.statPoints }
  if (set.teraType && meta.hasTera) body.teraType = set.teraType
  if (set.gender) body.gender = set.gender
  if (set.notes) body.notes = set.notes
  return body
}

function toMember(gen: DataGenId, uid: string, set: SavedSetLike): SavedSet {
  return { uid, gen, speciesId: set.speciesId, ...setToBody(gen, set) }
}

async function repo() {
  return getRepository()
}

async function team(uid: string): Promise<Team> {
  const t = await (await repo()).getTeam(uid)
  if (!t) throw new StorageError('Team not found', 'not-found')
  return t
}

async function write(uid: string, members: SavedSet[]): Promise<Team> {
  const t = await (await repo()).updateTeam(uid, { members })
  await reloadLibrary()
  clearTeamSelection(uid)
  return t
}

/** Structure changes invalidate the "this build came from chip i" link. */
function clearTeamSelection(uid: string): void {
  const s = store.get()
  if (s.team?.uid === uid && s.mineTeamIndex !== undefined) {
    const m = s.team.members[s.mineTeamIndex]
    if (!m || m.speciesId !== s.mine?.speciesId) store.set({ mineTeamIndex: undefined })
  }
}

// ---------------------------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------------------------

export async function createTeam(
  name: string,
  gen: DataGenId,
  members: SavedSet[] = [],
): Promise<Team> {
  const r = await repo()
  const t = await r.createTeam({ name: name.trim() || 'Team', gen, members })
  if (!store.get().team) await r.setActiveTeam(t.uid)
  await reloadLibrary()
  return t
}

export async function renameTeam(uid: string, name: string): Promise<void> {
  await (await repo()).updateTeam(uid, { name: name.trim().slice(0, LIMITS.maxNameLength) })
  await reloadLibrary()
}

export async function deleteTeam(uid: string): Promise<void> {
  await (await repo()).deleteTeam(uid)
  const s = store.get()
  if (s.team?.uid === uid) store.set({ team: undefined, mineTeamIndex: undefined })
  await reloadLibrary()
}

export async function duplicateTeam(uid: string, copyLabel: string): Promise<Team> {
  const src = await team(uid)
  const members = src.members.map((m) => ({ ...structuredClone(m), uid: newUid() }))
  const name = `${src.name} ${copyLabel}`.slice(0, LIMITS.maxNameLength)
  const t = await (await repo()).createTeam({ name, gen: src.gen, members })
  await reloadLibrary()
  return t
}

export async function setActiveTeam(uid: string | undefined): Promise<void> {
  await (await repo()).setActiveTeam(uid)
  store.set({ mineTeamIndex: undefined })
  await reloadLibrary()
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

/** A fresh member: the species' most used ("Common") set, else the neutral build. */
export async function defaultSet(gen: DataGenId, speciesId: string): Promise<SavedSetLike> {
  const { bridge } = getLib()
  let sets: Awaited<ReturnType<typeof bridge.loadCommonSets>>
  try {
    sets = await bridge.loadCommonSets(gen, speciesId)
  } catch {
    sets = undefined
  }
  const blank = blankSet(gen, speciesId)
  const common = sets?.length ? bridge.applyPreset(gen, blank, 'common', sets) : undefined
  return common ?? bridge.applyPreset(gen, blank, 'neutral')
}

export async function addMember(teamUid: string, speciesId: string): Promise<void> {
  const t = await team(teamUid)
  if (t.members.length >= LIMITS.maxMembers) throw new StorageError('Team is full', 'limit')
  const set = await defaultSet(t.gen, speciesId)
  await write(teamUid, [...t.members, toMember(t.gen, newUid(), set)])
}

export async function updateMember(
  teamUid: string,
  memberUid: string,
  set: SavedSetLike,
): Promise<void> {
  const t = await team(teamUid)
  if (!t.members.some((m) => m.uid === memberUid))
    throw new StorageError('Member not found', 'not-found')
  await write(
    teamUid,
    t.members.map((m) => (m.uid === memberUid ? toMember(t.gen, m.uid, set) : m)),
  )
}

export async function removeMember(teamUid: string, memberUid: string): Promise<void> {
  const t = await team(teamUid)
  await write(
    teamUid,
    t.members.filter((m) => m.uid !== memberUid),
  )
}

export async function moveMember(teamUid: string, index: number, delta: -1 | 1): Promise<void> {
  const t = await team(teamUid)
  const to = index + delta
  if (to < 0 || to >= t.members.length || !t.members[index]) return
  const members = [...t.members]
  ;[members[index], members[to]] = [members[to]!, members[index]!]
  await write(teamUid, members)
}

/** Save a battle build into a team: updates the member at `index` or appends (when < 6). */
export async function saveToTeam(
  teamUid: string,
  set: SavedSetLike,
  memberUid?: string,
): Promise<void> {
  const t = await team(teamUid)
  if (memberUid && t.members.some((m) => m.uid === memberUid)) {
    await updateMember(teamUid, memberUid, set)
    return
  }
  if (t.members.length >= LIMITS.maxMembers) throw new StorageError('Team is full', 'limit')
  await write(teamUid, [...t.members, toMember(t.gen, newUid(), set)])
}

// ---------------------------------------------------------------------------------------------
// Showdown paste
// ---------------------------------------------------------------------------------------------

export interface PasteOutcome {
  team?: Team
  imported: number
  warnings: string[]
}

/** Parses `text` for the current generation; creates a team, or replaces `target`'s members. */
export async function importPasteAsTeam(
  gen: DataGenId,
  text: string,
  opts: { name: string; target?: string },
): Promise<PasteOutcome> {
  const data = getLib().bridge.getBridge(gen).data
  const { members, warnings } = importPaste(text, gen, data)
  if (members.length === 0) return { imported: 0, warnings }
  const t = opts.target
    ? await write(opts.target, members)
    : await createTeam(opts.name, gen, members)
  return { team: t, imported: members.length, warnings }
}

export function teamPaste(t: Team): string {
  return exportPaste(t.members, getLib().bridge.getBridge(t.gen).data)
}

// ---------------------------------------------------------------------------------------------
// Custom sets
// ---------------------------------------------------------------------------------------------

export async function saveCustomSet(
  gen: DataGenId,
  name: string,
  set: SavedSetLike,
): Promise<CustomSet> {
  const cs = await (
    await repo()
  ).createCustomSet({
    name: name.trim().slice(0, LIMITS.maxNameLength) || set.speciesId,
    gen,
    speciesId: set.speciesId,
    set: setToBody(gen, set),
  })
  await reloadLibrary()
  return cs
}

export async function deleteCustomSet(uid: string): Promise<void> {
  await (await repo()).deleteCustomSet(uid)
  await reloadLibrary()
}

/** Make a team the active one, switching to its generation and selecting its first member. */
export async function switchActiveTeam(uid: string): Promise<void> {
  await setActiveTeam(uid)
  const t = store.get().team
  if (!t || t.uid !== uid) return
  if (t.gen !== store.get().gen) await setGen(t.gen)
  const s = store.get()
  if (s.gen === t.gen && t.members.length > 0 && s.booted) selectTeamMember(0)
}
