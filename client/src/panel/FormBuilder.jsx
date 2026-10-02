import { useEffect, useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { Field, ListEditor, UploadField } from '../components/Form.jsx';
import { api } from '../services/api.js';
import { getYouTubeId, youtubeThumb } from '../utils/youtube.js';
import { toLocalInput } from '../utils/format.js';

// ─── path helpers for nested fields like "seo.metaTitle" ───
export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const copy = { ...obj };
  let cur = copy;
  keys.slice(0, -1).forEach((k) => {
    cur[k] = { ...(cur[k] || {}) };
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = value;
  return copy;
}

/** Loads <select> options from an API endpoint, cached per endpoint for the session. */
const optionCache = new Map();
function useRemoteOptions(source) {
  const key = source ? `${source.endpoint}?${JSON.stringify(source.params || {})}` : null;
  const [options, setOptions] = useState(() => (key && optionCache.get(key)) || []);
  useEffect(() => {
    if (!key) return;
    if (optionCache.has(key)) { setOptions(optionCache.get(key)); return; }
    api.get(source.endpoint, { limit: 100, ...(source.params || {}) }).then(({ data }) => {
      const opts = data.map((d) => ({ value: d[source.valueKey || '_id'], label: typeof source.label === 'function' ? source.label(d) : d[source.labelKey || 'name'] }));
      optionCache.set(key, opts);
      setOptions(opts);
    }).catch(() => setOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return options;
}
export const clearOptionCache = () => optionCache.clear();

function ResourcesEditor({ value = [], onChange }) {
  const update = (i, k, v) => onChange(value.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  return (
    <div className="list-editor">
      {value.map((r, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="resource-editor-row" key={i}>
          <input className="input" placeholder="Title" value={r.title || ''} onChange={(e) => update(i, 'title', e.target.value)} aria-label="Resource title" />
          <input className="input" placeholder="https://…" value={r.url || ''} onChange={(e) => update(i, 'url', e.target.value)} aria-label="Resource URL" />
          <select className="select" value={r.kind || 'link'} onChange={(e) => update(i, 'kind', e.target.value)} aria-label="Resource type">
            {['link', 'pdf', 'audio', 'image', 'document'].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button type="button" className="icon-btn" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label="Remove resource"><LuTrash2 /></button>
        </div>
      ))}
      <div><button type="button" className="btn btn-text btn-sm" onClick={() => onChange([...value, { title: '', url: '', kind: 'link' }])}><LuPlus /> Add Resource</button></div>
    </div>
  );
}

function Control({ field, value, onChange, a11y }) {
  const remote = useRemoteOptions(field.optionsFrom);
  const options = field.options || remote;
  switch (field.type) {
    case 'textarea':
    case 'markdown':
      return <textarea className="textarea" rows={field.type === 'markdown' ? 10 : 4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} {...a11y} />;
    case 'number':
      return <input className="input" type="number" min={field.min} step={field.step || 'any'} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...a11y} />;
    case 'select':
      return (
        <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...a11y}>
          {field.placeholder !== false && <option value="">{field.placeholder || 'Select…'}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'multiselect':
      return (
        <div className="multi-select" role="group" {...a11y}>
          {options.length === 0 && <span className="hint">No options available yet.</span>}
          {options.map((o) => {
            const list = value || [];
            const checked = list.includes(o.value);
            return (
              <label key={o.value}>
                <input type="checkbox" checked={checked} onChange={() => onChange(checked ? list.filter((v) => v !== o.value) : [...list, o.value])} />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      );
    case 'checkbox':
      return (
        <label className="checkbox">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} {...a11y} />
          <span>{field.checkboxLabel || field.label}</span>
        </label>
      );
    case 'datetime':
      return <input className="input" type="datetime-local" value={toLocalInput(value)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')} {...a11y} />;
    case 'date':
      return <input className="input" type="date" value={value ? String(value).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} {...a11y} />;
    case 'list':
      return <ListEditor value={value || []} onChange={onChange} placeholder={field.placeholder || field.label} addLabel={field.addLabel || 'Add Item'} />;
    case 'image':
      return <UploadField value={value} onChange={onChange} folder={field.folder || 'images'} {...a11y} />;
    case 'resources':
      return <ResourcesEditor value={value || []} onChange={onChange} />;
    case 'youtube': {
      const id = getYouTubeId(value);
      return (
        <div>
          <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="https://www.youtube.com/watch?v=… or video ID" {...a11y} />
          {value && (id ? (
            <div className="row" style={{ marginTop: 8 }}>
              <img src={youtubeThumb(id, 'mqdefault')} alt="" className="thumb" style={{ width: 120, height: 68 }} />
              <span className="hint">Video ID: <code>{id}</code></span>
            </div>
          ) : <span className="error-text">That doesn't look like a YouTube link.</span>)}
        </div>
      );
    }
    default:
      return <input className="input" type={field.type || 'text'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} autoComplete={field.autoComplete || 'off'} {...a11y} />;
  }
}

/**
 * Renders a list of field definitions. Fields with the same `section`
 * are grouped; `half: true` places two fields side by side.
 */
export function FormFields({ fields, values, onChange, errors = {} }) {
  const visible = fields.filter((f) => !f.showIf || f.showIf(values));
  const sections = [];
  visible.forEach((f) => {
    const name = f.section || '';
    let s = sections.find((x) => x.name === name);
    if (!s) { s = { name, fields: [] }; sections.push(s); }
    s.fields.push(f);
  });

  const renderField = (f) => (
    <Field key={f.name} label={f.type === 'checkbox' ? undefined : f.label} required={f.required} hint={f.hint} error={errors[f.name]}>
      {(a11y) => <Control field={f} value={getPath(values, f.name)} onChange={(v) => onChange(setPath(values, f.name, v))} a11y={a11y} />}
    </Field>
  );

  return sections.map((s) => {
    const rows = [];
    for (let i = 0; i < s.fields.length; i += 1) {
      const f = s.fields[i];
      const nx = s.fields[i + 1];
      if (f.half && nx?.half) {
        rows.push(<div className="field-row" key={f.name} style={{ marginTop: rows.length ? 18 : 0 }}>{renderField(f)}{renderField(nx)}</div>);
        i += 1;
      } else rows.push(<div key={f.name} style={{ marginTop: rows.length ? 18 : 0 }}>{renderField(f)}</div>);
    }
    return (
      <div className="form-section" key={s.name || 'main'}>
        {s.name && <h3>{s.name}</h3>}
        {rows}
      </div>
    );
  });
}

/** Builds initial form values from field defaults + an existing item. */
export function initialValues(fields, item) {
  let v = {};
  fields.forEach((f) => {
    const existing = item ? getPath(item, f.name) : undefined;
    let val = existing !== undefined ? existing : f.default !== undefined ? f.default : f.type === 'checkbox' ? false : f.type === 'list' || f.type === 'multiselect' || f.type === 'resources' ? [] : '';
    // Relations come back populated ({_id, name}); forms work with ids.
    if (f.type === 'select' && val && typeof val === 'object') val = val._id;
    if (f.type === 'multiselect' && Array.isArray(val)) val = val.map((x) => (typeof x === 'object' ? x._id : x));
    v = setPath(v, f.name, val);
  });
  return v;
}

/** Strips empty list rows before sending. */
export function cleanPayload(fields, values) {
  let out = { ...values };
  fields.forEach((f) => {
    const val = getPath(values, f.name);
    if (f.type === 'list') out = setPath(out, f.name, (val || []).map((s) => String(s).trim()).filter(Boolean));
    if (f.type === 'resources') out = setPath(out, f.name, (val || []).filter((r) => r.title && r.url));
    if (f.type === 'password' && !val) {
      const copy = { ...out };
      delete copy[f.name];
      out = copy;
    }
    if (f.readOnly) {
      const copy = { ...out };
      delete copy[f.name];
      out = copy;
    }
  });
  return out;
}
