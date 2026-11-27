(function () {
  'use strict';

  const settingsLib = globalThis.TubeShieldSettings;
  const skipperLib = globalThis.TubeShieldAdSkipper;
  const channelLib = globalThis.TubeShieldChannelDetector;

  if (!settingsLib || !skipperLib || !channelLib) return;

  const PRUNE_EVENT_NAME = 'tubeshield:ad-pruned';
  const FEED_AD_SELECTORS = [
    'ytd-ad-slot-renderer',
    'ytd-banner-promo-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-display-ad-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-statement-banner-renderer',
    'ytd-mealbar-promo-renderer',
    '#masthead-ad'
  ];

  let currentSettings = settingsLib.getDefaultSettings();
  let currentChannel = null;
  let pendingCounts = { video: 0, feed: 0 };
  let flushTimer = null;
  const countedDomElements = new WeakSet();

  function queueStat(kind, count) {
    if ((kind !== 'video' && kind !== 'feed') || !Number.isInteger(count) || count <= 0) return;
    pendingCounts[kind] += count;
    if (flushTimer) return;

    flushTimer = setTimeout(() => {
      const toSend = { ...pendingCounts };
      pendingCounts = { video: 0, feed: 0 };
      flushTimer = null;

      for (const bucket of ['video', 'feed']) {
        if (toSend[bucket] > 0) {
          try {
            chrome.runtime.sendMessage(
              {
                type: 'TUBESHIELD_INCREMENT_STAT',
                kind: bucket,
                count: Math.min(toSend[bucket], 100)
              },
              () => void chrome.runtime.lastError
            );
          } catch {
            // Extension context invalidated on update/reload
          }
        }
      }
    }, 600);
  }

  const skipper = new skipperLib.AdSkipperController({
    onAdHandled(count) {
      queueStat('video', count);
    }
  });

  function isActiveForPage() {
    const channelKey = currentChannel ? currentChannel.key : null;
    return settingsLib.isSiteActive(currentSettings, channelKey);
  }

  function syncDomDataset() {
    const root = document.documentElement;
    if (!root) return;

    const active = isActiveForPage();
    root.dataset.tubeShieldActive = active ? '1' : '0';
    root.dataset.tubeShieldBlockVideo = active && currentSettings.blockVideoAds ? '1' : '0';
    root.dataset.tubeShieldHideFeed = active && currentSettings.hideFeedAds ? '1' : '0';
  }

  function countNewlyHiddenFeedAds() {
    if (!isActiveForPage() || !currentSettings.hideFeedAds || !document.body) return;
    let newlyFound = 0;
    for (const selector of FEED_AD_SELECTORS) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!countedDomElements.has(node)) {
          countedDomElements.add(node);
          newlyFound += 1;
        }
      }
    }
    if (newlyFound > 0) {
      queueStat('feed', newlyFound);
    }
  }

  function isEditableTarget(target) {
    if (!target || typeof target.tagName !== 'string') return false;
    const tag = target.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target.isContentEditable);
  }

  function handleUserToggleIntent() {
    const video = document.querySelector('video.html5-main-video, .html5-video-player video');
    if (!video) return;
    if (!video.paused) {
      skipper.markUserPaused();
    } else {
      skipper.clearUserPaused();
    }
  }

  function runSkipperPass() {
    currentChannel = channelLib.detectCurrentChannel(document, window.location);
    syncDomDataset();
    skipper.tick(document, {
      active: isActiveForPage(),
      autoSkipAds: currentSettings.autoSkipAds,
      navKey: window.location.pathname + window.location.search
    });
    countNewlyHiddenFeedAds();
  }

  function loadInitialSettings() {
    try {
      chrome.storage.local.get(null, (stored) => {
        if (chrome.runtime.lastError) return;
        currentSettings = settingsLib.sanitizeSettings(stored);
        runSkipperPass();
      });
    } catch {
      // Ignore transient startup storage errors
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const nextRaw = { ...currentSettings };
    for (const key of Object.keys(changes)) {
      nextRaw[key] = changes[key].newValue;
    }
    currentSettings = settingsLib.sanitizeSettings(nextRaw);
    runSkipperPass();
  });

  window.addEventListener(PRUNE_EVENT_NAME, (event) => {
    if (!isActiveForPage()) return;
    const detail = event && event.detail;
    if (!detail || typeof detail !== 'object') return;
    if ((detail.kind === 'video' || detail.kind === 'feed') && Number.isInteger(detail.count)) {
      queueStat(detail.kind, Math.min(detail.count, 50));
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'TUBESHIELD_GET_PAGE_CONTEXT') return false;
    currentChannel = channelLib.detectCurrentChannel(document, window.location);
    sendResponse({
      channel: currentChannel,
      active: isActiveForPage(),
      isWatchPage: window.location.pathname.startsWith('/watch') || window.location.pathname.startsWith('/shorts')
    });
    return false;
  });

  let rafScheduled = false;
  function schedulePass() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      runSkipperPass();
    });
  }

  function startObservers() {
    const target = document.body || document.documentElement;
    if (!target) return;

    const observer = new MutationObserver(() => {
      schedulePass();
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.isTrusted === false) return;
      const target = event.target;
      if (target && typeof target.closest === 'function' && target.closest('.html5-video-player')) {
        handleUserToggleIntent();
      }
    },
    true
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.isTrusted === false || isEditableTarget(event.target)) return;
      if (event.code === 'Space' || event.key === ' ' || event.key === 'k' || event.key === 'K') {
        handleUserToggleIntent();
      }
    },
    true
  );

  window.addEventListener('yt-navigate-start', () => {
    skipper.syncNavigation(window.location.pathname + window.location.search);
  });
  window.addEventListener('yt-navigate-finish', runSkipperPass);
  window.addEventListener('yt-page-data-updated', runSkipperPass);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      startObservers();
      runSkipperPass();
    });
  } else {
    startObservers();
  }

  setInterval(() => {
    if (document.visibilityState === 'visible') {
      runSkipperPass();
    }
  }, 450);

  loadInitialSettings();
  syncDomDataset();
})();
