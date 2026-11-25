importScripts('../shared/settings.js');

const settingsLib = globalThis.TubeShieldSettings;
const RULESET_ID = 'youtube_ads_ruleset';

function formatBadgeCount(count) {
  if (!count || count <= 0) return '';
  if (count >= 10000) return `${Math.floor(count / 1000)}k`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(count);
}

async function getStoredSettings() {
  const raw = await chrome.storage.local.get(null);
  return settingsLib.sanitizeSettings(raw);
}

async function syncDnrRuleset(settings) {
  const shouldEnable = Boolean(settings.enabled && settings.enableDnr);
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: shouldEnable ? [RULESET_ID] : [],
      disableRulesetIds: shouldEnable ? [] : [RULESET_ID]
    });
  } catch {
    // Ruleset API unavailable or unchanged
  }
}

async function syncBadge(settings) {
  try {
    await chrome.action.setBadgeBackgroundColor({
      color: settings.enabled ? '#dc2626' : '#6b7280'
    });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    await chrome.action.setBadgeText({
      text: settings.enabled ? formatBadgeCount(settings.stats.totalBlocked) : 'OFF'
    });
  } catch {
    // Ignore action API transient errors
  }
}

async function initializeExtension() {
  const current = await getStoredSettings();
  await chrome.storage.local.set(current);
  await Promise.all([syncDnrRuleset(current), syncBadge(current)]);
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    const current = await getStoredSettings();
    await Promise.all([syncDnrRuleset(current), syncBadge(current)]);
  })();
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== 'local') return;
  void (async () => {
    const current = await getStoredSettings();
    await Promise.all([syncDnrRuleset(current), syncBadge(current)]);
  })();
});

let statQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'TUBESHIELD_INCREMENT_STAT') {
    const senderUrl = sender && sender.tab && sender.tab.url ? sender.tab.url : '';
    if (!/^https:\/\/([a-z0-9-]+\.)?(youtube\.com|youtube-nocookie\.com)\//i.test(senderUrl)) {
      sendResponse({ ok: false });
      return false;
    }

    statQueue = statQueue.then(async () => {
      const current = await getStoredSettings();
      const nextStats = settingsLib.incrementStats(current.stats, message.kind, message.count);
      const updated = { ...current, stats: nextStats };
      await chrome.storage.local.set({ stats: nextStats });
      await syncBadge(updated);
      return nextStats;
    });

    statQueue.then(
      (stats) => sendResponse({ ok: true, stats }),
      () => sendResponse({ ok: false })
    );
    return true;
  }

  if (message.type === 'TUBESHIELD_RESET_STATS') {
    statQueue = statQueue.then(async () => {
      const emptyStats = settingsLib.getDefaultSettings().stats;
      await chrome.storage.local.set({ stats: emptyStats });
      const current = await getStoredSettings();
      await syncBadge(current);
      return emptyStats;
    });

    statQueue.then(
      (stats) => sendResponse({ ok: true, stats }),
      () => sendResponse({ ok: false })
    );
    return true;
  }

  return false;
});
