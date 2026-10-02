import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuSearch, LuSlidersHorizontal } from 'react-icons/lu';
import { useDebounce, useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { PageHero } from '../components/SectionHeading.jsx';
import { CourseGrid } from '../components/CourseCard.jsx';
import { ErrorState } from '../components/States.jsx';
import { Pagination } from '../components/Pagination.jsx';

const LEVELS = [
  { value: '', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
const PRICES = [
  { value: '', label: 'Free & paid' },
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
];
const SORTS = [
  { value: 'featured', label: 'Recommended' },
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most popular' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

function FilterGroup({ title, options, value, onChange }) {
  return (
    <div className="filter-group">
      <h4>{title}</h4>
      <div className="filter-options">
        {options.map((o) => (
          <button key={o.value} type="button" className="filter-option" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Courses() {
  useSeo({ title: 'Programs', description: 'Browse guided meditation, mindfulness, energy and personal-growth programs.' });
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const q = useDebounce(search);

  const get = (k) => params.get(k) || '';
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (q !== get('q')) set('q', q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const categories = useFetch('/categories', { limit: 50 });
  const query = {
    q: get('q'),
    category: get('category'),
    level: get('level'),
    price: get('price'),
    sort: get('sort') || 'featured',
    page: get('page') || 1,
    limit: 9,
  };
  const { data, meta, loading, error, reload } = useFetch('/courses', query);
  const catOptions = [{ value: '', label: 'All categories' }, ...(categories.data || []).map((c) => ({ value: c.slug, label: c.name }))];

  return (
    <>
      <PageHero eyebrow="Programs" title="Learning paths for the inner journey" lead="Self-paced programs with guided video lessons, practices and resources — learn on any device." />
      <section className="section-sm">
        <div className="container catalog-layout">
          <aside className={`filters${filtersOpen ? ' is-open' : ''}`} aria-label="Filters">
            <FilterGroup title="Category" options={catOptions} value={get('category')} onChange={(v) => set('category', v)} />
            <FilterGroup title="Level" options={LEVELS} value={get('level')} onChange={(v) => set('level', v)} />
            <FilterGroup title="Price" options={PRICES} value={get('price')} onChange={(v) => set('price', v)} />
          </aside>
          <div>
            <div className="catalog-toolbar">
              <div className="search-box">
                <LuSearch aria-hidden />
                <label htmlFor="course-search" className="sr-only">Search programs</label>
                <input id="course-search" className="input" type="search" placeholder="Search programs…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="row">
                <button type="button" className="btn btn-outline btn-sm filters-toggle" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
                  <LuSlidersHorizontal /> Filters
                </button>
                <label htmlFor="sort" className="sr-only">Sort by</label>
                <select id="sort" className="select" style={{ width: 'auto' }} value={get('sort') || 'featured'} onChange={(e) => set('sort', e.target.value)}>
                  {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            {meta && !loading && <p className="muted small" aria-live="polite">{meta.total} program{meta.total === 1 ? '' : 's'}</p>}
            {error ? (
              <ErrorState error={error} onRetry={reload} />
            ) : (
              <CourseGrid courses={data} loading={loading} columns={3} />
            )}
            {meta && <Pagination page={meta.page} pages={meta.pages} onChange={(p) => set('page', String(p))} />}
          </div>
        </div>
      </section>
    </>
  );
}
