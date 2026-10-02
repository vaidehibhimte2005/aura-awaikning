const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** Extract a YouTube video id from any common URL format, or accept a bare id. */
export function getYouTubeId(input) {
  if (!input) return null;
  const v = String(input).trim();
  if (ID_RE.test(v)) return v;
  try {
    const url = new URL(v.startsWith('http') ? v : `https://${v}`);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return ID_RE.test(url.pathname.slice(1, 12)) ? url.pathname.slice(1, 12) : null;
    const q = url.searchParams.get('v');
    if (q && ID_RE.test(q)) return q;
    const m = url.pathname.match(/\/(embed|live|shorts|v)\/([a-zA-Z0-9_-]{11})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

export const youtubeThumb = (id, quality = 'hqdefault') => (id ? `https://i.ytimg.com/vi/${id}/${quality}.jpg` : '');
