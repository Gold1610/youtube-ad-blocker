const test = require('node:test');
const assert = require('node:assert/strict');

const { AdSkipperController } = require('../src/content/ad-skipper.js');

function createFakeEnvironment({
  adShowing = false,
  adInterrupting = false,
  muted = false,
  volume = 0.75,
  playbackRate = 1,
  currentTime = 0,
  duration = 30,
  skipButtons = [],
  overlayCloseButtons = []
} = {}) {
  const classes = new Set();
  if (adShowing) classes.add('ad-showing');
  if (adInterrupting) classes.add('ad-interrupting');

  const video = {
    muted,
    volume,
    playbackRate,
    currentTime,
    duration,
    paused: false,
    playCalls: 0,
    play() {
      this.playCalls += 1;
      return Promise.resolve();
    }
  };

  const player = {
    classList: {
      contains(name) {
        return classes.has(name);
      }
    },
    setAdState(showing, interrupting = false) {
      classes.clear();
      if (showing) classes.add('ad-showing');
      if (interrupting) classes.add('ad-interrupting');
    }
  };

  const doc = {
    querySelector(selector) {
      if (selector === '.html5-video-player') return player;
      if (selector === 'video.html5-main-video, .html5-video-player video') return video;
      for (const btn of skipButtons) {
        if (btn.matches(selector)) return btn;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('overlay-close')) return overlayCloseButtons;
      return skipButtons.filter((btn) => btn.matches(selector));
    }
  };

  return { doc, player, video };
}

function makeButton(selectorMatch, visible = true) {
  return {
    clicks: 0,
    offsetParent: visible ? {} : null,
    disabled: false,
    matches(sel) {
      return sel.includes(selectorMatch);
    },
    click() {
      this.clicks += 1;
    }
  };
}

test('AdSkipperController mutes, fast-forwards, clicks skip, counts once per ad, and restores prior audio', () => {
  const skipBtn = makeButton('ytp-skip-ad-button', true);
  const { doc, player, video } = createFakeEnvironment({
    adShowing: true,
    muted: false,
    volume: 0.75,
    duration: 15,
    skipButtons: [skipBtn]
  });

  let blockedCalls = 0;
  const controller = new AdSkipperController({
    onAdHandled: () => {
      blockedCalls += 1;
    }
  });

  controller.tick(doc, { active: true, autoSkipAds: true });
  controller.tick(doc, { active: true, autoSkipAds: true });

  assert.equal(video.muted, true);
  assert.equal(video.playbackRate, 16);
  assert.equal(video.currentTime, 14.9);
  assert.equal(skipBtn.clicks, 2);
  assert.equal(blockedCalls, 1);

  player.setAdState(false, false);
  controller.tick(doc, { active: true, autoSkipAds: true });

  assert.equal(video.muted, false);
  assert.equal(video.volume, 0.75);
  assert.equal(video.playbackRate, 1);
});

test('AdSkipperController preserves user-muted state across ad transitions', () => {
  const { doc, player, video } = createFakeEnvironment({
    adShowing: true,
    muted: true,
    volume: 0.35,
    duration: Number.NaN
  });

  const controller = new AdSkipperController();
  controller.tick(doc, { active: true, autoSkipAds: true });

  assert.equal(Number.isNaN(video.currentTime), false);
  assert.equal(video.currentTime, 0);
  assert.equal(video.playbackRate, 16);

  player.setAdState(false, false);
  controller.tick(doc, { active: true, autoSkipAds: true });

  assert.equal(video.muted, true);
  assert.equal(video.volume, 0.35);
  assert.equal(video.playbackRate, 1);
});

test('AdSkipperController counts a new ad after the previous ad ends', () => {
  const { doc, player } = createFakeEnvironment({ adShowing: true, duration: 10 });
  let count = 0;
  const controller = new AdSkipperController({
    onAdHandled: () => {
      count += 1;
    }
  });

  controller.tick(doc, { active: true, autoSkipAds: true });
  player.setAdState(false);
  controller.tick(doc, { active: true, autoSkipAds: true });
  player.setAdState(true);
  controller.tick(doc, { active: true, autoSkipAds: true });

  assert.equal(count, 2);
});

test('AdSkipperController closes overlay ad banners even during normal playback', () => {
  const closeBtn = makeButton('overlay-close', true);
  const { doc } = createFakeEnvironment({
    adShowing: false,
    overlayCloseButtons: [closeBtn]
  });

  let count = 0;
  const controller = new AdSkipperController({
    onAdHandled: () => {
      count += 1;
    }
  });

  controller.tick(doc, { active: true, autoSkipAds: true });
  assert.equal(closeBtn.clicks, 1);
  assert.equal(count, 1);
});

test('AdSkipperController restores playback and stops intervening when paused or disabled', () => {
  const skipBtn = makeButton('ytp-skip-ad-button', true);
  const { doc, video } = createFakeEnvironment({
    adShowing: true,
    muted: false,
    volume: 0.8,
    duration: 20,
    skipButtons: [skipBtn]
  });

  const controller = new AdSkipperController();
  controller.tick(doc, { active: true, autoSkipAds: true });
  assert.equal(video.muted, true);
  assert.equal(video.playbackRate, 16);

  controller.tick(doc, { active: false, autoSkipAds: true });
  assert.equal(video.muted, false);
  assert.equal(video.volume, 0.8);
  assert.equal(video.playbackRate, 1);
  assert.equal(skipBtn.clicks, 1);
});
