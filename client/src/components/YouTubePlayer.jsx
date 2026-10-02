import { useState } from 'react';
import { LuPlay, LuVideoOff } from 'react-icons/lu';
import { getYouTubeId, youtubeThumb } from '../utils/youtube.js';

/**
 * Reusable YouTube player for lessons, previews, live streams and recordings.
 * - Accepts `videoId` or any YouTube `url` (watch, youtu.be, embed, live).
 * - Lazy: shows a lightweight poster and only loads the iframe on click
 *   (or immediately with `autoLoad`), which keeps pages fast.
 * - Uses youtube-nocookie.com for privacy-enhanced embedding.
 */
export function YouTubePlayer({ videoId, url, title = 'Video', live = false, autoLoad = false, autoplay = false, start = 0, className = '' }) {
  const id = videoId || getYouTubeId(url);
  const [active, setActive] = useState(autoLoad);

  if (!id) {
    return (
      <div className={`yt yt-empty ${className}`}>
        <div>
          <LuVideoOff size={28} style={{ margin: '0 auto 10px' }} aria-hidden />
          <p style={{ margin: 0 }}>Video will be available soon.</p>
        </div>
      </div>
    );
  }

  const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  if (active && (autoplay || !autoLoad)) params.set('autoplay', '1');
  if (start) params.set('start', String(Math.floor(start)));
  const src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;

  return (
    <div className={`yt ${className}`}>
      {active ? (
        <iframe
          src={src}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button type="button" className="yt-poster" onClick={() => setActive(true)} aria-label={`Play: ${title}`}>
          <img src={youtubeThumb(id, 'hqdefault')} alt="" loading="lazy" />
          <span className="yt-play" aria-hidden="true"><LuPlay /></span>
          {live && <span className="yt-label"><span className="badge badge-live">Live</span></span>}
        </button>
      )}
    </div>
  );
}
