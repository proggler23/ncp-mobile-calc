// Vendored NCP data scripts as raw text (unmodified), in the load order of the original pages.
import pokedex from '../../../vendor/ncp/script_res/pokedex.js?raw'
import statData from '../../../vendor/ncp/script_res/stat_data.js?raw'
import typeData from '../../../vendor/ncp/script_res/type_data.js?raw'
import natureData from '../../../vendor/ncp/script_res/nature_data.js?raw'
import abilityData from '../../../vendor/ncp/script_res/ability_data.js?raw'
import itemData from '../../../vendor/ncp/script_res/item_data.js?raw'
import moveData from '../../../vendor/ncp/script_res/move_data.js?raw'

export const DATA_SCRIPTS: readonly string[] = [
  pokedex,
  statData,
  typeData,
  natureData,
  abilityData,
  itemData,
  moveData,
]
