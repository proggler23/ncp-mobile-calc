/**
 * "Popular" usage lists for the pickers (generated/<gen>/popular.json, Smogon usage stats).
 * The file is a separate lazy chunk per generation; `usePopularFile` loads it once per session.
 * "No filter" (regulation `none`) has no popular data (usage belongs to one regulation's metagame).
 */
import { useEffect, useState } from 'react'
import { loadPopular } from '../data'
import type {
  GenId,
  PopularEntry,
  PopularFile,
  PopularRegulation,
  PopularSpecies,
} from '../data/types'
import { own } from '../own'

const loaded = new Map<GenId, PopularFile | null>()

/** The generation's popular data once loaded (`undefined` while loading or when it has none). */
export function usePopularFile(gen: GenId): PopularFile | undefined {
  const [, bump] = useState(0)
  useEffect(() => {
    if (loaded.has(gen)) return
    let live = true
    loadPopular(gen)
      .then((f) => loaded.set(gen, f ?? null))
      .catch(() => loaded.set(gen, null))
      .finally(() => live && bump((n) => n + 1))
    return () => {
      live = false
    }
  }, [gen])
  return loaded.get(gen) ?? undefined
}

/** Stats behind a regulation's lists (format, month, cutoff); undefined for `none` / no data. */
export function popularRegulation(
  file: PopularFile | undefined,
  regulation: string,
): PopularRegulation | undefined {
  return file ? own(file.regs, regulation) : undefined
}

export type PopularKind = keyof PopularSpecies

/** Usage list of one species (sorted by usage), or undefined when there is nothing to show. */
export function popularList(
  file: PopularFile | undefined,
  regulation: string,
  speciesId: string,
  kind: PopularKind,
): readonly PopularEntry[] | undefined {
  const sp = own(popularRegulation(file, regulation)?.species ?? {}, speciesId)
  const list = sp?.[kind]
  return list?.length ? list : undefined
}
