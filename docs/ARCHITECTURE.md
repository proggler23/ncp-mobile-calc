# Architecture

A short map of how the app is put together. Module-level details live in the READMEs of each
folder (`src/engine`, `src/bridge`, `src/data`, `scripts/build-data`); data refresh and deploy are in
[MAINTENANCE.md](MAINTENANCE.md).

## Data flow of a calculation

```
SavedSet                     Showdown ids, string gen ("sv"), set body from storage or the editor
   |  bridge.toEngineInput(gen, attackerSet, defenderSet, field)
   |    maps ids to NCP display names via the generated maps (src/bridge/generated)
   |    applies the UI conveniences (auto weather/terrain, Flame Orb status, plates,
   |    Hidden Power IVs), each can be switched off in ToEngineOptions
   v
CalcInput                    NCP display names, numeric gen (1 ... 10, 7.5, 9.5)
   |  engine.calculate(input)   (after prepare(gen) has been awaited once)
   |    adapter.fillState  -> writes a FormState (values NCP would read from the form)
   |    sandbox            -> NCP's own scripts, evaluated in one scope, with a jQuery stub
   |                          that answers their reads from FormState
   |    NCP calculate()    -> damageResults, KO text
   v
CalcResult                   per move: damage rolls, description, koChance, percentRange, ...
   |
   v
UI (features/matchup)        MoveResults and PokemonCard render the result
```

Key points:

- `calculate()` is synchronous and works only from the explicit input. NCP's scripts see a stub
  of the browser globals and jQuery (`sandbox/jquery-stub.ts`), not the real DOM.
- The damage math is NCP's unmodified code (`vendor/ncp/script_res`, checked by `npm run check:vendor`).
  Local changes, if any, must be recorded as patches in `vendor/ncp-patches/`.
- Correctness is pinned by 448 golden scenarios (`src/engine/__golden__`) captured from the original
  NCP pages; they must match exactly.

## Loading and caching

- **App shell:** screens are `React.lazy` chunks (matchup, teams, menu). The shell and UI chunks are
  in the service worker precache.
- **Engine:** `prepare(gen)` evaluates NCP's scripts from three `?raw` chunks (`data`, `logic`, `za`)
  that load on first use.
- **Game data:** `loadGenData(gen)` loads each generation's `dex.json` and `learnsets.json` as separate
  chunks through `import.meta.glob`. Common sets (`sets.json`) and the per-regulation popular lists (`popular.json`, `loadPopular`) load on demand. Name maps are
  per generation (`genmap-<gen>` chunks, `prefetchGen`).
- **Precache:** the build precaches everything except the data of generations other than Champions
  (`PRECACHED_GEN` in `vite.config.ts`). Champions therefore works offline immediately.
- **Runtime cache:** other generations' `gendata-*` and `genmap-*` chunks use `CacheFirst` in the
  `gen-data-v1` cache (max 120 entries, 180 days). They are stored the first time they are opened, or
  by "Download all generations".
- **Updates:** content-hashed chunks mean an app update creates new files. When a new service worker
  takes over a page that had downloaded all generations, those downloads are marked stale and fetched
  again in the background while online (`src/pwa.ts`).

## Persistence

- Stores: `teams`, `customSets`, `settings` in the IndexedDB database `ncp-mobile-calc`
  (schema version 1, migrations in `src/storage/backend.ts`).
- Fallback: if IndexedDB is unavailable (private mode, blocked, quota), a localStorage backend with
  the `ncp:` key prefix is used.
- Values read back from storage are treated as untrusted and validated with zod
  (`src/storage/schema.ts`).
- Backup export and import (JSON) and the Showdown paste import/export go through
  `src/storage/repository.ts` and `src/storage/showdown.ts`.
- Battle state (boosts, status, HP) is not saved with sets.

## Regulations

- Data: `src/data/generated/<gen>/regulations.json` (champions: Reg M-C default, M-B, M-A; sv: Reg I
  default, G, D, C), loaded with the gen's dex (`GenData.regulations`). The synthetic "No filter"
  (`none`) is available for every gen and means the previous behaviour (everything the engine knows).
- `src/bridge/regulations.ts` (legal pool sets, defaults, `buildProblems`) and `catalog.ts`
  (`engineSpeciesList` / `movesForSpecies` take a `regulation`; learnset + regulation changes,
  intersected with the regulation's moves) are the single place that applies a regulation.
- State: `AppState.regulation` (resolved, current gen) and `regulations` (saved choice per gen, also
  in `Settings.regulations` and in backups). `setRegulation`, `setGen` resolve it; teams keep an
  optional `regulation` (absent = the active one). Pickers (species, items, moves; abilities are
  always the species' own) are strictly legal; saved builds that are not legal stay and carry a
  "not legal in Reg X" marker (`features/regulation/LegalBadge`); paste import warns but keeps them.
- UI: the regulation select sits in the top bar. At 360px the gen select, the 1v1/2v2 switch and the
  menu already fill the row (16px text, 44px targets), so below 560px it gets its own full-width row
  under them; from 560px it sits next to the gen select. Only gens with regulations show it.

## Sharing calcs

- **Trigger:** long-press (500 ms, `ui/useLongPress`) on a result row, or the "Share" button in the
  expanded details, opens `features/matchup/ShareSheet` (a normal `Dialog`, so Back closes it) with
  Share / Copy text / Copy link. Status ("-") rows can be shared too; the text is NCP's message as shown.
- **Message** (`state/share.ts`): line 1 = the row as displayed (`moveLine`), line 2 = regulation (or
  the generation label for "No filter") - format - field effects (`state/fieldSummary.ts`, shared with
  the field summary), line 3 = the link. Share uses `navigator.share({title, text: lines 1-2, url})`;
  without Web Share the full text is copied. "Copy text" copies lines 1-3, "Copy link" only the link.
- **Link (v2, current):** `<origin><BASE_URL>#c2<data>` (~100 characters for a typical Champions
  doubles calc). `<data>` is base64url of a bit-packed binary (`src/share/v2.ts`, pure; nicknames and
  notes are never shared): a header (generation, format, presence bits), then the regulation, the
  field, both builds and the selected row. Numbers instead of names: species / moves / items /
  abilities / regulations are positions in **append-only id tables**
  (`src/share/generated/ids-<gen>.json`, built from the committed dex by `npm run build:share-ids`,
  loaded lazily per generation by `src/share/ids.ts`, chunk `gendata-<gen>-ids-*`). Code 0 spells
  the id out inline (ids missing from the table), codes are written with a per-link bit width. Fixed
  enum tables in `v2.ts` (generations, natures, types, status, weather, terrain, side flags,
  override category / pledge) are part of the wire format: append only. Defaults are omitted (level
  50, Serious, IV 31, EV 0, ...); EVs are 6 bits per stat when multiples of 4 (else 8 bits), IVs 5,
  Stat Points 6, boosts 4, HP in tenths (10 bits; exact float otherwise), overrides with their
  bounds. The payload is deflate-raw compressed only when that is shorter (first byte `0x80`).
  Token = `2<data>` (`decodeShare`); max 2048 characters, decompressed <= 2048 bytes.
- **Id-table stability:** a number must mean the same id forever. `build:share-ids` only appends
  (ids that left the dex keep their slot). `check:generated` fails when a table is missing, malformed
  or lacks a dex id; `check:data` (weekly auto-update gate) reports an **anomaly** when an existing
  mapping differs from the git baseline; the auto-update workflow runs `build:share-ids` and commits
  `src/share/generated`. `scripts/build-share-ids/tables.test.ts` pins sample numbers.
- **Link (v1, still decoded):** `<origin><BASE_URL>#/c/v1.<payload>` (compressed positional JSON) and
  `#/c/v1r.<payload>` (uncompressed fallback). v2 decodes into the same intermediate positional
  value as v1, so both go through one validation path. Versions are append-only: old links keep
  decoding through their own decoder; new shares always use v2.
- **Opening:** `App` calls `openSharedLink` for `#c2...` / `#/c/...` at start and on `hashchange`. The hash is
  replaced by `#/` first (a reload never re-applies it). Decoding is strict and never throws: token
  <= 4 KB (v2: 2 KB), decompressed JSON <= 16 KB (v2: 2 KB), bounds-checked bit reads (truncated
  input is an error), unknown numbers dropped with a warning, whitelisted keys, storage zod schemas with generation-aware
  EV / AV / Stat Point caps, then a check against the generation's data. Unknown parts are dropped and
  listed as warnings. The load goes through `applyMatchupSnapshot` (switches generation, regulation,
  format and matchup in one commit, persisted like any change). `AppState.shareNotice` holds the
  Undo snapshot (in memory only) and is shown by `ShareNotice` for 8 s.
- **Preview:** `index.html` carries Open Graph / Twitter tags. `__SITE_URL__` is replaced at build
  time from `VITE_SITE_URL` (default `https://proggler23.github.io/ncp-mobile-calc/`). The deploy
  workflow sets it from the optional repository variable `SITE_URL` (custom domain or fork), else
  `https://<owner, lowercased>.github.io/<repo>/`. The image
  `public/og-image-v2.jpg` (1200x630 JPEG, ~85 KB) is a promo image with a real screenshot of the
  app (German UI, Reg. M-C, Sneasler vs Incineroar, engine numbers). `npm run og:image` rebuilds the
  app, screenshots `vite preview` with Playwright and composes the picture
  (`scripts/generate-og-image.mjs`). It is excluded from the service worker precache (only crawlers
  fetch it); the file name carries a version so chat apps refetch it after a change.

## Generated data and provenance

- `src/data/generated/<gen>/` (dex, learnsets, sets), `src/bridge/generated/` (name maps) and
  `src/data/generated/version.json` are committed build outputs. They are never edited by hand.
- The app shows their provenance (`getDataVersionInfo()`: NCP commit, Showdown version, usage months,
  names snapshot date, build time).
- The deploy build runs with network access blocked, so it can only use committed files.

## Internationalisation

- Two dictionaries, `src/i18n/en.ts` (the source of the `Key` type) and `src/i18n/de.ts`, which is
  typed as `Dict` and therefore must contain every key. At runtime a missing value falls back to
  English and then to the key itself (`translate` in `src/i18n/index.ts`).
- Placeholders use `{name}` (for example `{gen}`, `{n}`).
- The initial language comes from the browser (`detectLang`: `de*` is German, everything else
  English); the user can change it in the menu.
- Pokémon, move, ability and item names: English from the Showdown/NCP data, German from the PokeAPI
  snapshot. A German name that is missing falls back to English.
