import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SUPPORT_URL } from '../../config'
import { store } from '../../state/app'
import { MenuSheet } from './MenuSheet'

afterEach(cleanup)

describe('MenuSheet support link', () => {
  it.each([
    ['en', '☕ Support this project', 'Helps cover development & hosting'],
    ['de', '☕ Projekt unterstützen', 'Unterstützt Entwicklung & Hosting'],
  ] as const)('renders a safe external link (%s)', (lang, label, hint) => {
    act(() => store.set({ lang }))
    render(<MenuSheet onClose={() => {}} />)
    const link = screen.getByRole('link', { name: label })
    expect(link).toHaveAttribute('href', SUPPORT_URL)
    expect(SUPPORT_URL).toBe('https://buymeacoffee.com/proggler23')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText(hint)).toBeInTheDocument()
  })
})
