import { FACADE_SOURCE } from './facade-source'
import {
  createDocument,
  createJQuery,
  createLocalStorage,
  type FormState,
  type JQueryStub,
} from './jquery-stub'

/** NCP dex entry (only the fields the adapter reads). */
export interface DexEntry {
  t1: string
  t2?: string
  bs: Record<string, number>
  w?: number
  ab?: string
  formes?: string[]
  isAlternateForme?: boolean
  canEvolve?: boolean
}

export interface MoveData {
  bp?: number
  type: string
  category: 'Physical' | 'Special' | 'Status'
  alwaysCrit?: boolean
  hitRange?: number | [number, number]
  canDouble?: boolean
  isPledge?: boolean
  linearAddBP?: boolean
  usesOppMoves?: boolean
  plusEffects?: {
    bp?: number
    alwaysCrit?: boolean
    hitRange?: number | [number, number]
    cooldown?: number
  }
}

export interface GenData {
  pokedex: Record<string, DexEntry>
  moves: Record<string, MoveData>
  items: string[]
  abilities: string[]
  typeChart: Record<string, Record<string, number>>
  STATS: string[]
  natures: Record<string, [string, string]>
  gmaxDefaults: string[]
}

/** Raw result entry of NCP's `damageResults[side][slot]`. */
export interface RawMoveResult {
  damage: number[] | number[][]
  description: string
  damageText: string
  koChanceText: string
  hits: number
  cooldown?: string
}

export type StubNode = Record<string, (...args: unknown[]) => unknown>

/** Surface returned by the facade appended to the vendored scripts (see facade-source.ts). */
export interface SandboxApi {
  configureGen(gen: number, natdex: boolean): void
  data(): GenData
  hasMoveDataZA(): boolean
  calcHP(poke: unknown): void
  calcStats(poke: unknown): void
  getHPDVs(poke: unknown): number
  setResultDisplay(mode: string): void
  run(): [RawMoveResult[], RawMoveResult[]]
  calcMinMaxDamage(damage: number[] | number[][], hits: number): [number, number]
}

export interface Runtime {
  api: SandboxApi
  /** Evaluates additional classic-script text inside the sandbox scope. */
  evalScript(code: string): void
  stub: JQueryStub
  state: FormState
  zaLoaded: boolean
}

/**
 * Implicit globals created by the vendored (sloppy-mode) scripts by assigning to undeclared names.
 * Declaring them up front keeps them inside the sandbox function scope instead of leaking onto the
 * real global object. A test asserts that no new globals appear.
 */
const IMPLICIT_GLOBALS = [
  'i',
  'n',
  'type',
  'ab',
  'variable',
  'moveSyn',
  'ivSpec',
  'ivSpecifics',
  'exactSpreads',
  'iv',
  'currStat',
  'stat',
  'targetRange',
  'isLastDmg',
  'moveProp',
  'autoLevel',
  'M',
  'eachVal',
  'eotType',
  'damageNum',
  'addedNum',
  'pivotNum',
  'spreadNum',
  'finalNum',
  'allStats',
  'attacker_name',
  'defender_name',
  'immuneBuildDesc',
  'setDamageBuildDesc',
  'atMods',
  'defense',
  'finalMods',
  'check',
  'overlordBoost',
].join(',')

/**
 * Build the sandbox: evaluates the vendored scripts + facade as the body of one function whose
 * parameters are the stubbed browser globals (`$`, `localStorage`, `document`, ...).
 */
export function createSandbox(scripts: readonly string[], state: FormState): Runtime {
  const stub = createJQuery(state)
  const body = `var ${IMPLICIT_GLOBALS};\n${scripts.join('\n;\n')}\n;\n${FACADE_SOURCE}`
  // The scripts are sloppy-mode classic scripts. The body is a generator (see facade-source.ts) so
  // that later scripts can be evaluated in the same scope; sloppy mode is the default for it.
  const GeneratorFunction = Object.getPrototypeOf(function* () {}).constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Generator<SandboxApi, void, string | undefined>
  const factory = new GeneratorFunction('$', 'localStorage', 'document', 'alert', 'console', body)
  const generator = factory(
    stub.$,
    createLocalStorage({ dex: 'vgcdex' }),
    createDocument(),
    (msg: unknown) => {
      throw new Error(`NCP alert: ${String(msg)}`)
    },
    console,
  )
  const api = generator.next().value as SandboxApi
  return {
    api,
    evalScript: (code) => void generator.next(code),
    stub,
    state,
    zaLoaded: false,
  }
}
