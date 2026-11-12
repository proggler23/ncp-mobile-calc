import { useCallback, useState } from 'react'
import { useT } from '../../state/hooks'
import { errorKey } from '../../state/teams'

/** Runs a storage action; a failure becomes a translated message instead of an exception. */
export function useRunner() {
  const t = useT()
  const [error, setError] = useState<string>()
  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      setError(undefined)
      try {
        return await fn()
      } catch (e) {
        setError(t(errorKey(e)))
        return undefined
      }
    },
    [t],
  )
  return { error, run, clear: () => setError(undefined) }
}
