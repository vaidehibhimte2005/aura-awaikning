import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LuBell, LuLayoutDashboard, LuLogOut, LuMenu, LuUser, LuX } from 'react-icons/lu';
import { Logo } from './Brand.jsx';
import { ROLE_HOME, useAuth } from '../context/AuthContext.jsx';
import { initials } from '../utils/format.js';

export const NAV_LINKS = [
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#plans', label: 'Plans' },
  { to: '/trainers', label: 'Trainers' },
  { to: '/#faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const home = ROLE_HOME[user.role] || '/dashboard';
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar" aria-hidden>{user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name)}</span>
        <span className="hide-mobile" style={{ fontSize: '0.9rem' }}>{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div className="dropdown" role="menu" onClick={() => setOpen(false)}>
          <div className="dropdown-head">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <hr />
          <Link to={home} role="menuitem"><LuLayoutDashboard size={16} /> Dashboard</Link>
          <Link to={`${home}/notifications`.replace('//', '/')} role="menuitem"><LuBell size={16} /> Notifications</Link>
          {user.role === 'learner' && <Link to="/dashboard/profile" role="menuitem"><LuUser size={16} /> Profile</Link>}
          <hr />
          <button type="button" role="menuitem" onClick={async () => { await logout(); navigate('/'); }}>
            <LuLogOut size={16} /> Log Out
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar({ transparent = false }) {
  const { isAuthenticated, status } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawer]);

  return (
    <>
      <header className={`nav${transparent ? ' nav-dark' : ''}${scrolled ? ' is-scrolled' : ''}`}>
        <div className="container nav-inner">
          <Logo />
          <nav aria-label="Main">
            <ul className="nav-links">
              {NAV_LINKS.map((l) => (
                <li key={l.to}>{l.to.includes('#') ? <Link to={l.to}>{l.label}</Link> : <NavLink to={l.to}>{l.label}</NavLink>}</li>
              ))}
            </ul>
          </nav>
          <div className="nav-actions">
            {status !== 'loading' && (isAuthenticated ? (
              <UserMenu />
            ) : (
              <>
                <Link to="/login" className="btn btn-outline btn-sm hide-mobile">Log In</Link>
                <Link to="/register" className={`btn btn-sm hide-mobile ${transparent ? 'btn-gold' : ''}`}>Register</Link>
              </>
            ))}
            <button type="button" className="icon-btn nav-toggle" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}>
              <LuMenu />
            </button>
          </div>
        </div>
      </header>

      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" className="icon-btn" onClick={() => setDrawer(false)} aria-label="Close menu"><LuX /></button>
            <nav aria-label="Mobile">
              <NavLink to="/" end>Home</NavLink>
              {NAV_LINKS.map((l) => (l.to.includes('#') ? <Link key={l.to} to={l.to}>{l.label}</Link> : <NavLink key={l.to} to={l.to}>{l.label}</NavLink>))}
            </nav>
            <div className="drawer-actions">
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn btn-gold" onClick={() => {}}>My Dashboard</Link>
              ) : (
                <>
                  <Link to="/register" className="btn btn-gold">Register as a learner</Link>
                  <Link to="/login" className="btn btn-ghost-light">Log In</Link>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
