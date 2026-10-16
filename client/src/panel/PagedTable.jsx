import { useEffect, useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import { useDebounce, useFetch } from '../hooks/useFetch.js';
import { EmptyState, ErrorState, Loader } from '../components/States.jsx';
import { Pagination } from '../components/Pagination.jsx';

/**
 * Read-only, server-paginated table with optional search + select filters.
 *   columns:   [{ key, label, render?(row) }]
 *   rowActions(row, { reload }) → JSX shown in the last column
 *   toolbar(ctx)  → extra JSX in the toolbar (ctx: { reload, data, meta })
 *   selectable    → adds checkboxes; onSelectionChange(ids[])
 */
export function PagedTable({
  endpoint,
  params = {},
  columns,
  filters = [],
  searchable = false,
  searchPlaceholder = 'Search…',
  rowActions,
  toolbar,
  empty = 'Nothing to show yet.',
  emptyTitle = 'No records',
  pageSize = 15,
  idKey = '_id',
  selectable = false,
  isSelectable = () => true,
  selected = [],
  onSelectedChange,
  refreshKey,
  onLoaded,
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const search = useDebounce(q);
  const { data, meta, loading, error, reload } = useFetch(endpoint, {
    ...params,
    ...filterValues,
    q: search || undefined,
    page,
    limit: pageSize,
    _r: refreshKey,
  });
  useEffect(() => { if (onLoaded && meta && data) onLoaded({ data, meta }); }, [data, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectableRows = (data || []).filter(isSelectable);
  const allOn = selectableRows.length > 0 && selectableRows.every((r) => selected.includes(r[idKey]));
  const toggle = (id) => onSelectedChange?.(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div>
      {(searchable || filters.length > 0 || toolbar) && (
        <div className="rm-toolbar">
          {searchable && (
            <div className="search-box">
              <LuSearch aria-hidden />
              <label className="sr-only" htmlFor={`pt-search-${endpoint}`}>Search</label>
              <input id={`pt-search-${endpoint}`} className="input" type="search" placeholder={searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
          )}
          {filters.map((f) => (
            <label key={f.name}>
              <span className="sr-only">{f.label}</span>
              <select className="select" value={filterValues[f.name] || ''} onChange={(e) => { setFilterValues((v) => ({ ...v, [f.name]: e.target.value || undefined })); setPage(1); onSelectedChange?.([]); }}>
                <option value="">{f.label}: All</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
          {toolbar?.({ reload, data, meta })}
          {meta && <span className="muted small" style={{ marginLeft: 'auto' }}>{meta.total} total</span>}
        </div>
      )}
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loader />
      ) : !data?.length ? (
        <EmptyState title={emptyTitle} message={q ? 'No results match your search.' : empty} />
      ) : (
        <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <table className="table table-responsive">
            <thead>
              <tr>
                {selectable && (
                  <th scope="col" style={{ width: 36 }}>
                    <input type="checkbox" aria-label="Select all rows" checked={allOn} onChange={() => onSelectedChange?.(allOn ? [] : selectableRows.map((r) => r[idKey]))} />
                  </th>
                )}
                {columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
                {rowActions && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row[idKey]}>
                  {selectable && (
                    <td data-label="Select">
                      <input type="checkbox" aria-label="Select row" disabled={!isSelectable(row)} checked={selected.includes(row[idKey])} onChange={() => toggle(row[idKey])} />
                    </td>
                  )}
                  {columns.map((c) => <td key={c.key} data-label={c.label}>{c.render ? c.render(row) : String(row[c.key] ?? '—')}</td>)}
                  {rowActions && <td className="actions">{rowActions(row, { reload })}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
    </div>
  );
}
