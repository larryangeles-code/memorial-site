/**
 * Memorial Site — script.js
 *
 * Builds the slideshow dynamically from PHOTOS (defined in photos.js).
 * Features:
 *  - Slides & dots injected from PHOTOS array — no hardcoded HTML needed
 *  - Auto-plays every 4 s, pauses on hover/focus/touch
 *  - Arrow buttons + dot navigation
 *  - Touch/swipe support (left/right)
 *  - "3 / 19" counter shown instead of dots when there are more than 8 slides
 *    (dots still used for ≤8, counter for larger sets — works on any screen)
 *  - Respects prefers-reduced-motion (disables autoplay)
 *  - Keyboard arrow navigation
 */

(function () {
  'use strict';

  /* ── Config ── */
  const INTERVAL_MS   = 2000;
  const DOT_THRESHOLD = 8; // use counter instead of dots above this count

  /* ── Guard ── */
  if (typeof PHOTOS === 'undefined' || !PHOTOS.length) {
    console.warn('memorial-site: PHOTOS is empty or not loaded.');
    return;
  }

  /* ── DOM refs ── */
  const track      = document.querySelector('.slideshow-track');
  const dotsWrap   = document.querySelector('.slideshow-dots');
  const counter    = document.querySelector('.slide-counter');
  const prevBtn    = document.querySelector('.slideshow-btn.prev');
  const nextBtn    = document.querySelector('.slideshow-btn.next');
  const slideshow  = document.querySelector('.slideshow');

  /* ── Build slides ── */
  PHOTOS.forEach(function (src, i) {
    const div = document.createElement('div');
    div.className = 'slide' + (i === 0 ? ' active' : '');
    div.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');

    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Photo ' + (i + 1);
    img.loading = i === 0 ? 'eager' : 'lazy'; // lazy-load everything after first

    div.appendChild(img);
    track.appendChild(div);
  });

  /* ── Build navigation (dots or counter) ── */
  const useDots = PHOTOS.length <= DOT_THRESHOLD;

  if (useDots) {
    PHOTOS.forEach(function (_, i) {
      const btn = document.createElement('button');
      btn.className = 'dot' + (i === 0 ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      btn.setAttribute('aria-label', 'Photo ' + (i + 1));
      btn.addEventListener('click', function () { goTo(i); startTimer(); });
      dotsWrap.appendChild(btn);
    });
    counter.hidden = true;
  } else {
    dotsWrap.hidden = true;
  }

  /* ── State ── */
  let current = 0;
  let timer   = null;

  /* ── Core: go to slide N ── */
  function goTo(index) {
    index = (index + PHOTOS.length) % PHOTOS.length;

    const slides = track.querySelectorAll('.slide');
    slides[current].classList.remove('active');
    slides[current].setAttribute('aria-hidden', 'true');

    current = index;

    slides[current].classList.add('active');
    slides[current].setAttribute('aria-hidden', 'false');

    if (useDots) {
      const dots = dotsWrap.querySelectorAll('.dot');
      dots.forEach(function (d, i) {
        d.classList.toggle('active', i === current);
        d.setAttribute('aria-selected', i === current ? 'true' : 'false');
      });
    } else {
      counter.textContent = (current + 1) + ' / ' + PHOTOS.length;
    }
  }

  /* ── Init counter text ── */
  if (!useDots) {
    counter.textContent = '1 / ' + PHOTOS.length;
  }

  /* ── Timer ── */
  function startTimer() {
    stopTimer();
    if (prefersReducedMotion.matches) return;
    timer = setInterval(function () { goTo(current + 1); }, INTERVAL_MS);
  }

  function stopTimer() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  /* ── Arrows ── */
  prevBtn.addEventListener('click', function () { goTo(current - 1); startTimer(); });
  nextBtn.addEventListener('click', function () { goTo(current + 1); startTimer(); });

  /* ── Keyboard ── */
  slideshow.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft')  { goTo(current - 1); startTimer(); }
    if (e.key === 'ArrowRight') { goTo(current + 1); startTimer(); }
  });

  /* ── Pause on hover / focus ── */
  slideshow.addEventListener('mouseenter', stopTimer);
  slideshow.addEventListener('mouseleave', startTimer);
  slideshow.addEventListener('focusin',    stopTimer);
  slideshow.addEventListener('focusout',   startTimer);

  /* ── Touch / swipe ── */
  var touchStartX = null;
  var touchStartY = null;

  slideshow.addEventListener('touchstart', function (e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    stopTimer();
  }, { passive: true });

  slideshow.addEventListener('touchend', function (e) {
    if (touchStartX === null) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;

    // Only register horizontal swipes (dx > dy to avoid scroll conflicts)
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goTo(current + 1); // swipe left → next
      else         goTo(current - 1); // swipe right → prev
    }

    touchStartX = null;
    touchStartY = null;
    startTimer();
  }, { passive: true });

  /* ── Reduced motion ── */
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  prefersReducedMotion.addEventListener('change', function () {
    if (prefersReducedMotion.matches) stopTimer(); else startTimer();
  });

  /* ── Init ── */
  startTimer();

})();
