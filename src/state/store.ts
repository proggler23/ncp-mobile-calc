import { useSyncExternalStore } from 'react'

/** Tiny external store (no dependency): `get`, `set` (shallow merge), `subscribe`. */
export interface Store<S> {
  get(): S
  set(patch: Partial<S>): void
  replace(next: S): void
  subscribe(fn: () => void): () => void
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((fn) => fn())
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch }
      emit()
    },
    replace(next) {
      state = next
      emit()
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

/** Select a slice; the selector must return referentially stable values (primitives/objects in state). */
export function useStore<S, T>(store: Store<S>, selector: (s: S) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}
