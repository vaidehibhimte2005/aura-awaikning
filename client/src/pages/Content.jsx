import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowRight, LuMail, LuMapPin, LuPhone, LuPlus, LuSend } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useSite } from '../context/SiteContext.jsx';
import { api } from '../services/api.js';
import { PageHero, SectionHeading } from '../components/SectionHeading.jsx';
import { CoverArt, AuraRings } from '../components/Brand.jsx';
import { AsyncBlock, EmptyState, ErrorState, Loader, Alert } from '../components/States.jsx';
import { TextField } from '../components/Form.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { Markdown } from '../utils/markdown.jsx';
import { formatDate } from '../utils/format.js';
import { LEGAL } from './legalDefaults.js';

// ─── About ────────────────────────────────────────────────
export function About() {
  const { settings } = useSite();
  const a = settings.about || {};
  const p = settings.homepage?.philosophy || {};
  useSeo({ title: 'About', description: a.lead });
  return (
    <>
      <PageHero eyebrow="Our story" title={a.title || 'About Aura Awakening'} lead={a.lead} />
      <section className="section section-white">
        <div className="container split" style={{ alignItems: 'start' }}>
          <Markdown source={a.body} />
          <figure className="quote-panel" style={{ margin: 0 }}>
            <p>“We offer a path, good company, and practices that work when you return to them.”</p>
            <cite>Aura Awakening</cite>
            <AuraRings className="ornament" rings={4} />
          </figure>
        </div>
      </section>
      {!!a.values?.length && (
        <section className="section">
          <div className="container">
            <SectionHeading center eyebrow="What we value" title="Held with care" />
            <div className="grid grid-3">
              {a.values.map((v) => (
                <div key={v.title} className="card card-pad">
                  <h3>{v.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {!!p.pillars?.length && (
        <section className="section section-dark">
          <div className="container">
            <SectionHeading eyebrow="Approach" title={p.title} lead={p.subtitle} />
            <div className="grid grid-4">
              {p.pillars.map((x, i) => (
                <div className="pillar" key={x.title}><span className="pillar-num">0{i + 1}</span><h3>{x.title}</h3><p>{x.body}</p></div>
              ))}
            </div>
            <div style={{ marginTop: 48 }}><Link to="/courses" className="btn btn-gold">Explore Programs</Link></div>
          </div>
        </section>
      )}
    </>
  );
}

// ─── Articles ─────────────────────────────────────────────
export function Articles() {
  useSeo({ title: 'Journal', description: 'Reflections, practices and guidance on awareness, mindfulness and growth.' });
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useFetch('/articles', { page, limit: 9 });
  return (
    <>
      <PageHero eyebrow="Journal & resources" title="Notes for the inner journey" lead="Short reads and practices from our guides." />
      <section className="section-sm">
        <div className="container">
          <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState title="No articles yet" message="Our guides are writing — check back soon." />}>
            <div className="grid grid-3">
              {data?.map((a) => (
                <article key={a._id} className="card article-card">
                  <div className="cover">{a.coverImage ? <img src={a.coverImage} alt="" loading="lazy" /> : <CoverArt seed={a.slug} label={a.category} />}</div>
                  <div className="article-card-body">
                    <div className="course-meta"><span>{a.category}</span><span className="dot" aria-hidden /><span>{a.readMinutes} min read</span></div>
                    <h3><Link to={`/articles/${a.slug}`}>{a.title}</Link></h3>
                    <p>{a.excerpt}</p>
                    <div className="meta">{a.authorName} · {formatDate(a.publishedAt)}</div>
                  </div>
                </article>
              ))}
            </div>
          </AsyncBlock>
          {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
        </div>
      </section>
    </>
  );
}

export function ArticleDetail() {
  const { slug } = useParams();
  const { data: a, loading, error, reload } = useFetch(`/articles/${slug}`);
  useSeo({ title: a?.seo?.metaTitle || a?.title, description: a?.seo?.metaDescription || a?.excerpt, image: a?.coverImage, type: 'article' });
  if (loading && !a) return <Loader page />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  return (
    <article>
      <PageHero
        eyebrow={a.category}
        title={a.title}
        lead={a.excerpt}
        crumbs={<nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/articles">Journal</Link><span aria-hidden>/</span><span>{a.category}</span></nav>}
      >
        <p className="small" style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>{a.authorName} · {formatDate(a.publishedAt)} · {a.readMinutes} min read</p>
      </PageHero>
      <section className="section-sm section-white">
        <div className="container container-narrow">
          {a.coverImage && <img src={a.coverImage} alt="" style={{ width: '100%', borderRadius: 6, marginBottom: 32 }} />}
          <Markdown source={a.body} />
          <div className="divider-ornament" style={{ margin: '48px auto' }} aria-hidden>✦</div>
          <div className="center"><Link to="/courses" className="link-arrow">Continue with a guided program <LuArrowRight size={14} /></Link></div>
        </div>
      </section>
    </article>
  );
}

// ─── FAQ ──────────────────────────────────────────────────
export function Faq() {
  useSeo({ title: 'FAQ', description: 'Answers to common questions about programs, live sessions, payments and certificates.' });
  const { data, loading, error, reload } = useFetch('/faqs', { limit: 100 });
  const groups = (data || []).reduce((acc, f) => ({ ...acc, [f.category]: [...(acc[f.category] || []), f] }), {});
  return (
    <>
      <PageHero eyebrow="Help" title="Frequently asked questions" lead="Can't find what you need? We're happy to help." />
      <section className="section-sm section-white">
        <div className="container container-narrow">
          <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length}>
            {Object.entries(groups).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 40 }}>
                <div className="eyebrow">{cat}</div>
                {items.map((f) => (
                  <details key={f._id} className="faq-item">
                    <summary>{f.question}<LuPlus aria-hidden /></summary>
                    <div className="answer"><Markdown source={f.answer} className="" /></div>
                  </details>
                ))}
              </div>
            ))}
          </AsyncBlock>
          <div className="card card-pad center" style={{ marginTop: 24 }}>
            <h3>Still have a question?</h3>
            <Link to="/contact" className="btn btn-outline">Contact Us</Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ─── Contact ──────────────────────────────────────────────
const EMPTY = { name: '', email: '', phone: '', subject: '', message: '', website: '' };

export function Contact() {
  useSeo({ title: 'Contact', description: 'Get in touch with the Aura Awakening team.' });
  const { settings } = useSite();
  const g = settings.general || {};
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Please enter your name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Please enter a valid email';
    if (form.message.trim().length < 10) errs.message = 'Please write at least a sentence';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setStatus({ state: 'sending' });
    try {
      await api.post('/contact', form);
      setForm(EMPTY);
      setStatus({ state: 'sent', message: 'Thank you — your message has been received. We usually reply within one working day.' });
    } catch (ex) {
      setErrors(ex.fieldErrors || {});
      setStatus({ state: 'error', message: ex.message });
    }
  };

  return (
    <>
      <PageHero eyebrow="Contact" title="We'd love to hear from you" lead="Questions about a program, a live session or working together — write to us." />
      <section className="section-sm section-white">
        <div className="container contact-grid">
          <div>
            <h2>Reach us</h2>
            {g.email && <div className="contact-line"><LuMail aria-hidden /><div><strong>Email</strong><a href={`mailto:${g.email}`}>{g.email}</a></div></div>}
            {g.phone && <div className="contact-line"><LuPhone aria-hidden /><div><strong>Phone</strong><a href={`tel:${g.phone.replace(/\s/g, '')}`}>{g.phone}</a></div></div>}
            {g.address && <div className="contact-line"><LuMapPin aria-hidden /><div><strong>Studio</strong>{g.address}</div></div>}
          </div>
          <form className="card card-pad" onSubmit={submit} noValidate>
            {status.state === 'sent' && <Alert type="success">{status.message}</Alert>}
            {status.state === 'error' && <Alert>{status.message}</Alert>}
            <div className="field-row" style={{ marginTop: status.state === 'idle' || status.state === 'sending' ? 0 : 18 }}>
              <TextField label="Your name" required value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" />
              <TextField label="Email" type="email" required value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" />
            </div>
            <div className="field-row" style={{ marginTop: 18 }}>
              <TextField label="Phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
              <TextField label="Subject" value={form.subject} onChange={set('subject')} />
            </div>
            <div style={{ marginTop: 18 }}><TextField label="Message" multiline required rows={6} value={form.message} onChange={set('message')} error={errors.message} /></div>
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
              <label>Website <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
            </div>
            <button type="submit" className="btn" style={{ marginTop: 22 }} disabled={status.state === 'sending'} aria-busy={status.state === 'sending'}>
              {status.state === 'sending' ? <span className="spinner" aria-hidden /> : <LuSend />} Send Message
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

// ─── Legal ────────────────────────────────────────────────
export function Legal({ kind }) {
  const { settings } = useSite();
  const meta = LEGAL[kind];
  useSeo({ title: meta.title, description: meta.description });
  const body = settings.legal?.[kind] || meta.body;
  return (
    <>
      <PageHero eyebrow="Legal" title={meta.title} lead={`Last updated ${meta.updated}`} />
      <section className="section-sm section-white">
        <div className="container container-narrow"><Markdown source={body} /></div>
      </section>
    </>
  );
}

// ─── 404 ──────────────────────────────────────────────────
export function NotFound() {
  useSeo({ title: 'Page not found', noindex: true });
  return (
    <section className="section">
      <div className="container container-narrow center">
        <div className="eyebrow" style={{ justifyContent: 'center' }}>404</div>
        <h1>This path leads nowhere — for now.</h1>
        <p className="lead" style={{ margin: '0 auto 32px' }}>The page you're looking for has moved or doesn't exist.</p>
        <Link to="/" className="btn">Return Home</Link>
      </div>
    </section>
  );
}
