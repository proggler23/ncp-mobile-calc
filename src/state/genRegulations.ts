/**
 * What the combined generation/regulation select offers. The regulation data itself only loads
 * together with a generation's bridge, but the select lists the options of every generation up
 * front, so the ids and labels are mirrored here (src/state/genRegulations.test.ts checks them
 * against src/data/generated/<gen>/regulations.json).
 */
import { GEN_DATA_IDS, GEN_META } from '../bridge/gens'
import type { DataGenId } from '../bridge/types'
import { NO_REGULATION } from '../data/types'
import { translate } from '../i18n'
import type { Lang } from '../storage/types'

interface RegLabels {
  id: string
  en: string
  de: string
}

export const GEN_REGULATIONS: Partial<Record<DataGenId, readonly RegLabels[]>> = {
  champions: [
    { id: 'regmc', en: 'Reg M-C', de: 'Reg. M-C' },
    { id: 'regmb', en: 'Reg M-B', de: 'Reg. M-B' },
    { id: 'regma', en: 'Reg M-A', de: 'Reg. M-A' },
  ],
  sv: [
    { id: 'regi', en: 'Reg I', de: 'Reg. I' },
    { id: 'regg', en: 'Reg G', de: 'Reg. G' },
    { id: 'regd', en: 'Reg D', de: 'Reg. D' },
    { id: 'regc', en: 'Reg C', de: 'Reg. C' },
  ],
}

export interface GenSelectOption {
  value: string
  text: string
  gen: DataGenId
  /** Regulation to select together with the generation (absent: generation without regulations) */
  regulation?: string
}

export interface GenSelectGroup {
  label: string
  options: GenSelectOption[]
}

/** `Reg M-C` / `Reg. M-C` -> `M-C` */
function shortReg(label: string): string {
  return label.replace(/^Reg\.?\s+/, '')
}

export const genSelectValue = (gen: DataGenId, regulation: string): string =>
  GEN_REGULATIONS[gen] ? `${gen}:${regulation}` : gen

/** One group per generation; generations without regulations are a single plain option. */
export function genSelectGroups(lang: Lang): GenSelectGroup[] {
  return GEN_DATA_IDS.map((gen) => {
    const label = GEN_META[gen].label
    const regs = GEN_REGULATIONS[gen]
    if (!regs) return { label, options: [{ value: gen, text: label, gen }] }
    return {
      label,
      options: [
        ...regs.map((r) => ({
          value: `${gen}:${r.id}`,
          text: `${label} · ${shortReg(r[lang])}`,
          gen,
          regulation: r.id,
        })),
        {
          value: `${gen}:${NO_REGULATION}`,
          text: `${label} · ${translate(lang, 'reg.none')}`,
          gen,
          regulation: NO_REGULATION,
        },
      ],
    }
  })
}

/** Parse a select value back into generation + regulation. */
export function parseGenSelectValue(value: string): { gen: DataGenId; regulation?: string } {
  const [gen, regulation] = value.split(':')
  return { gen: gen as DataGenId, regulation }
}
