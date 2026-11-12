# Third-party notices

This project (NCP Mobile Calc, MIT, see [LICENSE](LICENSE)) includes or is derived from the
third-party material listed below. Each entry gives the source, what is used, and the license
notice that applies to it.

| Component                             | Used as                                                     | License          |
| ------------------------------------- | ----------------------------------------------------------- | ---------------- |
| NCP VGC Damage Calculator             | vendored damage engine (`vendor/ncp/script_res/`)           | MIT              |
| Pokémon Showdown (`pokemon-showdown`) | source of species, move, item and ability data (build time) | MIT              |
| PokéAPI                               | German display names (committed snapshot)                   | BSD-3-Clause     |
| Smogon usage statistics               | numbers behind the "Common" opponent sets (build time)      | attribution only |
| React, React DOM, scheduler           | runtime (bundled)                                           | MIT              |
| zod                                   | runtime (bundled, validation of stored data)                | MIT              |
| idb                                   | runtime (bundled, IndexedDB access)                         | ISC              |
| Workbox (runtime, `workbox-*` 7.4.1)  | service worker and `workbox-window` (bundled)               | MIT              |

The build-time tools (Vite, Vite PWA plugin, Playwright, Vitest, ESLint, TypeScript and so on) are
not shipped in the deployed site and are not listed here.

---

## 1. NCP VGC Damage Calculator

- Repository: https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator
- Vendored commit: `a2e408ca905dd64d3ee29a1956edfbe74d1c4072` (committer date 2026-10-24),
  synced 2026-11-12. The list of vendored files and their SHA-256 checksums is in
  [vendor/ncp/UPSTREAM.md](vendor/ncp/UPSTREAM.md).
- Files: `vendor/ncp/script_res/*` (copied byte-for-byte; no local patches at the time of writing,
  see `vendor/ncp-patches/`).
- Use: the damage calculation itself runs these scripts (see `src/engine`). The bridge and data
  scripts read the NCP name tables from them.

The upstream license text, copied from [vendor/ncp/LICENSE](vendor/ncp/LICENSE):

```
MIT License

Copyright (c) 2013-2021 Honko, Tapin, Firestorm, Jake White (squirrelboyVGC), nerd-of-now, and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Pokémon Showdown (`pokemon-showdown` 0.11.11)

- Package: `pokemon-showdown`, pinned to the exact version 0.11.11 (devDependency).
- Use: pinned devDependency. The build scripts in `scripts/build-data` and `scripts/build-bridge`
  read its data (species, moves, learnsets, items, abilities, formats) and write the results to
  `src/data/generated/` and `src/bridge/generated/`, which are committed and bundled.

The license text, copied from `node_modules/pokemon-showdown/LICENSE`:

```
The MIT License (MIT)

Copyright (c) 2011-2026 Guangcong Luo and other contributors http://pokemonshowdown.com/

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## 3. PokéAPI (German names)

- Repository: https://github.com/PokeAPI/pokeapi (CSV data: `data/v2/csv`, German = language 6)
- Use: German display names for species, moves, abilities and items. They are stored as the
  committed snapshot `scripts/build-data/names/de.json` (plus hand-written
  `scripts/build-data/names/overrides.de.json`) and ship in the app data. The app only contacts
  PokeAPI when `npm run build:data -- --update-names` is run explicitly.
- License: **BSD-3-Clause** (also recorded in `src/data/generated/sources.json`, field
  `germanNames.license`). The text below was copied verbatim from
  https://github.com/PokeAPI/pokeapi/blob/master/LICENSE.md (downloaded 2026-11-12):

```
Copyright (c) © 2013–2023 Paul Hallett and PokéAPI contributors (https://github.com/PokeAPI/pokeapi#contributing). Pokémon and Pokémon character names are trademarks of Nintendo.

All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

* Neither the name of PokéAPI nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## 4. Smogon usage statistics

- Source: https://www.smogon.com/stats/ (monthly `chaos` JSON files for the VGC formats listed in
  `src/data/generated/sources.json`).
- Use: only aggregated usage numbers (spreads, items, abilities, moves, Tera types) are read.
  The "Common" opponent set is the most-used spread from these numbers. No Smogon articles,
  analysis or other prose is stored or displayed.
- Attribution: "Usage statistics from Smogon University (smogon.com)". No separate license text
  for these statistics was found in the repository; this entry is an attribution only.

---

## 5. Runtime npm dependencies (bundled into the site)

Versions are the installed ones (`node_modules/*/package.json`). Each notice below is copied from
the package's `LICENSE` file.

| Package                                                                                                                              | Version | License | Copyright holder (from LICENSE)                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------- | ------------------------------------------------------------- |
| react                                                                                                                                | 19.3.1  | MIT     | Meta Platforms, Inc. and affiliates.                          |
| react-dom                                                                                                                            | 19.3.1  | MIT     | Meta Platforms, Inc. and affiliates.                          |
| scheduler                                                                                                                            | 0.28.0  | MIT     | Meta Platforms, Inc. and affiliates (dependency of react-dom) |
| zod                                                                                                                                  | 4.6.7   | MIT     | Copyright (c) 2025 Colin McDonnell                            |
| idb                                                                                                                                  | 8.0.4   | ISC     | Copyright (c) 2016, Jake Archibald                            |
| workbox-* (core, precaching, routing, strategies, expiration, cacheable-response, window and the other workbox packages in the tree) | 7.4.1   | MIT     | Copyright 2018 Google LLC                                     |

Notes:

- `vite-plugin-pwa` (2.0.0, MIT) only runs at build time and generates the service worker. The
  Workbox runtime it uses (`dist/sw.js`, `dist/workbox-*.js`) and `workbox-window` (registration in
  the app) are bundled.
- The exact Workbox modules that end up in the generated service worker were not enumerated; the
  notice applies to all `workbox-*` packages at 7.4.1.

### react, react-dom and scheduler (MIT)

```
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### zod (MIT)

The license file of zod 4.6.7 is the MIT license with this copyright line:

```
MIT License

Copyright (c) 2025 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### idb (ISC)

```
ISC License (ISC)
Copyright (c) 2016, Jake Archibald <jaffathecake@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### Workbox (MIT)

```
Copyright 2018 Google LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## Trademarks

Pokémon, Pokémon character names and related marks are trademarks of Nintendo, Game Freak and
The Pokémon Company. This is an unofficial fan project and is not affiliated with or endorsed by
them. Game names, Pokémon names and move names appear only as data labels for the calculator.
