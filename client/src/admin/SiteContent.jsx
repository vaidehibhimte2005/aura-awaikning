import { useEffect, useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { FormFields } from '../panel/FormBuilder.jsx';
import { ErrorState, Loader, Alert } from '../components/States.jsx';

/** Repeatable group of small objects, e.g. homepage pillars or stats. */
function ObjectList({ label, value = [], onChange, shape }) {
  const update = (i, k, v) => onChange(value.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  return (
    <div className="form-section">
      <h3>{label}</h3>
      {value.map((item, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="small muted">#{i + 1}</span>
            <button type="button" className="icon-btn" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label={`Remove ${label} ${i + 1}`}><LuTrash2 /></button>
          </div>
          <div className={shape.length > 1 ? 'field-row' : ''}>
            {shape.map((s) => (
              <div className="field" key={s.key}>
                <label className="label" htmlFor={`${label}-${i}-${s.key}`}>{s.label}</label>
                {s.multiline
                  ? <textarea id={`${label}-${i}-${s.key}`} className="textarea" rows={2} value={item[s.key] || ''} onChange={(e) => update(i, s.key, e.target.value)} />
                  : <input id={`${label}-${i}-${s.key}`} className="input" value={item[s.key] || ''} onChange={(e) => update(i, s.key, e.target.value)} />}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-text btn-sm" onClick={() => onChange([...value, {}])}><LuPlus /> Add {label.replace(/s$/, '')}</button>
    </div>
  );
}

const TABS = {
  homepage: {
    label: 'Homepage',
    fields: [
      { name: 'hero.eyebrow', label: 'Hero eyebrow', section: 'Hero', half: true },
      { name: 'hero.title', label: 'Hero headline', section: 'Hero', half: true, hint: 'The last two words appear in gold italics' },
      { name: 'hero.subtitle', label: 'Hero supporting text', type: 'textarea', section: 'Hero' },
      { name: 'hero.primaryCta', label: 'Primary button', section: 'Hero', half: true },
      { name: 'hero.secondaryCta', label: 'Secondary button', section: 'Hero', half: true },
      { name: 'intro.title', label: 'Introduction title', section: 'Introduction' },
      { name: 'intro.body', label: 'Introduction text', type: 'textarea', section: 'Introduction' },
      { name: 'philosophy.title', label: 'Philosophy title', section: 'Philosophy', half: true },
      { name: 'philosophy.subtitle', label: 'Philosophy subtitle', section: 'Philosophy', half: true },
      { name: 'cta.title', label: 'Closing CTA title', section: 'Call to action', half: true },
      { name: 'cta.buttonLabel', label: 'Button label', section: 'Call to action', half: true },
      { name: 'cta.body', label: 'Closing CTA text', type: 'textarea', section: 'Call to action' },
    ],
    lists: [
      { path: ['intro', 'stats'], label: 'Hero stats', shape: [{ key: 'value', label: 'Value' }, { key: 'label', label: 'Label' }] },
      { path: ['philosophy', 'pillars'], label: 'Pillars', shape: [{ key: 'title', label: 'Title' }, { key: 'body', label: 'Text', multiline: true }] },
    ],
  },
  about: {
    label: 'About page',
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'lead', label: 'Lead', type: 'textarea' },
      { name: 'body', label: 'Story', type: 'markdown' },
    ],
    lists: [{ path: ['values'], label: 'Values', shape: [{ key: 'title', label: 'Title' }, { key: 'body', label: 'Text', multiline: true }] }],
  },
  legal: {
    label: 'Legal pages',
    fields: [
      { name: 'privacy', label: 'Privacy policy (leave empty for default)', type: 'markdown' },
      { name: 'terms', label: 'Terms & conditions (leave empty for default)', type: 'markdown' },
      { name: 'refund', label: 'Refund policy (leave empty for default)', type: 'markdown' },
    ],
  },
  general: {
    label: 'General',
    adminOnly: true,
    fields: [
      { name: 'siteName', label: 'Site name', half: true },
      { name: 'tagline', label: 'Tagline', half: true },
      { name: 'email', label: 'Contact email', type: 'email', half: true },
      { name: 'phone', label: 'Phone', half: true },
      { name: 'address', label: 'Address' },
      { name: 'socials.instagram', label: 'Instagram URL', half: true, section: 'Social links' },
      { name: 'socials.youtube', label: 'YouTube URL', half: true, section: 'Social links' },
      { name: 'socials.facebook', label: 'Facebook URL', half: true, section: 'Social links' },
      { name: 'socials.linkedin', label: 'LinkedIn URL', half: true, section: 'Social links' },
    ],
  },
};

const getIn = (o, path) => path.reduce((a, k) => (a ? a[k] : undefined), o);
const setIn = (o, path, v) => {
  if (!path.length) return v;
  const [k, ...rest] = path;
  return { ...o, [k]: setIn(o?.[k] || {}, rest, v) };
};

function SettingEditor({ settingKey }) {
  const toast = useToast();
  const cfg = TABS[settingKey];
  const { data, loading, error, reload } = useFetch(`/settings/${settingKey}`);
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (data) setValue(data.value); }, [data]);

  if (loading && !value) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!value) return null;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.put(`/settings/${settingKey}`, { value });
      toast.success(`${cfg.label} saved — changes are live`);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <form className="panel-card panel-card-body" onSubmit={save} noValidate>
      {err && <div style={{ marginBottom: 16 }}><Alert>{err}</Alert></div>}
      <FormFields fields={cfg.fields} values={value} onChange={setValue} />
      {cfg.lists?.map((l) => (
        <ObjectList key={l.label} label={l.label} shape={l.shape} value={getIn(value, l.path) || []} onChange={(v) => setValue((cur) => setIn(cur, l.path, v))} />
      ))}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="submit" className="btn" disabled={busy}>{busy && <span className="spinner" aria-hidden />} Save {cfg.label}</button>
        <a href={settingKey === 'about' ? '/about' : settingKey === 'legal' ? '/privacy-policy' : '/'} target="_blank" rel="noreferrer" className="btn btn-text btn-sm">Preview site</a>
      </div>
    </form>
  );
}

/** Website Content (CMS) — editable without touching React code. */
export default function SiteContent({ settingsOnly = false, isAdmin = false }) {
  useSeo({ title: settingsOnly ? 'Settings' : 'Website Content', noindex: true });
  const keys = Object.keys(TABS).filter((k) => (settingsOnly ? TABS[k].adminOnly : !TABS[k].adminOnly || false) && (isAdmin || !TABS[k].adminOnly));
  const [tab, setTab] = useState(keys[0]);
  return (
    <div style={{ maxWidth: 920 }}>
      <div className="panel-head">
        <div>
          <h1>{settingsOnly ? 'Settings' : 'Website content'}</h1>
          <p>{settingsOnly ? 'Site-wide contact details and social links.' : 'Edit homepage copy and pages. Changes publish immediately.'}</p>
        </div>
      </div>
      {keys.length > 1 && (
        <div className="player-tabs" role="tablist" style={{ marginTop: 0 }}>
          {keys.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{TABS[k].label}</button>)}
        </div>
      )}
      <SettingEditor key={tab} settingKey={tab} />
      {settingsOnly && (
        <div className="panel-card panel-card-body" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: '1.4rem' }}>Integrations</h2>
          <p className="muted" style={{ margin: 0 }}>Payment providers, email (SMTP), storage and secrets are configured with server environment variables — never in the browser. See <code>server/.env.example</code>.</p>
        </div>
      )}
    </div>
  );
}
