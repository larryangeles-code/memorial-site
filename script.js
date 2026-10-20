/**
 * Cinematic photo gallery. Original assets and PHOTOS order stay untouched.
 * Only the current/adjacent images are loaded, and transitions wait for decoding.
 * Autoplay stops offscreen, in hidden tabs, or when the visitor presses pause.
 */
(function () {
  'use strict';

  const INTERVAL_MS = 6500;
  const TRANSITION_MS = 1550;
  const photos = typeof PHOTOS !== 'undefined' ? PHOTOS : [];
  const slideshow = document.querySelector('.slideshow');
  const track = document.querySelector('.slideshow-track');
  const dotsWrap = document.querySelector('.slideshow-dots');
  const counter = document.querySelector('.slide-counter');
  const progress = document.querySelector('.slideshow-progress-fill');
  const previous = document.querySelector('.slideshow-btn.prev');
  const nextButton = document.querySelector('.slideshow-btn.next');
  const pause = document.querySelector('.slideshow-btn.pause');
  const status = document.querySelector('.slideshow-status');
  const displacement = document.getElementById('memorial-liquid-displacement');
  if (!photos.length || !slideshow || !track || !dotsWrap || !counter ||
      !progress || !previous || !nextButton || !pause) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smallScreen = window.matchMedia('(max-width: 820px), (pointer: coarse)');
  const slides = [];
  const dots = [];
  const imagePromises = new Map();
  const unavailable = new Set();
  let current = 0;
  let requested = 0;
  let requestVersion = 0;
  let ready = false;
  let loading = false;
  let userPaused = reduced.matches;
  let inViewport = true;
  let timer = null;
  let cleanupTimer = null;
  let rippleFrame = null;
  let pointerFrame = null;
  let pointerX = 0;
  let pointerY = 0;
  let touch = null;

  slideshow.style.setProperty('--slideshow-interval', INTERVAL_MS + 'ms');
  slideshow.classList.add('slideshow-ready');
  const normalize = (index) => ((index % photos.length) + photos.length) % photos.length;
  const lowMotion = () => reduced.matches || smallScreen.matches;
  const canPlay = () => ready && !loading && !userPaused && inViewport &&
    !document.hidden && photos.length > 1;

  photos.forEach(function (src, index) {
    const slide = document.createElement('div');
    slide.className = 'slide' + (index === 0 ? ' active' : '');
    slide.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
    const ambient = document.createElement('div');
    ambient.className = 'slide-ambient';
    ambient.setAttribute('aria-hidden', 'true');
    const background = document.createElement('img');
    background.className = 'slide-ambient-photo';
    background.alt = '';
    background.dataset.src = src;
    ambient.appendChild(background);
    const shade = document.createElement('div');
    shade.className = 'slide-vignette';
    shade.setAttribute('aria-hidden', 'true');
    const foreground = document.createElement('div');
    foreground.className = 'slide-foreground';
    const image = document.createElement('img');
    image.className = 'slide-photo';
    image.alt = 'Memorial photo ' + (index + 1) + ' of ' + photos.length;
    image.dataset.src = src;
    foreground.appendChild(image);
    slide.append(ambient, shade, foreground);
    track.appendChild(slide);
    slides.push(slide);
  });

  if (photos.length <= 8 && photos.length > 1) {
    photos.forEach(function (_, index) {
      const button = document.createElement('button');
      button.className = 'dot';
      button.type = 'button';
      button.setAttribute('aria-label', 'Show memorial photo ' + (index + 1));
      button.addEventListener('click', () => navigate(index));
      dotsWrap.appendChild(button);
      dots.push(button);
    });
    counter.hidden = true;
  } else {
    dotsWrap.hidden = true;
  }
  if (photos.length === 1) {
    previous.hidden = nextButton.hidden = pause.hidden = true;
    progress.parentElement.hidden = true;
  }

  function report(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  function prepare(index, priority) {
    index = normalize(index);
    if (imagePromises.has(index)) return imagePromises.get(index);
    const image = slides[index].querySelector('.slide-photo');
    const background = slides[index].querySelector('.slide-ambient-photo');
    const promise = new Promise(function (resolve) {
      let finished = false;
      const timeout = setTimeout(() => finish(false), 15000);
      function finish(success) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
        if (!success) unavailable.add(index);
        resolve(success);
      }
      async function loaded() {
        // decode() avoids flashing an undecoded incoming photo on slow devices.
        try { if (image.decode) await image.decode(); } catch (_) { /* use naturalWidth */ }
        finish(image.naturalWidth > 0);
      }
      function failed() { finish(false); }
      image.addEventListener('load', loaded);
      image.addEventListener('error', failed);
      image.loading = background.loading = 'eager';
      image.decoding = background.decoding = 'async';
      image.fetchPriority = priority ? 'high' : 'low';
      background.fetchPriority = 'low';
      image.src = image.dataset.src;
      background.src = background.dataset.src;
      if (image.complete) {
        if (image.naturalWidth > 0) loaded();
        else if (image.currentSrc) failed();
      }
    });
    imagePromises.set(index, promise);
    return promise;
  }

  function warmAdjacent() {
    [normalize(current - 1), normalize(current + 1)].forEach(function (index) {
      if (!unavailable.has(index)) void prepare(index, false);
    });
  }

  function releaseFarImages() {
    slides.forEach(function (slide, index) {
      const distance = Math.min(normalize(index - current), normalize(current - index));
      if (distance <= 1 || index === requested || slide.classList.contains('is-exiting')) return;
      slide.querySelectorAll('img').forEach((image) => image.removeAttribute('src'));
      imagePromises.delete(index);
    });
  }

  function cancelRipple() {
    if (rippleFrame !== null) cancelAnimationFrame(rippleFrame);
    rippleFrame = null;
    if (displacement) displacement.setAttribute('scale', '0');
    slides.forEach((slide) => slide.classList.remove('liquid-entering'));
  }

  function ripple(slide) {
    cancelRipple();
    if (lowMotion() || !displacement || !inViewport || document.hidden) return;
    slide.classList.add('liquid-entering');
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / 960, 1);
      displacement.setAttribute('scale', String(Math.sin(t * Math.PI) * 14));
      if (t < 1) rippleFrame = requestAnimationFrame(step);
      else cancelRipple();
    }
    rippleFrame = requestAnimationFrame(step);
  }

  function indicators() {
    counter.textContent = String(current + 1).padStart(2, '0') + ' / ' +
      String(photos.length).padStart(2, '0');
    dots.forEach(function (dot, index) {
      dot.classList.toggle('active', index === current);
      dot.setAttribute('aria-current', String(index === current));
    });
  }

  function automaticNext() {
    for (let offset = 1; offset < photos.length; offset += 1) {
      const index = normalize(current + offset);
      if (!unavailable.has(index)) return index;
    }
    return current;
  }

  function syncPlayback() {
    clearTimeout(timer);
    timer = null;
    progress.classList.remove('is-running');
    const running = canPlay();
    slideshow.classList.toggle('is-paused', !running);
    pause.setAttribute('aria-label', userPaused ? 'Resume slideshow' : 'Pause slideshow');
    pause.setAttribute('aria-pressed', String(userPaused));
    pause.title = userPaused ? 'Resume slideshow' : 'Pause slideshow';
    pause.querySelector('span').textContent = userPaused ? '\u25b6' : '\u2161';
    if (!running) { cancelRipple(); return; }
    if (!reduced.matches) {
      void progress.offsetWidth;
      progress.classList.add('is-running');
    }
    timer = setTimeout(() => navigate(automaticNext()), INTERVAL_MS);
  }

  async function navigate(index) {
    const version = ++requestVersion;
    requested = normalize(index);
    const destination = requested;
    loading = true;
    syncPlayback();
    const loaded = await prepare(destination, true);
    if (version !== requestVersion) return;
    loading = false;
    if (!loaded) {
      requested = current;
      if (!ready && unavailable.size < photos.length) {
        void navigate(automaticNext());
        return;
      }
      report('This photo could not load. Please try another photo or refresh the page.');
      syncPlayback();
      return;
    }
    report('');
    const changed = destination !== current;
    clearTimeout(cleanupTimer);
    cancelRipple();
    slides.forEach((slide) => slide.classList.remove('is-exiting'));
    if (changed) {
      slides[current].classList.remove('active');
      slides[current].classList.add('is-exiting');
      slides[current].setAttribute('aria-hidden', 'true');
    }
    current = destination;
    slides[current].classList.add('active');
    slides[current].setAttribute('aria-hidden', 'false');
    ready = true;
    indicators();
    warmAdjacent();
    syncPlayback();
    if (changed) ripple(slides[current]);
    cleanupTimer = setTimeout(function () {
      slides.forEach((slide) => slide.classList.remove('is-exiting'));
      releaseFarImages();
    }, reduced.matches ? 0 : TRANSITION_MS);
  }

  previous.addEventListener('click', () => navigate(requested - 1));
  nextButton.addEventListener('click', () => navigate(requested + 1));
  pause.addEventListener('click', function () {
    userPaused = !userPaused;
    syncPlayback();
    resetPointer();
  });
  slideshow.addEventListener('keydown', function (event) {
    if (event.target.matches('input, textarea, select')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      void navigate(requested + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  slideshow.addEventListener('touchstart', function (event) {
    touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  slideshow.addEventListener('touchend', function (event) {
    if (!touch || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touch.x;
    const dy = event.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) void navigate(requested + (dx < 0 ? 1 : -1));
  }, { passive: true });
  slideshow.addEventListener('touchcancel', () => { touch = null; }, { passive: true });

  function updatePointer() {
    pointerFrame = null;
    slideshow.style.setProperty('--parallax-x', (pointerX * 9).toFixed(1) + 'px');
    slideshow.style.setProperty('--parallax-y', (pointerY * 7).toFixed(1) + 'px');
    slideshow.style.setProperty('--ambient-x', (pointerX * -14).toFixed(1) + 'px');
    slideshow.style.setProperty('--ambient-y', (pointerY * -10).toFixed(1) + 'px');
  }
  function resetPointer() {
    if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
    pointerX = pointerY = 0;
    updatePointer();
  }
  slideshow.addEventListener('pointermove', function (event) {
    if (lowMotion() || !canPlay() || event.pointerType !== 'mouse') return;
    const bounds = slideshow.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    if (pointerFrame === null) pointerFrame = requestAnimationFrame(updatePointer);
  });
  slideshow.addEventListener('pointerleave', resetPointer);

  function motionChanged() {
    if (reduced.matches) userPaused = true;
    slideshow.classList.toggle('is-low-power', lowMotion());
    resetPointer();
    syncPlayback();
  }
  reduced.addEventListener('change', motionChanged);
  smallScreen.addEventListener('change', motionChanged);
  document.addEventListener('visibilitychange', function () { resetPointer(); syncPlayback(); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      inViewport = entries[0].isIntersecting;
      syncPlayback();
    }, { threshold: 0 });
    observer.observe(slideshow);
  }
  window.addEventListener('pagehide', function () {
    clearTimeout(timer);
    clearTimeout(cleanupTimer);
    cancelRipple();
    resetPointer();
  });
  window.addEventListener('pageshow', syncPlayback);
  slideshow.classList.toggle('is-low-power', lowMotion());
  indicators();
  void navigate(0);
})();
