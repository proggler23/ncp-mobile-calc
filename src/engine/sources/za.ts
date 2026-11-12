// Legends Z-A only scripts (loaded lazily, evaluated into the already running sandbox scope).
import moveDataZA from '../../../vendor/ncp/script_res/move_data_za.js?raw'
import cooldownZA from '../../../vendor/ncp/script_res/cooldown_za.js?raw'

export const ZA_SCRIPTS: readonly string[] = [moveDataZA, cooldownZA]
