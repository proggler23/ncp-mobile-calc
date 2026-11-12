/**
 * Minimal jQuery stand-in for the vendored (unmodified) NCP scripts.
 *
 * The NCP calc reads its inputs from the DOM through jQuery (`$("#p1").find(".hp .total").text()`,
 * `$("input:radio[name='weather']:checked").val()`, ...). This stub answers those reads from a
 * plain in-memory `FormState` instead, and silently ignores the UI-only calls (event binding,
 * show/hide, select2, ...) that the scripts make at load time and from `calculate()`.
 *
 * Unknown methods are recorded in `stub.unknownCalls` so tests can verify that no *read* the
 * engine path depends on is being silently swallowed.
 */

export interface Cell {
  val?: unknown
  text?: string
  checked?: boolean
  selectedIndex?: number
  props?: Record<string, unknown>
  attrs?: Record<string, unknown>
}

/** Plain in-memory replacement for the page DOM. */
export class FormState {
  /** Per-Pokemon form controls, keyed by normalized selector path (e.g. `.hp .base`). */
  readonly pokes: Record<'p1' | 'p2', Map<string, Cell>> = { p1: new Map(), p2: new Map() }
  /** Global controls keyed by raw selector (e.g. `#gravity`). */
  readonly globals = new Map<string, Cell>()
  /** Checked value of radio groups, keyed by `name`. */
  readonly radios = new Map<string, string>()

  clear(): void {
    this.pokes.p1.clear()
    this.pokes.p2.clear()
    this.globals.clear()
    this.radios.clear()
  }

  cell(scope: 'p1' | 'p2' | null, path: string): Cell {
    const map = scope ? this.pokes[scope] : this.globals
    let c = map.get(path)
    if (!c) {
      c = {}
      map.set(path, c)
    }
    return c
  }
}

/** Methods that only affect the UI; calling them is a deliberate no-op. */
const NOOP_METHODS = new Set([
  'show',
  'hide',
  'trigger',
  'change',
  'keyup',
  'click',
  'bind',
  'on',
  'off',
  'one',
  'ready',
  'removeClass',
  'addClass',
  'toggleClass',
  'css',
  'append',
  'prepend',
  'remove',
  'empty',
  'html',
  'select2',
  'focus',
  'blur',
  'data',
  'toggle',
  'fadeIn',
  'fadeOut',
])

/** Normalizes `select.ability` / `input.set-selector` style paths to plain class paths. */
function normalizePath(sel: string): string {
  return sel
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/^(select|input|div|span|label)(?=\.)/, ''))
    .join(' ')
}

type Kind =
  | { t: 'scope'; scope: 'p1' | 'p2'; path: string }
  | { t: 'radio'; name: string }
  | { t: 'checkbox-id'; id: string }
  | { t: 'global'; sel: string }

function parseSelector(sel: string): Kind {
  const scoped = /^#(p1|p2)(?:\s+(.+))?$/.exec(sel)
  if (scoped) {
    return {
      t: 'scope',
      scope: scoped[1] as 'p1' | 'p2',
      path: scoped[2] ? normalizePath(scoped[2]) : '',
    }
  }
  const radio = /^input:radio\[name=['"]([^'"]+)['"]\]:checked$/.exec(sel)
  if (radio) return { t: 'radio', name: radio[1]! }
  const chk = /^input:checkbox\[id=['"]([^'"]+)['"]\]:checked$/.exec(sel)
  if (chk) return { t: 'checkbox-id', id: chk[1]! }
  return { t: 'global', sel }
}

export interface JQueryStub {
  $: StubFn
  state: FormState
  /** Names of methods that were called on a stub node but are neither implemented nor known no-ops. */
  unknownCalls: Set<string>
}

type StubNode = Record<string, unknown>
export type StubFn = ((arg?: unknown) => StubNode) & {
  extend: (...args: unknown[]) => unknown
  isEmptyObject: (o: unknown) => boolean
  fn: Record<string, unknown>
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v) as unknown
  return proto === Object.prototype || proto === null
}

/** jQuery.extend semantics (shallow and deep), enough for the vendored data files. */
export function extend(...args: unknown[]): unknown {
  let deep = false
  let i = 0
  if (typeof args[0] === 'boolean') {
    deep = args[0]
    i = 1
  }
  const target = (args[i] ?? {}) as Record<string, unknown>
  for (let n = i + 1; n < args.length; n++) {
    const src = args[n] as Record<string, unknown> | null | undefined
    if (src == null) continue
    for (const key of Object.keys(src)) {
      const v = src[key]
      if (v === undefined || target === v) continue
      if (deep && (isPlainObject(v) || Array.isArray(v))) {
        const cur = target[key]
        const base = Array.isArray(v)
          ? Array.isArray(cur)
            ? cur
            : []
          : isPlainObject(cur)
            ? cur
            : {}
        target[key] = extend(true, base, v)
      } else {
        target[key] = v
      }
    }
  }
  return target
}

export function createJQuery(state: FormState): JQueryStub {
  const unknownCalls = new Set<string>()

  function makeNode(kind: Kind): StubNode {
    const cellOf = (): Cell =>
      kind.t === 'scope'
        ? state.cell(kind.scope, kind.path)
        : kind.t === 'global'
          ? state.cell(null, kind.sel)
          : state.cell(null, kind.t === 'radio' ? `radio:${kind.name}` : `#${kind.id}`)

    const self: StubNode = {
      find: (sel: string) => {
        if (kind.t !== 'scope') return makeNode({ t: 'global', sel: `${describe(kind)} ${sel}` })
        const p = normalizePath(sel)
        return makeNode({
          t: 'scope',
          scope: kind.scope,
          path: kind.path ? `${kind.path} ${p}` : p,
        })
      },
      closest: (sel: string) =>
        kind.t === 'scope' && sel === '.poke-info'
          ? makeNode({ t: 'scope', scope: kind.scope, path: '' })
          : self,
      children: (sel?: string) => (sel ? (self.find as (s: string) => StubNode)(sel) : self),
      parent: () => self,
      siblings: () => self,
      val: (...a: unknown[]) => {
        if (a.length) {
          if (kind.t === 'radio') state.radios.set(kind.name, String(a[0]))
          else cellOf().val = a[0]
          return self
        }
        if (kind.t === 'radio') return state.radios.get(kind.name)
        if (kind.t === 'checkbox-id')
          return state.cell(null, `#${kind.id}`).checked ? 'on' : undefined
        return cellOf().val
      },
      text: (...a: unknown[]) => {
        if (a.length) {
          cellOf().text = String(a[0])
          return self
        }
        return cellOf().text ?? ''
      },
      prop: (name: string, ...a: unknown[]) => {
        const c = cellOf()
        if (a.length) {
          if (name === 'checked') c.checked = Boolean(a[0])
          else if (name === 'selectedIndex') c.selectedIndex = Number(a[0])
          else (c.props ??= {})[name] = a[0]
          return self
        }
        if (name === 'checked') return c.checked ?? false
        if (name === 'selectedIndex') return c.selectedIndex ?? 0
        if (name === 'id') return kind.t === 'scope' && kind.path === '' ? kind.scope : undefined
        return c.props?.[name]
      },
      attr: (name: string, ...a: unknown[]) => {
        const c = cellOf()
        if (a.length) {
          ;(c.attrs ??= {})[name] = a[0]
          return self
        }
        if (name === 'id' && kind.t === 'scope' && kind.path === '') return kind.scope
        return c.attrs?.[name]
      },
      is: (sel: string) => {
        if (sel === ':checked') return cellOf().checked ?? false
        if (sel === ':visible') return true
        unknownCalls.add(`is(${sel})`)
        return false
      },
      toArray: () => [],
      each: () => self,
    }
    Object.defineProperty(self, 'length', {
      get: () => (kind.t === 'global' && !kind.sel.startsWith('#') ? 0 : 1),
    })
    return new Proxy(self, {
      get(target, prop) {
        if (prop in target) return target[prop as string]
        if (typeof prop === 'symbol') return undefined
        if (!NOOP_METHODS.has(prop)) unknownCalls.add(prop)
        return () => proxyRef
      },
    })
  }
  // The proxy returned by makeNode needs to return itself from no-op methods; use a shared sink
  // node for that (no-ops are never chained into reads).
  const proxyRef: StubNode = makeNode({ t: 'global', sel: '<sink>' })

  const $ = ((arg?: unknown): StubNode => {
    if (typeof arg === 'string') return makeNode(parseSelector(arg))
    // $(function) / $(document) / $(this): nothing to run, nothing to read.
    return makeNode({ t: 'global', sel: '<other>' })
  }) as StubFn
  $.extend = extend
  $.isEmptyObject = (o: unknown) => {
    return o == null || Object.keys(o as object).length === 0
  }
  $.fn = {}
  return { $, state, unknownCalls }
}

function describe(kind: Kind): string {
  switch (kind.t) {
    case 'scope':
      return `#${kind.scope} ${kind.path}`
    case 'radio':
      return `radio:${kind.name}`
    case 'checkbox-id':
      return `#${kind.id}`
    case 'global':
      return kind.sel
  }
}

/** Stand-in for `localStorage` (only `getItem("dex")` & friends are read by the scripts). */
export function createLocalStorage(values: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(values))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  }
}

/** Stand-in for `document`: every property/method is an inert no-op. */
export function createDocument(): unknown {
  const sink: unknown = new Proxy(function () {}, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => '' : sink),
    apply: () => sink,
    set: () => true,
  })
  return sink
}
