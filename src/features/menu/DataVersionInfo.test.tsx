import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataVersionInfo as VersionInfo } from '../../data/version'
import { store } from '../../state/app'
import { prepareLib } from '../../state/lib'
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

  it('shows the active regulation and where its list comes from', async () => {
    await prepareLib('champions')
    const withRegs: VersionInfo = {
      ...info,
      regulations: {
        champions: {
          regmc: { source: 'manual', verified: true },
          regmb: { source: 'showdown' },
          regma: { source: 'manual', verified: false },
        },
      },
    }
    const view = (lang: 'en' | 'de', regulation: string) => {
      cleanup()
      act(() => store.set({ lang, gen: 'champions', regulation }))
      render(<DataVersionInfo info={withRegs} />)
    }
    view('en', 'regmc')
    expect(screen.getByText('Reg M-C (hand-maintained list)')).toBeInTheDocument()
    view('en', 'regmb')
    expect(screen.getByText('Reg M-B (derived from Pokémon Showdown)')).toBeInTheDocument()
    view('en', 'regma')
    expect(screen.getByText('Reg M-A (hand-maintained list, not verified)')).toBeInTheDocument()
    view('en', 'none')
    expect(screen.getByText('No filter (all entries the calculator knows)')).toBeInTheDocument()
    view('de', 'regmc')
    expect(screen.getByText('Regelwerk')).toBeInTheDocument()
    expect(screen.getByText('Reg. M-C (handgepflegte Liste)')).toBeInTheDocument()
    act(() => store.set({ regulation: 'none' }))
  })

  it('formats helpers and tolerates bad input', () => {
    expect(formatDataDate('2026-10-01', 'en')).toBe('Oct 1, 2026')
    expect(formatDataDate('garbage', 'en')).toBe('garbage')
    expect(formatUsageMonth('2026-10', 'en')).toBe('Oct 2026')
  })
})
