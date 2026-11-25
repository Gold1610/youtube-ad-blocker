(function () {
  'use strict';

  const pruner = globalThis.TubeShieldAdPruner;
  if (!pruner) return;

  // Remove temporary global immediately so page scripts cannot probe it
  try {
    delete globalThis.TubeShieldAdPruner;
  } catch {
    globalThis.TubeShieldAdPruner = undefined;
  }

  const PRUNE_EVENT_NAME = 'tubeshield:ad-pruned';

  function getConfig() {
    const ds = document.documentElement ? document.documentElement.dataset : null;
    if (!ds) {
      return { active: true, pruneVideoAds: true, pruneFeedAds: true };
    }
    return {
      active: ds.tubeShieldActive !== '0',
      pruneVideoAds: ds.tubeShieldBlockVideo !== '0',
      pruneFeedAds: ds.tubeShieldHideFeed !== '0'
    };
  }

  function emitPruned(kind, count) {
    if (!count || count <= 0) return;
    try {
      window.dispatchEvent(
        new CustomEvent(PRUNE_EVENT_NAME, {
          detail: { kind, count }
        })
      );
    } catch {
      // Ignore event dispatch failures
    }
  }

  function pruneJsonPayload(payload, url) {
    const cfg = getConfig();
    if (!cfg.active || !payload || typeof payload !== 'object') {
      return payload;
    }

    let result = payload;
    if (cfg.pruneVideoAds) {
      const playerRes = pruner.prunePlayerPayload(result, { pruneVideoAds: true });
      result = playerRes.data;
      if (playerRes.removedCount > 0) {
        emitPruned('video', playerRes.removedCount);
      }
    }

    const shouldPruneFeed =
      cfg.pruneFeedAds && (!url || /\/youtubei\/v1\/(next|browse|search|reel\/reel_watch_sequence)\b/.test(url));
    if (shouldPruneFeed) {
      const feedRes = pruner.pruneFeedPayload(result, { pruneFeedAds: true });
      result = feedRes.data;
      if (feedRes.removedCount > 0) {
        emitPruned('feed', feedRes.removedCount);
      }
    }

    return result;
  }

  function defineInitialTrap(propName) {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, propName);
      if (desc && desc.configurable === false) return;

      let internalValue = desc && 'value' in desc ? pruneJsonPayload(desc.value) : undefined;
      Object.defineProperty(window, propName, {
        configurable: true,
        enumerable: true,
        get() {
          return internalValue;
        },
        set(nextValue) {
          internalValue = pruneJsonPayload(nextValue);
        }
      });
    } catch {
      // Fail open to avoid breaking YouTube hydration
    }
  }

  defineInitialTrap('ytInitialPlayerResponse');
  defineInitialTrap('ytInitialData');

  function wrapFetchResponse(response, url) {
    if (!response || typeof response.json !== 'function') return response;

    const origJson = response.json.bind(response);
    const origText = response.text.bind(response);
    const origClone = response.clone.bind(response);

    let cachedPrunedPromise = null;
    function getPrunedData() {
      if (!cachedPrunedPromise) {
        cachedPrunedPromise = origJson().then((data) => pruneJsonPayload(data, url));
      }
      return cachedPrunedPromise;
    }

    try {
      Object.defineProperties(response, {
        json: {
          configurable: true,
          value: () => getPrunedData().catch(() => origJson())
        },
        text: {
          configurable: true,
          value: () =>
            getPrunedData()
              .then((data) => JSON.stringify(data))
              .catch(() => origText())
        },
        clone: {
          configurable: true,
          value: () => wrapFetchResponse(origClone(), url)
        }
      });
    } catch {
      // Return original response if property definition is disallowed
    }

    return response;
  }

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function wrappedFetch(input, init) {
      const requestUrl = typeof input === 'string' ? input : input && input.url ? input.url : '';
      const cfg = getConfig();
      const shouldIntercept = cfg.active && pruner.isYouTubeApiUrl(requestUrl);

      const fetchPromise = origFetch.apply(this, arguments);
      if (!shouldIntercept) {
        return fetchPromise;
      }

      return fetchPromise.then((response) => {
        if (!response || !response.ok) return response;
        return wrapFetchResponse(response, requestUrl);
      });
    };
  }

  const origXhrOpen = XMLHttpRequest.prototype.open;
  const responseTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
  const responseDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');

  if (origXhrOpen && responseTextDesc && responseTextDesc.get && responseDesc && responseDesc.get) {
    const xhrUrls = new WeakMap();
    const xhrCache = new WeakMap();

    XMLHttpRequest.prototype.open = function wrappedOpen(method, url) {
      if (typeof url === 'string' && pruner.isYouTubeApiUrl(url)) {
        xhrUrls.set(this, url);
      } else {
        xhrUrls.delete(this);
      }
      xhrCache.delete(this);
      return origXhrOpen.apply(this, arguments);
    };

    function getPrunedXhrPayload(xhr, rawText) {
      if (xhrCache.has(xhr)) return xhrCache.get(xhr);
      const url = xhrUrls.get(xhr);
      if (!url || !getConfig().active) return null;

      try {
        const parsed = JSON.parse(rawText);
        const pruned = pruneJsonPayload(parsed, url);
        const result = { parsed: pruned, text: JSON.stringify(pruned) };
        xhrCache.set(xhr, result);
        return result;
      } catch {
        return null;
      }
    }

    Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
      configurable: true,
      get() {
        const raw = responseTextDesc.get.call(this);
        if (this.readyState !== 4 || !xhrUrls.has(this)) return raw;
        const pruned = getPrunedXhrPayload(this, raw);
        return pruned ? pruned.text : raw;
      }
    });

    Object.defineProperty(XMLHttpRequest.prototype, 'response', {
      configurable: true,
      get() {
        const raw = responseDesc.get.call(this);
        if (this.readyState !== 4 || !xhrUrls.has(this)) return raw;
        const type = this.responseType;
        if (type === '' || type === 'text') {
          const pruned = getPrunedXhrPayload(this, typeof raw === 'string' ? raw : '');
          return pruned ? pruned.text : raw;
        }
        if (type === 'json' && raw && typeof raw === 'object') {
          if (xhrCache.has(this)) return xhrCache.get(this).parsed;
          const prunedObj = pruneJsonPayload(raw, xhrUrls.get(this));
          xhrCache.set(this, { parsed: prunedObj, text: '' });
          return prunedObj;
        }
        return raw;
      }
    });
  }
})();
