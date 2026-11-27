(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TubeShieldAdPruner = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_DEPTH = 14;
  const YOUTUBE_API_PATH_RE = /^\/youtubei\/v1\/(player|next|browse|search|reel\/reel_watch_sequence)\b/;

  const AD_PLAYER_KEYS = new Set([
    'adPlacements',
    'playerAds',
    'adSlots',
    'adBreakHeartbeatParams',
    'enforcementMessageViewModel'
  ]);

  const AD_RENDERER_KEYS = new Set([
    'adSlotRenderer',
    'promotedSparklesWebRenderer',
    'promotedSparklesTextSearchRenderer',
    'displayAdRenderer',
    'bannerPromoRenderer',
    'statementBannerRenderer',
    'mealbarPromoRenderer',
    'inFeedAdLayoutRenderer',
    'searchPyvRenderer',
    'brandVideoSingletonRenderer',
    'companionAdRenderer',
    'actionCompanionAdRenderer',
    'promotedVideoRenderer'
  ]);

  function isYouTubeHost(hostname) {
    if (!hostname) return false;
    const lower = hostname.toLowerCase();
    return (
      lower === 'youtube.com' ||
      lower.endsWith('.youtube.com') ||
      lower === 'youtube-nocookie.com' ||
      lower.endsWith('.youtube-nocookie.com')
    );
  }

  function isYouTubeApiUrl(input) {
    let rawUrl = null;
    if (typeof input === 'string') {
      rawUrl = input;
    } else if (input && typeof input.url === 'string') {
      rawUrl = input.url;
    }

    if (!rawUrl) return false;

    try {
      const parsed = new URL(rawUrl, 'https://www.youtube.com');
      if (!isYouTubeHost(parsed.hostname)) return false;
      return YOUTUBE_API_PATH_RE.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function hasNonEmptyAdValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined;
  }

  function prunePlayerNode(node, depth, seen) {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) {
      return { data: node, removedCount: 0 };
    }
    if (seen.has(node)) {
      return { data: node, removedCount: 0 };
    }
    seen.add(node);

    if (Array.isArray(node)) {
      let removedCount = 0;
      let changed = false;
      const next = node.map((item) => {
        const res = prunePlayerNode(item, depth + 1, seen);
        if (res.data !== item) changed = true;
        removedCount += res.removedCount;
        return res.data;
      });
      return { data: changed ? next : node, removedCount };
    }

    let removedCount = 0;
    let changed = false;
    const copy = {};

    for (const key of Object.keys(node)) {
      if (AD_PLAYER_KEYS.has(key)) {
        changed = true;
        if (hasNonEmptyAdValue(node[key])) {
          removedCount += 1;
        }
        continue;
      }

      const child = prunePlayerNode(node[key], depth + 1, seen);
      if (child.data !== node[key]) changed = true;
      removedCount += child.removedCount;
      copy[key] = child.data;
    }

    return { data: changed ? copy : node, removedCount };
  }

  function prunePlayerPayload(payload, options) {
    if (!options || !options.pruneVideoAds || !payload || typeof payload !== 'object') {
      return { data: payload, removedCount: 0 };
    }
    return prunePlayerNode(payload, 0, new WeakSet());
  }

  function isDirectAdObject(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;

    for (const key of Object.keys(item)) {
      if (AD_RENDERER_KEYS.has(key)) return true;
    }

    const richContent = item.richItemRenderer && item.richItemRenderer.content;
    if (richContent && typeof richContent === 'object') {
      for (const key of Object.keys(richContent)) {
        if (AD_RENDERER_KEYS.has(key)) return true;
      }
    }

    return false;
  }

  function pruneFeedNode(node, depth, seen) {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) {
      return { data: node, removedCount: 0 };
    }
    if (seen.has(node)) {
      return { data: node, removedCount: 0 };
    }
    seen.add(node);

    if (Array.isArray(node)) {
      let removedCount = 0;
      let changed = false;
      const next = [];

      for (const item of node) {
        if (isDirectAdObject(item)) {
          changed = true;
          removedCount += 1;
          continue;
        }
        const res = pruneFeedNode(item, depth + 1, seen);
        if (res.data !== item) changed = true;
        removedCount += res.removedCount;
        next.push(res.data);
      }

      return { data: changed ? next : node, removedCount };
    }

    let removedCount = 0;
    let changed = false;
    const copy = {};

    for (const key of Object.keys(node)) {
      if (AD_RENDERER_KEYS.has(key)) {
        changed = true;
        removedCount += 1;
        continue;
      }

      const child = pruneFeedNode(node[key], depth + 1, seen);
      if (child.data !== node[key]) changed = true;
      removedCount += child.removedCount;
      copy[key] = child.data;
    }

    return { data: changed ? copy : node, removedCount };
  }

  function pruneFeedPayload(payload, options) {
    if (!options || !options.pruneFeedAds || !payload || typeof payload !== 'object') {
      return { data: payload, removedCount: 0 };
    }
    return pruneFeedNode(payload, 0, new WeakSet());
  }

  return {
    isYouTubeApiUrl,
    prunePlayerPayload,
    pruneFeedPayload
  };
});
