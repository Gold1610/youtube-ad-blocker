const test = require('node:test');
const assert = require('node:assert/strict');

const settingsLib = require('../src/shared/settings.js');

test('getDefaultSettings returns fresh default config with zeroed stats', () => {
  const first = settingsLib.getDefaultSettings();
  const second = settingsLib.getDefaultSettings();

  assert.deepEqual(first, {
    enabled: true,
    blockVideoAds: true,
    hideFeedAds: true,
    enableDnr: false,
    autoSkipAds: true,
    whitelistedChannels: [],
    stats: {
      totalBlocked: 0,
      videoAdsBlocked: 0,
      feedAdsHidden: 0
    }
  });

  first.whitelistedChannels.push('@test');
  first.stats.totalBlocked = 99;
  assert.deepEqual(second.whitelistedChannels, []);
  assert.equal(second.stats.totalBlocked, 0);
});

test('normalizeChannelKey normalizes handles, URLs, and rejects empty values', () => {
  assert.equal(settingsLib.normalizeChannelKey('  @Fireship  '), '@fireship');
  assert.equal(settingsLib.normalizeChannelKey('https://www.youtube.com/@Veritasium/videos'), '@veritasium');
  assert.equal(settingsLib.normalizeChannelKey('/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw'), 'channel:uc_x5xg1ov2p6uzz5fsm9ttw');
  assert.equal(settingsLib.normalizeChannelKey('  '), null);
  assert.equal(settingsLib.normalizeChannelKey(null), null);
  assert.equal(settingsLib.normalizeChannelKey(123), null);
});

test('toggleChannelWhitelist adds and removes channels immutably', () => {
  const initial = settingsLib.getDefaultSettings();
  const added = settingsLib.toggleChannelWhitelist(initial, '@Fireship');

  assert.deepEqual(initial.whitelistedChannels, []);
  assert.deepEqual(added.whitelistedChannels, ['@fireship']);
  assert.equal(settingsLib.isSiteActive(added, '@Fireship'), false);
  assert.equal(settingsLib.isSiteActive(added, '@OtherChannel'), true);

  const removed = settingsLib.toggleChannelWhitelist(added, 'https://www.youtube.com/@fireship');
  assert.deepEqual(added.whitelistedChannels, ['@fireship']);
  assert.deepEqual(removed.whitelistedChannels, []);
  assert.equal(settingsLib.isSiteActive(removed, '@Fireship'), true);
});

test('isSiteActive returns false globally when enabled is false', () => {
  const paused = { ...settingsLib.getDefaultSettings(), enabled: false };
  assert.equal(settingsLib.isSiteActive(paused, '@AnyChannel'), false);
  assert.equal(settingsLib.isSiteActive(paused, null), false);
});

test('sanitizeSettings recovers safely from malformed or polluted storage data', () => {
  const polluted = JSON.parse(
    '{"enabled":"yes","blockVideoAds":false,"enableDnr":0,"whitelistedChannels":["  @Demo ", "", 42, "__proto__"],"stats":{"totalBlocked":-5,"videoAdsBlocked":12,"feedAdsHidden":"bad"}}'
  );

  const clean = settingsLib.sanitizeSettings(polluted);

  assert.equal(clean.enabled, true);
  assert.equal(clean.blockVideoAds, false);
  assert.equal(clean.hideFeedAds, true);
  assert.equal(clean.enableDnr, false);
  assert.deepEqual(clean.whitelistedChannels, ['@demo', '__proto__']);
  assert.equal(clean.stats.totalBlocked, 0);
  assert.equal(clean.stats.videoAdsBlocked, 12);
  assert.equal(clean.stats.feedAdsHidden, 0);
});

test('incrementStats increments target bucket immutably and rejects invalid counts', () => {
  const initial = { totalBlocked: 4, videoAdsBlocked: 3, feedAdsHidden: 1 };
  const nextVideo = settingsLib.incrementStats(initial, 'video', 2);

  assert.deepEqual(initial, { totalBlocked: 4, videoAdsBlocked: 3, feedAdsHidden: 1 });
  assert.deepEqual(nextVideo, { totalBlocked: 6, videoAdsBlocked: 5, feedAdsHidden: 1 });

  const nextFeed = settingsLib.incrementStats(nextVideo, 'feed', 3);
  assert.deepEqual(nextFeed, { totalBlocked: 9, videoAdsBlocked: 5, feedAdsHidden: 4 });

  const ignored = settingsLib.incrementStats(nextFeed, 'video', -2);
  assert.deepEqual(ignored, nextFeed);

  const capped = settingsLib.incrementStats(nextFeed, 'feed', 9999);
  assert.deepEqual(capped, nextFeed);
});
