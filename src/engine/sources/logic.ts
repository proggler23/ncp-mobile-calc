// Vendored NCP engine scripts as raw text (unmodified), in the load order of index.html.
import apCalc from '../../../vendor/ncp/script_res/ap_calc.js?raw'
import damageMaster from '../../../vendor/ncp/script_res/damage_MASTER.js?raw'
import damageSV from '../../../vendor/ncp/script_res/damage_SV.js?raw'
import damageXY from '../../../vendor/ncp/script_res/damage_xy.js?raw'
import damageDPP from '../../../vendor/ncp/script_res/damage_dpp.js?raw'
import damageRSE from '../../../vendor/ncp/script_res/damage_rse.js?raw'
import damageGSC from '../../../vendor/ncp/script_res/damage_gsc.js?raw'
import damageRBY from '../../../vendor/ncp/script_res/damage_rby.js?raw'
import koChance from '../../../vendor/ncp/script_res/ko_chance.js?raw'

export const LOGIC_SCRIPTS: readonly string[] = [
  apCalc,
  damageMaster,
  damageSV,
  damageXY,
  damageDPP,
  damageRSE,
  damageGSC,
  damageRBY,
  koChance,
]
