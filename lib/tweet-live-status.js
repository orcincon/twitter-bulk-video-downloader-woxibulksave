import { fetchFixTweetResponse, fetchFixTweetUser } from '@/lib/fixtweet.js';
import { extractTweetId, extractTweetScreenName } from '@/lib/tweet-url.js';

function fxCode(httpStatus, data) {
  if (typeof data?.code === 'number') return data.code;
  return httpStatus;
}

function fxMessage(data) {
  return String(data?.message || data?.error || '').toUpperCase().replace(/[_-]+/g, ' ');
}

function hasTweet(data) {
  return Boolean(data?.tweet && (data.tweet.id || data.tweet.url || data.tweet.author));
}

function hasUser(data) {
  return Boolean(data?.user && (data.user.id || data.user.screen_name));
}

/**
 * FixTweet/FxEmbed ile gönderinin ve (mümkünse) hesabın hâlâ durup durmadığını kontrol eder.
 * Ağ hatasında asla "silindi" demez.
 */
export async function checkTweetLiveStatus(tweetUrl, { username } = {}) {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    return { tweetId: null, status: 'invalid', label: 'Geçersiz link' };
  }

  const tweetRes = await fetchFixTweetResponse(tweetUrl);
  const tweetCode = fxCode(tweetRes.httpStatus, tweetRes.data);
  const tweetMsg = fxMessage(tweetRes.data);

  if (tweetRes.httpStatus === 0 && !tweetRes.data) {
    return { tweetId, status: 'unknown', label: 'Kontrol edilemedi' };
  }

  if (hasTweet(tweetRes.data) && (tweetRes.ok || tweetCode === 200)) {
    return { tweetId, status: 'ok', label: 'Aktif' };
  }

  if (tweetCode === 401 || tweetMsg.includes('PRIVATE') || tweetMsg.includes('PROTECTED')) {
    return { tweetId, status: 'private', label: 'Gizli' };
  }

  if (tweetCode === 403 || tweetMsg.includes('SUSPEND')) {
    return { tweetId, status: 'suspended', label: 'Hesap askıda' };
  }

  const screenName =
    extractTweetScreenName(tweetUrl) ||
    String(username || '')
      .trim()
      .replace(/^@+/, '');

  if (!screenName) {
    if (tweetCode === 404 || tweetMsg.includes('NOT FOUND')) {
      return { tweetId, status: 'missing', label: 'Gönderi yok' };
    }
    return { tweetId, status: 'unknown', label: 'Kontrol edilemedi' };
  }

  const userRes = await fetchFixTweetUser(screenName);
  const userCode = fxCode(userRes.httpStatus, userRes.data);
  const userMsg = fxMessage(userRes.data);

  if (userRes.httpStatus === 0 && !userRes.data) {
    return { tweetId, status: 'unknown', label: 'Kontrol edilemedi' };
  }

  if (userCode === 403 || userMsg.includes('SUSPEND')) {
    return { tweetId, status: 'suspended', label: 'Hesap askıda' };
  }

  if (userCode === 401 || userMsg.includes('PRIVATE') || userMsg.includes('PROTECTED')) {
    return { tweetId, status: 'private', label: 'Gizli hesap' };
  }

  if (userCode === 404 || userMsg.includes('NOT FOUND')) {
    return { tweetId, status: 'account_deleted', label: 'Hesap yok' };
  }

  if (hasUser(userRes.data) && (userRes.ok || userCode === 200)) {
    if (tweetCode === 404 || tweetMsg.includes('NOT FOUND')) {
      return { tweetId, status: 'tweet_deleted', label: 'Gönderi silinmiş' };
    }
  }

  return { tweetId, status: 'unknown', label: 'Kontrol edilemedi' };
}

export async function checkTweetLiveStatusBatch(items, { concurrency = 4 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const results = {};
  let index = 0;

  async function worker() {
    while (index < list.length) {
      const current = list[index++];
      const url = typeof current === 'string' ? current : current?.url;
      const username = typeof current === 'string' ? '' : current?.username;
      const checked = await checkTweetLiveStatus(url, { username });
      if (checked.tweetId) results[checked.tweetId] = checked;
    }
  }

  const pool = Math.max(1, Math.min(concurrency, list.length || 1));
  await Promise.all(Array.from({ length: list.length ? pool : 0 }, () => worker()));
  return results;
}
