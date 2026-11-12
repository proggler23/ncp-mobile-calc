import type { DataGenId } from '../../bridge/types'
import { useApp, useT } from '../../state/hooks'
import { buildProblemsOf, problemText, regulationName } from '../../state/regulation'
import './legal.css'

type SetLike = { speciesId: string; itemId?: string; moveIds: readonly string[] }

/**
 * Small "not legal in Reg X" marker for a saved or loaded build; nothing when the build is legal
 * (or the regulation is "No filter"). `detail` also lists what is illegal.
 */
export function LegalBadge({
  gen,
  regulation,
  set,
  detail = false,
}: {
  gen: DataGenId
  regulation: string
  set: SetLike
  detail?: boolean
}) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const problems = buildProblemsOf(gen, regulation, set)
  if (!problems) return null
  const reg = regulationName(gen, regulation, lang)
  const what = problemText(gen, problems, set, lang)
  return (
    <span className="legal-badge" role="note" title={t('reg.notLegalWhat', { reg, what })}>
      <span aria-hidden="true">⚠ </span>
      {detail ? t('reg.notLegalWhat', { reg, what }) : t('reg.notLegal', { reg })}
    </span>
  )
}
