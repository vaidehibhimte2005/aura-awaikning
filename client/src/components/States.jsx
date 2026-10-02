import { LuCircleAlert, LuLeaf, LuRefreshCw } from 'react-icons/lu';

export function Loader({ label = 'Loading…', page = false }) {
  return (
    <div className={`loader${page ? ' loader-page' : ''}`} role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = LuLeaf, title = 'Nothing here yet', message, action }) {
  return (
    <div className="state">
      <div className="state-icon" aria-hidden="true"><Icon size={24} /></div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="state state-error" role="alert">
      <div className="state-icon" aria-hidden="true"><LuCircleAlert size={24} /></div>
      <h3>{error?.status === 404 ? 'Not found' : error?.status === 403 ? 'Access restricted' : title}</h3>
      <p>{error?.message || 'Please try again in a moment.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
          <LuRefreshCw /> Try Again
        </button>
      )}
    </div>
  );
}

/** Renders loading / error / empty / content consistently. */
export function AsyncBlock({ loading, error, onRetry, empty, emptyState, children, skeleton }) {
  if (loading && !children?.length && skeleton) return skeleton;
  if (loading) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (empty) return emptyState || <EmptyState />;
  return children;
}

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <LuCircleAlert size={16} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function SkeletonCards({ count = 3 }) {
  return (
    <div className="grid grid-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <div className="skeleton" style={{ aspectRatio: '16/10', borderRadius: 0 }} />
          <div style={{ padding: 22 }}>
            <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: 14 }} />
            <div className="skeleton" style={{ height: 22, width: '80%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 14, width: '95%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
