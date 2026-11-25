(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/settings.js'));
  } else {
    root.TubeShieldChannelDetector = factory(root.TubeShieldSettings);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (settingsLib) {
  'use strict';

  const CHANNEL_LINK_SELECTORS = [
    'ytd-watch-metadata #channel-name a',
    'ytd-video-owner-renderer #channel-name a',
    '#upload-info #channel-name a',
    'ytm-slim-owner-renderer a'
  ];

  function detectCurrentChannel(doc, loc) {
    if (!doc) return null;

    for (const selector of CHANNEL_LINK_SELECTORS) {
      const anchor = doc.querySelector(selector);
      if (anchor) {
        const href = anchor.getAttribute('href') || '';
        const name = (anchor.textContent || '').trim();
        const key = settingsLib.normalizeChannelKey(href || name);
        if (key) {
          return { key, name: name || key };
        }
      }
    }

    if (loc && typeof loc.pathname === 'string') {
      if (/^\/(@[^/]+|channel\/[^/]+)/.test(loc.pathname)) {
        const key = settingsLib.normalizeChannelKey(loc.pathname);
        if (key) {
          const titleEl = doc.querySelector('ytd-channel-name #text, #channel-header #text');
          const name = titleEl ? (titleEl.textContent || '').trim() : key;
          return { key, name: name || key };
        }
      }
    }

    return null;
  }

  return {
    detectCurrentChannel
  };
});
