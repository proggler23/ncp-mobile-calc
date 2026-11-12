# NCP golden oracle

`capture.mjs` serves a local clone of the upstream NCP repo over HTTP and drives the REAL original
pages (`index.html`, `lgpe-calc.html`, `za-calc.html`) in headless Chromium through their own UI
controls/handlers (`.val().change()` etc.), then records inputs and the per-move results
(`damageResults`: damage rolls, description, damage/KO text) into `src/engine/__golden__/gen-*.json`.

```sh
git clone https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator /tmp/ncp-upstream   # new empty dir
git -C /tmp/ncp-upstream checkout a2e408ca905dd64d3ee29a1956edfbe74d1c4072
npm run golden:capture -- --upstream /tmp/ncp-upstream            # all scenarios -> __golden__
npm run golden:capture -- --upstream /tmp/ncp-upstream --filter g9/   # debug subset (no files written)
```

The clone is treated as untrusted data: it is only served as static files to the browser; nothing
from it runs in Node and none of its tooling is executed. External requests (fonts, ads) are blocked.
Output is deterministic (re-capturing yields identical files).

`scenarios.mjs` builds the matrix: per-generation matchups x variants (field, boosts, status, ...)
plus hand-written extra scenarios. `browser-verify.mjs` bundles the engine with Vite and replays all
goldens in Chromium (also prints chunk sizes).
