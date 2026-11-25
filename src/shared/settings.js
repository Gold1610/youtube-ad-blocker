(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TubeShieldSettings = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_WHITELIST_ENTRIES = 500;
  const MAX_CHANNEL_LENGTH = 120;
  const MAX_STAT_INCREMENT = 100;

  function getDefaultSettings() {
    return {
      enabled: true,
      blockVideoAds: true,
      hideFeedAds: true,
      enableDnr: true,
      autoSkipAds: true,
      whitelistedChannels: [],
      stats: {
        totalBlocked: 0,
        videoAdsBlocked: 0,
        feedAdsHidden: 0
      }
    };
  }

  function normalizeChannelKey(input) {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed || trimmed.length > MAX_CHANNEL_LENGTH) return null;

    let candidate = trimmed;
    if (/^https?:\/\//i.test(candidate)) {
      try {
        const parsed = new URL(candidate);
        candidate = parsed.pathname;
      } catch {
        return null;
      }
    }

    const handleMatch = candidate.match(/\/?(@[A-Za-z0-9._-]+)/);
    if (handleMatch) {
      return handleMatch[1].toLowerCase();
    }

    const channelIdMatch = candidate.match(/\/?(?:channel\/)?(UC[A-Za-z0-9_-]{6,})/i);
    if (channelIdMatch) {
      return `channel:${channelIdMatch[1].toLowerCase()}`;
    }

    return candidate.toLowerCase();
  }

  function readBool(obj, key, fallback) {
    if (!obj || !Object.prototype.hasOwnProperty.call(obj, key)) return fallback;
    return typeof obj[key] === 'boolean' ? obj[key] : fallback;
  }

  function readNonNegInt(obj, key) {
    if (!obj || !Object.prototype.hasOwnProperty.call(obj, key)) return 0;
    const num = obj[key];
    if (typeof num !== 'number' || !Number.isFinite(num) || num <= 0) return 0;
    return Math.floor(num);
  }

  function sanitizeSettings(raw) {
    const defaults = getDefaultSettings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return defaults;
    }

    const rawChannels =
      Object.prototype.hasOwnProperty.call(raw, 'whitelistedChannels') && Array.isArray(raw.whitelistedChannels)
        ? raw.whitelistedChannels
        : [];

    const dedupedChannels = [];
    const seen = new Set();
    for (const entry of rawChannels) {
      const normalized = normalizeChannelKey(entry);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        dedupedChannels.push(normalized);
        if (dedupedChannels.length >= MAX_WHITELIST_ENTRIES) break;
      }
    }

    const rawStats =
      Object.prototype.hasOwnProperty.call(raw, 'stats') && raw.stats && typeof raw.stats === 'object'
        ? raw.stats
        : {};

    return {
      enabled: readBool(raw, 'enabled', defaults.enabled),
      blockVideoAds: readBool(raw, 'blockVideoAds', defaults.blockVideoAds),
      hideFeedAds: readBool(raw, 'hideFeedAds', defaults.hideFeedAds),
      enableDnr: readBool(raw, 'enableDnr', defaults.enableDnr),
      autoSkipAds: readBool(raw, 'autoSkipAds', defaults.autoSkipAds),
      whitelistedChannels: dedupedChannels,
      stats: {
        totalBlocked: readNonNegInt(rawStats, 'totalBlocked'),
        videoAdsBlocked: readNonNegInt(rawStats, 'videoAdsBlocked'),
        feedAdsHidden: readNonNegInt(rawStats, 'feedAdsHidden')
      }
    };
  }

  function isChannelWhitelisted(settings, channelInput) {
    const clean = sanitizeSettings(settings);
    const key = normalizeChannelKey(channelInput);
    if (!key) return false;
    return clean.whitelistedChannels.includes(key);
  }

  function isSiteActive(settings, channelInput) {
    const clean = sanitizeSettings(settings);
    if (!clean.enabled) return false;
    if (!channelInput) return true;
    return !isChannelWhitelisted(clean, channelInput);
  }

  function toggleChannelWhitelist(settings, channelInput) {
    const clean = sanitizeSettings(settings);
    const key = normalizeChannelKey(channelInput);
    if (!key) return clean;

    const exists = clean.whitelistedChannels.includes(key);
    const nextChannels = exists
      ? clean.whitelistedChannels.filter((item) => item !== key)
      : [...clean.whitelistedChannels, key].slice(0, MAX_WHITELIST_ENTRIES);

    return {
      ...clean,
      whitelistedChannels: nextChannels
    };
  }

  function incrementStats(stats, kind, amount) {
    const current = {
      totalBlocked: readNonNegInt(stats, 'totalBlocked'),
      videoAdsBlocked: readNonNegInt(stats, 'videoAdsBlocked'),
      feedAdsHidden: readNonNegInt(stats, 'feedAdsHidden')
    };

    if (kind !== 'video' && kind !== 'feed') return current;
    if (typeof amount !== 'number' || !Number.isInteger(amount)) return current;
    if (amount <= 0 || amount > MAX_STAT_INCREMENT) return current;

    return {
      totalBlocked: current.totalBlocked + amount,
      videoAdsBlocked: current.videoAdsBlocked + (kind === 'video' ? amount : 0),
      feedAdsHidden: current.feedAdsHidden + (kind === 'feed' ? amount : 0)
    };
  }

  return {
    getDefaultSettings,
    normalizeChannelKey,
    sanitizeSettings,
    isChannelWhitelisted,
    isSiteActive,
    toggleChannelWhitelist,
    incrementStats
  };
});
