/**
 * Video Thumbnail Generator & Generic Placeholder Utility
 * 
 * Provides:
 * 1. High-resolution vector generic thumbnail placeholder (never breaks, zero latency)
 * 2. Automated frame capture from uploaded video files (File, Blob, or URL)
 * 3. Graceful onError fallback handler for all <img> elements displaying media previews
 */

// Embedded fallback SVG Data URI so it works 100% offline, cross-origin, and without network
export const GENERIC_VIDEO_THUMBNAIL_SVG_DATA =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0c14" />
      <stop offset="50%" stop-color="#121624" />
      <stop offset="100%" stop-color="#080a10" />
    </linearGradient>
    <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8257e5" />
      <stop offset="50%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#04d361" />
    </linearGradient>
    <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e2438" stop-opacity="0.85" />
      <stop offset="100%" stop-color="#111522" stop-opacity="0.95" />
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)" />
  <circle cx="320" cy="180" r="140" fill="#8257e5" opacity="0.16" />
  <circle cx="320" cy="180" r="90" fill="#06b6d4" opacity="0.2" />
  <rect x="170" y="65" width="300" height="220" rx="18" fill="url(#card)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
  <line x1="200" y1="65" x2="440" y2="65" stroke="url(#neon)" stroke-width="2.5" stroke-linecap="round" />
  <circle cx="320" cy="155" r="42" fill="rgba(10,14,26,0.9)" stroke="url(#neon)" stroke-width="2.5" />
  <polygon points="312,138 338,155 312,172" fill="#06b6d4" />
  <text x="320" y="232" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="1">VÍDEO CLIP</text>
  <text x="320" y="254" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#94a3b8" text-anchor="middle" letter-spacing="0.5">ALÔ EDITOR • PREVIEW</text>
</svg>`);

export const GENERIC_VIDEO_THUMBNAIL = '/video-placeholder.svg';

/**
 * Capture a thumbnail image from a video File, Blob, or URL.
 * Attempts to seek to 0.5s (or midway) to grab a non-black frame.
 * Falls back safely to GENERIC_VIDEO_THUMBNAIL if capture fails.
 */
export async function captureVideoThumbnail(
  source: File | Blob | string,
  targetTimeSec: number = 0.5,
  onDuration?: (duration: number) => void
): Promise<string> {
  // If in SSR or no browser environment, return placeholder
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return GENERIC_VIDEO_THUMBNAIL;
  }

  return new Promise((resolve) => {
    let resolved = false;
    let objectUrlToRevoke: string | null = null;

    let mediaUrl: string;
    if (typeof source === 'string') {
      mediaUrl = source;
    } else {
      objectUrlToRevoke = URL.createObjectURL(source);
      mediaUrl = objectUrlToRevoke;
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
        objectUrlToRevoke = null;
      }
      video.removeAttribute('src');
      video.load();
    };

    const finish = (result: string) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    // 3.5s timeout safety guard
    const timer = setTimeout(() => {
      finish(GENERIC_VIDEO_THUMBNAIL);
    }, 3500);

    video.onloadedmetadata = () => {
      try {
        const duration = video.duration || 1;
        if (onDuration && duration > 0 && !isNaN(duration) && isFinite(duration)) {
          onDuration(parseFloat(duration.toFixed(3)));
        }
        const seekTime = Math.min(targetTimeSec, Math.max(0.1, duration / 4));
        video.currentTime = seekTime;
      } catch {
        finish(GENERIC_VIDEO_THUMBNAIL);
      }
    };

    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        const vWidth = video.videoWidth || 320;
        const vHeight = video.videoHeight || 180;
        const targetWidth = Math.min(480, Math.max(240, vWidth));
        const targetHeight = Math.round((targetWidth * vHeight) / vWidth);

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          finish(dataUrl);
          return;
        }
      } catch (err) {
        // e.g. Canvas tainted by cross-origin video without permissive headers
        console.warn('Could not export canvas thumbnail, using generic placeholder:', err);
      }
      finish(GENERIC_VIDEO_THUMBNAIL);
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish(GENERIC_VIDEO_THUMBNAIL);
    };

    video.src = mediaUrl;
  });
}

/**
 * Fallback image error handler. Replaces broken image with generic video thumbnail.
 */
export function handleThumbnailError(e: React.SyntheticEvent<HTMLImageElement>) {
  const target = e.currentTarget;
  if (target.src !== GENERIC_VIDEO_THUMBNAIL && !target.src.includes(GENERIC_VIDEO_THUMBNAIL)) {
    target.src = GENERIC_VIDEO_THUMBNAIL;
  }
}

/**
 * Accurately extracts the real media duration (in seconds) from a File, Blob, or URL
 * for both video and audio files.
 */
export async function getMediaDuration(
  source: File | Blob | string,
  isAudio: boolean = false
): Promise<number> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 10.0;
  }

  return new Promise((resolve) => {
    let objectUrlToRevoke: string | null = null;
    let mediaUrl: string;

    if (typeof source === 'string') {
      mediaUrl = source;
    } else {
      objectUrlToRevoke = URL.createObjectURL(source);
      mediaUrl = objectUrlToRevoke;
    }

    const el = document.createElement(isAudio ? 'audio' : 'video');
    el.preload = 'metadata';
    el.muted = true;

    let resolved = false;
    const cleanup = () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
        objectUrlToRevoke = null;
      }
      el.removeAttribute('src');
      el.load();
    };

    const finish = (dur: number) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(dur);
      }
    };

    const timer = setTimeout(() => {
      finish(10.0);
    }, 4500);

    el.onloadedmetadata = () => {
      clearTimeout(timer);
      const d = el.duration;
      if (d && !isNaN(d) && isFinite(d) && d > 0) {
        finish(parseFloat(d.toFixed(3)));
      } else {
        finish(10.0);
      }
    };

    el.onerror = () => {
      clearTimeout(timer);
      finish(10.0);
    };

    el.src = mediaUrl;
  });
}

// Filmstrip cache: key -> array of frame data URLs
const filmstripCache = new Map<string, string[]>();
const filmstripLoadingSet = new Set<string>();

/**
 * Returns cached filmstrip frames synchronously or fills with fallback thumbnail.
 */
export function getFilmstripFramesSync(
  sourceUrl: string,
  count: number,
  fallbackUrl?: string
): string[] {
  const fallback = fallbackUrl || GENERIC_VIDEO_THUMBNAIL;
  if (!sourceUrl) {
    return Array(Math.max(1, count)).fill(fallback);
  }
  const cached = filmstripCache.get(sourceUrl);
  if (cached && cached.length > 0) {
    const res: string[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.min(cached.length - 1, Math.floor((i / count) * cached.length));
      res.push(cached[idx]);
    }
    return res;
  }
  return Array(Math.max(1, count)).fill(fallback);
}

/**
 * Extracts a sequence of keyframe thumbnails across the video to display a filmstrip in the timeline.
 */
export async function getVideoFilmstripFrames(
  source: File | Blob | string,
  count: number = 8,
  totalDuration?: number
): Promise<string[]> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Array(count).fill(GENERIC_VIDEO_THUMBNAIL);
  }

  const cacheKey = typeof source === 'string' ? source : (source as any).name || 'blob_video';
  if (filmstripCache.has(cacheKey)) {
    return filmstripCache.get(cacheKey)!;
  }

  if (filmstripLoadingSet.has(cacheKey)) {
    return Array(count).fill(GENERIC_VIDEO_THUMBNAIL);
  }

  filmstripLoadingSet.add(cacheKey);

  return new Promise((resolve) => {
    let objectUrlToRevoke: string | null = null;
    let mediaUrl: string;

    if (typeof source === 'string') {
      mediaUrl = source;
    } else {
      objectUrlToRevoke = URL.createObjectURL(source);
      mediaUrl = objectUrlToRevoke;
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const frames: string[] = [];
    const cleanup = () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
        objectUrlToRevoke = null;
      }
      video.removeAttribute('src');
      video.load();
      filmstripLoadingSet.delete(cacheKey);
    };

    const timer = setTimeout(() => {
      cleanup();
      if (frames.length > 0) {
        filmstripCache.set(cacheKey, frames);
        resolve(frames);
      } else {
        resolve(Array(count).fill(GENERIC_VIDEO_THUMBNAIL));
      }
    }, 4500);

    video.onloadedmetadata = async () => {
      try {
        const dur = video.duration || totalDuration || 5.0;
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 68;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timer);
          cleanup();
          resolve(Array(count).fill(GENERIC_VIDEO_THUMBNAIL));
          return;
        }

        const timestamps: number[] = [];
        for (let i = 0; i < count; i++) {
          const t = Math.max(0.05, Math.min(dur - 0.05, (i / Math.max(1, count - 1)) * (dur - 0.1) + 0.05));
          timestamps.push(t);
        }

        for (const t of timestamps) {
          await new Promise<void>((resSeek) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                frames.push(dataUrl);
              } catch {
                frames.push(GENERIC_VIDEO_THUMBNAIL);
              }
              resSeek();
            };
            video.addEventListener('seeked', onSeeked, { once: true });
            video.currentTime = t;
          });
        }

        clearTimeout(timer);
        cleanup();
        filmstripCache.set(cacheKey, frames);
        resolve(frames);
      } catch {
        clearTimeout(timer);
        cleanup();
        resolve(Array(count).fill(GENERIC_VIDEO_THUMBNAIL));
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve(Array(count).fill(GENERIC_VIDEO_THUMBNAIL));
    };

    video.src = mediaUrl;
  });
}

