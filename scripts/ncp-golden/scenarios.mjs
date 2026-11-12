// Scenario matrix for the golden oracle. Each scenario is a plain CalcInput (see
// src/engine/types.ts) plus an id. Scenarios are built from per-generation "matchups" crossed with
// a list of variants (field/status/boost toggles) that are valid in that generation's UI.

const clone = (o) => JSON.parse(JSON.stringify(o))

/** Apply a patch to attacker / defender / field of a scenario input (shallow-merge per section). */
const A = (patch) => (i) => ({ ...i, attacker: { ...i.attacker, ...patch } })
const D = (patch) => (i) => ({ ...i, defender: { ...i.defender, ...patch } })
const F = (patch) => (i) => ({ ...i, field: { ...i.field, ...patch } })
const AS = (patch) => (i) => ({
  ...i,
  field: { ...i.field, attackerSide: { ...i.field?.attackerSide, ...patch } },
})
const DS = (patch) => (i) => ({
  ...i,
  field: { ...i.field, defenderSide: { ...i.field?.defenderSide, ...patch } },
})
const both =
  (...fns) =>
  (i) =>
    fns.reduce((acc, fn) => fn(acc), i)
const critAll = (i) => ({
  ...i,
  attacker: {
    ...i.attacker,
    moves: i.attacker.moves.map((m) => (typeof m === 'string' ? { name: m, crit: true } : m)),
  },
})

/**
 * Each generation: list of matchups, each { id, attacker, defender, field? }, and the variants
 * applied to every matchup: [tag, fn].
 */
const GENS = []
const gen = (id, matchups, variants, opts = {}) => GENS.push({ id, matchups, variants, ...opts })

// ---------------------------------------------------------------- Gen 1 (RBY)
gen(
  1,
  [
    {
      id: 'tauros-chansey',
      attacker: {
        species: 'Tauros',
        level: 100,
        moves: ['Body Slam', 'Hyper Beam', 'Earthquake', 'Blizzard'],
      },
      defender: {
        species: 'Chansey',
        level: 100,
        moves: ['Ice Beam', 'Seismic Toss', 'Thunderbolt', 'Soft-Boiled'],
      },
    },
    {
      id: 'alakazam-snorlax',
      attacker: {
        species: 'Alakazam',
        level: 100,
        moves: ['Psychic', 'Seismic Toss', 'Thunderbolt', 'Recover'],
      },
      defender: {
        species: 'Snorlax',
        level: 100,
        moves: ['Body Slam', 'Earthquake', 'Hyper Beam', 'Rest'],
      },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['atk+1-def-1', both(A({ boosts: { at: 1, sl: 1 } }), D({ boosts: { df: -1, sl: -1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['halfhp', D({ percentHP: 50 })],
    ['dvs', A({ dvs: { at: 8, df: 7, sl: 9, sp: 3 } })],
    ['lvl50', both(A({ level: 50 }), D({ level: 50 }))],
  ],
)

// ---------------------------------------------------------------- Gen 2 (GSC)
gen(
  2,
  [
    {
      id: 'snorlax-skarmory',
      attacker: {
        species: 'Snorlax',
        level: 100,
        item: 'Leftovers',
        moves: ['Body Slam', 'Earthquake', 'Rock Slide', 'Curse'],
      },
      defender: {
        species: 'Skarmory',
        level: 100,
        moves: ['Drill Peck', 'Steel Wing', 'Whirlwind', 'Rest'],
      },
    },
    {
      id: 'tyranitar-zapdos',
      attacker: {
        species: 'Tyranitar',
        level: 100,
        item: 'Charcoal',
        moves: ['Crunch', 'Rock Slide', 'Fire Blast', 'Earthquake'],
      },
      defender: {
        species: 'Zapdos',
        level: 100,
        moves: ['Thunder', 'Hidden Power Ice', 'Drill Peck', 'Rest'],
      },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['sand', F({ weather: 'Sand' })],
    ['atk+2', A({ boosts: { at: 2, sa: 2 } })],
    ['paralysis-def', D({ status: 'Paralyzed' })],
    ['burn', A({ status: 'Burned' })],
    ['item-boost', A({ item: 'Mystic Water' })],
    ['dvs', A({ dvs: { at: 14, df: 13, sa: 9, sp: 5 } })],
  ],
)

// ---------------------------------------------------------------- Gen 3 (ADV)
gen(
  3,
  [
    {
      id: 'salamence-skarmory',
      attacker: {
        species: 'Salamence',
        level: 100,
        nature: 'Adamant',
        ability: 'Intimidate',
        item: 'Leftovers',
        evs: { at: 252, sp: 252, hp: 4 },
        moves: ['Earthquake', 'Rock Slide', 'Dragon Claw', 'Flamethrower'],
      },
      defender: {
        species: 'Skarmory',
        level: 100,
        nature: 'Impish',
        ability: 'Keen Eye',
        evs: { hp: 252, df: 252 },
        moves: ['Drill Peck', 'Steel Wing', 'Rest', 'Toxic'],
      },
    },
    {
      id: 'swampert-blissey',
      attacker: {
        species: 'Swampert',
        level: 100,
        nature: 'Modest',
        ability: 'Torrent',
        evs: { sa: 252, hp: 252 },
        moves: ['Surf', 'Earthquake', 'Ice Beam', 'Hydro Pump'],
      },
      defender: {
        species: 'Blissey',
        level: 100,
        nature: 'Bold',
        ability: 'Natural Cure',
        evs: { hp: 252, df: 252 },
        moves: ['Seismic Toss', 'Ice Beam', 'Thunderbolt', 'Soft-Boiled'],
      },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['singles', F({ format: 'Singles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['sand', F({ weather: 'Sand' })],
    ['hail', F({ weather: 'Hail' })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['choice-band', A({ item: 'Choice Band' })],
    ['halfhp', D({ percentHP: 50 })],
    ['spikes', DS({ spikes: 2 })],
  ],
)

// ---------------------------------------------------------------- Gen 4 (DPP)
gen(
  4,
  [
    {
      id: 'garchomp-heatran',
      attacker: {
        species: 'Garchomp',
        level: 100,
        nature: 'Jolly',
        ability: 'Sand Veil',
        item: 'Life Orb',
        evs: { at: 252, sp: 252, hp: 4 },
        moves: ['Earthquake', 'Outrage', 'Stone Edge', 'Fire Blast'],
      },
      defender: {
        species: 'Heatran',
        level: 100,
        nature: 'Calm',
        ability: 'Flash Fire',
        item: 'Leftovers',
        evs: { hp: 252, sd: 252 },
        moves: ['Fire Blast', 'Earth Power', 'Dragon Pulse', 'Explosion'],
      },
    },
    {
      id: 'lucario-gengar',
      attacker: {
        species: 'Lucario',
        level: 100,
        nature: 'Naive',
        ability: 'Inner Focus',
        item: 'Expert Belt',
        evs: { at: 252, sa: 4, sp: 252 },
        moves: ['Close Combat', 'Crunch', 'Aura Sphere', 'Extreme Speed'],
      },
      defender: {
        species: 'Gengar',
        level: 100,
        nature: 'Timid',
        ability: 'Levitate',
        item: 'Choice Specs',
        evs: { sa: 252, sp: 252, hp: 4 },
        moves: ['Shadow Ball', 'Focus Blast', 'Thunderbolt', 'Sludge Bomb'],
      },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['singles', F({ format: 'Singles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['sand', F({ weather: 'Sand' })],
    ['hail', F({ weather: 'Hail' })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['helping-hand', AS({ helpingHand: true })],
    ['stealth-rock-sr', DS({ stealthRock: true })],
    ['foresight', DS({ foresight: true })],
  ],
)

// ---------------------------------------------------------------- Gen 5 (BW)
gen(
  5,
  [
    {
      id: 'excadrill-landorus',
      attacker: {
        species: 'Excadrill',
        level: 100,
        nature: 'Adamant',
        ability: 'Sand Rush',
        item: 'Life Orb',
        evs: { at: 252, sp: 252, hp: 4 },
        moves: ['Earthquake', 'Rock Slide', 'Iron Head', 'Drill Run'],
      },
      defender: {
        species: 'Landorus-Therian',
        level: 100,
        nature: 'Impish',
        ability: 'Intimidate',
        item: 'Leftovers',
        evs: { hp: 252, df: 252 },
        moves: ['Earthquake', 'Stone Edge', 'U-turn', 'Stealth Rock'],
      },
    },
    {
      id: 'chandelure-conkeldurr',
      attacker: {
        species: 'Chandelure',
        level: 100,
        nature: 'Modest',
        ability: 'Flash Fire',
        item: 'Choice Scarf',
        evs: { sa: 252, sp: 252, hp: 4 },
        moves: ['Shadow Ball', 'Fire Blast', 'Heat Wave', 'Energy Ball'],
      },
      defender: {
        species: 'Conkeldurr',
        level: 100,
        nature: 'Adamant',
        ability: 'Guts',
        item: 'Eviolite',
        evs: { hp: 252, at: 252 },
        moves: ['Drain Punch', 'Mach Punch', 'Stone Edge', 'Knock Off'],
      },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['singles', F({ format: 'Singles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['sand', F({ weather: 'Sand' })],
    ['hail', F({ weather: 'Hail' })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['helping-hand', AS({ helpingHand: true })],
    ['friend-guard', DS({ friendGuard: true })],
    ['gravity', F({ gravity: true })],
  ],
)

// ---------------------------------------------------------------- Gen 6 (XY/ORAS)
gen(
  6,
  [
    {
      id: 'mkangaskhan-talonflame',
      attacker: {
        species: 'Mega Kangaskhan',
        level: 50,
        nature: 'Adamant',
        ability: 'Parental Bond',
        item: 'Kangaskhanite',
        evs: { at: 252, sp: 252, hp: 4 },
        moves: ['Return', 'Fake Out', 'Earthquake', 'Sucker Punch'],
      },
      defender: {
        species: 'Talonflame',
        level: 50,
        nature: 'Jolly',
        ability: 'Gale Wings',
        item: 'Sitrus Berry',
        evs: { sp: 252, hp: 252 },
        moves: ['Brave Bird', 'Flare Blitz', 'Roost', 'Tailwind'],
      },
    },
    {
      id: 'mcharizardy-gardevoir',
      attacker: {
        species: 'Mega Charizard Y',
        level: 50,
        nature: 'Timid',
        ability: 'Drought',
        item: 'Charizardite Y',
        evs: { sa: 252, sp: 252, hp: 4 },
        moves: ['Heat Wave', 'Fire Blast', 'Solar Beam', 'Air Slash'],
      },
      defender: {
        species: 'Gardevoir',
        level: 50,
        nature: 'Modest',
        ability: 'Trace',
        item: 'Choice Scarf',
        evs: { sa: 252, hp: 252 },
        moves: ['Moonblast', 'Psychic', 'Hyper Voice', 'Focus Blast'],
      },
      field: { weather: 'Sun' },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['singles', F({ format: 'Singles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['sand', F({ weather: 'Sand' })],
    ['hail', F({ weather: 'Hail' })],
    ['strong-winds', F({ weather: 'Strong Winds' })],
    ['grassy', F({ terrain: 'Grassy' })],
    ['misty', F({ terrain: 'Misty' })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['helping-hand', AS({ helpingHand: true })],
    ['friend-guard', DS({ friendGuard: true })],
    ['fairy-aura', F({ auras: { fairy: true } })],
    ['aura-break', F({ auras: { fairy: true, break: true } })],
  ],
)

// ---------------------------------------------------------------- Gen 7 (SM/USUM)
gen(
  7,
  [
    {
      id: 'incineroar-kartana',
      attacker: {
        species: 'Incineroar',
        level: 50,
        nature: 'Adamant',
        ability: 'Intimidate',
        item: 'Firium Z',
        evs: { hp: 252, at: 164, sd: 92 },
        moves: ['Flare Blitz', 'Darkest Lariat', 'Fake Out', 'U-turn'],
      },
      defender: {
        species: 'Kartana',
        level: 50,
        nature: 'Jolly',
        ability: 'Beast Boost',
        item: 'Life Orb',
        evs: { at: 252, sp: 252, hp: 4 },
        moves: ['Leaf Blade', 'Sacred Sword', 'Smart Strike', 'Night Slash'],
      },
    },
    {
      id: 'tapukoko-tapufini',
      attacker: {
        species: 'Tapu Koko',
        level: 50,
        nature: 'Timid',
        ability: 'Electric Surge',
        item: 'Electrium Z',
        evs: { sa: 252, sp: 252, hp: 4 },
        moves: ['Thunderbolt', 'Dazzling Gleam', 'Discharge', 'Volt Switch'],
      },
      defender: {
        species: 'Tapu Fini',
        level: 50,
        nature: 'Bold',
        ability: 'Misty Surge',
        item: 'Leftovers',
        evs: { hp: 252, df: 252 },
        moves: ['Moonblast', 'Muddy Water', 'Scald', 'Taunt'],
      },
      field: { terrain: 'Electric' },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['singles', F({ format: 'Singles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['aurora-veil', both(F({ weather: 'Hail' }), DS({ auroraVeil: true }))],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['grassy', F({ terrain: 'Grassy' })],
    ['psychic-terrain', F({ terrain: 'Psychic' })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['helping-hand', AS({ helpingHand: true })],
    ['battery', AS({ battery: true })],
    ['protect-spread', DS({ protect: true })],
    ['friend-guard', DS({ friendGuard: true })],
    ['z-move-1', A({ moves: [{ name: 'Flare Blitz', z: true }, 'Darkest Lariat'] })],
  ],
)

// ---------------------------------------------------------------- Gen 7.5 (LGPE)
gen(
  7.5,
  [
    {
      id: 'pikachu-gyarados',
      attacker: {
        species: 'Pikachu',
        level: 50,
        nature: 'Timid',
        ivs: { hp: 31, at: 31, df: 31, sa: 31, sd: 31, sp: 31 },
        avs: { sa: 200, sp: 200 },
        friendship: 255,
        moves: ['Thunderbolt', 'Surf', 'Zippy Zap', 'Quick Attack'],
      },
      defender: {
        species: 'Gyarados',
        level: 50,
        nature: 'Adamant',
        avs: { hp: 200, at: 200 },
        moves: ['Waterfall', 'Earthquake', 'Bite', 'Hyper Beam'],
      },
    },
    {
      id: 'eevee-snorlax',
      attacker: {
        species: 'Eevee',
        level: 50,
        nature: 'Adamant',
        moves: ['Double-Edge', 'Bouncy Bubble', 'Sizzly Slide', 'Baddy Bad'],
      },
      defender: {
        species: 'Snorlax',
        level: 50,
        moves: ['Body Slam', 'Earthquake', 'Crunch', 'Rest'],
      },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['doubles', F({ format: 'Doubles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['doubles-helping-hand', both(F({ format: 'Doubles' }), AS({ helpingHand: true }))],
    ['stealth-rock', DS({ stealthRock: true })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['halfhp', D({ percentHP: 50 })],
    ['avs-friendship', A({ avs: { at: 100, sa: 100 }, friendship: 100 })],
    ['lvl100', both(A({ level: 100 }), D({ level: 100 }))],
  ],
)

// ---------------------------------------------------------------- Gen 8 (SwSh)
gen(
  8,
  [
    {
      id: 'dragapult-corviknight',
      attacker: {
        species: 'Dragapult',
        level: 50,
        nature: 'Naive',
        ability: 'Infiltrator',
        item: 'Choice Specs',
        evs: { sa: 252, sp: 252, hp: 4 },
        moves: ['Shadow Ball', 'Draco Meteor', 'Phantom Force', 'Dragon Darts'],
      },
      defender: {
        species: 'Corviknight',
        level: 50,
        nature: 'Impish',
        ability: 'Mirror Armor',
        item: 'Leftovers',
        evs: { hp: 252, df: 252 },
        moves: ['Brave Bird', 'Body Press', 'Roost', 'Iron Head'],
      },
    },
    {
      id: 'urshifu-incineroar',
      attacker: {
        species: 'Urshifu-Rapid Strike',
        level: 50,
        nature: 'Jolly',
        ability: 'Unseen Fist',
        item: 'Choice Scarf',
        evs: { at: 252, sp: 252, hp: 4 },
        moves: ['Surging Strikes', 'Close Combat', 'Aqua Jet', 'U-turn'],
      },
      defender: {
        species: 'Incineroar',
        level: 50,
        nature: 'Careful',
        ability: 'Intimidate',
        item: 'Assault Vest',
        evs: { hp: 252, sd: 252 },
        moves: ['Flare Blitz', 'Knock Off', 'Fake Out', 'Parting Shot'],
      },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['singles', F({ format: 'Singles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['aurora-veil', both(F({ weather: 'Hail' }), DS({ auroraVeil: true }))],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['sand', F({ weather: 'Sand' })],
    ['grassy', F({ terrain: 'Grassy' })],
    ['psychic-terrain', F({ terrain: 'Psychic' })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['helping-hand', AS({ helpingHand: true })],
    ['friend-guard', DS({ friendGuard: true })],
    ['gravity', F({ gravity: true })],
    ['power-spot-steely-spirit', AS({ powerSpot: true, steelySpirit: true })],
    ['protect-spread', DS({ protect: true })],
    ['dynamax-atk', A({ dynamax: true })],
    ['dynamax-def', D({ dynamax: true })],
    [
      'gmax-charizard',
      both(
        A({
          species: 'Charizard',
          ability: 'Blaze',
          item: '',
          moves: ['Heat Wave', 'Air Slash', 'Fire Blast', 'Solar Beam'],
          dynamax: true,
          gmax: true,
        }),
      ),
    ],
    ['weakness-policy', DS({ weaknessPolicy: true })],
    ['natdex-base', F({}), { natDex: true }],
  ],
)

// ---------------------------------------------------------------- Gen 9 (SV)
gen(
  9,
  [
    {
      id: 'fluttermane-incineroar',
      attacker: {
        species: 'Flutter Mane',
        level: 50,
        nature: 'Timid',
        ability: 'Protosynthesis',
        item: 'Choice Specs',
        evs: { sa: 252, sp: 252, hp: 4 },
        teraType: 'Fairy',
        moves: ['Moonblast', 'Shadow Ball', 'Dazzling Gleam', 'Mystical Fire'],
      },
      defender: {
        species: 'Incineroar',
        level: 50,
        nature: 'Careful',
        ability: 'Intimidate',
        item: 'Safety Goggles',
        evs: { hp: 252, sd: 252, df: 4 },
        teraType: 'Grass',
        moves: ['Flare Blitz', 'Knock Off', 'Fake Out', 'Parting Shot'],
      },
    },
    {
      id: 'chienpao-ogerpon',
      attacker: {
        species: 'Chien-Pao',
        level: 50,
        nature: 'Jolly',
        ability: 'Sword of Ruin',
        item: 'Focus Sash',
        evs: { at: 252, sp: 252, hp: 4 },
        teraType: 'Ghost',
        moves: ['Icicle Crash', 'Sucker Punch', 'Ice Spinner', 'Sacred Sword'],
      },
      defender: {
        species: 'Rillaboom',
        level: 50,
        nature: 'Adamant',
        ability: 'Grassy Surge',
        item: 'Assault Vest',
        evs: { hp: 252, at: 252 },
        teraType: 'Fire',
        moves: ['Grassy Glide', 'Wood Hammer', 'Fake Out', 'U-turn'],
      },
      field: { ruin: { sword: true }, terrain: 'Grassy' },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['singles', F({ format: 'Singles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['aurora-veil', both(F({ weather: 'Snow' }), DS({ auroraVeil: true }))],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['sand', F({ weather: 'Sand' })],
    ['snow', F({ weather: 'Snow' })],
    ['electric-terrain', F({ terrain: 'Electric' })],
    ['psychic-terrain', F({ terrain: 'Psychic' })],
    ['misty-terrain', F({ terrain: 'Misty' })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['helping-hand', AS({ helpingHand: true })],
    ['friend-guard', DS({ friendGuard: true })],
    ['power-spot-battery', AS({ powerSpot: true, battery: true })],
    ['tera-atk', A({ terastallized: true })],
    ['tera-def', D({ terastallized: true })],
    ['tera-both', both(A({ terastallized: true }), D({ terastallized: true }))],
    ['ruin-all', F({ ruin: { tablets: true, vessel: true, sword: true, beads: true } })],
    ['ruin-tablets-beads', F({ ruin: { tablets: true, beads: true } })],
    ['tatsugiri-commander', AS({ commander: true })],
    ['salt-cure', DS({ saltCure: true })],
    ['neutralizing-gas', F({ neutralizingGas: true })],
    ['halfhp-def', D({ percentHP: 50 })],
    ['evs-neutral', both(A({ nature: 'Serious', evs: {} }), D({ nature: 'Serious', evs: {} }))],
    ['natdex-base', F({}), { natDex: true }],
  ],
)

// ---------------------------------------------------------------- Gen 9.5 (Legends Z-A)
gen(
  9.5,
  [
    {
      id: 'mcharizardx-garchomp',
      attacker: {
        species: 'Mega Charizard X',
        level: 50,
        nature: 'Adamant',
        item: 'Charizardite X',
        evs: { at: 252, sp: 252, hp: 4 },
        moves: ['Flare Blitz', 'Dragon Claw', 'Earthquake', 'Heat Wave'],
      },
      defender: {
        species: 'Garchomp',
        level: 50,
        nature: 'Jolly',
        evs: { hp: 252, df: 252 },
        moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Fire Fang'],
      },
    },
    {
      id: 'lucario-greninja',
      attacker: {
        species: 'Lucario',
        level: 50,
        nature: 'Timid',
        moves: ['Aura Sphere', 'Close Combat', 'Flash Cannon', 'Extreme Speed'],
      },
      defender: {
        species: 'Greninja',
        level: 50,
        nature: 'Timid',
        moves: ['Hydro Pump', 'Dark Pulse', 'Ice Beam', 'Water Shuriken'],
      },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['protect', DS({ protect: true })],
    ['salt-cure', DS({ saltCure: true })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['atk+1-def-1', both(A({ boosts: { at: 1, sa: 1 } }), D({ boosts: { df: -1, sd: -1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['drowsy', D({ status: 'Drowsy' })],
    ['red-item', AS({ redItem: true })],
    ['blue-item', DS({ blueItem: true })],
    ['charge', AS({ charge: true })],
    ['halfhp', D({ percentHP: 50 })],
    ['stealth-rock', DS({ stealthRock: true })],
    [
      'plus-moves-off',
      A({
        moves: [
          { name: 'Flare Blitz', plus: false },
          { name: 'Dragon Claw', plus: false },
        ],
      }),
    ],
  ],
)

// ---------------------------------------------------------------- Gen 10 (Champions)
gen(
  10,
  [
    {
      id: 'garchomp-incineroar',
      attacker: {
        species: 'Garchomp',
        nature: 'Jolly',
        ability: 'Rough Skin',
        item: 'Choice Scarf',
        statPoints: { at: 32, sp: 32, hp: 2 },
        moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Stomping Tantrum'],
      },
      defender: {
        species: 'Incineroar',
        nature: 'Careful',
        ability: 'Intimidate',
        item: 'Sitrus Berry',
        statPoints: { hp: 32, sd: 32, df: 2 },
        moves: ['Flare Blitz', 'Knock Off', 'Fake Out', 'Parting Shot'],
      },
    },
    {
      id: 'mcharizardy-venusaur',
      attacker: {
        species: 'Mega Charizard Y',
        nature: 'Timid',
        ability: 'Drought',
        item: 'Charizardite Y',
        statPoints: { sa: 32, sp: 32, hp: 2 },
        moves: ['Heat Wave', 'Air Slash', 'Solar Beam', 'Overheat'],
      },
      defender: {
        species: 'Venusaur',
        nature: 'Bold',
        ability: 'Overgrow',
        item: 'Leftovers',
        statPoints: { hp: 32, df: 32, sd: 2 },
        moves: ['Giga Drain', 'Sludge Bomb', 'Sleep Powder', 'Protect'],
      },
      field: { weather: 'Sun' },
    },
  ],
  [
    ['base', (i) => i],
    ['crit', critAll],
    ['singles', F({ format: 'Singles' })],
    ['reflect', DS({ reflect: true })],
    ['lightscreen', DS({ lightScreen: true })],
    ['aurora-veil', both(F({ weather: 'Snow' }), DS({ auroraVeil: true }))],
    ['sun', F({ weather: 'Sun' })],
    ['rain', F({ weather: 'Rain' })],
    ['sand', F({ weather: 'Sand' })],
    ['snow', F({ weather: 'Snow' })],
    ['electric-terrain', F({ terrain: 'Electric' })],
    ['grassy-terrain', F({ terrain: 'Grassy' })],
    ['psychic-terrain', F({ terrain: 'Psychic' })],
    ['misty-terrain', F({ terrain: 'Misty' })],
    ['atk+2-def+1', both(A({ boosts: { at: 2, sa: 2 } }), D({ boosts: { df: 1, sd: 1 } }))],
    ['burn', A({ status: 'Burned' })],
    ['helping-hand', AS({ helpingHand: true })],
    ['friend-guard', DS({ friendGuard: true })],
    ['protect-spread', DS({ protect: true })],
    ['steely-spirit', AS({ steelySpirit: true })],
    ['salt-cure', DS({ saltCure: true })],
    ['no-sps', both(A({ statPoints: {} }), D({ statPoints: {} }))],
    [
      'max-sps',
      both(
        A({ statPoints: { hp: 32, at: 32, sa: 2 } }),
        D({ statPoints: { hp: 2, df: 32, sd: 32 } }),
      ),
    ],
    ['neutral-nature', both(A({ nature: 'Serious' }), D({ nature: 'Serious' }))],
    ['halfhp', D({ percentHP: 50 })],
    ['natdex-base', F({}), { natDex: true }],
    ['display-raw', F({}), { resultDisplay: 'raw' }],
    ['display-evs', F({}), { resultDisplay: 'EVs' }],
  ],
)

/** Extra hand-written scenarios (id, input) for special mechanics. */
const EXTRA = [
  // Multi-hit and variable BP
  {
    id: 'g9-multihit-skill-link',
    input: {
      gen: 9,
      attacker: {
        species: 'Cinderace',
        level: 50,
        ability: 'Libero',
        moves: [{ name: 'Triple Axel', hits: 3 }, 'Pyro Ball', 'Bullet Seed', 'Rock Blast'],
      },
      defender: { species: 'Amoonguss', level: 50, evs: { hp: 252 }, moves: ['Spore'] },
    },
  },
  {
    id: 'g9-parental-bond-like-fixed',
    input: {
      gen: 9,
      attacker: {
        species: 'Garchomp',
        level: 50,
        moves: ['Night Shade', 'Seismic Toss', 'Earthquake'],
      },
      defender: { species: 'Gholdengo', level: 50, moves: ['Make It Rain'] },
    },
  },
  {
    id: 'g9-weather-ball-sun',
    input: {
      gen: 9,
      attacker: {
        species: 'Torkoal',
        level: 50,
        ability: 'Drought',
        moves: ['Weather Ball', 'Eruption', 'Heat Wave'],
      },
      defender: { species: 'Amoonguss', level: 50, moves: ['Spore'] },
      field: { weather: 'Sun' },
    },
  },
  {
    id: 'g9-eruption-lowhp',
    input: {
      gen: 9,
      attacker: {
        species: 'Typhlosion',
        level: 50,
        percentHP: 40,
        moves: ['Eruption', 'Heat Wave'],
      },
      defender: { species: 'Garganacl', level: 50, evs: { hp: 252 }, moves: ['Salt Cure'] },
      field: { format: 'Singles' },
    },
  },
  {
    id: 'g9-tera-stellar',
    input: {
      gen: 9,
      attacker: {
        species: 'Terapagos',
        level: 50,
        teraType: 'Stellar',
        terastallized: true,
        moves: ['Tera Starstorm', 'Earth Power', 'Dazzling Gleam'],
      },
      defender: { species: 'Garchomp', level: 50, moves: ['Earthquake'] },
    },
  },
  {
    id: 'g9-ogerpon-mask',
    input: {
      gen: 9,
      attacker: {
        species: 'Ogerpon-Wellspring',
        level: 50,
        nature: 'Jolly',
        item: 'Wellspring Mask',
        evs: { at: 252, sp: 252 },
        moves: ['Ivy Cudgel', 'Horn Leech', 'Power Whip', 'Follow Me'],
      },
      defender: {
        species: 'Incineroar',
        level: 50,
        evs: { hp: 252, df: 252 },
        moves: ['Flare Blitz'],
      },
    },
  },
  {
    id: 'g9-supreme-overlord',
    input: {
      gen: 9,
      attacker: {
        species: 'Kingambit',
        level: 50,
        ability: 'Supreme Overlord',
        supremeOverlord: 3,
        nature: 'Adamant',
        evs: { at: 252, hp: 252 },
        moves: ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Low Kick'],
      },
      defender: { species: 'Flutter Mane', level: 50, moves: ['Moonblast'] },
    },
  },
  {
    id: 'g9-protosynthesis-sun',
    input: {
      gen: 9,
      attacker: {
        species: 'Roaring Moon',
        level: 50,
        ability: 'Protosynthesis',
        nature: 'Jolly',
        evs: { at: 252, sp: 252 },
        moves: ['Dragon Claw', 'Crunch', 'Earthquake', 'Acrobatics'],
      },
      defender: { species: 'Iron Hands', level: 50, moves: ['Drain Punch'] },
      field: { weather: 'Sun' },
    },
  },
  {
    id: 'g9-toxic-ko-text',
    input: {
      gen: 9,
      attacker: {
        species: 'Gholdengo',
        level: 50,
        nature: 'Modest',
        evs: { sa: 252 },
        moves: ['Shadow Ball', 'Make It Rain'],
      },
      defender: {
        species: 'Amoonguss',
        level: 50,
        status: 'Badly Poisoned',
        toxicCounter: 3,
        item: 'Black Sludge',
        moves: ['Spore'],
      },
    },
  },
  {
    id: 'g9-spikes-leech-ko-text',
    input: {
      gen: 9,
      attacker: {
        species: 'Urshifu-Rapid Strike',
        level: 50,
        moves: ['Surging Strikes', 'Close Combat'],
      },
      defender: { species: 'Rillaboom', level: 50, evs: { hp: 252 }, moves: ['Grassy Glide'] },
      field: { terrain: 'Grassy', defenderSide: { leechSeed: true, spikes: 2 } },
    },
  },
  {
    id: 'g8-dynamax-max-move',
    input: {
      gen: 8,
      attacker: {
        species: 'Rillaboom',
        level: 50,
        dynamax: true,
        moves: ['Grassy Glide', 'Wood Hammer', 'Knock Off', 'Fake Out'],
      },
      defender: {
        species: 'Cinderace',
        level: 50,
        evs: { hp: 252, df: 252 },
        moves: ['Pyro Ball'],
      },
    },
  },
  {
    id: 'g7-z-crystal-spread',
    input: {
      gen: 7,
      attacker: {
        species: 'Kyogre',
        level: 50,
        ability: 'Drizzle',
        item: 'Mystic Water',
        nature: 'Modest',
        evs: { sa: 252 },
        moves: ['Water Spout', 'Origin Pulse', { name: 'Surf', z: true }, 'Ice Beam'],
      },
      defender: { species: 'Groudon', level: 50, evs: { hp: 252 }, moves: ['Precipice Blades'] },
      field: { weather: 'Rain' },
    },
  },
  {
    id: 'g6-sheer-force-lifeorb',
    input: {
      gen: 6,
      attacker: {
        species: 'Nidoking',
        level: 50,
        ability: 'Sheer Force',
        item: 'Life Orb',
        nature: 'Modest',
        evs: { sa: 252, sp: 252 },
        moves: ['Sludge Wave', 'Earth Power', 'Ice Beam', 'Thunderbolt'],
      },
      defender: { species: 'Tyranitar', level: 50, evs: { hp: 252 }, moves: ['Crunch'] },
    },
  },
  {
    id: 'g5-technician-bulletpunch',
    input: {
      gen: 5,
      attacker: {
        species: 'Scizor',
        level: 100,
        ability: 'Technician',
        item: 'Choice Band',
        nature: 'Adamant',
        evs: { at: 252, hp: 252 },
        moves: ['Bullet Punch', 'U-turn', 'Superpower', 'X-Scissor'],
      },
      defender: { species: 'Tyranitar', level: 100, moves: ['Crunch'] },
    },
  },
  {
    id: 'g4-flame-orb-guts-facade',
    input: {
      gen: 4,
      attacker: {
        species: 'Ursaring',
        level: 100,
        ability: 'Guts',
        item: 'Flame Orb',
        status: 'Burned',
        nature: 'Adamant',
        evs: { at: 252 },
        moves: ['Facade', 'Close Combat', 'Crunch', 'Swords Dance'],
      },
      defender: { species: 'Blissey', level: 100, evs: { hp: 252 }, moves: ['Seismic Toss'] },
    },
  },
  {
    id: 'g3-huge-power-marowak-thickclub',
    input: {
      gen: 3,
      attacker: {
        species: 'Marowak',
        level: 100,
        item: 'Thick Club',
        nature: 'Adamant',
        evs: { at: 252 },
        moves: ['Earthquake', 'Rock Slide', 'Swords Dance'],
      },
      defender: { species: 'Gengar', level: 100, moves: ['Shadow Ball'] },
    },
  },
  {
    id: 'g4-hidden-power-generic-ivs',
    input: {
      gen: 4,
      attacker: {
        species: 'Gengar',
        level: 100,
        nature: 'Timid',
        ivs: { hp: 31, at: 30, df: 30, sa: 30, sd: 31, sp: 31 },
        evs: { sa: 252, sp: 252 },
        moves: ['Hidden Power', 'Shadow Ball'],
      },
      defender: { species: 'Heatran', level: 100, evs: { hp: 252 }, moves: ['Fire Blast'] },
    },
  },
  {
    id: 'g7-hidden-power-generic-ivs',
    input: {
      gen: 7,
      attacker: {
        species: 'Magnezone',
        nature: 'Modest',
        level: 50,
        ivs: { hp: 31, at: 31, df: 30, sa: 31, sd: 30, sp: 31 },
        evs: { sa: 252 },
        moves: ['Hidden Power', 'Flash Cannon'],
      },
      defender: { species: 'Tapu Fini', level: 50, evs: { hp: 252 }, moves: ['Moonblast'] },
    },
  },
  {
    id: 'g3-hidden-power-generic-ivs',
    input: {
      gen: 3,
      attacker: {
        species: 'Gengar',
        level: 100,
        ivs: { hp: 31, at: 31, df: 31, sa: 31, sd: 31, sp: 31 },
        moves: ['Hidden Power', 'Shadow Ball'],
      },
      defender: { species: 'Blissey', level: 100, moves: ['Seismic Toss'] },
    },
  },
  {
    id: 'g9-ogerpon-tera-embody-aspect',
    input: {
      gen: 9,
      attacker: {
        species: 'Ogerpon-Hearthflame',
        level: 50,
        nature: 'Jolly',
        item: 'Hearthflame Mask',
        terastallized: true,
        evs: { at: 252, sp: 252 },
        moves: ['Ivy Cudgel', 'Horn Leech', 'Spiky Shield'],
      },
      defender: { species: 'Amoonguss', level: 50, evs: { hp: 252 }, moves: ['Pollen Puff'] },
    },
  },
  {
    id: 'g9-terapagos-stellar-forme',
    input: {
      gen: 9,
      attacker: {
        species: 'Terapagos-Stellar',
        level: 50,
        teraType: 'Stellar',
        evs: { sa: 252 },
        moves: ['Tera Starstorm', 'Earth Power', 'Dark Pulse'],
      },
      defender: { species: 'Incineroar', level: 50, moves: ['Fake Out'] },
    },
  },
  {
    id: 'g9-rage-fist-times-affected',
    input: {
      gen: 9,
      attacker: {
        species: 'Annihilape',
        level: 50,
        nature: 'Jolly',
        evs: { at: 252, sp: 252 },
        moves: [{ name: 'Rage Fist', timesAffected: 3 }, 'Drain Punch', 'Close Combat'],
      },
      defender: { species: 'Gholdengo', level: 50, evs: { hp: 252 }, moves: ['Shadow Ball'] },
    },
  },
  {
    id: 'g9-foul-play-body-press',
    input: {
      gen: 9,
      attacker: {
        species: 'Grimmsnarl',
        level: 50,
        evs: { hp: 252, df: 252 },
        moves: ['Foul Play', 'Body Press', 'Knock Off', 'Facade'],
      },
      defender: {
        species: 'Garchomp',
        level: 50,
        nature: 'Adamant',
        evs: { at: 252 },
        status: 'Burned',
        moves: ['Earthquake'],
      },
    },
  },
  {
    id: 'g9-population-bomb-hits',
    input: {
      gen: 9,
      attacker: {
        species: 'Maushold-Four',
        level: 50,
        item: 'Loaded Dice',
        moves: ['Population Bomb', { name: 'Population Bomb', hits: 5 }, 'Last Respects'],
      },
      defender: { species: 'Gholdengo', level: 50, moves: ['Make It Rain'] },
    },
  },
  {
    id: 'g9-skill-link-bullet-seed',
    input: {
      gen: 9,
      attacker: {
        species: 'Cinderace',
        level: 50,
        ability: 'Libero',
        moves: ['Bullet Seed', 'Pin Missile', 'Rock Blast'],
      },
      defender: { species: 'Amoonguss', level: 50, moves: ['Spore'] },
    },
  },
  {
    id: 'g7-rivalry-same-gender',
    input: {
      gen: 7,
      attacker: {
        species: 'Nidoking',
        level: 50,
        ability: 'Rivalry',
        rivalry: 'Same',
        moves: ['Earth Power', 'Sludge Wave'],
      },
      defender: { species: 'Garchomp', level: 50, moves: ['Earthquake'] },
    },
  },
  {
    id: 'g9-quark-drive-highest-stat-override',
    input: {
      gen: 9,
      attacker: {
        species: 'Iron Valiant',
        level: 50,
        ability: 'Quark Drive',
        item: 'Booster Energy',
        highestStat: 2,
        moves: ['Moonblast', 'Close Combat'],
      },
      defender: { species: 'Gholdengo', level: 50, moves: ['Shadow Ball'] },
      field: { terrain: 'Electric' },
    },
  },
  {
    id: 'g9-ability-toggles-flashfire-intimidate-off',
    input: {
      gen: 9,
      attacker: {
        species: 'Heatran',
        level: 50,
        ability: 'Flash Fire',
        abilityOn: true,
        moves: ['Flamethrower', 'Magma Storm', 'Flash Cannon'],
      },
      defender: {
        species: 'Incineroar',
        level: 50,
        ability: 'Intimidate',
        abilityOn: false,
        moves: ['Flare Blitz'],
      },
    },
  },
  {
    id: 'g9-weight-moves-override',
    input: {
      gen: 9,
      attacker: {
        species: 'Garganacl',
        level: 50,
        moves: ['Heavy Slam', 'Grass Knot', 'Low Kick'],
      },
      defender: { species: 'Flutter Mane', level: 50, weight: 250, moves: ['Moonblast'] },
    },
  },
  {
    id: 'g9-absolute-cur-hp-and-lv100',
    input: {
      gen: 9,
      vgcLevels: false,
      attacker: {
        species: 'Dragonite',
        level: 100,
        moves: ['Extreme Speed', 'Dragon Claw', 'Earthquake'],
      },
      defender: { species: 'Iron Hands', level: 100, curHP: 123, moves: ['Drain Punch'] },
    },
  },
  {
    id: 'g9-palafin-hero-forme',
    input: {
      gen: 9,
      attacker: {
        species: 'Palafin-Hero',
        level: 50,
        nature: 'Adamant',
        evs: { at: 252 },
        moves: ['Jet Punch', 'Close Combat', 'Wave Crash'],
      },
      defender: { species: 'Incineroar', level: 50, moves: ['Fake Out'] },
    },
  },
  {
    id: 'g9-expanding-force-terrain-pulse',
    input: {
      gen: 9,
      attacker: {
        species: 'Hatterene',
        level: 50,
        moves: ['Expanding Force', 'Terrain Pulse', 'Dazzling Gleam'],
      },
      defender: { species: 'Amoonguss', level: 50, moves: ['Spore'] },
      field: { terrain: 'Psychic' },
    },
  },
  {
    id: 'g8-pledge-combo',
    input: {
      gen: 8,
      attacker: {
        species: 'Venusaur',
        level: 50,
        moves: [{ name: 'Fire Pledge', pledge: 'Grass Pledge' }, 'Grass Pledge', 'Water Pledge'],
      },
      defender: { species: 'Corviknight', level: 50, moves: ['Brave Bird'] },
    },
  },
  {
    id: 'g6-aegislash-blade-forme',
    input: {
      gen: 6,
      attacker: {
        species: 'Aegislash-Blade',
        level: 50,
        nature: 'Adamant',
        evs: { at: 252 },
        moves: ['Sacred Sword', 'Iron Head', 'Shadow Sneak'],
      },
      defender: { species: 'Gardevoir', level: 50, moves: ['Moonblast'] },
    },
  },
  {
    id: 'g5-eviolite-chansey-canevolve',
    input: {
      gen: 5,
      attacker: {
        species: 'Hydreigon',
        level: 100,
        nature: 'Modest',
        evs: { sa: 252 },
        moves: ['Dark Pulse', 'Draco Meteor', 'Earthquake'],
      },
      defender: {
        species: 'Chansey',
        level: 100,
        item: 'Eviolite',
        evs: { hp: 252 },
        moves: ['Seismic Toss'],
      },
    },
  },
  {
    id: 'g7-z-move-status-and-max-hp-percent',
    input: {
      gen: 7,
      attacker: {
        species: 'Raichu',
        level: 50,
        item: 'Aloraichium Z',
        moves: [{ name: 'Thunderbolt', z: true }, 'Surf'],
      },
      defender: { species: 'Gyarados', level: 50, percentHP: 33, moves: ['Waterfall'] },
    },
  },
  {
    id: 'g10-mega-sps-doubles-spread',
    input: {
      gen: 10,
      attacker: {
        species: 'Mega Garchomp',
        nature: 'Adamant',
        item: 'Garchompite',
        statPoints: { at: 32, sp: 32, hp: 2 },
        moves: ['Earthquake', 'Rock Slide', 'Dragon Claw', 'Stone Edge'],
      },
      defender: {
        species: 'Mega Charizard X',
        nature: 'Adamant',
        item: 'Charizardite X',
        statPoints: { hp: 32, df: 32 },
        moves: ['Flare Blitz', 'Dragon Claw'],
      },
    },
  },
  {
    id: 'g10-natdex-ability-list',
    input: {
      gen: 10,
      natDex: true,
      attacker: {
        species: 'Dragapult',
        nature: 'Timid',
        statPoints: { sa: 32, sp: 32, hp: 2 },
        moves: ['Shadow Ball', 'Draco Meteor', 'Dragon Darts'],
      },
      defender: { species: 'Corviknight', statPoints: { hp: 32, df: 32 }, moves: ['Brave Bird'] },
    },
  },
]

export function buildScenarios() {
  const out = []
  for (const g of GENS) {
    for (const m of g.matchups) {
      for (const [tag, fn, extraOpts] of g.variants) {
        const base = {
          gen: g.id,
          ...(extraOpts ?? {}),
          attacker: clone(m.attacker),
          defender: clone(m.defender),
          field: clone(m.field ?? {}),
        }
        const input = clone(fn(base))
        out.push({ id: `g${g.id}/${m.id}/${tag}`, input })
      }
    }
  }
  for (const e of EXTRA) out.push({ id: `extra/${e.id}`, input: clone(e.input) })
  return out
}
