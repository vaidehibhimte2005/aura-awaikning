import { Link } from 'react-router-dom';

/** Concentric "aura" rings — the brand motif, reused in hero, covers and ornaments. */
export function AuraRings({ className, rings = 5, animated = false, stroke = '#D1B48C' }) {
  return (
    <svg className={className} viewBox="0 0 400 400" fill="none" aria-hidden="true" focusable="false">
      {Array.from({ length: rings }).map((_, i) => (
        <circle
          key={i}
          className={animated && i < 3 ? 'aura-ring' : undefined}
          cx="200"
          cy="200"
          r={60 + i * 32}
          stroke={stroke}
          strokeWidth={i === 0 ? 1.4 : 0.8}
          opacity={1 - i * 0.16}
        />
      ))}
      <circle cx="200" cy="200" r="6" fill={stroke} />
      <path d="M200 120 C 230 160, 230 240, 200 280 C 170 240, 170 160, 200 120 Z" stroke={stroke} strokeWidth="1" opacity="0.8" />
    </svg>
  );
}

export function LogoMark({ className = 'logo-mark' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="22" stroke="#D1B48C" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="14" stroke="#D1B48C" strokeWidth="1" opacity="0.7" />
      <path d="M24 10 C 31 18, 31 30, 24 38 C 17 30, 17 18, 24 10 Z" fill="#D1B48C" opacity="0.9" />
      <circle cx="24" cy="24" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label="Aura Awakening — home">
      <LogoMark />
      <span className="logo-text">
        <strong>Aura Awakening</strong>
        <small>Awareness · Growth</small>
      </span>
    </Link>
  );
}

/** Branded placeholder used when a course/article has no cover image. */
export function CoverArt({ label, seed = '' }) {
  const n = [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const cx = 60 + (n % 50);
  const cy = 30 + (n % 40);
  return (
    <div className="cover-art">
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id={`g${n}`} cx="70%" cy="30%" r="80%">
            <stop offset="0" stopColor="#1a5252" />
            <stop offset="1" stopColor="#022424" />
          </radialGradient>
        </defs>
        <rect width="160" height="100" fill={`url(#g${n})`} />
        {[14, 26, 38, 50, 62].map((r, i) => (
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#D1B48C" strokeWidth={0.35} opacity={0.75 - i * 0.12} />
        ))}
        <circle cx={cx} cy={cy} r="2" fill="#D1B48C" />
      </svg>
      {label && <span>{label}</span>}
    </div>
  );
}
