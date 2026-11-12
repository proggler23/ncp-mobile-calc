# NCP Mobile Calc

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/proggler23)

A mobile-first, installable web app (PWA) for Pokémon VGC damage calculations. It is a rebuild of
the [NCP VGC Damage Calculator](https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/) with a UI
designed for phones.

## What it is

- **Same numbers as NCP.** The damage math is NCP's own scripts, run unmodified in a sandbox. The
  results are checked against 448 golden scenarios captured from the original NCP pages; they must
  match exactly (damage rolls, description and KO text).
- **All generations NCP supports:** RBY, GSC, ADV, DPP, BW, XY/ORAS, SM/USUM, LGPE, SwSh, SV,
  Legends Z-A and Champions. Singles and doubles.
- **Installable and offline.** Champions works offline right after the first load; other generations
  are saved when first opened, or all at once from the menu.
- **German and English** UI, and search works in both languages (species names in German come from
  PokeAPI).

## Features

- **Matchup screen:** your Pokémon and the opponent stacked as cards, with the damage results for
  both directions below. Rolls and KO chances are shown per move.
- **Teams:** several named teams, up to six Pokémon each, shown as chips for quick switching. Teams are
  tied to one generation.
- **Opponent presets:** Neutral, Def, SpD, Atk, SpA and Common (the most used set from usage
  statistics). Your own saved sets appear next to them.
- **Custom sets:** save an edited Pokémon (ability, item, nature, spread, moves, Tera type, Z/Plus
  move, crit, hits) as a reusable set.
- **Pokémon editor:** Pokémon, formes, level, nature, ability, item, moves, stat points/EVs/IVs
  (labels follow the generation), Tera, Dynamax/Gigantamax and status/boosts/HP for the battle state.
- **Move picker:** search moves, filtered by the learnset of the selected Pokémon. For Legends Z-A
  the learnset is unreliable, so the full move list is offered with a warning.
- **Field sheet:** singles/doubles (spread-move damage), weather, terrain, global effects (Gravity,
  Neutralizing Gas, auras, Ruin abilities) and side conditions (Reflect, Light Screen, Tailwind, ...)
  for each side.
- **Showdown paste:** import a team from a Showdown export and export a team back as text, with
  copy and share.
- **Backup:** export teams and saved sets as a JSON file; import them with merge or replace.
- **Offline use:** "Download all generations" in the menu. After an app update, downloaded
  generations are fetched again in the background while online.
- **Data info:** the menu shows the NCP commit the engine was synced from, the Showdown version,
  the usage months per generation and when the data was built.

## Known limitations

- **Not supported:** Transform and NCP's custom modifiers.
- **Legends Z-A** learnsets are inherited from Scarlet/Violet and are not reliable; Z-A movepools
  and balance changes are not reflected.
- **Usage sets** ("Common") exist only where Smogon VGC statistics exist: none for RBY, GSC, ADV, LGPE
  and Z-A; few for DPP and BW (sparse sets).
- **Ruleset data:** XY uses Showdown's ORAS data and SM uses USUM data. The LGPE item list is not
  restricted to LGPE items.
- **Some NCP-only entities have no German name** and are shown in English.
- **Showdown-only moves** (for example Bide, Present) cannot be calculated.
- **Content Security Policy:** the engine evaluates NCP's scripts with `new Function`, so any CSP
  must allow `unsafe-eval`.
- **Testing:** the iPhone project in the e2e suite uses Chromium with iPhone device emulation, not
  real WebKit.

## Development

### Requirements

- Node.js 22 (the version used by the CI and deploy workflows; `package.json` has no `engines` field)
- npm (a `package-lock.json` is committed; use `npm ci`)

### Install and run

```sh
npm ci
npm run dev          # Vite dev server
npm run build && npm run preview
npm run test:e2e     # first time: npx playwright install chromium
```

### Scripts

| Script                  | What it does                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `dev`                   | Vite dev server                                                                                     |
| `build`                 | type-check the app (`tsc -b`) and build `dist/`                                                     |
| `build:offline`         | same build with outbound network blocked (what the deploy workflow runs)                            |
| `preview`               | serve the built `dist/`                                                                             |
| `lint`                  | ESLint                                                                                              |
| `typecheck`             | type-check the app                                                                                  |
| `typecheck:scripts`     | type-check `scripts/`                                                                               |
| `typecheck:data`        | type-check `scripts/build-data`                                                                     |
| `typecheck:bridge`      | type-check `scripts/build-bridge`                                                                   |
| `test`                  | unit and golden tests (Vitest)                                                                      |
| `test:e2e`              | Playwright tests (Pixel 7 and iPhone 14 projects; builds and previews on port 4173)                 |
| `build:data`            | regenerate game data for the active generations (uses the network)                                  |
| `build:bridge`          | regenerate the Showdown/NCP name maps                                                               |
| `build:assets`          | `build:data` then `build:bridge`                                                                    |
| `build:version`         | rewrite `src/data/generated/version.json` only                                                      |
| `check:data`            | validation gates (schema, count deltas, coverage, checks; `--full` adds lint/typecheck/tests/build) |
| `check:generated`       | generated files are present, valid and match an offline rebuild                                     |
| `check:vendor`          | vendored NCP files match the checksums in `vendor/ncp/UPSTREAM.md`                                  |
| `ncp:sync`              | pull the NCP upstream if it moved, re-vendor, rebuild maps and goldens                              |
| `ncp:patches`           | verify that the patches in `vendor/ncp-patches/` apply                                              |
| `golden:capture`        | re-capture the golden scenarios from the original NCP pages                                         |
| `engine:browser-verify` | replay the golden scenarios in headless Chromium against a build                                    |
| `format`                | Prettier, write all files                                                                           |

`VITE_BASE` sets the base path of the build (see [Deployment](#deployment)).

### Project structure

```
src/
  engine/    NCP damage engine wrapper: sandbox (vendored scripts + jQuery stub), adapter,
             runtime, script chunks, __golden__ scenarios
  bridge/    Showdown id <-> NCP name mapping; generated maps in bridge/generated
  data/      generated game data per generation (dex, learnsets, sets) and loaders
  storage/   IndexedDB (localStorage fallback) persistence, backup, Showdown paste
  state/     app state: store, teams, sets, field, routing
  features/  screens: matchup, teams, editor, menu
  ui/        shared components (dialogs, overlays, controls)
  i18n/      English and German dictionaries
scripts/
  build-data/     Showdown + Smogon + PokeAPI -> src/data/generated
  build-bridge/   NCP tables + Showdown data -> src/bridge/generated
  check-data/     validation gates, generated/vendor checks, offline build guard
  ncp-sync/       NCP upstream sync and patch handling
  ncp-golden/     golden capture and browser verification
  vite-base.ts    VITE_BASE normalisation
vendor/
  ncp/            vendored NCP scripts, UPSTREAM.md (commit, checksums), LICENSE
  ncp-patches/    local patches on top of the vendored files (none at the moment)
e2e/              Playwright tests
docs/             MAINTENANCE.md (data refresh, NCP sync, deploy), ARCHITECTURE.md
```

For how the pieces fit together, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The
sub-folders have their own READMEs: `src/engine`, `src/bridge`, `src/data`, `scripts/build-data`.

## Deployment

The site is deployed to GitHub Pages by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
on every push to `main` (and on manual runs). The deploy build uses only committed files: it runs
`npm ci`, `check:generated`, `check:vendor` and `build:offline` with
`VITE_BASE=/<repo-name>/`, then publishes `dist/`.

**Repository settings required:**

- _Settings → Pages → Build and deployment → Source_: **GitHub Actions**.
- _Settings → Actions → General_: enable **Allow GitHub Actions to create and approve pull requests**
  (needed by the weekly update when it opens a review PR).
- Optional: if `main` is protected, create a fine-grained PAT (Contents and Pull requests:
  read/write on this repository) or a GitHub App token that may bypass the protection, and store it
  as the repository secret **`AUTO_UPDATE_TOKEN`**. The update workflow uses it when present.

**Usage statistics (optional).** The build includes anonymous GoatCounter statistics only if the
repository variable `GOATCOUNTER_URL` is set (for example `https://<code>.goatcounter.com/count`):
_Settings → Secrets and variables → Actions → Variables → New repository variable_. It is passed
to the build as `VITE_GOATCOUNTER_URL` and checked at build time (https only; either a
`*.goatcounter.com` host or a URL ending in `/count`). Unset or empty: no statistics, and the
menu says so. See [Privacy](#privacy) and [docs/MAINTENANCE.md](docs/MAINTENANCE.md#usage-statistics-goatcounter).

**Base path.** `VITE_BASE` sets the path the app is served from (for example `/repo-name/`). It
defaults to `/`. The deploy workflow sets it from the repository name. Set it yourself when you
preview a subpath build locally.

**Weekly automatic update.** [`.github/workflows/auto-update.yml`](.github/workflows/auto-update.yml)
runs every Monday at 06:00 UTC (and on manual dispatch). It refreshes the game data for the active
generations, syncs the NCP upstream if it moved, and runs the validation gates:

- gates pass: one commit on `main` ("chore(data): weekly refresh of game data and NCP sync"), then deploy;
- gate anomaly: a pull request labelled `data` with the gate summary, nothing pushed to `main`;
- gate failure: the run fails and nothing is committed.

Thresholds, rollback, NCP patches and the German-name and curated-set workflows are in
[docs/MAINTENANCE.md](docs/MAINTENANCE.md).

## Privacy

The app has no accounts, no cookies and no server of its own: teams, sets and calcs stay on your
device (IndexedDB / localStorage). The only data that leaves it are a few **anonymous usage
statistics**, counted by [GoatCounter](https://www.goatcounter.com/) (privacy-friendly, cookieless,
no personal data; see [its privacy policy](https://www.goatcounter.com/privacy)). They are sent
only by builds that were configured with a GoatCounter endpoint (see
[Deployment](#deployment)); a fork or local build sends nothing.

**What is sent** (one small request each; GoatCounter also sees what every web request reveals,
namely your IP address and browser, which it only uses to count a visitor once per day without
storing either):

| Name                                                                                            | When                                                                              |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| page view of `/` (plus a coarse screen size, and the referring site, without query or fragment) | the app is opened                                                                 |
| `gen/<generation>/<regulation>`, e.g. `gen/champions/regmc`                                     | at start and when you change generation or regulation, once per value and session |
| `share/native`, `share/copy-text`, `share/copy-link`                                            | a share or copy action succeeded                                                  |
| `share-open`                                                                                    | a shared link was opened and applied                                              |
| `share-open-new`                                                                                | additionally, when the device had no app data before (a new user)                 |
| `install/accepted`                                                                              | you accepted the browser's install dialog                                         |
| `install/ios-howto`                                                                             | the iOS install instructions were opened                                          |
| `install/standalone`                                                                            | the first start as an installed app (once per device)                             |

**What is never sent:** teams, Pokémon, moves, sets, calc inputs or results, the share link or
anything after the `#` or `?` of the address, names, user IDs or anything that identifies you.

**Opt out** any time in the menu (⋮) under "Privacy" ("Send anonymous statistics"). Nothing is
sent either when your browser sends Do Not Track or Global Privacy Control, when you are offline
(nothing is queued for later), or in automated browsers. The choice is stored on the device only
and is not part of backups.

## Support

This is a free, non-commercial fan tool. If it is useful to you, you can
[buy me a coffee](https://buymeacoffee.com/proggler23). Donations support its development and
hosting. They are entirely optional.

## Data sources and credits

- **NCP VGC Damage Calculator** (MIT, © 2013–2021 Honko, Tapin, Firestorm, Jake White
  (squirrelboyVGC), nerd-of-now and other contributors). The damage engine is NCP's code, vendored
  unmodified in `vendor/ncp/` at a recorded commit ([UPSTREAM.md](vendor/ncp/UPSTREAM.md)).
- **Pokémon Showdown** (MIT) data, through the pinned `pokemon-showdown` npm package: species,
  moves, learnsets, items, abilities and formats.
- **PokéAPI** (BSD-3-Clause): German names for species, moves, abilities and items.
- **Smogon usage statistics** ([smogon.com/stats](https://www.smogon.com/stats/)): aggregated usage
  numbers only (spreads, items, abilities, moves, Tera types) behind the "Common" presets. No Smogon
  text is stored or shown.

Full notices and the license texts of all bundled dependencies are in [THIRD_PARTY.md](THIRD_PARTY.md).

## Trademark notice

Pokémon and Pokémon character names are trademarks of Nintendo, Game Freak and The Pokémon Company.
This is an unofficial fan project and is not affiliated with or endorsed by them.

## License

[MIT](LICENSE). Code vendored from NCP keeps its own MIT notice (see `vendor/ncp/LICENSE` and
[THIRD_PARTY.md](THIRD_PARTY.md)).
