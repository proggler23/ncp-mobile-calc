import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// findBy*/waitFor wait for lazy chunks and data loads; the 1s default is too tight under load.
configure({ asyncUtilTimeout: 20_000 })
