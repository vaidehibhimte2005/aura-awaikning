export function SectionHeading({ eyebrow, title, lead, center = false, as: Tag = 'h2', children }) {
  return (
    <div className={`section-heading${center ? ' center' : ''}`}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <Tag>{title}</Tag>
      {lead && <p className="lead">{lead}</p>}
      {children}
    </div>
  );
}

export function PageHero({ eyebrow, title, lead, crumbs, children }) {
  return (
    <section className="page-hero">
      <div className="container">
        {crumbs}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}
