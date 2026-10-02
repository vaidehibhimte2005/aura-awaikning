import { Link } from 'react-router-dom';
import { LuFacebook, LuInstagram, LuLinkedin, LuYoutube } from 'react-icons/lu';
import { Logo } from './Brand.jsx';
import { useSite } from '../context/SiteContext.jsx';

export function Footer() {
  const { settings } = useSite();
  const g = settings.general || {};
  const socials = [
    { href: g.socials?.instagram, icon: LuInstagram, label: 'Instagram' },
    { href: g.socials?.youtube, icon: LuYoutube, label: 'YouTube' },
    { href: g.socials?.facebook, icon: LuFacebook, label: 'Facebook' },
    { href: g.socials?.linkedin, icon: LuLinkedin, label: 'LinkedIn' },
  ].filter((s) => s.href);

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-about">
            <Logo />
            <p>{g.tagline ? `${g.tagline}. ` : ''}A learning sanctuary for awareness, mindfulness and inner growth.</p>
            {!!socials.length && (
              <div className="socials">
                {socials.map(({ href, icon: Icon, label }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}><Icon size={17} /></a>
                ))}
              </div>
            )}
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li><Link to="/about">About</Link></li>
              <li><Link to="/courses">Programs</Link></li>
              <li><Link to="/trainers">Trainers</Link></li>
              <li><Link to="/articles">Journal</Link></li>
            </ul>
          </div>
          <div>
            <h4>Practice</h4>
            <ul>
              <li><Link to="/live-sessions">Live Sessions</Link></li>
              <li><Link to="/events">Events &amp; Retreats</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/dashboard">My Learning</Link></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              {g.email && <li><a href={`mailto:${g.email}`}>{g.email}</a></li>}
              {g.phone && <li><a href={`tel:${g.phone.replace(/\s/g, '')}`}>{g.phone}</a></li>}
              {g.address && <li>{g.address}</li>}
              <li><Link to="/contact">Send a message</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {g.siteName || 'Aura Awakening'}. All rights reserved.</span>
          <nav aria-label="Legal">
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/refund-policy">Refunds</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
