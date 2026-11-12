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
menu says so. See [Privacy](#privacy-policy) and [docs/MAINTENANCE.md](docs/MAINTENANCE.md#usage-statistics-goatcounter).

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

<!-- legal:start -->

## Privacy policy

_As of: 2026-11-12_

### Controller

Alexander Hain, Linz, Österreich

Email: [al.hain@gmx.at](mailto:al.hain@gmx.at)

### Hosting (GitHub Pages)

The app is served by GitHub Pages (GitHub, Inc., USA). When you open the site, GitHub processes technically necessary data in server logs, including your IP address and request data (e.g. date, time, requested file, browser). We have no influence on this processing.

The legal basis is Art. 6(1)(f) GDPR (legitimate interest in providing the site).

Data may be processed in the USA. GitHub is certified under the EU-US Data Privacy Framework ([listing](https://www.dataprivacyframework.gov/participant/6174)). Details: [GitHub’s privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

### Anonymous usage statistics (GoatCounter)

We count anonymously how the app is used, with [GoatCounter](https://www.goatcounter.com/). GoatCounter is operated by Martin Tournoij (Ireland); its data is stored on servers of Hetzner Online GmbH in Finland and Germany. GoatCounter sets no cookies and stores neither IP addresses nor the full User-Agent nor a tracker ID. The IP address and User-Agent are only used briefly in memory to count repeat visits once for up to 8 hours, and to derive the country. Only aggregate counts are stored (e.g. browser, operating system, country, language, screen width per day). Sources: [GoatCounter privacy policy](https://www.goatcounter.com/help/privacy), [GoatCounter and GDPR](https://www.goatcounter.com/help/gdpr).

Statistics are only sent by builds that were configured with a GoatCounter endpoint. One small request is sent per event:

- **page view of `/`**: the app was opened (with a coarse screen size and the referring site, without query or fragment)
- `gen/<generation>/<regulation>`: at start and when the generation or regulation changes, once per value and session
- `share/native`: the system share dialog was used successfully
- `share/copy-text`: calc text was copied
- `share/copy-link`: a share link was copied
- `share-open`: a shared link was opened and applied
- `share-open-new`: in addition, when the device had no app data before (a new user)
- `install/accepted`: the browser’s install dialog was accepted
- `install/ios-howto`: the iOS install instructions were opened
- `install/standalone`: first start as an installed app (once per device)

Never sent: teams, Pokémon, moves, sets, calc inputs or results, the share link or anything after the “#” or “?” of the address, names, user IDs or anything that identifies you.

Storage on your device: at start the app checks whether app data already existed on the device (to count “new user via shared link”; the result is only kept in memory) and stores a flag whether the “install/standalone” event was already sent. No cookies are used.

The legal basis is Art. 6(1)(f) GDPR (legitimate interest in anonymous audience measurement to improve the app).

Objection: you can switch statistics off at any time in the menu (⋮) under “Privacy” with the switch “Send anonymous statistics”. Nothing is sent either when your browser signals Do Not Track or Global Privacy Control, when you are offline (nothing is queued for later) or in automated browsers. The choice is stored on the device only and is not part of backups.

### Local data on your device

Teams, sets, settings (e.g. language, generation) and the last matchup are stored in your browser’s IndexedDB / localStorage and are never transmitted to us or to third parties. Delete them with your browser data or by uninstalling the app.

### Shared calc links

The calc data is contained in the link itself (after the “#”). Anyone who has the link can see it; you decide whom you give it to. Nothing is stored on a server.

### External links

The app links to external sites (e.g. Buy Me a Coffee, GitHub, Smogon, Nimbasa City Post). Their privacy rules apply once you follow a link; we have no influence on them.

### Your rights

You have the right of access, rectification, erasure, restriction of processing, data portability and objection. Write to [al.hain@gmx.at](mailto:al.hain@gmx.at). As GoatCounter stores no personal data, no record can be attributed to you there.

You also have the right to lodge a complaint with the supervisory authority: the Austrian Data Protection Authority (Datenschutzbehörde), [www.dsb.gv.at](https://www.dsb.gv.at).

## Imprint / Disclosure

### Media owner and publisher (Medieninhaber und Herausgeber)

Alexander Hain, Linz, Österreich

Contact: [al.hain@gmx.at](mailto:al.hain@gmx.at)

### Purpose of the site (§ 25 MedienG)

An unofficial, non-commercial fan project: a free damage calculator for Pokémon VGC battles. It is not affiliated with Nintendo, Game Freak, The Pokémon Company or Nimbasa City Post.

Optional voluntary donations (e.g. via [Buy Me a Coffee](https://buymeacoffee.com/proggler23)) support development and hosting.

### Disclaimer

All calculations are provided without warranty. The results are based on the NCP Damage Calculator and on data from Pokémon Showdown and Smogon and may contain errors. Unofficial fan project. Pokémon and all related names are trademarks of Nintendo, Game Freak and The Pokémon Company.

### Deutsche Fassung

#### Impressum

##### Medieninhaber und Herausgeber

Alexander Hain, Linz, Österreich

Kontakt: [al.hain@gmx.at](mailto:al.hain@gmx.at)

##### Grundlegende Richtung (§ 25 MedienG)

Inoffizielles, nicht kommerzielles Fanprojekt: ein kostenloser Schadensrechner für Pokémon-VGC-Kämpfe. Es besteht keine Verbindung zu Nintendo, Game Freak, The Pokémon Company oder Nimbasa City Post.

Freiwillige Spenden (z. B. über [Buy Me a Coffee](https://buymeacoffee.com/proggler23)) unterstützen Entwicklung und Hosting. Sie sind vollkommen optional.

##### Haftungsausschluss

Alle Berechnungen ohne Gewähr. Die Ergebnisse basieren auf dem NCP Damage Calculator sowie Daten von Pokémon Showdown und Smogon und können Fehler enthalten. Inoffizielles Fanprojekt. Pokémon und alle zugehörigen Namen sind Marken von Nintendo, Game Freak und The Pokémon Company.

#### Datenschutzerklärung

_Stand: 12.11.2026_

##### Verantwortlicher

Alexander Hain, Linz, Österreich

E-Mail: [al.hain@gmx.at](mailto:al.hain@gmx.at)

##### Hosting (GitHub Pages)

Die App wird über GitHub Pages ausgeliefert (GitHub, Inc., USA). Beim Aufruf der Website verarbeitet GitHub technisch notwendige Daten in Server-Logs, darunter Ihre IP-Adresse und Anfragedaten (z. B. Datum, Uhrzeit, angeforderte Datei, Browser). Auf diese Verarbeitung haben wir keinen Einfluss.

Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Bereitstellung der Website).

Dabei können Daten in die USA übermittelt werden. GitHub ist unter dem EU-US Data Privacy Framework zertifiziert ([Eintrag](https://www.dataprivacyframework.gov/participant/6174)). Details: [Datenschutzerklärung von GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

##### Anonyme Nutzungsstatistik (GoatCounter)

Wir zählen anonym, wie die App genutzt wird, mit [GoatCounter](https://www.goatcounter.com/). Betreiber von GoatCounter ist Martin Tournoij (Irland); die Daten liegen auf Servern von Hetzner Online GmbH in Finnland und Deutschland. GoatCounter setzt keine Cookies und speichert weder IP-Adressen noch den vollständigen User-Agent noch eine Tracker-ID. Die IP-Adresse und der User-Agent werden nur kurzfristig im Arbeitsspeicher verwendet, um wiederkehrende Besuche innerhalb von bis zu 8 Stunden einmal zu zählen, und um das Land zu bestimmen. Gespeichert werden nur aggregierte Zähler (z. B. Browser, Betriebssystem, Land, Sprache, Bildschirmbreite pro Tag). Quellen: [Datenschutz von GoatCounter](https://www.goatcounter.com/help/privacy), [GoatCounter und DSGVO](https://www.goatcounter.com/help/gdpr).

Die Statistik wird nur von Builds gesendet, die mit einem GoatCounter-Endpunkt konfiguriert sind. Pro Ereignis wird eine kleine Anfrage gesendet:

- **page view of `/`**: die App wurde geöffnet (mit grober Bildschirmgröße und der verweisenden Website ohne Query und Fragment)
- `gen/<generation>/<regulation>`: beim Start und beim Wechsel von Generation oder Regelwerk, einmal pro Wert und Sitzung
- `share/native`: der System-Teilen-Dialog wurde erfolgreich genutzt
- `share/copy-text`: Calc-Text wurde kopiert
- `share/copy-link`: ein Teilen-Link wurde kopiert
- `share-open`: ein geteilter Link wurde geöffnet und angewendet
- `share-open-new`: zusätzlich, wenn auf dem Gerät vorher keine App-Daten vorhanden waren (neue Nutzer:innen)
- `install/accepted`: der Installationsdialog des Browsers wurde bestätigt
- `install/ios-howto`: die iOS-Installationsanleitung wurde geöffnet
- `install/standalone`: erster Start als installierte App (einmal pro Gerät)

Nie gesendet werden: Teams, Pokémon, Attacken, Sets, Calc-Eingaben oder -Ergebnisse, der Teilen-Link oder alles nach dem „#“ oder „?“ der Adresse, Namen, Nutzerkennungen oder sonst etwas, das Sie identifiziert.

Lokale Speicherung auf Ihrem Gerät: Die App prüft beim Start, ob auf dem Gerät bereits App-Daten vorhanden waren (um „neue Nutzer:innen über einen geteilten Link“ zu zählen; das Ergebnis wird nur im Arbeitsspeicher gehalten), und speichert ein Merkzeichen, ob das Ereignis „install/standalone“ bereits gesendet wurde. Es werden keine Cookies verwendet.

Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer anonymen Reichweitenmessung, um die App zu verbessern).

Widerspruch: Sie können die Statistik jederzeit im Menü (⋮) unter „Datenschutz“ mit dem Schalter „Anonyme Statistik senden“ ausschalten. Außerdem wird nichts gesendet, wenn Ihr Browser „Do Not Track“ oder „Global Privacy Control“ signalisiert, wenn Sie offline sind (nichts wird für später vorgemerkt) oder in automatisierten Browsern. Die Einstellung wird nur auf dem Gerät gespeichert und ist nicht Teil von Backups.

##### Lokale Daten auf Ihrem Gerät

Teams, Sets, Einstellungen (z. B. Sprache, Generation) und der zuletzt bearbeitete Vergleich werden in IndexedDB bzw. localStorage Ihres Browsers gespeichert und nie an uns oder Dritte übertragen. Sie löschen sie über die Browserdaten bzw. durch Deinstallieren der App.

##### Geteilte Calc-Links

Die Calc-Daten stehen im Link selbst (nach dem „#“). Jede Person, die den Link hat, kann sie sehen; wem Sie den Link geben, entscheiden Sie. Es gibt keine Speicherung auf einem Server.

##### Externe Links

Die App verlinkt auf externe Seiten (z. B. Buy Me a Coffee, GitHub, Smogon, Nimbasa City Post). Nach dem Anklicken gelten dort deren Datenschutzbestimmungen; wir haben darauf keinen Einfluss.

##### Ihre Rechte

Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Schreiben Sie dazu an [al.hain@gmx.at](mailto:al.hain@gmx.at). Da GoatCounter keine personenbezogenen Daten speichert, kann dort kein Datensatz Ihrer Person zugeordnet werden.

Sie haben außerdem das Recht, sich bei der Aufsichtsbehörde zu beschweren: Österreichische Datenschutzbehörde (Datenschutzbehörde), [www.dsb.gv.at](https://www.dsb.gv.at).

The same texts are shown in the app (menu → Legal). German is the primary language of the legal notice.

<!-- legal:end -->

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

## License

[MIT](LICENSE). Code vendored from NCP keeps its own MIT notice (see `vendor/ncp/LICENSE` and
[THIRD_PARTY.md](THIRD_PARTY.md)).
