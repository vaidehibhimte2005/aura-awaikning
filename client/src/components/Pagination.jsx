import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

export function Pagination({ page = 1, pages = 1, onChange }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i += 1) nums.push(i);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page"><LuChevronLeft /></button>
      {nums.map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
      ))}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page"><LuChevronRight /></button>
    </nav>
  );
}
