/**
 * Explicit NCP name -> Showdown id overrides for names that normalization alone cannot match.
 * Keys are NCP names (exact), values Showdown ids. Applied before automatic matching; an override
 * whose target does not exist in a generation's Showdown data is ignored for that generation.
 */
export const SPECIES_OVERRIDES: Record<string, string> = {
  'Urshifu-Single Strike': 'urshifu',
  'Urshifu-Rapid Strike': 'urshifurapidstrike',
  'Calyrex-Ice Rider': 'calyrexice',
  'Calyrex-Shadow Rider': 'calyrexshadow',
  Flabebe: 'flabebe',
  'Pumpkaboo-Average': 'pumpkaboo',
  'Gourgeist-Average': 'gourgeist',
  'Ash-Greninja': 'greninjaash',
  'Ultra Necrozma': 'necrozmaultra',
  'Oricorio-Baile': 'oricorio',
  'Lycanroc-Midday': 'lycanroc',
  'Mega Garchomp Z': 'garchompmegaz',
  'Mega Meowstic': 'meowsticmmega',
  'Mega Tatsugiri': 'tatsugirimega',
}

export const MOVE_OVERRIDES: Record<string, string> = {}
export const ITEM_OVERRIDES: Record<string, string> = {}
export const ABILITY_OVERRIDES: Record<string, string> = {
  'As One': 'asoneglastrier',
  'Embody Aspect': 'embodyaspectteal',
}

/**
 * Showdown ids that also map to an NCP entity (one-way, Showdown -> NCP). NCP has a single
 * "As One" / "Embody Aspect" ability where Showdown has one id per variant.
 */
export const ABILITY_ALIASES: Record<string, string[]> = {
  'As One': ['asonespectrier'],
  'Embody Aspect': ['embodyaspecthearthflame', 'embodyaspectwellspring', 'embodyaspectcornerstone'],
}
