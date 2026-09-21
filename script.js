/**
 * Memorial Site — slideshow
 *
 * Performance/UX notes:
 * - Only the current and adjacent photos receive a src initially.
 *   This avoids downloading the full gallery on first paint.
 * - The next/previous images are warmed before navigation.
 * - Autoplay continues through normal pointer, focus, and swipe interaction.
 * - Autoplay pauses only while the browser tab itself is hidden.
 * - Reduced-motion preferences keep the photo changes but remove motion effects via CSS.
 */

(function () {
  'use strict';

  const INTERVAL_MS = 4500;
  const DOT_THRESHOLD = 8;

  if (typeof PHOTOS === 'undefined' || !PHOTOS.length) {
    console.warn('memorial-site: PHOTOS is empty or not loaded.');
    return;
  }

  const track = document.querySelector('.slideshow-track');
  const dotsWrap = document.querySelector('.slideshow-dots');
  const counter = document.querySelector('.slide-counter');
  const prevBtn = document.querySelector('.slideshow-btn.prev');
  const nextBtn = document.querySelector('.slideshow-btn.next');
  const slideshow = document.querySelector('.slideshow');

  if (!track || !dotsWrap || !counter || !prevBtn || !nextBtn || !slideshow) {
    console.warn('memorial-site: slideshow markup is incomplete.');
    return;
  }

  const slides = [];
  const dots = [];
  const useDots = PHOTOS.length <= DOT_THRESHOLD;

  let current = 0;
  let timer = null;
  let touchStartX = null;
  let touchStartY = null;

  function normalizeIndex(index) {
    return (index + PHOTOS.length) % PHOTOS.length;
  }

  function ensureImageLoaded(index, priority) {
    const normalized = normalizeIndex(index);
    const img = slides[normalized] && slides[normalized].querySelector('img');

    if (!img || img.getAttribute('src')) return;

    img.src = img.dataset.src;
    img.removeAttribute('data-src');
    img.loading = priority ? 'eager' : 'lazy';
    img.decoding = 'async';

    if (priority) {
      img.fetchPriority = 'high';
    }
  }

  function warmAdjacentImages(index) {
    ensureImageLoaded(index, true);
    ensureImageLoaded(index + 1, false);
    ensureImageLoaded(index - 1, false);
  }

  PHOTOS.forEach(function (src, i) {
    const div = document.createElement('div');
    div.className = 'slide' + (i === 0 ? ' active' : '');
    div.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');

    const img = document.createElement('img');
    img.dataset.src = src;
    img.alt = 'Memorial photo ' + (i + 1) + ' of ' + PHOTOS.length;
    img.decoding = 'async';

    div.appendChild(img);
    track.appendChild(div);
    slides.push(div);
  });

  if (useDots) {
    PHOTOS.forEach(function (_, i) {
      const btn = document.createElement('button');
      btn.className = 'dot' + (i === 0 ? ' active' : '');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Show memorial photo ' + (i + 1));
      btn.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      btn.addEventListener('click', function () {
        goTo(i);
        startTimer();
      });

      dotsWrap.appendChild(btn);
      dots.push(btn);
    });

    counter.hidden = true;
  } else {
    dotsWrap.hidden = true;
    counter.textContent = '1 / ' + PHOTOS.length;
  }

  warmAdjacentImages(0);

  function goTo(index) {
    const next = normalizeIndex(index);

    if (next === current) return;

    warmAdjacentImages(next);

    const outgoing = slides[current];
    const incoming = slides[next];
    const movingForward = index > current || (current === PHOTOS.length - 1 && next === 0);

    outgoing.classList.remove('leaving-left', 'leaving-right');
    incoming.classList.remove('leaving-left', 'leaving-right', 'enter-from-left');

    if (!movingForward) {
      incoming.classList.add('enter-from-left');
    }

    // Force the browser to paint the incoming photo at its starting
    // position before we activate it. This makes the swipe visible
    // even when the image is already cached.
    void incoming.offsetWidth;

    outgoing.classList.add(movingForward ? 'leaving-left' : 'leaving-right');
    outgoing.classList.remove('active');
    outgoing.setAttribute('aria-hidden', 'true');

    current = next;

    incoming.classList.add('active');
    incoming.setAttribute('aria-hidden', 'false');

    if (!movingForward) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          incoming.classList.remove('enter-from-left');
        });
      });
    }

    window.setTimeout(function () {
      outgoing.classList.remove('leaving-left', 'leaving-right');
    }, 1250);

    if (useDots) {
      dots.forEach(function (dot, i) {
        const active = i === current;
        dot.classList.toggle('active', active);
        dot.setAttribute('aria-current', active ? 'true' : 'false');
      });
    } else {
      counter.textContent = (current + 1) + ' / ' + PHOTOS.length;
    }
  }

  function canAutoplay() {
    return !document.hidden;
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (!canAutoplay()) return;

    timer = setInterval(function () {
      goTo(current + 1);
    }, INTERVAL_MS);
  }

  prevBtn.addEventListener('click', function () {
    goTo(current - 1);
    startTimer();
  });

  nextBtn.addEventListener('click', function () {
    goTo(current + 1);
    startTimer();
  });

  slideshow.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') {
      goTo(current - 1);
      startTimer();
    } else if (event.key === 'ArrowRight') {
      goTo(current + 1);
      startTimer();
    }
  });

  slideshow.addEventListener('touchstart', function (event) {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }, { passive: true });

  slideshow.addEventListener('touchend', function (event) {
    if (touchStartX === null) {
      startTimer();
      return;
    }

    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      goTo(dx < 0 ? current + 1 : current - 1);
    }

    touchStartX = null;
    touchStartY = null;
    startTimer();
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopTimer();
    else startTimer();
  });

  startTimer();
})();
