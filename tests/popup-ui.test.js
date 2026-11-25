const test = require('node:test');
const assert = require('node:assert/strict');

const settingsLib = require('../src/shared/settings.js');
const { createPopupController } = require('../src/popup/popup.js');

function createFakeElement(id) {
  return {
    id,
    textContent: '',
    disabled: false,
    checked: false,
    hidden: false,
    dataset: {},
    listeners: {},
    classList: {
      classes: new Set(),
      add(name) {
        this.classes.add(name);
      },
      remove(name) {
        this.classes.delete(name);
      },
      toggle(name, force) {
        if (force === undefined) {
          if (this.classes.has(name)) this.classes.delete(name);
          else this.classes.add(name);
        } else if (force) {
          this.classes.add(name);
        } else {
          this.classes.delete(name);
        }
      },
      contains(name) {
        return this.classes.has(name);
      }
    },
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    async trigger(type) {
      for (const fn of this.listeners[type] || []) {
        await fn({ target: this, currentTarget: this });
      }
    }
  };
}

function createPopupDom() {
  const ids = [
    'statusBadge',
    'statusText',
    'masterToggle',
    'totalBlocked',
    'videoBlocked',
    'feedBlocked',
    'channelSection',
    'channelName',
    'channelActionBtn',
    'channelHint',
    'toggleVideoAds',
    'toggleAutoSkip',
    'toggleFeedAds',
    'toggleDnr',
    'resetStatsBtn'
  ];
  const elements = new Map(ids.map((id) => [id, createFakeElement(id)]));
  return {
    elements,
    getElementById(id) {
      return elements.get(id) || null;
    }
  };
}

function createFakeChrome({ stored, activeTab, pageContext }) {
  let state = settingsLib.sanitizeSettings(stored);
  return {
    getState: () => state,
    storage: {
      local: {
        async get() {
          return { ...state };
        },
        async set(patch) {
          state = settingsLib.sanitizeSettings({ ...state, ...patch });
        }
      }
    },
    tabs: {
      async query() {
        return activeTab ? [activeTab] : [];
      },
      async sendMessage() {
        if (!pageContext) throw new Error('No listener');
        return pageContext;
      }
    },
    runtime: {
      async sendMessage(msg) {
        if (msg.type === 'TUBESHIELD_RESET_STATS') {
          state = { ...state, stats: settingsLib.getDefaultSettings().stats };
          return { ok: true, stats: state.stats };
        }
        return { ok: false };
      }
    }
  };
}

test('popup renders active YouTube channel, stats, and toggles channel whitelist in storage', async () => {
  const doc = createPopupDom();
  const chromeApi = createFakeChrome({
    stored: {
      enabled: true,
      stats: { totalBlocked: 14, videoAdsBlocked: 9, feedAdsHidden: 5 }
    },
    activeTab: { id: 7, url: 'https://www.youtube.com/watch?v=abc' },
    pageContext: {
      channel: { key: '@fireship', name: 'Fireship' },
      active: true,
      isWatchPage: true
    }
  });

  const controller = createPopupController({ doc, chromeApi, settingsLib });
  await controller.init();

  assert.equal(doc.getElementById('totalBlocked').textContent, '14');
  assert.equal(doc.getElementById('videoBlocked').textContent, '9');
  assert.equal(doc.getElementById('feedBlocked').textContent, '5');
  assert.equal(doc.getElementById('channelName').textContent, 'Fireship');
  assert.equal(doc.getElementById('channelActionBtn').disabled, false);
  assert.equal(doc.getElementById('statusBadge').dataset.state, 'active');

  await doc.getElementById('channelActionBtn').trigger('click');
  assert.deepEqual(chromeApi.getState().whitelistedChannels, ['@fireship']);
  assert.equal(doc.getElementById('statusBadge').dataset.state, 'whitelisted');

  await doc.getElementById('channelActionBtn').trigger('click');
  assert.deepEqual(chromeApi.getState().whitelistedChannels, []);
  assert.equal(doc.getElementById('statusBadge').dataset.state, 'active');
});

test('popup shows clear fallback on non-YouTube tabs and resets stats cleanly', async () => {
  const doc = createPopupDom();
  const chromeApi = createFakeChrome({
    stored: {
      enabled: true,
      stats: { totalBlocked: 10, videoAdsBlocked: 6, feedAdsHidden: 4 }
    },
    activeTab: { id: 9, url: 'https://example.com/' },
    pageContext: null
  });

  const controller = createPopupController({ doc, chromeApi, settingsLib });
  await controller.init();

  assert.equal(doc.getElementById('channelActionBtn').disabled, true);
  assert.equal(doc.getElementById('statusBadge').dataset.state, 'active');

  await doc.getElementById('resetStatsBtn').trigger('click');
  assert.equal(doc.getElementById('totalBlocked').textContent, '0');
  assert.equal(chromeApi.getState().stats.totalBlocked, 0);

  doc.getElementById('masterToggle').checked = false;
  await doc.getElementById('masterToggle').trigger('change');
  assert.equal(chromeApi.getState().enabled, false);
  assert.equal(doc.getElementById('statusBadge').dataset.state, 'paused');
});
