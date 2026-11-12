import type { DataGenId } from '../bridge/types'
import type { Status } from '../engine/types'

const COMMON: Status[] = ['Healthy', 'Burned', 'Paralyzed', 'Poisoned', 'Badly Poisoned']

/**
 * Status conditions offered for a generation (single source of truth for the editor and the card
 * chip). NCP's engine accepts every one of them in every generation (the damage code just ignores
 * those without a damage effect, e.g. Toxic in gen 1); Z-A swaps Sleep for Drowsy, as NCP does.
 */
export function statusOptions(gen: DataGenId): Status[] {
  return [...COMMON, gen === 'za' ? 'Drowsy' : 'Asleep', 'Frozen']
}
