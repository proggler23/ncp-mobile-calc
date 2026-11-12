import { useTranslate, type TFn } from '../i18n'
import { store, type AppState } from './app'
import { useStore } from './store'

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector)
}

export function useT(): TFn {
  return useTranslate(useApp((s) => s.lang))
}
