import { Link } from 'react-router-dom';

/**
 * <Button variant="gold" to="/courses">Explore Programs</Button>
 * Renders a Link when `to` is set, an <a> for `href`, otherwise a <button>.
 */
export function Button({ variant, size, block, loading, to, href, children, className = '', type = 'button', ...rest }) {
  const cls = ['btn', variant && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  const content = (
    <>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return (
    <button type={type} className={cls} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
