import { useEffect } from 'react';

const SITE = 'Aura Awakening';
const SITE_URL = import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

function setMeta(attr, key, content) {
  if (content === undefined) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content || '');
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Per-page title, description, Open Graph and canonical URL.
 * (For full crawler support, pair with prerendering or SSR at deploy time.)
 */
export function useSeo({ title, description, image, type = 'website', noindex = false } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} · ${SITE}` : `${SITE} — Awareness, Mindfulness & Growth`;
    document.title = fullTitle;
    const url = `${SITE_URL}${window.location.pathname}`;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    if (image) setMeta('property', 'og:image', image);
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setCanonical(url);
  }, [title, description, image, type, noindex]);
}
