/**
 * Minimal, safe markdown renderer (headings, paragraphs, lists, quotes, bold,
 * italic, links). Builds React elements — never uses dangerouslySetInnerHTML,
 * so content from the CMS cannot inject scripts.
 */
import { Fragment } from 'react';

const SAFE_URL = /^(https?:\/\/|\/|mailto:)/i;

function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('*')) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else {
      const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      out.push(
        SAFE_URL.test(href) ? (
          <a key={k} href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source = '', className = 'prose' }) {
  const blocks = String(source).replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const b = block.trim();
        if (!b) return null;
        if (b.startsWith('### ')) return <h3 key={bi}>{inline(b.slice(4), bi)}</h3>;
        if (b.startsWith('## ')) return <h2 key={bi}>{inline(b.slice(3), bi)}</h2>;
        if (b.startsWith('# ')) return <h2 key={bi}>{inline(b.slice(2), bi)}</h2>;
        if (b.startsWith('> ')) return <blockquote key={bi}>{inline(b.replace(/^>\s?/gm, ''), bi)}</blockquote>;
        const lines = b.split('\n');
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^[-*]\s+/, ''), `${bi}-${li}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\.\s+/.test(l))) {
          return <ol key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\d+\.\s+/, ''), `${bi}-${li}`)}</li>)}</ol>;
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
