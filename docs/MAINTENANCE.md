# Maintenance: data refresh, NCP sync, gates and deploy

The site is built **only from committed files**. Everything that needs the network (game data,
usage stats, the NCP upstream) happens in a separate, gated update step that results in a normal
commit; the deploy workflow never downloads anything.

## Overview

```
weekly (Mon 06:00 UTC) / manual           auto-update.yml
job build-and-check  (read-only token)
  build:data --refresh   (ACTIVE_FORMATS only)
  ncp:sync               (only if upstream main moved: re-vendor, bridge, goldens)
  build:bridge
  check:data --full      schema + count deltas + bridge coverage + vendor checksums
                         + lint/typecheck/test/build
  -> artifact: update.patch (allowed paths only) + gate summary
job publish          (contents + pull-requests write; runs no repository code)
  applies the patch after checking its paths
        |
        +-- pass     -> bot commit on main -> deploy.yml (called in the same run)
        +-- anomaly  -> PR "needs review" (body = gate summary), nothing pushed to main
        +-- fail     -> job fails (GitHub notifies), nothing committed
```

`deploy.yml` (push to main, manual, or `workflow_call`) runs `npm ci`, `check:generated`
(generated files present, schema-valid, bridge maps identical to an offline rebuild) and
`check:vendor` and `build:offline` (the normal build with outbound network access blocked by
`scripts/check-data/block-network.cjs`). `ci.yml` runs lint, typecheck (app + scripts), tests
(including the golden suite, which also holds the sandbox containment test), `check:generated`,
`ncp:patches`, `check:vendor` and `build:offline`.

`npm run check:vendor` verifies the sha256 of every file under `vendor/ncp/script_res/` against the
list in `vendor/ncp/UPSTREAM.md` (and flags missing / unlisted files). Those hashes are of the
pristine UPSTREAM bytes, so when `vendor/ncp-patches/*.patch` exist the check reverse-applies them
(last first) on a temporary copy before hashing: patched files pass only if the patch captures every
local change. A hand edit of a vendored file without a patch fails it.

All third-party actions are pinned to full commit SHAs (`uses: owner/repo@<sha> # vX.Y.Z`);
Dependabot (github-actions ecosystem) proposes updates. Do not replace them with floating tags.

## Frozen vs active generations

`scripts/build-data/config.ts` exports `ACTIVE_FORMATS` (initially `['champions']`).

- `npm run build:data` and the weekly refresh regenerate **only** active gens.
- Every other gen's files in `src/data/generated/<gen>/` are committed snapshots and are never
  touched by the refresh.
- `npm run build:data -- --all` regenerates everything (manual use, e.g. after a Showdown bump);
  `--gen sv,za` regenerates specific gens.

### Adding a format / generation to `ACTIVE_FORMATS`

1. New game/format with its own folder: add a `GenConfig` to `GENS` in `config.ts` (id, label,
   `source` = `{kind:'gen', gen}` for mainline `Dex.forGen` or `{kind:'ps', mod, learnGen}` for a
   Showdown data mod, `vgc` = Smogon stats formats + candidate months, `gaps`), add the id to
   `GEN_IDS` in `src/data/types.ts` and to `GENS` in `scripts/build-bridge/index.ts` (+ NCP engine
   gen mapping), then run `npm run build:data -- --gen <id>` and `npm run build:bridge`.
2. Add the id to `ACTIVE_FORMATS` so the weekly job keeps it fresh. Optional candidates (left
   frozen by default because the games/formats are finished): `'sv'` (while a VGC regulation is
   still being played) and `'za'` (if Showdown's `gen9legends` mod is still changing).
3. To freeze a finished gen, remove it from `ACTIVE_FORMATS`; its last output stays committed.

## Gates and thresholds

`npm run check:data` (add `--full` for lint/typecheck/tests/build, `--merge <result.json>` to fold
in the NCP sync result, `--base <ref>` to compare against another commit than `HEAD`). It writes
`.cache/check-data/result.json` (`{status: pass|anomaly|fail, reasons[], notes[], checks[]}`) and
`result.md`, and exits 1 only for `fail`.

| condition                                                                                                                                                                                 | result  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| JSON schema / referential validation fails (zod, `scripts/check-data/schema.ts`)                                                                                                          | fail    |
| `build:bridge`, lint, typecheck, tests (incl. goldens) or build fail                                                                                                                      | fail    |
| species/moves/items/abilities/learnsets/sets count drops by more than 5% vs the previous committed snapshot (per gen)                                                                     | anomaly |
| ... by 50% or more, or a gen's data disappears                                                                                                                                            | fail    |
| a regulation's legal species/items drop by more than 5% vs the previous snapshot (per `<gen>/<regulation>`)                                                                               | anomaly |
| ... by 50% or more, or a regulation disappears; regulations.json invalid (dangling ids, no/two defaults, manual entry without `verified`, regulation of `config.ts` missing)              | fail    |
| a new unmatched NCP<->Showdown entity appears (`src/bridge/generated/coverage.json`, either side)                                                                                         | anomaly |
| more than 10% of golden scenarios changed after an NCP sync                                                                                                                               | anomaly |
| NCP structural change: vendored file removed/renamed upstream, no longer loaded by a page, or a new script that is neither vendored nor on the ignore list (`scripts/ncp-sync/config.ts`) | anomaly |
| NCP loader failure (bridge build / sandbox cannot evaluate the new scripts), golden capture failure                                                                                       | anomaly |
| an NCP patch no longer applies to the new upstream                                                                                                                                        | anomaly |

Thresholds live in `THRESHOLDS` (`scripts/check-data/gates.ts`). Notes (never affect the status):
German names that fell back to English, usage stats that were unavailable (committed sets kept),
known data quirks. Anomaly with nothing to commit (e.g. vendored file removed upstream: nothing is
re-vendored) fails the job instead of opening an empty PR.

## Running locally

```sh
npm ci
npm run build:data                     # active gens (add -- --refresh to re-download usage stats)
npm run build:data -- --all            # all gens
npm run ncp:sync                       # no-op unless upstream main moved; -- --force to re-run
npm run ncp:sync -- --dry-run          # analyse only
npm run build:bridge
npm run check:data -- --full           # the same gate CI runs; see .cache/check-data/result.md
```

`ncp:sync` needs Playwright Chromium for the golden re-capture (`npx playwright install chromium`).
Downloads and the upstream clone live in the gitignored `.cache/` (`build-data/downloads`,
`ncp-sync/work`). Downloaded data is treated as untrusted: it is parsed, never executed (the NCP
clone is only copied and served to the headless browser).

## Data provenance (`version.json`)

`src/data/generated/version.json` is exposed as `getDataVersionInfo()` (`src/data/version.ts`):
`ncpSha`, `ncpSyncedAt`, `showdownVersion`, `usageMonths` per gen, `namesSnapshotDate`, `builtAt`
(only moves when something else changed).

## Updating Showdown

`pokemon-showdown` is pinned to an exact version (devDependency). Dependabot opens separate PRs
for it. After merging a bump run `npm run build:data` (active gens; `-- --all` if frozen gens
should pick up fixes too), review the diff, commit. The weekly job also picks it up for active gens.
Check `npm view pokemon-showdown versions` for a release that contains a newer Champions / VGC
format (`config/formats.js` in the tarball) and then update the regulations, see below.

## Regulations

Each regulation (a legal pool: species, items, moves) of `champions` and `sv` is built into
`src/data/generated/<gen>/regulations.json`; the app's pickers show exactly that pool ("No filter" =
everything the engine knows). Regulations are listed in `scripts/build-data/config.ts`
(`GenConfig.regulations`, one `default`), derived from the pinned Showdown formats or kept by hand in
`scripts/build-data/regulations/manual.json` (schema and procedure: `scripts/build-data/README.md`).

- **New Champions regulation (e.g. M-D)**: add it to `config.ts` (first = newest, mark `default`), add
  a `manual.json` entry (`base` = the previous regulation + `addSpecies` / `addItems` / `addMoves` /
  `learnsets` / `removeSpecies` ...; `verified: true` only with an authoritative source, put the
  source in `source`), then `npm run build:data` and `npm run build:bridge`. When Showdown ships the
  format, move the regulation to `format` and delete the manual entry.
- **Active vs frozen**: `champions` is active, so the weekly refresh rebuilds its regulations; `sv` is
  frozen (rebuilt with `--gen sv` / `--all`).
- The state of the lists is visible in-app (menu -> data sources: active regulation and whether its
  list is derived or hand-maintained) and in `version.json` (`regulations`).

## Popular lists (Smogon usage per regulation)

`src/data/generated/<gen>/popular.json` (champions, sv) holds, per regulation and species, the top 10
moves, items, abilities and natures of the Smogon VGC chaos stats with their usage in % (1 decimal):
moves are the share of the species' users that run the move (can sum to 400 %), items / abilities /
natures are shares of the species' total (natures aggregated from the spread keys, also for
Champions stat-point spreads). Names are mapped to Showdown ids and entries outside the gen's dex
(and `Other` / `Nothing` / empty) are dropped before the top-10 cut. Shape:
`{ source: 'smogon', regs: { <regId>: { format, month, cutoff, battles, species: { <speciesId>:
{ moves: [[id, pct]...], items, abilities, natures } } } } }` (`meta` is per regulation because each
regulation has its own format and month).

- Source per regulation: `RegConfig.usage` in `config.ts` (`{ id, months }`; months = candidates, newest
  first). Cutoff 1760, falling back to 1630 / 1500 / 0 per month, then to the next candidate month.
  Regulations without Smogon stats simply have no `usage` and no popular section in the app.
- Same fallback as the sets: if a regulation's download fails or has no usable stats, the previously
  committed entry for that regulation is kept (`sources.json` -> `gens.<gen>.popularFallback`).
- Refresh: `npm run build:data -- --refresh` (champions, also in the weekly job; `UPDATE_PATHS`
  already covers `src/data/generated`). sv is frozen: `npm run build:data -- --gen sv`. New
  regulation: add `usage` to its `RegConfig`; the gates (`check:generated`, `check:data`) fail when a
  configured regulation lacks popular data, validate the schema (ids in the dex, sorted, <= 10
  entries, 0 < pct <= 100) and compare the species count per regulation with `HEAD` (>5 % drop =
  anomaly, >= 50 % or a regulation disappearing = fail).
- Provenance: `version.json` -> `popular` (format, month, cutoff per regulation), shown in the menu
  under "Popular lists" for the active regulation.
- In the app (`state/popular.ts`, `ui/SearchOverlay.tsx`): the move, item, ability and nature pickers
  show "Popular in <regulation>" (sorted by %, right-aligned %, attribution caption) before the full
  alphabetical list. Popular entries are filtered to what the picker offers (legal in the
  regulation, learnable, species-own ability). With a search query the matching popular entries stay
  on top with their % and are not repeated below (no headers). No popular section for "No filter",
  for species/regulations without data, or when nothing remains after filtering. The nature field is a
  picker (not a native select) so it can have the same sections.

## Roll back

Every automatic update is one commit on `main` ("chore(data): weekly refresh ..."): `git revert
<sha>` (or revert the merged PR) and push; the deploy workflow redeploys the previous data.
Roll back the NCP engine the same way (the commit contains vendored files, UPSTREAM.md and goldens).

## Branch protection and tokens

The publish job pushes to `main`. If `main` is protected, give the workflow a token that may bypass
it: create a fine-grained PAT (Contents + Pull requests: read/write on this repo) or a GitHub App
installation token that is allowed to bypass the ruleset, and store it as the repository secret
**`AUTO_UPDATE_TOKEN`**. The workflow uses it if present, otherwise `GITHUB_TOKEN`.

Differences: pushes with `GITHUB_TOKEN` do not trigger other workflows, so the update run calls
`deploy.yml` itself (`workflow_call`); with `AUTO_UPDATE_TOKEN` the push triggers `deploy.yml` and
`ci.yml` normally and the explicit call is skipped. PRs opened with `GITHUB_TOKEN` do not trigger
CI either (re-run it from the PR or use the PAT). Also enable _Settings -> Actions -> General ->
Allow GitHub Actions to create and approve pull requests_. Permissions per job: build-and-check =
`contents: read` (all downloading, building and testing happens here, with no write token);
publish = `contents: write`, `pull-requests: write` (only applies the artifact, commits / pushes or
opens the PR; the artifact patch is rejected if it touches paths outside `UPDATE_PATHS`; the
`AUTO_UPDATE_TOKEN` PAT is only used by this job); deploy = `contents: read`, `pages: write`,
`id-token: write`. Runs are serialised by the `auto-update` concurrency group.

## Usage statistics (GoatCounter)

Anonymous, cookieless statistics (`src/analytics/`, events listed in the README "Privacy"
section). The build only contains them if `VITE_GOATCOUNTER_URL` is set; local builds, forks and
the unit tests have none.

One-time setup:

1. Create a free site at goatcounter.com (site code e.g. `ncpcalc`). GoatCounter counts a
   visitor with a hash of IP + user agent that rotates daily; no cookies.
2. GitHub: _Settings → Secrets and variables → Actions → **Variables** → New repository variable_,
   name `GOATCOUNTER_URL`, value `https://<code>.goatcounter.com/count` (a plain variable, not a
   secret: the URL is public in the shipped JavaScript anyway).
3. Re-run the deploy workflow (or push to `main`). The weekly auto-update deploy uses the same
   variable.

`deploy.yml` passes the variable as `VITE_GOATCOUNTER_URL`; `scripts/goatcounter-url.ts`
(called from `vite.config.ts`) rejects anything that is not `https://<code>.goatcounter.com[/count]`
or `https://<host>/count` (self-hosted) and fails the build. To switch statistics off, delete the
variable and redeploy. Events appear in GoatCounter as pages (`/`) and events (`gen/...`,
`share/...`, `install/...`); the site's title is only informative. If no hits show up, check the
site's settings in GoatCounter (it may restrict which domains may send data). E2E tests build
with a fake endpoint (`https://test.goatcounter.com/count`) and intercept all requests; the window
flag `__NCP_ANALYTICS_FORCE__` (set by the Playwright fixture) lifts only the "automated browser"
block, never the opt-out, Do Not Track or Global Privacy Control.

## German names

- `scripts/build-data/names/de.json`: committed snapshot (kind -> Showdown id of the English name ->
  German), built from PokeAPI CSVs. Rewrite it only with `npm run build:data -- --update-names`
  (the only code path that contacts PokeAPI); review the diff.
- `scripts/build-data/names/overrides.de.json`: hand-maintained, wins over the snapshot. Same shape,
  e.g. `{"moves": {"newmove": "Neuer Angriff"}}`. Keys are lowercase alphanumerics (the id of the
  English name, e.g. `hiddenpowerfire`). Add entries for names listed as "German name missing" in the
  gate notes, then `npm run build:data -- --gen <id>`.
- Entities without a German name fall back to English (listed in the gate report).

## Curated sets

`scripts/build-data/sets/curated.json` (empty initially) layers hand-written sets over the
generated Smogon-usage sets:

```json
{
  "gens": {
    "champions": {
      "garchomp": {
        "mode": "prepend",
        "sets": [
          {
            "ability": "roughskin",
            "item": "focussash",
            "nature": "Jolly",
            "evs": { "atk": 32, "spe": 32 },
            "moves": ["earthquake", "protect"],
            "teraType": "Steel"
          }
        ]
      }
    }
  }
}
```

`mode`: `replace` (default; only the curated sets), `prepend`, `append`. Ids are Showdown ids as in
`dex.json`; unknown ids fail the build. Curated sets carry `source: "curated"`, `usagePct: 0`,
`month: ""`. They are applied whenever that gen is built (so for a frozen gen run
`npm run build:data -- --gen <id>`).

Smogon usage is optional: if the download fails or no usable stats exist (format renamed), the last
committed `sets.json` is kept and `sources.json` records `usageFallback`.

## NCP patches

`npm run ncp:sync` compares `git ls-remote` of upstream `main` with the SHA in
`vendor/ncp/UPSTREAM.md`. Unchanged: nothing happens. Changed: it clones upstream into
`.cache/ncp-sync/work`, analyses the structure (script tags of `index.html`, `lgpe-calc.html`,
`za-calc.html` vs the vendored list in UPSTREAM.md), applies `vendor/ncp-patches/*.patch`, re-vendors
the same file list, rewrites UPSTREAM.md (SHA, sync time, sha256 of the pristine files, applied
patches), rebuilds the bridge, re-captures all goldens with Playwright against the (patched)
upstream copy and reports how many golden scenarios changed. Result: `.cache/ncp-sync/result.json`.

To add a patch: edit the vendored file, then produce a git-format diff with `a/script_res/<file>`
paths relative to the upstream root against the pristine upstream file, e.g. from a fresh clone
`cp vendor/ncp/script_res/x.js <clone>/script_res/x.js && git -C <clone> diff > vendor/ncp-patches/001-description.patch`.
Patches are applied in file-name order. `npm run ncp:patches` (also in CI) verifies that every patch
is applied to `vendor/ncp`. If a patch stops applying after an upstream change the sync reports an
anomaly (`ncp-patch-failed`) and leaves the patch unapplied for you to rebase. Goldens are captured
from the patched copy, so intentional patch behaviour is part of the oracle.

Adding a new ignored (non-engine) upstream script: extend `IGNORED_REFS` in
`scripts/ncp-sync/config.ts`. Adding a new vendored script: add it to the hash list in UPSTREAM.md
and to the engine sources (`src/engine/sources`).
