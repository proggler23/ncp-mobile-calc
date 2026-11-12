import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataVersionInfo as VersionInfo } from '../../data/version'
import { store } from '../../state/app'
import { DataVersionInfo, formatDataDate, formatUsageMonth } from './DataVersionInfo'

const info: VersionInfo = {
  ncpSha: 'a2e408ca905dd64d3ee29a1956edfbe74d1c4072',
  ncpSyncedAt: '2026-11-12T08:53:57Z',
  showdownVersion: '0.11.11',
  usageMonths: { champions: ['2026-08', '2026-10'], gsc: [] },
  namesSnapshotDate: '2026-10-01',
  builtAt: '2026-11-12T09:00:00Z',
}

afterEach(cleanup)

function show(lang: 'en' | 'de', gen: 'champions' | 'gsc') {
  act(() => store.set({ lang, gen }))
  render(<DataVersionInfo info={info} />)
}

describe('DataVersionInfo', () => {
  it('shows linked short SHA, versions and usage months (en)', () => {
    show('en', 'champions')
    const link = screen.getByRole('link', { name: 'a2e408c' })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator/commit/a2e408ca905dd64d3ee29a1956edfbe74d1c4072',
    )
    expect(screen.getByText('0.11.11')).toBeInTheDocument()
    expect(screen.getByText('Aug 2026, Oct 2026')).toBeInTheDocument()
    expect(screen.getAllByText('Nov 12, 2026')).toHaveLength(2)
    expect(screen.getByText('Oct 1, 2026')).toBeInTheDocument()
    expect(screen.getByText('NCP synced')).toBeInTheDocument()
  })

  it('localizes labels and dates (de)', () => {
    show('de', 'champions')
    expect(screen.getByText('NCP synchronisiert')).toBeInTheDocument()
    expect(screen.getAllByText('12.11.2026')).toHaveLength(2)
    expect(screen.getByText('01.10.2026')).toBeInTheDocument()
  })

  it('reports missing usage data for a generation without months', () => {
    show('en', 'gsc')
    expect(screen.getByText('no usage data')).toBeInTheDocument()
  })

  it('formats helpers and tolerates bad input', () => {
    expect(formatDataDate('2026-10-01', 'en')).toBe('Oct 1, 2026')
    expect(formatDataDate('garbage', 'en')).toBe('garbage')
    expect(formatUsageMonth('2026-10', 'en')).toBe('Oct 2026')
  })
})
