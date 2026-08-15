/** Aynı X videosunun kalite varyantlarını tek medya öğesine indirger. */

const VIDEO_MEDIA_ID_RE = /\/(?:ext_tw_video|amplify_video)\/(\d+)/;
const THUMB_MEDIA_ID_RE = /\/(?:ext_tw_video_thumb|amplify_video_thumb)\/(\d+)/;
const TWEET_VIDEO_RE = /\/tweet_video\/([^/?]+)/;

export function getTwitterMediaKey(video) {
  const url = String(video?.url || '');
  const thumb = String(video?.thumbnail || '');
  const fromVideo = url.match(VIDEO_MEDIA_ID_RE)?.[1];
  if (fromVideo) return `vid:${fromVideo}`;
  const fromThumb = thumb.match(THUMB_MEDIA_ID_RE)?.[1];
  if (fromThumb) return `vid:${fromThumb}`;
  const tweetVideo = url.match(TWEET_VIDEO_RE)?.[1];
  if (tweetVideo) return `gif:${tweetVideo}`;
  if (thumb.startsWith('http')) return `thumb:${thumb.split('?')[0]}`;
  if (url.startsWith('http')) return `url:${url.split('?')[0]}`;
  return null;
}

function qualityScore(video) {
  const bitrate = Number(video?.bitrate);
  if (Number.isFinite(bitrate) && bitrate > 0) return bitrate;
  const q = video?.quality;
  if (typeof q === 'number' && Number.isFinite(q) && q > 0) return q;
  const s = String(q || video?.label || '').toLowerCase();
  if (s.includes('1080')) return 2073600;
  if (s.includes('720')) return 921600;
  if (s.includes('480')) return 307200;
  if (s.includes('360')) return 129600;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export function isPlayableVideo(video) {
  return (
    !!video?.url &&
    typeof video.url === 'string' &&
    video.url.startsWith('http') &&
    video.mediaType !== 'photo'
  );
}

/**
 * Aynı medya öğesinin 360p/720p/1080p kopyalarını tek videoda tutar.
 * Farklı medya ID'li videolar (tek tweette 2 video) ayrı kalır.
 */
export function collapseDistinctVideos(videos) {
  if (!Array.isArray(videos) || videos.length === 0) return [];
  const bestByKey = new Map();
  const order = [];
  for (const video of videos) {
    if (!video?.url || typeof video.url !== 'string' || !video.url.startsWith('http')) continue;
    const key = getTwitterMediaKey(video) || `url:${video.url.split('?')[0]}`;
    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, video);
      order.push(key);
      continue;
    }
    if (qualityScore(video) > qualityScore(prev)) bestByKey.set(key, video);
  }
  return order.map((key) => bestByKey.get(key));
}

export function countDistinctVideos(videos) {
  return collapseDistinctVideos((videos || []).filter(isPlayableVideo)).length;
}

export function sanitizeAnalysisResults(results) {
  if (!Array.isArray(results)) return [];
  return results.map((result) => {
    if (!result || !Array.isArray(result.videos)) return result;
    return { ...result, videos: collapseDistinctVideos(result.videos) };
  });
}
