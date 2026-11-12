import { getDataVersionInfo, type DataVersionInfo as VersionInfo } from '../../data/version'
import type { Lang } from '../../i18n'
import { useApp, useT } from '../../state/hooks'
import { regulationName } from '../../state/regulation'

export const NCP_REPO_URL = 'https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator'

/** Format an ISO date/time (or `YYYY-MM-DD`) as a medium date in the language; '' if unparsable. */
export function formatDataDate(iso: string, lang: Lang): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(d)
}

/** `YYYY-MM` -> "Oct 2026" / "Okt. 2026". */
export function formatUsageMonth(month: string, lang: Lang): string {
  const d = new Date(`${month}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return month
  return new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    d,
  )
}

/** Provenance of the bundled data (compact definition list in the menu's About section). */
export function DataVersionInfo({ info = getDataVersionInfo() }: { info?: VersionInfo }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const gen = useApp((s) => s.gen)
  const regulation = useApp((s) => s.regulation)
  const months = info.usageMonths[gen] ?? []
  const regInfo = info.regulations?.[gen]?.[regulation]
  const regSource =
    regInfo === undefined
      ? t('menu.data.regSource.none')
      : regInfo.source === 'showdown'
        ? t('menu.data.regSource.showdown')
        : regInfo.verified === false
          ? t('menu.data.regSource.unverified')
          : t('menu.data.regSource.manual')
  const pop = info.popular?.[gen]?.[regulation]
  return (
    <dl className="data-info" aria-label={t('menu.data.title')}>
      <dt>{t('menu.data.ncp')}</dt>
      <dd>
        <a href={`${NCP_REPO_URL}/commit/${info.ncpSha}`} target="_blank" rel="noreferrer noopener">
          <code>{info.ncpSha.slice(0, 7)}</code>
        </a>
      </dd>
      <dt>{t('menu.data.ncpSynced')}</dt>
      <dd>{formatDataDate(info.ncpSyncedAt, lang)}</dd>
      <dt>{t('menu.data.showdown')}</dt>
      <dd>{info.showdownVersion}</dd>
      <dt>{t('menu.data.regulation')}</dt>
      <dd>
        {regulationName(gen, regulation, lang)} ({regSource})
      </dd>
      <dt>{t('menu.data.usage')}</dt>
      <dd>
        {months.length
          ? months.map((m) => formatUsageMonth(m, lang)).join(', ')
          : t('menu.data.noUsage')}
      </dd>
      <dt>{t('menu.data.popular')}</dt>
      <dd>
        {pop
          ? t('menu.data.popularValue', {
              format: pop.format,
              month: formatUsageMonth(pop.month, lang),
              cutoff: pop.cutoff,
            })
          : t('menu.data.noPopular')}
      </dd>
      <dt>{t('menu.data.names')}</dt>
      <dd>{formatDataDate(info.namesSnapshotDate, lang)}</dd>
      <dt>{t('menu.data.built')}</dt>
      <dd>{formatDataDate(info.builtAt, lang)}</dd>
    </dl>
  )
}
