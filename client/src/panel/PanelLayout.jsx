import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LuBell, LuCalendarDays, LuCalendarPlus, LuCircleHelp, LuCreditCard, LuFileText, LuGlobe, LuGraduationCap, LuHistory,
  LuLayoutDashboard, LuLogOut, LuMegaphone, LuMenu, LuMessageSquare, LuMessageSquareQuote, LuPackage, LuSettings,
  LuShieldCheck, LuStar, LuUser, LuUsers, LuWallet, LuX,
} from 'react-icons/lu';
import { Logo } from '../components/Brand.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { initials } from '../utils/format.js';

export const PANEL_NAV = {
  admin: {
    label: 'Administration',
    groups: [
      { items: [{ to: '/admin', label: 'Dashboard', icon: LuLayoutDashboard, end: true }] },
      { title: 'People', items: [
        { to: '/admin/trainers', label: 'Trainers', icon: LuGraduationCap },
        { to: '/admin/learners', label: 'Learners', icon: LuUsers },
      ] },
      { title: 'Packages', items: [
        { to: '/admin/packages', label: 'Packages & pricing', icon: LuPackage },
        { to: '/admin/subscriptions', label: 'Usage & expiry', icon: LuShieldCheck },
        { to: '/admin/payments', label: 'Payments', icon: LuCreditCard },
      ] },
      { title: 'Sessions', items: [
        { to: '/admin/bookings', label: 'Bookings & attendance', icon: LuCalendarDays },
        { to: '/admin/reports', label: 'Session report', icon: LuFileText },
        { to: '/admin/payouts', label: 'Trainer payouts', icon: LuWallet },
        { to: '/admin/feedback', label: 'Learner feedback', icon: LuStar },
      ] },
      { title: 'Website', items: [
        { to: '/admin/faqs', label: 'FAQs', icon: LuCircleHelp },
        { to: '/admin/testimonials', label: 'Testimonials', icon: LuMessageSquareQuote },
        { to: '/admin/messages', label: 'Contact messages', icon: LuMessageSquare },
      ] },
      { items: [
        { to: '/admin/notifications', label: 'Notifications', icon: LuBell },
        { to: '/admin/broadcast', label: 'Send notification', icon: LuMegaphone },
        { to: '/admin/activity', label: 'Activity log', icon: LuHistory },
        { to: '/admin/settings', label: 'Settings', icon: LuSettings },
      ] },
    ],
  },
  trainer: {
    label: 'Trainer Studio',
    groups: [
      { items: [
        { to: '/trainer', label: 'Dashboard', icon: LuLayoutDashboard, end: true },
        { to: '/trainer/slots', label: 'My availability', icon: LuCalendarPlus },
        { to: '/trainer/bookings', label: 'Bookings', icon: LuCalendarDays },
        { to: '/trainer/earnings', label: 'Earnings', icon: LuWallet },
        { to: '/trainer/notifications', label: 'Notifications', icon: LuBell },
        { to: '/trainer/profile', label: 'Profile', icon: LuUser },
      ] },
    ],
  },
  learner: {
    label: 'My Training',
    groups: [
      { items: [
        { to: '/dashboard', label: 'Overview', icon: LuLayoutDashboard, end: true },
        { to: '/dashboard/plans', label: 'My plan', icon: LuPackage },
        { to: '/dashboard/trainers', label: 'Trainers', icon: LuGraduationCap },
        { to: '/dashboard/book', label: 'Book a session', icon: LuCalendarPlus },
        { to: '/dashboard/bookings', label: 'My bookings', icon: LuCalendarDays },
        { to: '/dashboard/history', label: 'Training history', icon: LuHistory },
        { to: '/dashboard/payments', label: 'Payments', icon: LuCreditCard },
        { to: '/dashboard/notifications', label: 'Notifications', icon: LuBell },
        { to: '/dashboard/profile', label: 'Profile', icon: LuUser },
      ] },
    ],
  },
};

export function PanelLayout({ area }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const nav = PANEL_NAV[area];

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/notifications', { limit: 1 }).then((r) => alive && setUnread(r.meta?.unread || 0)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [location.pathname]);

  // Only admins have a second area to switch to.
  const switchLinks = [
    user.role === 'admin' && area !== 'admin' && { to: '/admin', label: 'Admin panel' },
    user.role === 'trainer' && area !== 'trainer' && { to: '/trainer', label: 'Trainer studio' },
  ].filter(Boolean);

  return (
    <div className="panel">
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={`panel-side${open ? ' is-open' : ''}`} aria-label={`${nav.label} navigation`}>
        <div className="row-between" style={{ flexWrap: 'nowrap' }}>
          <Logo />
          {open && <button type="button" className="icon-btn" style={{ color: '#fff' }} onClick={() => setOpen(false)} aria-label="Close menu"><LuX /></button>}
        </div>
        <div className="panel-role">{nav.label}</div>
        <nav className="panel-nav">
          {nav.groups.map((g, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i}>
              {g.title && <div className="panel-nav-group">{g.title}</div>}
              {g.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end}><Icon aria-hidden /> {label}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="panel-side-foot panel-nav">
          {switchLinks.map((l) => <Link key={l.to} to={l.to}><LuLayoutDashboard aria-hidden /> {l.label}</Link>)}
          <Link to="/"><LuGlobe aria-hidden /> View website</Link>
        </div>
      </aside>
      <div className="panel-main">
        <header className="panel-top">
          <button type="button" className="icon-btn menu" onClick={() => setOpen(true)} aria-label="Open menu"><LuMenu /></button>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <Link to={area === 'learner' ? '/dashboard/notifications' : `/${area}/notifications`} className="icon-btn bell" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
              <LuBell />{unread > 0 && <span className="count">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            <span className="avatar" aria-hidden>{user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name)}</span>
            <span className="small" style={{ fontWeight: 500 }}>{user.name}</span>
            <button type="button" className="icon-btn" onClick={async () => { await logout(); navigate('/'); }} aria-label="Log out" title="Log out"><LuLogOut /></button>
          </div>
        </header>
        <main className="panel-content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
