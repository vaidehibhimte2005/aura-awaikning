import { useState } from 'react';
import { LuPencil, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu';
import { useDebounce, useFetch } from '../hooks/useFetch.js';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { EmptyState, ErrorState, Loader, Alert } from '../components/States.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { FormFields, cleanPayload, initialValues, clearOptionCache } from './FormBuilder.jsx';

/**
 * Generic, config-driven CRUD screen used across Admin, Manager and Trainer
 * panels (courses, lessons, sessions, articles, FAQs, testimonials, …).
 * One component → consistent loading/empty/error states, validation feedback,
 * pagination and confirmation dialogs everywhere.
 */
export function ResourceManager({
  title,
  description,
  endpoint,
  params = {},
  columns,
  fields = [],
  entity = 'item',
  createLabel,
  filters = [],
  searchable = true,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  toPayload = (v) => v,
  fixedValues = {},
  rowActions,
  headerActions,
  deleteMessage,
  pageSize = 15,
  modalSize = 'lg',
  emptyMessage,
  onSaved,
}) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const search = useDebounce(q);
  const { data, meta, loading, error, reload } = useFetch(endpoint, { ...params, ...filterValues, q: search || undefined, page, limit: pageSize });

  const [editing, setEditing] = useState(null); // null | 'new' | item
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // `fields` may be a function of the item being edited ('new' when creating).
  const fieldsFor = (target) => (typeof fields === 'function' ? fields(target) : fields);
  const activeFields = editing ? fieldsFor(editing) : [];
  const hasForm = fieldsFor('new').length > 0 || fieldsFor({}).length > 0;

  const open = (item) => {
    setEditing(item || 'new');
    setValues(initialValues(fieldsFor(item || 'new'), item));
    setErrors({});
    setFormError('');
  };
  const close = () => setEditing(null);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError('');
    try {
      const body = { ...toPayload(cleanPayload(activeFields, values), editing), ...fixedValues };
      const isNew = editing === 'new';
      const res = isNew ? await api.post(endpoint, body) : await api.patch(`${endpoint}/${editing._id}`, body);
      toast.success(isNew ? `${entity[0].toUpperCase()}${entity.slice(1)} created` : 'Changes saved');
      clearOptionCache();
      close();
      reload();
      onSaved?.(res.data);
    } catch (ex) {
      setErrors(ex.fieldErrors || {});
      setFormError(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const { data: res } = await api.delete(`${endpoint}/${toDelete._id}`);
      toast.success(res?.archived ? `Archived (it has learners, so it was kept for their records)` : `${entity[0].toUpperCase()}${entity.slice(1)} deleted`);
      setToDelete(null);
      clearOptionCache();
      reload();
    } catch (ex) {
      toast.error(ex.message);
    } finally {
      setDeleting(false);
    }
  };

  const allowEdit = (item) => (typeof canEdit === 'function' ? canEdit(item) : canEdit);
  const allowDelete = (item) => (typeof canDelete === 'function' ? canDelete(item) : canDelete);
  const label = createLabel || `Create ${entity[0].toUpperCase()}${entity.slice(1)}`;

  return (
    <div>
      {title && (
        <div className="panel-head">
          <div>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          <div className="row">
            {headerActions}
            {canCreate && hasForm && <button type="button" className="btn" onClick={() => open(null)}><LuPlus /> {label}</button>}
          </div>
        </div>
      )}

      {(searchable || filters.length > 0) && (
        <div className="rm-toolbar">
          {searchable && (
            <div className="search-box">
              <LuSearch aria-hidden />
              <label className="sr-only" htmlFor={`rm-search-${entity}`}>Search</label>
              <input id={`rm-search-${entity}`} className="input" type="search" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
          )}
          {filters.map((f) => (
            <label key={f.name}>
              <span className="sr-only">{f.label}</span>
              <select className="select" value={filterValues[f.name] || ''} onChange={(e) => { setFilterValues((v) => ({ ...v, [f.name]: e.target.value || undefined })); setPage(1); }}>
                <option value="">{f.label}: All</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
          {meta && <span className="muted small" style={{ marginLeft: 'auto' }}>{meta.total} total</span>}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loader />
      ) : !data?.length ? (
        <EmptyState
          title={`No ${entity}s yet`}
          message={emptyMessage || (q ? 'No results match your search.' : undefined)}
          action={canCreate && hasForm && !q ? <button type="button" className="btn btn-sm" onClick={() => open(null)}><LuPlus /> {label}</button> : null}
        />
      ) : (
        <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <table className="table table-responsive">
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item._id}>
                  {columns.map((c) => <td key={c.key} data-label={c.label}>{c.render ? c.render(item) : String(item[c.key] ?? '—')}</td>)}
                  <td className="actions">
                    {rowActions?.(item, { reload, edit: () => open(item) })}
                    {allowEdit(item) && hasForm && <button type="button" className="icon-btn" onClick={() => open(item)} aria-label={`Edit ${entity}`} title="Edit"><LuPencil /></button>}
                    {allowDelete(item) && <button type="button" className="icon-btn" onClick={() => setToDelete(item)} aria-label={`Delete ${entity}`} title="Delete"><LuTrash2 /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}

      <Modal
        open={!!editing}
        onClose={close}
        size={modalSize}
        title={editing === 'new' ? label : `Edit ${entity}`}
        footer={
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={close}>Cancel</button>
            <button type="submit" form="rm-form" className="btn btn-sm" disabled={saving} aria-busy={saving}>
              {saving && <span className="spinner" aria-hidden />} {editing === 'new' ? label : 'Save Changes'}
            </button>
          </>
        }
      >
        <form id="rm-form" onSubmit={save} noValidate>
          {formError && <div style={{ marginBottom: 18 }}><Alert>{formError}</Alert></div>}
          <FormFields fields={activeFields} values={values} onChange={setValues} errors={errors} />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={deleting}
        title={`Delete ${entity}?`}
        message={deleteMessage || 'This cannot be undone.'}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
