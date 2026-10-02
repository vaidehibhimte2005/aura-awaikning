/**
 * Accepts any common YouTube URL form (watch, youtu.be, embed, live, shorts)
 * or a bare 11-character ID and returns the video ID — or null.
 */
const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeId(input) {
  if (!input) return null;
  const value = String(input).trim();
  if (ID_RE.test(value)) return value;
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1, 12);
      return ID_RE.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = url.searchParams.get('v');
      if (v && ID_RE.test(v)) return v;
      const m = url.pathname.match(/\/(embed|live|shorts|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

export const youtubeWatchUrl = (id) => (id ? `https://www.youtube.com/watch?v=${id}` : '');
export const youtubeThumb = (id) => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');

/**
 * Mongoose sub-schema definition shared by Lesson, Course preview and LiveSession,
 * so every video is stored the same way across the platform.
 */
export const videoFields = {
  youtubeUrl: { type: String, trim: true, default: '' },
  youtubeId: { type: String, trim: true, default: '' },
  videoType: { type: String, enum: ['video', 'live', 'recording'], default: 'video' },
  durationMinutes: { type: Number, min: 0, default: 0 },
};

/** Normalises youtubeUrl/youtubeId before save. */
export function normaliseVideo(doc) {
  // The URL is the source of truth when present (forms accept a URL *or* an ID).
  const fromUrl = parseYouTubeId(doc.youtubeUrl);
  if (fromUrl) doc.youtubeId = fromUrl;
  else if (doc.youtubeId) doc.youtubeId = parseYouTubeId(doc.youtubeId) || '';
  if (doc.youtubeId && !fromUrl) doc.youtubeUrl = youtubeWatchUrl(doc.youtubeId);
  if (!doc.youtubeId && doc.youtubeUrl && !fromUrl) doc.youtubeUrl = '';
}
