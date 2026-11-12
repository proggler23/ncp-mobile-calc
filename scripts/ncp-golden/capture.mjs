#!/usr/bin/env node
/* global $, gen, pokedex, calculate, Pokemon, damageResults, toggleResultDisplay */
// Golden oracle capture: drives the REAL original NCP pages (served from a local clone of the
// upstream repo) in headless Chromium and records damage rolls / description / KO text for the
// scenario matrix in ./scenarios.mjs.
//
// Usage: node scripts/ncp-golden/capture.mjs --upstream <dir of upstream clone> [--out <dir>]
//        [--filter <substring>] [--concurrency 4]
//
// The upstream clone is untrusted data: it is only served as static files to the browser sandbox.
// Nothing from it is executed in Node and no build tooling of the clone is run.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { buildScenarios } from './scenarios.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
const upstream = path.resolve(args.upstream ?? '')
if (!args.upstream || !fs.existsSync(path.join(upstream, 'index.html'))) {
  console.error('Missing/invalid --upstream <dir of NCP clone>')
  process.exit(2)
}
const outDir = path.resolve(args.out ?? path.join(here, '../../src/engine/__golden__'))
const concurrency = Number(args.concurrency ?? 4)

function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--'))
      o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return o
}

const sha = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD']).toString().trim()

// ---------------------------------------------------------------------------- static server
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const file = path.join(upstream, urlPath === '/' ? 'index.html' : urlPath)
  if (!file.startsWith(upstream) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404
    res.end()
    return
  }
  res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream')
  res.end(fs.readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

// ---------------------------------------------------------------------------- page driver
// This function runs INSIDE the original NCP page. It only uses the page's own UI elements and
// event handlers (jQuery .val().change() etc.), mirroring what a user would do.
function driver(input) {
  const fail = (msg) => {
    throw new Error(msg)
  }
  window.alert = (m) => fail('alert: ' + m)
  const SIDE_IDS = {
    reflect: 'reflect',
    lightScreen: 'lightScreen',
    auroraVeil: 'auroraVeil',
    helpingHand: 'helpingHand',
    friendGuard: 'friendGuard',
    tailwind: 'tailwind',
    protect: 'protect',
    stealthRock: 'sr',
    foresight: 'foresight',
    gMaxField: 'gMaxField',
    flowerGift: 'flowerGift',
    steelySpirit: 'steelySpirit',
    powerSpot: 'powerSpot',
    battery: 'battery',
    saltCure: 'saltCure',
    swamp: 'swamp',
    seaFire: 'seaFire',
    redItem: 'redItem',
    blueItem: 'blueItem',
    charge: 'charge',
    leechSeed: 'leechSeed',
    ingrain: 'ingrain',
    curse: 'curse',
    binding: 'binding',
    aquaRing: 'aquaRing',
    nightmare: 'nightmare',
    weaknessPolicy: 'weak',
    evoboost: 'evo',
    geomancy: 'clang',
    commander: 'tatsu',
  }
  const WEATHER_IDS = {
    '': 'clear',
    Sun: 'sun',
    Rain: 'rain',
    Sand: 'sand',
    Hail: 'hail',
    Snow: 'snow',
    'Harsh Sun': 'harsh-sun',
    'Heavy Rain': 'heavy-rain',
    'Strong Winds': 'strong-winds',
  }
  const GSC_WEATHER_IDS = { '': 'gscClear', Sun: 'gscSun', Rain: 'gscRain', Sand: 'gscSand' }
  const TERRAIN_IDS = {
    '': 'noterrain',
    Electric: 'electric',
    Grassy: 'grassy',
    Misty: 'misty',
    Psychic: 'psychic',
  }
  const warnings = []

  const setControl = (id, wanted) => {
    const el = $('#' + CSS.escape(id))
    if (!el.length) fail(`UI control #${id} does not exist on this page`)
    if (el.prop('checked') === wanted) return
    const label = $(`label[for="${id}"]`)
    if (label.length && !label.is(':visible')) warnings.push(`#${id} not visible in this gen`)
    el.prop('checked', wanted)
    el.trigger('change')
  }
  const setSelect = (sel, value, what) => {
    const el = $(sel)
    if (!el.length) fail(`${what}: ${sel} not found`)
    el.val(value)
    if (el.val() !== value)
      fail(`${what}: cannot select "${value}" (got ${JSON.stringify(el.val())})`)
    el.trigger('change')
  }
  const setInput = (sel, value, ev = 'change') => {
    const el = $(sel)
    if (!el.length) fail(`input ${sel} not found`)
    el.val(value)
    el.trigger(ev)
    el.trigger('keyup')
  }

  const STATS = ['hp', 'at', 'df', 'sa', 'sd', 'sp', 'sl']

  function setPokemon(pid, p) {
    const root = '#' + pid
    const dex = pokedex
    if (!dex[p.species]) fail(`species "${p.species}" not in gen ${gen} dex`)
    let base = p.species
    if (!(dex[p.species].formes && dex[p.species].formes.includes(p.species))) {
      for (const k of Object.keys(dex)) {
        if (dex[k].formes && dex[k].formes.includes(p.species)) {
          base = k
          break
        }
      }
    }
    $(root + ' .set-selector')
      .val(base + ' (Blank Set)')
      .change()
    if ($(root + ' .set-selector').val() !== base + ' (Blank Set)')
      fail('set selector rejected ' + base)
    // Realistic user flow: a set's moves are chosen first and the forme afterwards, so that the
    // forme-change handler (e.g. Z-A "plus" moves for Mega formes) acts on the chosen moves.
    const moveSpecs = []
    for (let i = 0; i < 4; i++) {
      const m = p.moves[i]
      const mv = typeof m === 'string' ? { name: m } : (m ?? { name: '(No Move)' })
      moveSpecs.push(mv)
      setSelect(`${root} .move${i + 1} select.move-selector`, mv.name, 'move')
    }
    if (dex[base].formes) setSelect(root + ' .forme', p.species, 'forme')

    const level = p.level
    if (level !== undefined && gen < 10) setInput(root + ' .level', level, 'keyup')
    if (p.nature) setSelect(root + ' .nature', p.nature, 'nature')
    for (const [k, v] of Object.entries(p.evs ?? {})) setInput(`${root} .${k} .evs`, v)
    for (const [k, v] of Object.entries(p.ivs ?? {})) setInput(`${root} .${k} .ivs`, v)
    for (const [k, v] of Object.entries(p.avs ?? {})) setInput(`${root} .${k} .avs`, v)
    for (const [k, v] of Object.entries(p.statPoints ?? {})) setInput(`${root} .${k} .sps`, v)
    for (const [k, v] of Object.entries(p.dvs ?? {})) {
      setInput(`${root} .${k} .dvs`, v, 'keyup')
    }
    if (p.friendship !== undefined) setInput(root + ' .friendship', p.friendship)
    if (p.ability !== undefined) setSelect(root + ' select.ability', p.ability, 'ability')
    if (p.abilityOn !== undefined) {
      $(root + ' .abilityToggle')
        .prop('checked', p.abilityOn)
        .trigger('change')
    }
    if (p.item !== undefined) setSelect(root + ' select.item', p.item, 'item')
    setSelect(root + ' .status', p.status ?? 'Healthy', 'status')
    if (p.toxicCounter !== undefined)
      setSelect(root + ' .toxic-counter', String(p.toxicCounter), 'toxic')
    for (const [k, v] of Object.entries(p.boosts ?? {}))
      setSelect(`${root} .${k} .boost`, String(v), 'boost')
    if (p.supremeOverlord !== undefined)
      setSelect(root + ' .ability-supreme', String(p.supremeOverlord), 'supreme')
    if (p.rivalry !== undefined) setSelect(root + ' .ability-rivalry', p.rivalry, 'rivalry')
    if (p.highestStat !== undefined) {
      $(root + ' .ability-advanced')
        .prop('checked', true)
        .trigger('change')
      setSelect(root + ' .ability-proto-quark', String(p.highestStat), 'protoquark')
    }
    if (p.types) {
      setSelect(root + ' .type1', p.types[0], 'type1')
      setSelect(root + ' .type2', p.types[1] ?? '', 'type2')
    }
    if (p.weight !== undefined) setInput(root + ' .weight', p.weight)
    if (p.glaiveRush)
      $(root + ' .glaive-rush')
        .prop('checked', true)
        .trigger('change')

    for (let i = 0; i < 4; i++) {
      const mv = moveSpecs[i]
      const g = `${root} .move${i + 1}`
      if (mv.bp !== undefined) setInput(`${g} .move-bp`, mv.bp)
      if (mv.type !== undefined) setSelect(`${g} .move-type`, mv.type, 'move type')
      if (mv.category !== undefined) setSelect(`${g} .move-cat`, mv.category, 'move cat')
      if (mv.crit !== undefined) $(`${g} .move-crit`).prop('checked', mv.crit).trigger('change')
      if (mv.hits !== undefined) setSelect(`${g} .move-hits`, String(mv.hits), 'hits')
      if (mv.double !== undefined)
        $(`${g} .move-double`).prop('checked', mv.double).trigger('change')
      if (mv.z !== undefined) $(`${g} .move-z`).prop('checked', mv.z).trigger('change')
      if (mv.plus !== undefined) $(`${g} .move-plus`).prop('checked', mv.plus).trigger('change')
      if (mv.pledge !== undefined) setSelect(`${g} .move-pledge`, mv.pledge, 'pledge')
      if (mv.stellar !== undefined) $(`${g} .move-stellar`).prop('checked', mv.stellar)
      if (mv.timesAffected !== undefined)
        setSelect(`${g} .move-linearAddedBP`, String(mv.timesAffected), 'linear')
      if (mv.opponentMoveIndex !== undefined)
        $(`${g} .move-opponent`).prop('selectedIndex', mv.opponentMoveIndex)
    }

    if (p.teraType) setSelect(root + ' .tera-type', p.teraType, 'tera type')
    if (p.terastallized !== undefined)
      $(root + ' .tera')
        .prop('checked', p.terastallized)
        .trigger('change')
    if (p.dynamax !== undefined)
      $(root + ' .max')
        .prop('checked', p.dynamax)
        .trigger('change')
    if (p.gmax !== undefined)
      $(root + ' .gmax')
        .prop('checked', p.gmax)
        .trigger('change')
    if (p.percentHP !== undefined) setInput(root + ' .percent-hp', p.percentHP, 'keyup')
    if (p.curHP !== undefined) setInput(root + ' .current-hp', p.curHP, 'keyup')
    void STATS
  }

  function setField(f, g) {
    f = f ?? {}
    const singlesOnlyPage = g === 9.5
    const format = f.format ?? (g === 7.5 || singlesOnlyPage ? 'Singles' : 'Doubles')
    setControl(format === 'Singles' ? 'singles' : 'doubles', true)
    const weather = f.weather ?? ''
    setControl((g === 2 ? GSC_WEATHER_IDS : WEATHER_IDS)[weather], true)
    setControl(TERRAIN_IDS[f.terrain ?? ''], true)
    setControl('gravity', !!f.gravity)
    setControl('neutralizingGas', !!f.neutralizingGas)
    const au = f.auras ?? {}
    setControl('fairy-aura', !!au.fairy)
    setControl('dark-aura', !!au.dark)
    setControl('aura-break', !!au.break)
    const ru = f.ruin ?? {}
    setControl('tablets-of-ruin', !!ru.tablets)
    setControl('vessel-of-ruin', !!ru.vessel)
    setControl('sword-of-ruin', !!ru.sword)
    setControl('beads-of-ruin', !!ru.beads)
    for (const [side, suffix] of [
      [f.attackerSide ?? {}, 'L'],
      [f.defenderSide ?? {}, 'R'],
    ]) {
      for (const [key, idBase] of Object.entries(SIDE_IDS)) {
        if (key in side || $('#' + idBase + suffix).prop('checked'))
          setControl(idBase + suffix, !!side[key])
      }
      const layers = side.spikes ?? 0
      if (g === 2 || g === 9.5) setControl('gscSpikes' + suffix, layers > 0)
      else setControl(`spikes${suffix}${layers}`, true)
    }
  }

  function snapshot(P) {
    return {
      name: P.name,
      type1: P.type1,
      type2: P.type2 ?? '',
      level: P.level,
      maxHP: P.maxHP,
      curHP: P.curHP,
      rawStats: P.rawStats,
      boosts: P.boosts,
      ability: P.ability,
      abilityOn: !!P.abilityOn,
      item: P.item,
      status: P.status,
      nature: P.nature,
      tera_type: P.tera_type ?? null,
      isTerastalize: !!P.isTerastalize,
      isDynamax: !!P.isDynamax,
      moves: P.moves.map((m) => ({
        name: m.name,
        bp: m.bp,
        type: m.type,
        category: m.category,
        hits: m.hits,
        isCrit: !!m.isCrit,
        isZ: !!m.isZ,
        isPlusMove: !!m.isPlusMove,
      })),
    }
  }

  window.calcQueue++
  setPokemon('p1', input.attacker)
  setPokemon('p2', input.defender)
  setField(input.field, gen)
  if (input.vgcLevels === false) $('#douswitch').prop('checked', false)
  if (input.resultDisplay) toggleResultDisplay(input.resultDisplay)
  window.calcQueue = 0
  const p1 = new Pokemon($('#p1'))
  const p2 = new Pokemon($('#p2'))
  calculate()
  const pick = (r) => ({
    damage: r.damage,
    description: r.description,
    damageText: r.damageText,
    koChanceText: r.koChanceText,
    hits: r.hits,
    ...(r.cooldown !== undefined ? { cooldown: r.cooldown } : {}),
  })
  return {
    gen,
    resolved: { attacker: snapshot(p1), defender: snapshot(p2) },
    expected: {
      moves: damageResults[0].map(pick),
      reverseMoves: damageResults[1].map(pick),
    },
    warnings,
  }
}

// ---------------------------------------------------------------------------- orchestration
function pageFor(genId) {
  return genId === 7.5 ? 'lgpe-calc.html' : genId === 9.5 ? 'za-calc.html' : 'index.html'
}

async function runScenario(browser, sc) {
  const ctx = await browser.newContext()
  try {
    await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.abort())
    const input = sc.input
    await ctx.addInitScript(
      ([g, natDex]) => {
        localStorage.setItem('gen', String(g))
        localStorage.setItem('dex', natDex ? 'natdex' : 'vgcdex')
        localStorage.setItem('theme', 'light')
      },
      [input.gen, !!input.natDex],
    )
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${origin}/${pageFor(input.gen)}`)
    await page.waitForFunction(
      () =>
        typeof calculate === 'function' &&
        typeof gen === 'number' &&
        typeof damageResults !== 'undefined' &&
        $('#p1 .set-selector').val() &&
        $('#p2 .set-selector').val(),
      null,
      { timeout: 30000 },
    )
    const pageGen = await page.evaluate(() => gen)
    if (pageGen !== input.gen) throw new Error(`page gen ${pageGen} != ${input.gen}`)
    const result = await page.evaluate(driver, input)
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '))
    return {
      id: sc.id,
      input,
      resolved: result.resolved,
      expected: result.expected,
      uiWarnings: result.warnings,
    }
  } finally {
    await ctx.close()
  }
}

const filter = typeof args.filter === 'string' ? args.filter : ''
const scenarios = buildScenarios().filter((s) => s.id.includes(filter))
console.log(`upstream ${sha}; capturing ${scenarios.length} scenarios (concurrency ${concurrency})`)

const browser = await chromium.launch()
const results = new Array(scenarios.length)
const failures = []
let next = 0
async function worker() {
  while (next < scenarios.length) {
    const idx = next++
    const sc = scenarios[idx]
    try {
      results[idx] = await runScenario(browser, sc)
      if (results[idx].uiWarnings.length)
        console.log(`warn ${sc.id}: ${results[idx].uiWarnings.join('; ')}`)
    } catch (e) {
      failures.push({ id: sc.id, error: String(e.message).split('\n')[0] })
      console.log(`FAIL ${sc.id}: ${String(e.message).split('\n')[0]}`)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
await browser.close()
server.close()

if (!filter) {
  fs.mkdirSync(outDir, { recursive: true })
  // group by gen, one file per gen; one scenario per line for reviewable diffs
  const byGen = new Map()
  for (const r of results) {
    if (!r) continue
    const g = r.input.gen
    if (!byGen.has(g)) byGen.set(g, [])
    byGen.get(g).push(r)
  }
  for (const f of fs.readdirSync(outDir)) if (f.endsWith('.json')) fs.rmSync(path.join(outDir, f))
  for (const [g, list] of byGen) {
    const body = list.map((r) => '  ' + JSON.stringify(r)).join(',\n')
    fs.writeFileSync(
      path.join(outDir, `gen-${g}.json`),
      `{\n "upstreamSha": "${sha}",\n "gen": ${g},\n "scenarios": [\n${body}\n ]\n}\n`,
    )
    console.log(`gen ${g}: ${list.length} scenarios`)
  }
} else {
  for (const r of results.filter(Boolean))
    console.log(r.id, JSON.stringify(r.expected.moves[0]).slice(0, 300))
}
console.log(`done: ${results.filter(Boolean).length} ok, ${failures.length} failed`)
if (failures.length) process.exitCode = 1
