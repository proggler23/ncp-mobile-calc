import { updateSet, type Side } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { Dialog } from '../../ui/Dialog'
import { PokemonEditor } from '../editor/PokemonEditor'

export function EditorSheet({ side, onClose }: { side: Side; onClose: () => void }) {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const set = useApp((s) => s[side])
  if (!set) return null
  return (
    <Dialog
      title={t(side === 'mine' ? 'ed.titleMine' : 'ed.titleOpp')}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      <PokemonEditor gen={gen} value={set} onChange={(next) => updateSet(side, () => next)} />
      <div className="sheet-actions">
        {side === 'mine' && (
          // TODO(Phase 5b): save the build to the active team / as a custom set.
          <button type="button" className="btn" disabled title={t('ed.saveSoon')}>
            {t('ed.save')}
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {t('common.done')}
        </button>
      </div>
    </Dialog>
  )
}
