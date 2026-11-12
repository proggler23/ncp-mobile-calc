# NCP patches

Unified diffs (`*.patch`, git format, paths like `a/script_res/damage_SV.js` relative to the
UPSTREAM repo root) applied in file-name order on top of the vendored upstream files after every
`npm run ncp:sync`. Use them for deliberate local fixes to `vendor/ncp/script_res/*`.

There are none at the moment. How to add one, how the sync treats them and how to verify them
(`npm run ncp:patches`) is described in docs/MAINTENANCE.md ("NCP patches").
