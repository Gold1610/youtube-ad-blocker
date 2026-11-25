(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const api = factory();
    root.TubeShieldPopup = api;
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof chrome !== 'undefined' && root.TubeShieldSettings) {
        const controller = api.createPopupController({
          doc: document,
          chromeApi: chrome,
          settingsLib: root.TubeShieldSettings
        });
        void controller.init();
      }
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function formatNumber(val) {
    return new Intl.NumberFormat('vi-VN').format(val || 0);
  }

  function isYouTubeTabUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    return /^https:\/\/([a-z0-9-]+\.)?(youtube\.com|youtube-nocookie\.com)\//i.test(url);
  }

  function createPopupController({ doc, chromeApi, settingsLib }) {
    let settings = settingsLib.getDefaultSettings();
    let activeChannel = null;

    const els = {
      statusBadge: doc.getElementById('statusBadge'),
      statusText: doc.getElementById('statusText'),
      masterToggle: doc.getElementById('masterToggle'),
      totalBlocked: doc.getElementById('totalBlocked'),
      videoBlocked: doc.getElementById('videoBlocked'),
      feedBlocked: doc.getElementById('feedBlocked'),
      channelName: doc.getElementById('channelName'),
      channelHint: doc.getElementById('channelHint'),
      channelActionBtn: doc.getElementById('channelActionBtn'),
      toggleVideoAds: doc.getElementById('toggleVideoAds'),
      toggleAutoSkip: doc.getElementById('toggleAutoSkip'),
      toggleFeedAds: doc.getElementById('toggleFeedAds'),
      toggleDnr: doc.getElementById('toggleDnr'),
      resetStatsBtn: doc.getElementById('resetStatsBtn')
    };

    function render() {
      const channelKey = activeChannel ? activeChannel.key : null;
      const whitelisted = Boolean(channelKey && settingsLib.isChannelWhitelisted(settings, channelKey));

      if (!settings.enabled) {
        els.statusBadge.dataset.state = 'paused';
        els.statusText.textContent = 'Đã tạm dừng toàn bộ';
      } else if (whitelisted) {
        els.statusBadge.dataset.state = 'whitelisted';
        els.statusText.textContent = 'Đang bỏ qua kênh này';
      } else {
        els.statusBadge.dataset.state = 'active';
        els.statusText.textContent = 'Đang bảo vệ YouTube';
      }

      els.masterToggle.checked = settings.enabled;
      els.toggleVideoAds.checked = settings.blockVideoAds;
      els.toggleAutoSkip.checked = settings.autoSkipAds;
      els.toggleFeedAds.checked = settings.hideFeedAds;
      els.toggleDnr.checked = settings.enableDnr;

      els.totalBlocked.textContent = formatNumber(settings.stats.totalBlocked);
      els.videoBlocked.textContent = formatNumber(settings.stats.videoAdsBlocked);
      els.feedBlocked.textContent = formatNumber(settings.stats.feedAdsHidden);

      if (activeChannel) {
        els.channelName.textContent = activeChannel.name;
        els.channelActionBtn.disabled = false;
        els.channelActionBtn.classList.toggle('is-whitelisted', whitelisted);
        if (whitelisted) {
          els.channelActionBtn.textContent = 'Bật lại kênh này';
          els.channelHint.textContent = 'Quảng cáo được giữ nguyên trên kênh này.';
        } else {
          els.channelActionBtn.textContent = 'Tạm dừng kênh này';
          els.channelHint.textContent = 'Thêm vào danh sách ngoại lệ nếu muốn ủng hộ kênh.';
        }
      } else {
        els.channelName.textContent = 'Chưa mở kênh YouTube';
        els.channelHint.textContent = 'Mở video YouTube để bật/tắt riêng.';
        els.channelActionBtn.disabled = true;
        els.channelActionBtn.classList.remove('is-whitelisted');
        els.channelActionBtn.textContent = 'Tạm dừng kênh này';
      }
    }

    async function savePatch(patch) {
      settings = settingsLib.sanitizeSettings({ ...settings, ...patch });
      await chromeApi.storage.local.set(patch);
      render();
    }

    function bindEvents() {
      const toggleBindings = [
        [els.masterToggle, 'enabled'],
        [els.toggleVideoAds, 'blockVideoAds'],
        [els.toggleAutoSkip, 'autoSkipAds'],
        [els.toggleFeedAds, 'hideFeedAds'],
        [els.toggleDnr, 'enableDnr']
      ];

      for (const [input, key] of toggleBindings) {
        input.addEventListener('change', () => savePatch({ [key]: Boolean(input.checked) }));
      }

      els.channelActionBtn.addEventListener('click', async () => {
        if (!activeChannel) return;
        const updated = settingsLib.toggleChannelWhitelist(settings, activeChannel.key);
        await savePatch({ whitelistedChannels: updated.whitelistedChannels });
      });

      els.resetStatsBtn.addEventListener('click', async () => {
        const res = await chromeApi.runtime.sendMessage({ type: 'TUBESHIELD_RESET_STATS' });
        if (res && res.ok) {
          settings = settingsLib.sanitizeSettings({ ...settings, stats: res.stats });
          render();
        }
      });
    }

    async function loadActiveChannel() {
      try {
        const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
        const tab = tabs && tabs[0];
        if (!tab || !isYouTubeTabUrl(tab.url)) {
          activeChannel = null;
          return;
        }
        const ctx = await chromeApi.tabs.sendMessage(tab.id, { type: 'TUBESHIELD_GET_PAGE_CONTEXT' });
        activeChannel = ctx && ctx.channel ? ctx.channel : null;
      } catch {
        activeChannel = null;
      }
    }

    async function init() {
      bindEvents();
      const stored = await chromeApi.storage.local.get(null);
      settings = settingsLib.sanitizeSettings(stored);
      await loadActiveChannel();
      render();
    }

    return {
      init,
      render
    };
  }

  return {
    createPopupController
  };
});
