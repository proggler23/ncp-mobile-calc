/**
 * Bridge between the UI/storage world (Showdown ids, string generation ids) and the NCP engine
 * (NCP display-name keys, numeric generation ids). See README.md in this folder.
 */
export * from './types'
export * from './gens'
export {
  loadBridge,
  prepareBridge,
  prefetchGen,
  getBridge,
  ncpName,
  showdownId,
  entityNames,
  type Bridge,
} from './maps'
export {
  toEngineInput,
  toEngineInputDetailed,
  fromCommonSet,
  commonSetToSet,
  type ToEngineResult,
} from './convert'
export {
  speciesDisplayName,
  displayName,
  engineSpeciesList,
  movesForSpecies,
  isMoveLegal,
  buildProblems,
  type EngineSpecies,
  type MovePool,
} from './catalog'
export * from './regulations'
export { applyPreset, applyPresetAsync, loadCommonSets } from './presets'
export {
  fieldFromAbilities,
  statusFromItem,
  typeFromItem,
  type AutoField,
  type AbilityState,
} from './auto'
export {
  hiddenPowerIvs,
  hiddenPowerDvs,
  hiddenPowerTypeOfIvs,
  hiddenPowerTypeOfDvs,
  hiddenPowerTypeOfMove,
  HP_TYPE_ORDER,
  type HiddenPowerType,
} from './hidden-power'
