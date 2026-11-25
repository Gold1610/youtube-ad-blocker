(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TubeShieldAdSkipper = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_AD_PLAYBACK_RATE = 16;
  const SEEK_TAIL_OFFSET_SEC = 0.1;
  const MIN_SEEKABLE_DURATION_SEC = 0.2;

  const PLAYER_SELECTOR = '.html5-video-player';
  const VIDEO_SELECTOR = 'video.html5-main-video, .html5-video-player video';
  const SKIP_BUTTON_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    'button[id^="skip-button"]'
  ];
  const OVERLAY_CLOSE_SELECTORS = [
    '.ytp-ad-overlay-close-button',
    '.ytp-ad-message-container .ytp-ad-overlay-close-button'
  ];

  function isButtonClickable(button) {
    if (!button || button.disabled) return false;
    return button.offsetParent !== null;
  }

  class AdSkipperController {
    constructor({ onAdHandled } = {}) {
      this.onAdHandled = typeof onAdHandled === 'function' ? onAdHandled : null;
      this.inAdSession = false;
      this.handledCurrentAd = false;
      this.savedAudio = null;
    }

    restoreAudioAndSpeed(video) {
      if (!video || !this.savedAudio) return;
      video.muted = this.savedAudio.muted;
      video.volume = this.savedAudio.volume;
      video.playbackRate = 1;
      this.savedAudio = null;
    }

    closeOverlayAds(doc) {
      let closedCount = 0;
      const seen = new Set();
      for (const selector of OVERLAY_CLOSE_SELECTORS) {
        const buttons = doc.querySelectorAll(selector);
        for (const button of buttons) {
          if (!seen.has(button) && isButtonClickable(button)) {
            seen.add(button);
            button.click();
            closedCount += 1;
          }
        }
      }
      return closedCount;
    }

    clickSkipButtons(doc) {
      let clicked = false;
      for (const selector of SKIP_BUTTON_SELECTORS) {
        const button = doc.querySelector(selector);
        if (isButtonClickable(button)) {
          button.click();
          clicked = true;
        }
      }
      return clicked;
    }

    tick(doc, { active = true, autoSkipAds = true } = {}) {
      if (!doc) return { adActive: false, handled: 0 };

      const player = doc.querySelector(PLAYER_SELECTOR);
      const video = doc.querySelector(VIDEO_SELECTOR);

      if (!active) {
        this.restoreAudioAndSpeed(video);
        this.inAdSession = false;
        this.handledCurrentAd = false;
        return { adActive: false, handled: 0 };
      }

      let handled = this.closeOverlayAds(doc);
      const adActive = Boolean(
        player &&
          player.classList &&
          (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))
      );

      if (adActive && autoSkipAds && video) {
        if (!this.inAdSession) {
          this.inAdSession = true;
          this.handledCurrentAd = false;
          this.savedAudio = {
            muted: Boolean(video.muted),
            volume: typeof video.volume === 'number' ? video.volume : 1
          };
        }

        video.muted = true;
        if (video.playbackRate !== MAX_AD_PLAYBACK_RATE) {
          video.playbackRate = MAX_AD_PLAYBACK_RATE;
        }

        if (
          Number.isFinite(video.duration) &&
          video.duration > MIN_SEEKABLE_DURATION_SEC &&
          video.currentTime < video.duration - SEEK_TAIL_OFFSET_SEC
        ) {
          video.currentTime = video.duration - SEEK_TAIL_OFFSET_SEC;
        }

        this.clickSkipButtons(doc);

        if (video.paused && typeof video.play === 'function') {
          try {
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
              playPromise.catch(() => {});
            }
          } catch {
            // Ignore autoplay restriction errors during ad transitions
          }
        }

        if (!this.handledCurrentAd) {
          this.handledCurrentAd = true;
          handled += 1;
        }
      } else if (this.inAdSession) {
        this.restoreAudioAndSpeed(video);
        this.inAdSession = false;
        this.handledCurrentAd = false;
      }

      if (handled > 0 && this.onAdHandled) {
        this.onAdHandled(handled);
      }

      return { adActive, handled };
    }
  }

  return {
    AdSkipperController,
    MAX_AD_PLAYBACK_RATE
  };
});
