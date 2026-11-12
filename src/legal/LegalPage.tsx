import { Fragment, type ReactNode } from 'react'
import { useApp, useT } from '../state/hooks'
import { goBack } from '../state/route'
import { LEGAL, type Block } from './content'
import type { LegalPageId } from './route'
import './legal.css'

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g

/** Renders the markdown subset used by the legal texts (links, bold, code). */
export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const [, label, href, bold, code] = m
    if (label && href) {
      const external = /^https?:/.test(href)
      out.push(
        <a
          key={m.index}
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {label}
        </a>,
      )
    } else if (bold) {
      out.push(
        <strong key={m.index}>
          <Inline text={bold} />
        </strong>,
      )
    } else if (code) {
      out.push(<code key={m.index}>{code}</code>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === 'string') {
    return (
      <p>
        {block.split('\n').map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            <Inline text={line} />
          </Fragment>
        ))}
      </p>
    )
  }
  return (
    <ul>
      {block.list.map((item) => (
        <li key={item}>
          <Inline text={item} />
        </li>
      ))}
    </ul>
  )
}

/** Full-screen legal page (imprint, privacy policy, disclaimer) in the current UI language. */
export default function LegalPage({ page }: { page: LegalPageId }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const doc = LEGAL[lang][page]
  return (
    <article className="legal" aria-labelledby="legal-title" lang={lang}>
      <div className="legal__bar">
        <button type="button" className="btn" onClick={() => goBack('/')}>
          ← {t('legal.back')}
        </button>
      </div>
      <h2 id="legal-title" className="legal__title">
        {doc.title}
      </h2>
      {doc.subtitle && <p className="muted">{doc.subtitle}</p>}
      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`legal-${s.id}`}>
          <h3 id={`legal-${s.id}`}>{s.title}</h3>
          {s.body.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </section>
      ))}
    </article>
  )
}
