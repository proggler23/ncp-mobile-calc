/**
 * Legal texts: imprint (Impressum / Offenlegung), privacy policy and disclaimer, in German and
 * English. Single source for the in-app pages (`LegalPage`), the README regions and
 * docs/PRIVACY.md (`npm run docs:legal`). Inline text uses a tiny markdown subset: `[text](url)`
 * links and `**bold**`. Contact data comes from `src/config.ts`; the event list from
 * `src/analytics/events.ts`.
 *
 * Keep the privacy text in line with what `src/analytics` really sends.
 */
import { GEN_EVENT_PATTERN, STATIC_EVENTS, type StaticEvent } from '../analytics/events'
import { CONTACT_EMAIL, OWNER_CITY, OWNER_NAME, SUPPORT_URL } from '../config'

export type Lang = 'en' | 'de'

export type Block = string | { list: string[] }

export interface LegalSection {
  id: string
  title: string
  body: Block[]
}

export interface LegalDoc {
  title: string
  /** Shown under the title (privacy: the "as of" date). */
  subtitle?: string
  sections: LegalSection[]
}

/** "Stand" of the privacy policy and the imprint; bump it whenever the texts change. */
export const LEGAL_UPDATED = '2026-11-12'

const GITHUB_PRIVACY =
  'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'
const GITHUB_DPF = 'https://www.dataprivacyframework.gov/participant/6174'
const GC_PRIVACY = 'https://www.goatcounter.com/help/privacy'
const GC_GDPR = 'https://www.goatcounter.com/help/gdpr'
const DSB = 'https://www.dsb.gv.at'

const dateFor = (lang: Lang): string => {
  const [y, m, d] = LEGAL_UPDATED.split('-')
  return lang === 'de' ? `${d}.${m}.${y}` : LEGAL_UPDATED
}

const mail = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`
const owner = `${OWNER_NAME}, ${OWNER_CITY}`

/** What each statistics event means. Typed over the event list, so a new event must be described. */
const EVENT_WHEN: Record<StaticEvent, Record<Lang, string>> = {
  'share/native': {
    en: 'the system share dialog was used successfully',
    de: 'der System-Teilen-Dialog wurde erfolgreich genutzt',
  },
  'share/copy-text': { en: 'calc text was copied', de: 'Calc-Text wurde kopiert' },
  'share/copy-link': { en: 'a share link was copied', de: 'ein Teilen-Link wurde kopiert' },
  'share-open': {
    en: 'a shared link was opened and applied',
    de: 'ein geteilter Link wurde geöffnet und angewendet',
  },
  'share-open-new': {
    en: 'in addition, when the device had no app data before (a new user)',
    de: 'zusätzlich, wenn auf dem Gerät vorher keine App-Daten vorhanden waren (neue Nutzer:innen)',
  },
  'install/accepted': {
    en: 'the browser’s install dialog was accepted',
    de: 'der Installationsdialog des Browsers wurde bestätigt',
  },
  'install/ios-howto': {
    en: 'the iOS install instructions were opened',
    de: 'die iOS-Installationsanleitung wurde geöffnet',
  },
  'install/standalone': {
    en: 'first start as an installed app (once per device)',
    de: 'erster Start als installierte App (einmal pro Gerät)',
  },
}

const GEN_WHEN: Record<Lang, string> = {
  en: 'at start and when the generation or regulation changes, once per value and session',
  de: 'beim Start und beim Wechsel von Generation oder Regelwerk, einmal pro Wert und Sitzung',
}

const eventList = (lang: Lang): string[] => [
  `**page view of \`/\`**: ${
    lang === 'de'
      ? 'die App wurde geöffnet (mit grober Bildschirmgröße und der verweisenden Website ohne Query und Fragment)'
      : 'the app was opened (with a coarse screen size and the referring site, without query or fragment)'
  }`,
  `\`${GEN_EVENT_PATTERN}\`: ${GEN_WHEN[lang]}`,
  ...STATIC_EVENTS.map((e) => `\`${e}\`: ${EVENT_WHEN[e][lang]}`),
]

const DISCLAIMER: Record<Lang, string> = {
  de: 'Alle Berechnungen ohne Gewähr. Die Ergebnisse basieren auf dem NCP Damage Calculator sowie Daten von Pokémon Showdown und Smogon und können Fehler enthalten. Inoffizielles Fanprojekt. Pokémon und alle zugehörigen Namen sind Marken von Nintendo, Game Freak und The Pokémon Company.',
  en: 'All calculations are provided without warranty. The results are based on the NCP Damage Calculator and on data from Pokémon Showdown and Smogon and may contain errors. Unofficial fan project. Pokémon and all related names are trademarks of Nintendo, Game Freak and The Pokémon Company.',
}

const disclaimerSection = (lang: Lang): LegalSection => ({
  id: 'haftung',
  title: lang === 'de' ? 'Haftungsausschluss' : 'Disclaimer',
  body: [DISCLAIMER[lang]],
})

function imprint(lang: Lang): LegalDoc {
  if (lang === 'de') {
    return {
      title: 'Impressum',
      sections: [
        {
          id: 'herausgeber',
          title: 'Medieninhaber und Herausgeber',
          body: [`${owner}`, `Kontakt: ${mail}`],
        },
        {
          id: 'richtung',
          title: 'Grundlegende Richtung (§ 25 MedienG)',
          body: [
            'Inoffizielles, nicht kommerzielles Fanprojekt: ein kostenloser Schadensrechner für Pokémon-VGC-Kämpfe. Es besteht keine Verbindung zu Nintendo, Game Freak, The Pokémon Company oder Nimbasa City Post.',
            `Freiwillige Spenden (z. B. über [Buy Me a Coffee](${SUPPORT_URL})) unterstützen Entwicklung und Hosting. Sie sind vollkommen optional.`,
          ],
        },
        disclaimerSection(lang),
      ],
    }
  }
  return {
    title: 'Imprint / Disclosure',
    sections: [
      {
        id: 'herausgeber',
        title: 'Media owner and publisher (Medieninhaber und Herausgeber)',
        body: [`${owner}`, `Contact: ${mail}`],
      },
      {
        id: 'richtung',
        title: 'Purpose of the site (§ 25 MedienG)',
        body: [
          'An unofficial, non-commercial fan project: a free damage calculator for Pokémon VGC battles. It is not affiliated with Nintendo, Game Freak, The Pokémon Company or Nimbasa City Post.',
          `Optional voluntary donations (e.g. via [Buy Me a Coffee](${SUPPORT_URL})) support development and hosting.`,
        ],
      },
      disclaimerSection(lang),
    ],
  }
}

function privacy(lang: Lang): LegalDoc {
  if (lang === 'de') {
    return {
      title: 'Datenschutzerklärung',
      subtitle: `Stand: ${dateFor(lang)}`,
      sections: [
        {
          id: 'verantwortlicher',
          title: 'Verantwortlicher',
          body: [`${owner}`, `E-Mail: ${mail}`],
        },
        {
          id: 'hosting',
          title: 'Hosting (GitHub Pages)',
          body: [
            'Die App wird über GitHub Pages ausgeliefert (GitHub, Inc., USA). Beim Aufruf der Website verarbeitet GitHub technisch notwendige Daten in Server-Logs, darunter Ihre IP-Adresse und Anfragedaten (z. B. Datum, Uhrzeit, angeforderte Datei, Browser). Auf diese Verarbeitung haben wir keinen Einfluss.',
            'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Bereitstellung der Website).',
            `Dabei können Daten in die USA übermittelt werden. GitHub ist unter dem EU-US Data Privacy Framework zertifiziert ([Eintrag](${GITHUB_DPF})). Details: [Datenschutzerklärung von GitHub](${GITHUB_PRIVACY}).`,
          ],
        },
        {
          id: 'statistik',
          title: 'Anonyme Nutzungsstatistik (GoatCounter)',
          body: [
            `Wir zählen anonym, wie die App genutzt wird, mit [GoatCounter](https://www.goatcounter.com/). Betreiber von GoatCounter ist Martin Tournoij (Irland); die Daten liegen auf Servern von Hetzner Online GmbH in Finnland und Deutschland. GoatCounter setzt keine Cookies und speichert weder IP-Adressen noch den vollständigen User-Agent noch eine Tracker-ID. Die IP-Adresse und der User-Agent werden nur kurzfristig im Arbeitsspeicher verwendet, um wiederkehrende Besuche innerhalb von bis zu 8 Stunden einmal zu zählen, und um das Land zu bestimmen. Gespeichert werden nur aggregierte Zähler (z. B. Browser, Betriebssystem, Land, Sprache, Bildschirmbreite pro Tag). Quellen: [Datenschutz von GoatCounter](${GC_PRIVACY}), [GoatCounter und DSGVO](${GC_GDPR}).`,
            'Die Statistik wird nur von Builds gesendet, die mit einem GoatCounter-Endpunkt konfiguriert sind. Pro Ereignis wird eine kleine Anfrage gesendet:',
            { list: eventList(lang) },
            'Nie gesendet werden: Teams, Pokémon, Attacken, Sets, Calc-Eingaben oder -Ergebnisse, der Teilen-Link oder alles nach dem „#“ oder „?“ der Adresse, Namen, Nutzerkennungen oder sonst etwas, das Sie identifiziert.',
            'Lokale Speicherung auf Ihrem Gerät: Die App prüft beim Start, ob auf dem Gerät bereits App-Daten vorhanden waren (um „neue Nutzer:innen über einen geteilten Link“ zu zählen; das Ergebnis wird nur im Arbeitsspeicher gehalten), und speichert ein Merkzeichen, ob das Ereignis „install/standalone“ bereits gesendet wurde. Es werden keine Cookies verwendet.',
            'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer anonymen Reichweitenmessung, um die App zu verbessern).',
            'Widerspruch: Sie können die Statistik jederzeit im Menü (⋮) unter „Datenschutz“ mit dem Schalter „Anonyme Statistik senden“ ausschalten. Außerdem wird nichts gesendet, wenn Ihr Browser „Do Not Track“ oder „Global Privacy Control“ signalisiert, wenn Sie offline sind (nichts wird für später vorgemerkt) oder in automatisierten Browsern. Die Einstellung wird nur auf dem Gerät gespeichert und ist nicht Teil von Backups.',
          ],
        },
        {
          id: 'lokal',
          title: 'Lokale Daten auf Ihrem Gerät',
          body: [
            'Teams, Sets, Einstellungen (z. B. Sprache, Generation) und der zuletzt bearbeitete Vergleich werden in IndexedDB bzw. localStorage Ihres Browsers gespeichert und nie an uns oder Dritte übertragen. Sie löschen sie über die Browserdaten bzw. durch Deinstallieren der App.',
          ],
        },
        {
          id: 'links',
          title: 'Geteilte Calc-Links',
          body: [
            'Die Calc-Daten stehen im Link selbst (nach dem „#“). Jede Person, die den Link hat, kann sie sehen; wem Sie den Link geben, entscheiden Sie. Es gibt keine Speicherung auf einem Server.',
          ],
        },
        {
          id: 'extern',
          title: 'Externe Links',
          body: [
            'Die App verlinkt auf externe Seiten (z. B. Buy Me a Coffee, GitHub, Smogon, Nimbasa City Post). Nach dem Anklicken gelten dort deren Datenschutzbestimmungen; wir haben darauf keinen Einfluss.',
          ],
        },
        {
          id: 'rechte',
          title: 'Ihre Rechte',
          body: [
            'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Schreiben Sie dazu an ' +
              mail +
              '. Da GoatCounter keine personenbezogenen Daten speichert, kann dort kein Datensatz Ihrer Person zugeordnet werden.',
            `Sie haben außerdem das Recht, sich bei der Aufsichtsbehörde zu beschweren: Österreichische Datenschutzbehörde (Datenschutzbehörde), [${DSB.replace('https://', '')}](${DSB}).`,
          ],
        },
      ],
    }
  }
  return {
    title: 'Privacy policy',
    subtitle: `As of: ${dateFor(lang)}`,
    sections: [
      {
        id: 'verantwortlicher',
        title: 'Controller',
        body: [`${owner}`, `Email: ${mail}`],
      },
      {
        id: 'hosting',
        title: 'Hosting (GitHub Pages)',
        body: [
          'The app is served by GitHub Pages (GitHub, Inc., USA). When you open the site, GitHub processes technically necessary data in server logs, including your IP address and request data (e.g. date, time, requested file, browser). We have no influence on this processing.',
          'The legal basis is Art. 6(1)(f) GDPR (legitimate interest in providing the site).',
          `Data may be processed in the USA. GitHub is certified under the EU-US Data Privacy Framework ([listing](${GITHUB_DPF})). Details: [GitHub’s privacy statement](${GITHUB_PRIVACY}).`,
        ],
      },
      {
        id: 'statistik',
        title: 'Anonymous usage statistics (GoatCounter)',
        body: [
          `We count anonymously how the app is used, with [GoatCounter](https://www.goatcounter.com/). GoatCounter is operated by Martin Tournoij (Ireland); its data is stored on servers of Hetzner Online GmbH in Finland and Germany. GoatCounter sets no cookies and stores neither IP addresses nor the full User-Agent nor a tracker ID. The IP address and User-Agent are only used briefly in memory to count repeat visits once for up to 8 hours, and to derive the country. Only aggregate counts are stored (e.g. browser, operating system, country, language, screen width per day). Sources: [GoatCounter privacy policy](${GC_PRIVACY}), [GoatCounter and GDPR](${GC_GDPR}).`,
          'Statistics are only sent by builds that were configured with a GoatCounter endpoint. One small request is sent per event:',
          { list: eventList(lang) },
          'Never sent: teams, Pokémon, moves, sets, calc inputs or results, the share link or anything after the “#” or “?” of the address, names, user IDs or anything that identifies you.',
          'Storage on your device: at start the app checks whether app data already existed on the device (to count “new user via shared link”; the result is only kept in memory) and stores a flag whether the “install/standalone” event was already sent. No cookies are used.',
          'The legal basis is Art. 6(1)(f) GDPR (legitimate interest in anonymous audience measurement to improve the app).',
          'Objection: you can switch statistics off at any time in the menu (⋮) under “Privacy” with the switch “Send anonymous statistics”. Nothing is sent either when your browser signals Do Not Track or Global Privacy Control, when you are offline (nothing is queued for later) or in automated browsers. The choice is stored on the device only and is not part of backups.',
        ],
      },
      {
        id: 'lokal',
        title: 'Local data on your device',
        body: [
          'Teams, sets, settings (e.g. language, generation) and the last matchup are stored in your browser’s IndexedDB / localStorage and are never transmitted to us or to third parties. Delete them with your browser data or by uninstalling the app.',
        ],
      },
      {
        id: 'links',
        title: 'Shared calc links',
        body: [
          'The calc data is contained in the link itself (after the “#”). Anyone who has the link can see it; you decide whom you give it to. Nothing is stored on a server.',
        ],
      },
      {
        id: 'extern',
        title: 'External links',
        body: [
          'The app links to external sites (e.g. Buy Me a Coffee, GitHub, Smogon, Nimbasa City Post). Their privacy rules apply once you follow a link; we have no influence on them.',
        ],
      },
      {
        id: 'rechte',
        title: 'Your rights',
        body: [
          'You have the right of access, rectification, erasure, restriction of processing, data portability and objection. Write to ' +
            mail +
            '. As GoatCounter stores no personal data, no record can be attributed to you there.',
          `You also have the right to lodge a complaint with the supervisory authority: the Austrian Data Protection Authority (Datenschutzbehörde), [${DSB.replace('https://', '')}](${DSB}).`,
        ],
      },
    ],
  }
}

export interface LegalTexts {
  imprint: LegalDoc
  privacy: LegalDoc
  disclaimer: LegalDoc
}

export const LEGAL: Record<Lang, LegalTexts> = {
  de: {
    imprint: imprint('de'),
    privacy: privacy('de'),
    disclaimer: { title: 'Haftungsausschluss', sections: [disclaimerSection('de')] },
  },
  en: {
    imprint: imprint('en'),
    privacy: privacy('en'),
    disclaimer: { title: 'Disclaimer', sections: [disclaimerSection('en')] },
  },
}

/** Short disclaimer for the menu's "About" section. */
export const disclaimerText = (lang: Lang): string => DISCLAIMER[lang]

// ---------------------------------------------------------------------------------------------
// Markdown (README, docs/PRIVACY.md)
// ---------------------------------------------------------------------------------------------

function blockMd(b: Block): string {
  return typeof b === 'string' ? b : b.list.map((x) => `- ${x}`).join('\n')
}

/** `level` = heading level of the document title; sections are one level below. */
export function docToMarkdown(doc: LegalDoc, level: number): string {
  const h = (n: number, text: string) => `${'#'.repeat(n)} ${text}`
  const out = [h(level, doc.title)]
  if (doc.subtitle) out.push(`_${doc.subtitle}_`)
  for (const s of doc.sections) {
    out.push(h(level + 1, s.title), ...s.body.map(blockMd))
  }
  return out.join('\n\n')
}

/** README region: the imprint and the privacy policy (English, then the German originals). */
export function readmeLegalMarkdown(): string {
  const note =
    'The same texts are shown in the app (menu → Legal). German is the primary language of the legal notice.'
  return [
    docToMarkdown(LEGAL.en.privacy, 2),
    docToMarkdown(LEGAL.en.imprint, 2),
    `### Deutsche Fassung\n\n${docToMarkdown(LEGAL.de.imprint, 4)}\n\n${docToMarkdown(LEGAL.de.privacy, 4)}`,
    note,
  ].join('\n\n')
}

export function privacyDocMarkdown(): string {
  return [
    '<!-- Generated by `npm run docs:legal` from src/legal/content.ts. Do not edit. -->',
    docToMarkdown(LEGAL.de.privacy, 1),
    docToMarkdown(LEGAL.en.privacy, 1),
  ].join('\n\n')
}
