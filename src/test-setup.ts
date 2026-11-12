import { vi } from 'vitest'
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// findBy*/waitFor wait for lazy chunks and data loads; the 1s default is too tight under load.
configure({ asyncUtilTimeout: 20_000 })

// Unit tests never send usage statistics, whatever a local .env says (analytics tests stub it).
vi.stubEnv('VITE_GOATCOUNTER_URL', '')
