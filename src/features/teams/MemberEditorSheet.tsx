import { useState } from 'react'
import type { DataGenId, SavedSetLike } from '../../bridge/types'
import { useT } from '../../state/hooks'
import { Dialog } from '../../ui/Dialog'
import { PokemonEditor } from '../editor/PokemonEditor'

/** Edits one team member on a local draft; only "Save" writes it back. */
export function MemberEditorSheet({
  gen,
  regulation,
  initial,
  onSave,
  onClose,
}: {
  gen: DataGenId
  regulation?: string
  initial: SavedSetLike
  onSave: (set: SavedSetLike) => void
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(initial)
  return (
    <Dialog title={t('teams.editMember')} onClose={onClose} closeLabel={t('common.close')}>
      <PokemonEditor
        gen={gen}
        regulation={regulation}
        value={draft}
        onChange={setDraft}
        battleState={false}
      />
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onSave(draft)
            onClose()
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </Dialog>
  )
}
