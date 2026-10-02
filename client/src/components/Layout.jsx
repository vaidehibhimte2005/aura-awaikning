import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LuX } from 'react-icons/lu';
import { Navbar } from './Navbar.jsx';
import { Footer } from './Footer.jsx';
import { useSite } from '../context/SiteContext.jsx';

function AnnouncementBar() {
  const { announcements } = useSite();
  const banner = announcements.find((a) => a.showAsBanner);
  const key = banner ? `aa_dismiss_${banner._id}` : null;
  const [hidden, setHidden] = useState(() => {
    try { return key ? sessionStorage.getItem(key) === '1' : false; } catch { return false; }
  });
  useEffect(() => {
    try { setHidden(key ? sessionStorage.getItem(key) === '1' : false); } catch { /* storage unavailable */ }
  }, [key]);
  if (!banner || hidden) return null;
  return (
    <div className="announce" role="region" aria-label="Announcement">
      <span><strong style={{ fontWeight: 500 }}>{banner.title}</strong> — {banner.message}</span>
      {banner.link && <Link to={banner.link}>{banner.linkLabel || 'Learn more'} →</Link>}
      <button type="button" className="icon-btn" aria-label="Dismiss announcement" onClick={() => { try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ } setHidden(true); }}>
        <LuX size={16} />
      </button>
    </div>
  );
}

/** Public site shell. The home page uses a transparent nav over the hero. */
export function SiteLayout() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <AnnouncementBar />
      <div style={{ position: 'relative' }}>
        <Navbar transparent={isHome} />
        <main id="main">
          <Outlet />
        </main>
      </div>
      <Footer />
    </>
  );
}
