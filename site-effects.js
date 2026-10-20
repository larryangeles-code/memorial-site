/**
 * Site-level progressive enhancements:
 * - accessible custom audio controls (native controls remain as fallback)
 * - one-time scroll reveals (content stays visible without JavaScript)
 */
(function () {
  'use strict';

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reveals = Array.from(document.querySelectorAll('[data-reveal]'));

  if ('IntersectionObserver' in window && !motionQuery.matches && reveals.length) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.07, rootMargin: '0px 0px -25px 0px' });

    reveals.forEach(function (item) { observer.observe(item); });
    document.documentElement.classList.add('motion-ready');

    // Switching to reduced motion later should never leave a hidden section.
    motionQuery.addEventListener('change', function (event) {
      if (event.matches) {
        document.documentElement.classList.remove('motion-ready');
        observer.disconnect();
      }
    });
  }

  // Decorative effects stop below the fold and while the tab is hidden.
  // Playing audio is intentionally not stopped when scrolling or switching tabs.
  const ambientSections = Array.from(document.querySelectorAll('.music-section, .memory-section'));
  const visibleSections = new Set();
  function updateAmbientVisibility() {
    ambientSections.forEach(function (section) {
      section.classList.toggle('is-in-view', visibleSections.has(section) && !document.hidden);
    });
  }
  if ('IntersectionObserver' in window) {
    const ambientObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visibleSections.add(entry.target);
        else visibleSections.delete(entry.target);
      });
      updateAmbientVisibility();
    });
    ambientSections.forEach((section) => ambientObserver.observe(section));
    document.addEventListener('visibilitychange', updateAmbientVisibility);
  }

  const audio = document.getElementById('bg-audio');
  const card = document.querySelector('.music-card');
  const controls = document.querySelector('.custom-player');
  if (!audio || !card || !controls) return;

  const playButton = controls.querySelector('.audio-toggle');
  const playIcon = controls.querySelector('.audio-toggle-icon');
  const muteButton = controls.querySelector('.audio-mute');
  const muteIcon = muteButton && muteButton.querySelector('span');
  const seek = controls.querySelector('.audio-seek');
  const elapsed = controls.querySelector('.audio-elapsed');
  const durationLabel = controls.querySelector('.audio-duration');
  const status = card.querySelector('.audio-status');

  if (!playButton || !playIcon || !muteButton || !seek || !elapsed || !durationLabel) return;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function updatePlayback() {
    const playing = !audio.paused && !audio.ended;
    card.classList.toggle('is-playing', playing);
    playButton.setAttribute('aria-label', playing ? 'Pause memorial song' : 'Play memorial song');
    playButton.setAttribute('aria-pressed', String(playing));
    playIcon.textContent = playing ? 'Ⅱ' : '▶';
    muteButton.setAttribute('aria-label', audio.muted ? 'Unmute audio' : 'Mute audio');
    muteButton.setAttribute('aria-pressed', String(audio.muted));
    if (muteIcon) muteIcon.textContent = audio.muted ? '×' : '♫';
  }

  function updateTimeline() {
    const duration = audio.duration;
    const valid = Number.isFinite(duration) && duration > 0;
    seek.disabled = !valid;
    if (valid) {
      seek.max = String(duration);
      seek.value = String(Math.min(audio.currentTime || 0, duration));
      seek.style.setProperty('--seek-progress', ((audio.currentTime / duration) * 100 || 0) + '%');
      seek.setAttribute('aria-valuetext', formatTime(audio.currentTime) + ' of ' + formatTime(duration));
    } else {
      seek.value = '0';
      seek.style.setProperty('--seek-progress', '0%');
    }
    elapsed.textContent = formatTime(audio.currentTime);
    durationLabel.textContent = formatTime(duration);
  }

  function useNativeFallback(message) {
    controls.hidden = true;
    card.classList.remove('audio-enhanced', 'is-playing');
    audio.controls = true;
    audio.hidden = false;
    if (status) status.textContent = message || '';
  }

  audio.addEventListener('loadedmetadata', updateTimeline);
  audio.addEventListener('durationchange', updateTimeline);
  audio.addEventListener('timeupdate', updateTimeline);
  audio.addEventListener('seeked', updateTimeline);
  audio.addEventListener('play', updatePlayback);
  audio.addEventListener('pause', updatePlayback);
  audio.addEventListener('ended', updatePlayback);
  audio.addEventListener('volumechange', updatePlayback);
  audio.addEventListener('error', function () {
    useNativeFallback('The song could not be loaded. Please try the standard player.');
  });

  playButton.addEventListener('click', function () {
    if (audio.paused) {
      const result = audio.play();
      if (result && typeof result.catch === 'function') {
        result.catch(function () {
          if (status) status.textContent = 'Playback was blocked. Please tap play again.';
          updatePlayback();
        });
      }
    } else {
      audio.pause();
    }
  });

  muteButton.addEventListener('click', function () {
    audio.muted = !audio.muted;
  });

  seek.addEventListener('input', function () {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.max(0, Math.min(Number(seek.value), audio.duration));
      updateTimeline();
    }
  });

  if (audio.error) {
    useNativeFallback('The song could not be loaded. Please try the standard player.');
    return;
  }
  controls.hidden = false;
  card.classList.add('audio-enhanced');
  audio.controls = false;
  audio.hidden = true;
  updateTimeline();
  updatePlayback();
})();
