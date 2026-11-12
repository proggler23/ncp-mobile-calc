# Upstream: NCP VGC Damage Calculator

- Repository: https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator
- Branch: main
- Commit SHA: a2e408ca905dd64d3ee29a1956edfbe74d1c4072 (committer date 2026-10-24)
- Synced at: 2026-11-12T08:53:57Z
- License: MIT (see `LICENSE`, copied unmodified from upstream)

Files under `script_res/` are copied byte-for-byte from the upstream clone, except where a patch in
`vendor/ncp-patches/` is listed below. Only the data/engine scripts needed for damage computation
are vendored (list: `scripts/ncp-sync/config.ts`). Not vendored: CSS, images, setdex files,
select2, jQuery, UI-only scripts (`switch_mode.js`, `sidebars.js`, `statuscalc.js`,
`afd_res/*`), `legacy_scripts/`.

To refresh: `npm run ncp:sync` (see docs/MAINTENANCE.md). It re-vendors the files listed below,
rewrites this file, rebuilds the bridge maps and re-captures the golden tests.

## sha256 of vendored files

```
7f5e71f5204f92f441d13324367426cd38745a98658e50c60d1e8bb2cadebddd  script_res/ability_data.js
c962b4140687bff9d56df1fe3d0cb4e2a0e017d4a5c516015b34e9c5e782d08d  script_res/ap_calc.js
09239085c0b76b874fd4a32ef71b063a828aca4c336a1c4868626592e1abfb38  script_res/cooldown_za.js
19813c4a0e9f33bae33ffd13e9887ee093fa2b551ce41a66ee332e37f3d6fb44  script_res/damage_MASTER.js
91a03edd19805b3d101e0a37231e87573b03a0f08a28966fdec97c73ba9c9f2c  script_res/damage_SV.js
a7481d2ef311115797da6fa9322a10526ddf41a6dc81e1041dfce0f979f77db3  script_res/damage_dpp.js
0fce3678275ceede0b300e4c0c7f6f25479a4a81b790b744aa68b4ff6b58bc2a  script_res/damage_gsc.js
2a475880d911f643e8fd7cb2c3b7c0409ccef1b7168522d4ae5c54419233429c  script_res/damage_rby.js
209e32d4e728248ff3aa696bfb56a6a4226cce6c84d967d7cede103cd8a9236f  script_res/damage_rse.js
6634f1695b2eb9caa16505f7fa9bd3fcb632deaeef336b27d80b2752d7da24c5  script_res/damage_xy.js
7fef551dc97f3c12b7c557820d852c2c55039960a0b35baa4d11083aeee67d78  script_res/item_data.js
42487c88108fde388e6a97d844ad95fd80e1823e316a1e2d55c300f6456a9a32  script_res/ko_chance.js
a37c7f624011c07a7d6620b74bca46a3da8faa684c2e7bea6d50235a033209ec  script_res/move_data.js
90e978355e20254adac006980e20c9ba0a3d9bd7d1a5866dea76a5439e1bea3d  script_res/move_data_za.js
7adc03e1df3acc26a1cb790155c2b1983eb2e954b12ad6f793a17cd5ac56f8d3  script_res/nature_data.js
2e2a49a76bbc104486f8ea65623b1e21b727d8cb73a2a1123c3ac17b52915985  script_res/pokedex.js
4e0cfd94e6796c137a9ba6cce28724927c2db37c746136574a86ac24c208a15b  script_res/stat_data.js
f1fe4ab101d4a7ae13aa2d21658490df0924d1e3bf8ee19c2ea1870bcb36927a  script_res/type_data.js
```
