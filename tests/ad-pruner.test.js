const test = require('node:test');
const assert = require('node:assert/strict');

const adPruner = require('../src/shared/ad-pruner.js');

test('isYouTubeApiUrl matches YouTube internal API endpoints and rejects non-YouTube hosts', () => {
  assert.equal(adPruner.isYouTubeApiUrl('/youtubei/v1/player?key=abc'), true);
  assert.equal(adPruner.isYouTubeApiUrl('https://www.youtube.com/youtubei/v1/next?prettyPrint=false'), true);
  assert.equal(adPruner.isYouTubeApiUrl('https://music.youtube.com/youtubei/v1/browse'), true);
  assert.equal(adPruner.isYouTubeApiUrl('https://m.youtube.com/youtubei/v1/search'), true);
  assert.equal(adPruner.isYouTubeApiUrl('https://www.youtube.com/youtubei/v1/reel/reel_watch_sequence'), true);

  assert.equal(adPruner.isYouTubeApiUrl('https://www.youtube.com/youtubei/v1/log_event'), false);
  assert.equal(adPruner.isYouTubeApiUrl('https://evil.example/youtubei/v1/player'), false);
  assert.equal(adPruner.isYouTubeApiUrl('/watch?v=12345'), false);
  assert.equal(adPruner.isYouTubeApiUrl(null), false);
});

test('prunePlayerPayload strips ad fields immutably while keeping real video metadata', () => {
  const original = {
    videoDetails: { videoId: 'dQw4w9WgXcQ', title: 'Sample Video' },
    streamingData: { formats: [{ itag: 18 }] },
    playabilityStatus: { status: 'OK' },
    adPlacements: [{ adPlacementRenderer: { config: {} } }, { adPlacementRenderer: { config: {} } }],
    playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
    adSlots: [{ adSlotRenderer: {} }],
    adBreakHeartbeatParams: 'heartbeat-token',
    playerResponse: {
      adPlacements: [{ adPlacementRenderer: {} }],
      videoDetails: { videoId: 'nested' }
    }
  };

  const snapshot = JSON.stringify(original);
  const result = adPruner.prunePlayerPayload(original, { pruneVideoAds: true });

  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(result.removedCount, 5);
  assert.equal('adPlacements' in result.data, false);
  assert.equal('playerAds' in result.data, false);
  assert.equal('adSlots' in result.data, false);
  assert.equal('adBreakHeartbeatParams' in result.data, false);
  assert.equal('adPlacements' in result.data.playerResponse, false);
  assert.deepEqual(result.data.videoDetails, { videoId: 'dQw4w9WgXcQ', title: 'Sample Video' });
  assert.deepEqual(result.data.streamingData, { formats: [{ itag: 18 }] });
  assert.deepEqual(result.data.playabilityStatus, { status: 'OK' });
});

test('prunePlayerPayload respects pruneVideoAds false option and handles empty inputs', () => {
  const payload = { adPlacements: [{ id: 1 }], videoDetails: { videoId: '1' } };
  const skipped = adPruner.prunePlayerPayload(payload, { pruneVideoAds: false });

  assert.equal(skipped.removedCount, 0);
  assert.equal(skipped.data.adPlacements.length, 1);

  assert.deepEqual(adPruner.prunePlayerPayload(null, { pruneVideoAds: true }), { data: null, removedCount: 0 });
  assert.deepEqual(adPruner.prunePlayerPayload({ videoDetails: { videoId: 'ok' } }, { pruneVideoAds: true }), {
    data: { videoDetails: { videoId: 'ok' } },
    removedCount: 0
  });
});

test('pruneFeedPayload removes promoted and ad-slot renderers from nested feeds immutably', () => {
  const feed = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                richGridRenderer: {
                  contents: [
                    { richItemRenderer: { content: { adSlotRenderer: { adSlotMetadata: {} } } } },
                    { richItemRenderer: { content: { videoRenderer: { videoId: 'real-1' } } } },
                    { promotedSparklesWebRenderer: { title: 'Buy now' } },
                    { inFeedAdLayoutRenderer: { ad: true } },
                    { richItemRenderer: { content: { videoRenderer: { videoId: 'real-2' } } } }
                  ]
                }
              }
            }
          }
        ]
      }
    },
    frameworkUpdates: { keep: true }
  };

  const snapshot = JSON.stringify(feed);
  const result = adPruner.pruneFeedPayload(feed, { pruneFeedAds: true });

  assert.equal(JSON.stringify(feed), snapshot);
  assert.equal(result.removedCount, 3);
  const gridItems =
    result.data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents;
  assert.equal(gridItems.length, 2);
  assert.equal(gridItems[0].richItemRenderer.content.videoRenderer.videoId, 'real-1');
  assert.equal(gridItems[1].richItemRenderer.content.videoRenderer.videoId, 'real-2');
  assert.deepEqual(result.data.frameworkUpdates, { keep: true });
});

test('pruneFeedPayload respects pruneFeedAds false option', () => {
  const feed = {
    items: [{ adSlotRenderer: {} }, { videoRenderer: { videoId: '1' } }]
  };
  const result = adPruner.pruneFeedPayload(feed, { pruneFeedAds: false });

  assert.equal(result.removedCount, 0);
  assert.equal(result.data.items.length, 2);
});
