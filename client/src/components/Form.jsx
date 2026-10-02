import { useId, useState } from 'react';
import { LuPlus, LuTrash2, LuUpload } from 'react-icons/lu';
import { api } from '../services/api.js';

/** Label + control + hint + error, wired up for screen readers. */
export function Field({ label, required, hint, error, children, id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  const control = typeof children === 'function' ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined }) : children;
  return (
    <div className="field">
      {label && <label className="label" htmlFor={id}>{label}{required && <span className="req" aria-hidden>*</span>}</label>}
      {control}
      {hint && !error && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error-text" id={`${id}-err`}>{error}</span>}
    </div>
  );
}

export function TextField({ label, required, hint, error, multiline, ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      {(a11y) => (multiline ? <textarea className="textarea" required={required} {...a11y} {...props} /> : <input className="input" required={required} {...a11y} {...props} />)}
    </Field>
  );
}

export function SelectField({ label, required, hint, error, options = [], placeholder, ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      {(a11y) => (
        <select className="select" required={required} {...a11y} {...props}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

/** Repeatable text inputs — used for requirements, outcomes, tags, specialties. */
export function ListEditor({ value = [], onChange, placeholder = 'Add item', addLabel = 'Add Item' }) {
  const items = value.length ? value : [];
  const update = (i, v) => onChange(items.map((x, idx) => (idx === i ? v : x)));
  return (
    <div className="list-editor">
      {items.map((item, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="list-editor-row" key={i}>
          <input className="input" value={item} onChange={(e) => update(i, e.target.value)} placeholder={placeholder} aria-label={`${placeholder} ${i + 1}`} />
          <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label="Remove item"><LuTrash2 /></button>
        </div>
      ))}
      <div><button type="button" className="btn btn-text btn-sm" onClick={() => onChange([...items, ''])}><LuPlus /> {addLabel}</button></div>
    </div>
  );
}

/** Image/file URL input with optional upload to /api/uploads. */
export function UploadField({ value, onChange, folder = 'images', accept = 'image/*', id, ...a11y }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.upload(file, folder);
      onChange(data.url);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  return (
    <div>
      <div className="list-editor-row">
        <input id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="https://… or upload" {...a11y} />
        <label className="btn btn-outline btn-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? <span className="spinner" aria-hidden /> : <LuUpload />} Upload
          <input type="file" accept={accept} onChange={onFile} hidden disabled={busy} />
        </label>
      </div>
      {value && accept.startsWith('image') && <img src={value} alt="" className="thumb" style={{ marginTop: 8, width: 120, height: 72 }} />}
      {err && <span className="error-text">{err}</span>}
    </div>
  );
}
