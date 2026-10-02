import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LuAward, LuBell, LuBookOpen, LuCalendarDays, LuCircleHelp, LuCreditCard, LuFileText, LuFolderTree, LuGlobe, LuGraduationCap,
  LuLayoutDashboard, LuLogOut, LuMegaphone, LuMenu, LuMessageSquare, LuMessageSquareQuote, LuRadio, LuReceipt, LuSettings,
  LuShieldCheck, LuUser, LuUserCog, LuUsers, LuX,
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
        { to: '/admin/users', label: 'Users', icon: LuUsers },
        { to: '/admin/trainers', label: 'Trainers', icon: LuGraduationCap },
        { to: '/admin/managers', label: 'Managers', icon: LuUserCog },
      ] },
      { title: 'Learning', items: [
        { to: '/admin/courses', label: 'Courses', icon: LuBookOpen },
        { to: '/admin/categories', label: 'Categories', icon: LuFolderTree },
        { to: '/admin/enrollments', label: 'Enrollments', icon: LuShieldCheck },
        { to: '/admin/certificates', label: 'Certificates', icon: LuAward },
      ] },
      { title: 'Live', items: [
        { to: '/admin/live-sessions', label: 'Live Sessions', icon: LuRadio },
        { to: '/admin/events', label: 'Events', icon: LuCalendarDays },
      ] },
      { title: 'Commerce', items: [
        { to: '/admin/payments', label: 'Payments', icon: LuCreditCard },
        { to: '/admin/orders', label: 'Orders', icon: LuReceipt },
      ] },
      { title: 'Content', items: [
        { to: '/admin/articles', label: 'Articles', icon: LuFileText },
        { to: '/admin/faqs', label: 'FAQs', icon: LuCircleHelp },
        { to: '/admin/testimonials', label: 'Testimonials', icon: LuMessageSquareQuote },
        { to: '/admin/announcements', label: 'Announcements', icon: LuMegaphone },
        { to: '/admin/messages', label: 'Messages', icon: LuMessageSquare },
        { to: '/admin/content', label: 'Website Content', icon: LuGlobe },
      ] },
      { items: [{ to: '/admin/settings', label: 'Settings', icon: LuSettings }] },
    ],
  },
  manager: {
    label: 'Content & Live',
    groups: [
      { items: [{ to: '/manager', label: 'Dashboard', icon: LuLayoutDashboard, end: true }] },
      { title: 'Live', items: [
        { to: '/manager/live-sessions', label: 'Live Sessions', icon: LuRadio },
        { to: '/manager/events', label: 'Events', icon: LuCalendarDays },
      ] },
      { title: 'Content', items: [
        { to: '/manager/content', label: 'Homepage & Pages', icon: LuGlobe },
        { to: '/manager/courses', label: 'Course Presentation', icon: LuBookOpen },
        { to: '/manager/articles', label: 'Articles', icon: LuFileText },
        { to: '/manager/faqs', label: 'FAQs', icon: LuCircleHelp },
        { to: '/manager/testimonials', label: 'Testimonials', icon: LuMessageSquareQuote },
        { to: '/manager/announcements', label: 'Announcements', icon: LuMegaphone },
        { to: '/manager/messages', label: 'Messages', icon: LuMessageSquare },
      ] },
    ],
  },
  trainer: {
    label: 'Trainer Studio',
    groups: [
      { items: [{ to: '/trainer', label: 'Dashboard', icon: LuLayoutDashboard, end: true }] },
      { title: 'Teach', items: [
        { to: '/trainer/courses', label: 'My Courses', icon: LuBookOpen },
        { to: '/trainer/live-sessions', label: 'Live Sessions', icon: LuRadio },
        { to: '/trainer/learners', label: 'Learners', icon: LuUsers },
      ] },
      { items: [{ to: '/trainer/profile', label: 'Public Profile', icon: LuUser }] },
    ],
  },
  learner: {
    label: 'My Learning',
    groups: [
      { items: [
        { to: '/dashboard', label: 'Overview', icon: LuLayoutDashboard, end: true },
        { to: '/dashboard/courses', label: 'My Courses', icon: LuBookOpen },
        { to: '/dashboard/sessions', label: 'Live Sessions', icon: LuRadio },
        { to: '/dashboard/certificates', label: 'Certificates', icon: LuAward },
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

  // Staff can also reach their personal learner area.
  const switchLinks = [
    user.role === 'admin' && area !== 'admin' && { to: '/admin', label: 'Admin panel' },
    user.role === 'manager' && area !== 'manager' && { to: '/manager', label: 'Manager panel' },
    user.role === 'trainer' && area !== 'trainer' && { to: '/trainer', label: 'Trainer studio' },
    area !== 'learner' && { to: '/dashboard', label: 'My learning' },
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
            <Link to="/dashboard/notifications" className="icon-btn bell" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
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
