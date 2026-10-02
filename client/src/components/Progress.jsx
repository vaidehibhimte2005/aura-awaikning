export function Progress({ value = 0, label = true }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      {label && (
        <div className="progress-label">
          <span>{v === 100 ? 'Completed' : 'Progress'}</span>
          <span>{v}% completed</span>
        </div>
      )}
      <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={`${v}% completed`}>
        <span style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
