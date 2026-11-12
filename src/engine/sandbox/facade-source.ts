/**
 * Source text appended (in the same function scope) after the vendored NCP scripts. It lives in
 * the scope of the vendored code so it can read/write NCP's top-level `var`s, and exposes the small
 * surface the TypeScript adapter needs.
 *
 * `configureGen` is a faithful copy of the global assignments done by the `.gen` change handler in
 * the original `ap_calc.js` (the rest of that handler is DOM/UI work).
 */
export const FACADE_SOURCE = String.raw`
// UI-level globals that live in the (unvendored) switch_mode.js on the original pages.
var isCustomMods = false;
var confirmCustomMods = false;
var resultDisplayMode = 'SPs';
function __configureGen(g, natdex) {
  gen = g;
  switch (gen) {
    case 1:
      pokedex = POKEDEX_RBY; typeChart = TYPE_CHART_RBY; moves = MOVES_RBY; items = []; abilities = [];
      STATS = STATS_RBY; calculateAllMoves = CALCULATE_ALL_MOVES_RBY; calcHP = CALC_HP_RBY; calcStat = CALC_STAT_RBY;
      break;
    case 2:
      pokedex = POKEDEX_GSC; typeChart = TYPE_CHART_GSC; moves = MOVES_GSC; items = ITEMS_GSC; abilities = [];
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_GSC; calcHP = CALC_HP_RBY; calcStat = CALC_STAT_RBY;
      break;
    case 3:
      pokedex = POKEDEX_ADV; typeChart = TYPE_CHART_GSC; moves = MOVES_ADV; items = ITEMS_ADV; abilities = ABILITIES_ADV;
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_ADV; calcHP = CALC_HP_ADV; calcStat = CALC_STAT_ADV;
      break;
    case 4:
      pokedex = POKEDEX_DPP; typeChart = TYPE_CHART_GSC; moves = MOVES_DPP; items = ITEMS_DPP; abilities = ABILITIES_DPP;
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_DPP; calcHP = CALC_HP_ADV; calcStat = CALC_STAT_ADV;
      break;
    case 5:
      pokedex = POKEDEX_BW; typeChart = TYPE_CHART_BW; moves = MOVES_BW; items = ITEMS_BW; abilities = ABILITIES_BW;
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_XY; calcHP = CALC_HP_ADV; calcStat = CALC_STAT_ADV;
      break;
    case 6:
      pokedex = POKEDEX_XY; typeChart = TYPE_CHART_XY; moves = MOVES_XY; items = ITEMS_XY; abilities = ABILITIES_XY;
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_XY; calcHP = CALC_HP_ADV; calcStat = CALC_STAT_ADV;
      break;
    case 7:
      pokedex = POKEDEX_SM; typeChart = TYPE_CHART_XY; moves = MOVES_SM; items = ITEMS_SM; abilities = ABILITIES_SM;
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_SV; calcHP = CALC_HP_ADV; calcStat = CALC_STAT_ADV;
      break;
    case 7.5:
      pokedex = POKEDEX_LGPE; typeChart = TYPE_CHART_XY; moves = MOVES_LGPE; items = []; abilities = [];
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_SV; calcHP = CALC_HP_LGPE; calcStat = CALC_STAT_LGPE;
      break;
    case 8:
      pokedex = natdex ? POKEDEX_SS_NATDEX : POKEDEX_SS; typeChart = TYPE_CHART_XY;
      moves = natdex ? MOVES_SS_NATDEX : MOVES_SS; items = natdex ? ITEMS_SS_NATDEX : ITEMS_SS; abilities = ABILITIES_SS;
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_SV; calcHP = CALC_HP_ADV; calcStat = CALC_STAT_ADV;
      break;
    case 9:
      pokedex = natdex ? POKEDEX_SV_NATDEX : POKEDEX_SV; typeChart = TYPE_CHART_SV;
      moves = natdex ? MOVES_SV_NATDEX : MOVES_SV; items = natdex ? ITEMS_SV_NATDEX : ITEMS_SV; abilities = ABILITIES_SV;
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_SV; calcHP = CALC_HP_ADV; calcStat = CALC_STAT_ADV;
      break;
    case 9.5:
      pokedex = POKEDEX_ZA; typeChart = TYPE_CHART_SV; moves = MOVES_ZA; items = ITEMS_ZA; abilities = [];
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_SV; calcHP = CALC_HP_ADV; calcStat = CALC_STAT_ADV;
      break;
    case 10:
      pokedex = natdex ? POKEDEX_ZA_NATDEX : POKEDEX_CHAMPIONS; typeChart = TYPE_CHART_SV;
      moves = natdex ? MOVES_CHAMPIONS_NATDEX : MOVES_CHAMPIONS; items = natdex ? ITEMS_ZA_NATDEX : ITEMS_CHAMPIONS;
      abilities = natdex ? ABILITIES_CHAMPIONS_NATDEX : ABILITIES_CHAMPIONS;
      STATS = STATS_GSC; calculateAllMoves = CALCULATE_ALL_MOVES_SV; calcHP = CALC_HP_CHAMP; calcStat = CALC_STAT_CHAMP;
      break;
    default:
      throw new Error('Unsupported generation: ' + g);
  }
}
var __api = {
  configureGen: __configureGen,
  data: function () {
    return { pokedex: pokedex, moves: moves, items: items, abilities: abilities, typeChart: typeChart, STATS: STATS, natures: NATURES, gmaxDefaults: GMAX_DEFAULTS };
  },
  calcHP: function (poke) { calcHP(poke); },
  calcStats: function (poke) { calcStats(poke); },
  getHPDVs: function (poke) { return getHPDVs(poke); },
  setResultDisplay: function (mode) { resultDisplayMode = mode; },
  run: function () { calcQueue = 0; calculate(); return damageResults; },
  calcMinMaxDamage: function (damage, hits) { return calcMinMaxDamage(damage, hits); }
};
// The sandbox body is a generator so that further scripts can be evaluated later *in this same
// scope* (a direct eval must sit in the function body itself): resume with the script text.
var __script;
while (true) {
  __script = yield __api;
  if (__script) { eval(__script); }
}
`
