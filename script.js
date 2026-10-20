/**
 * Cinematic memorial slideshow: layered photos, gentle parallax and a short
 * SVG liquid ripple on desktop. No dependencies and no changes to photo files.
 */
(function () {
  'use strict';

  const INTERVAL_MS = 6500;
  const TRANSITION_MS = 1500;
  const DOT_THRESHOLD = 8;
  const photos = typeof PHOTOS !== 'undefined' ? PHOTOS : [];

  const slideshow = document.querySelector('.slideshow');
  const track = document.querySelector('.slideshow-track');
  const dotsWrap = document.querySelector('.slideshow-dots');
  const counter = document.querySelector('.slide-counter');
  const progressFill = document.querySelector('.slideshow-progress-fill');
  const prevBtn = document.querySelector('.slideshow-btn.prev');
  const nextBtn = document.querySelector('.slideshow-btn.next');
  const displacement = document.getElementById('memorial-liquid-displacement');

  if (!photos.length || !slideshow || !track || !dotsWrap || !counter ||
      !progressFill || !prevBtn || !nextBtn) return;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lowPowerQuery = window.matchMedia('(max-width: 640px)');
  const slides = [];
  const dots = [];
  let current = 0;
  let timer = null;
  let transitionTimer = null;
  let rippleFrame = null;
  let touchStartX = null;
  let touchStartY = null;
  let pointerFrame = null;
  let pointerX = 0;
  let pointerY = 0;

  slideshow.style.setProperty('--slideshow-interval', INTERVAL_MS + 'ms');

  function lowMotion() {
    return reducedMotionQuery.matches || lowPowerQuery.matches;
  }

  function normalize(index) {
    return (index + photos.length) % photos.length;
  }

  function setImage(index, priority) {
    const slide = slides[normalize(index)];
    if (!slide) return;
    const imgs = slide.querySelectorAll('img');
    imgs.forEach(function (img) {
      if (img.getAttribute('src')) return;
      img.loading = priority ? 'eager' : 'lazy';
      img.decoding = 'async';
      if (priority && img.classList.contains('slide-photo')) img.fetchPriority = 'high';
      img.src = img.dataset.src;
    });
  }

  function warm(index) {
    setImage(index, true);
    setImage(index + 1, false);
    setImage(index - 1, false);
  }

  // Keep decoded pictures nearby; do not retain 110 images in memory for 55 slides.
  function releaseFarImages() {
    slides.forEach(function (slide, i) {
      const distance = Math.min((i - current + photos.length) % photos.length,
        (current - i + photos.length) % photos.length);
      if (distance <= 2 || slide.classList.contains('is-exiting')) return;
      slide.querySelectorAll('img').forEach(function (img) {
        if (img.hasAttribute('src')) img.removeAttribute('src');
      });
    });
  }

  photos.forEach(function (src, i) {
    const slide = document.createElement('div');
    slide.className = 'slide' + (i === 0 ? ' active' : '');
    slide.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');

    const ambient = document.createElement('div');
    ambient.className = 'slide-ambient';
    ambient.setAttribute('aria-hidden', 'true');
    const ambientImage = document.createElement('img');
    ambientImage.className = 'slide-ambient-photo';
    ambientImage.dataset.src = src;
    ambientImage.alt = '';
    ambient.appendChild(ambientImage);

    const shade = document.createElement('div');
    shade.className = 'slide-vignette';
    shade.setAttribute('aria-hidden', 'true');

    const foreground = document.createElement('div');
    foreground.className = 'slide-foreground';
    const image = document.createElement('img');
    image.className = 'slide-photo';
    image.dataset.src = src;
    image.alt = 'Memorial photo ' + (i + 1) + ' of ' + photos.length;
    foreground.appendChild(image);

    slide.appendChild(ambient);
    slide.appendChild(shade);
    slide.appendChild(foreground);
    track.appendChild(slide);
    slides.push(slide);
  });

  if (photos.length <= DOT_THRESHOLD) {
    photos.forEach(function (_, i) {
      const btn = document.createElement('button');
      btn.className = 'dot' + (i === 0 ? ' active' : '');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Show memorial photo ' + (i + 1));
      btn.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      btn.addEventListener('click', function () { goTo(i); restartAutoplay(); });
      dotsWrap.appendChild(btn);
      dots.push(btn);
    });
    counter.hidden = true;
  } else {
    dotsWrap.hidden = true;
    counter.textContent = '01 / ' + String(photos.length).padStart(2, '0');
  }

  function cancelRipple() {
    if (rippleFrame !== null) cancelAnimationFrame(rippleFrame);
    rippleFrame = null;
    if (displacement) displacement.setAttribute('scale', '0');
    slides.forEach(function (slide) { slide.classList.remove('liquid-entering'); });
  }

  function ripple(slide) {
    cancelRipple();
    if (lowMotion() || !displacement) return;
    slide.classList.add('liquid-entering');
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / 960, 1);
      displacement.setAttribute('scale', String(Math.sin(t * Math.PI) * 17));
      if (t < 1) rippleFrame = requestAnimationFrame(step);
      else {
        rippleFrame = null;
        displacement.setAttribute('scale', '0');
        slide.classList.remove('liquid-entering');
      }
    }
    rippleFrame = requestAnimationFrame(step);
  }

  function updateIndicators() {
    if (dots.length) {
      dots.forEach(function (dot, i) {
        dot.classList.toggle('active', i === current);
        dot.setAttribute('aria-current', i === current ? 'true' : 'false');
      });
    } else {
      counter.textContent = String(current + 1).padStart(2, '0') +
        ' / ' + String(photos.length).padStart(2, '0');
    }
  }

  function goTo(index) {
    const next = normalize(index);
    if (next === current) return;

    // Avoid overlapping transition cleanup during rapid manual clicks.
    if (transitionTimer !== null) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    cancelRipple();
    slides.forEach(function (slide) {
      slide.classList.remove('is-exiting', 'liquid-entering');
    });

    const outgoing = slides[current];
    const incoming = slides[next];
    warm(next);

    outgoing.classList.remove('active');
    outgoing.classList.add('is-exiting');
    outgoing.setAttribute('aria-hidden', 'true');
    incoming.classList.add('active');
    incoming.setAttribute('aria-hidden', 'false');
    current = next;
    updateIndicators();
    ripple(incoming);

    transitionTimer = setTimeout(function () {
      outgoing.classList.remove('is-exiting');
      transitionTimer = null;
      releaseFarImages();
    }, lowMotion() ? 50 : TRANSITION_MS);
  }

  function resetProgress() {
    progressFill.classList.remove('is-running');
    void progressFill.offsetWidth;
    if (!reducedMotionQuery.matches && !document.hidden) {
      progressFill.classList.add('is-running');
    }
  }

  function stopAutoplay() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    slideshow.classList.add('is-paused');
  }

  function restartAutoplay() {
    stopAutoplay();
    resetProgress();
    if (document.hidden) return;
    slideshow.classList.remove('is-paused');
    timer = setInterval(function () {
      goTo(current + 1);
      resetProgress();
    }, INTERVAL_MS);
  }

  prevBtn.addEventListener('click', function () { goTo(current - 1); restartAutoplay(); });
  nextBtn.addEventListener('click', function () { goTo(current + 1); restartAutoplay(); });

  slideshow.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(current - 1); restartAutoplay(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(current + 1); restartAutoplay(); }
  });

  slideshow.addEventListener('touchstart', function (event) {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }, { passive: true });

  slideshow.addEventListener('touchend', function (event) {
    if (touchStartX === null) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      goTo(current + (dx < 0 ? 1 : -1));
      restartAutoplay();
    }
    touchStartX = touchStartY = null;
  }, { passive: true });

  function updateParallax() {
    pointerFrame = null;
    slideshow.style.setProperty('--parallax-x', (pointerX * 9).toFixed(1) + 'px');
    slideshow.style.setProperty('--parallax-y', (pointerY * 7).toFixed(1) + 'px');
    slideshow.style.setProperty('--ambient-x', (pointerX * -14).toFixed(1) + 'px');
    slideshow.style.setProperty('--ambient-y', (pointerY * -10).toFixed(1) + 'px');
  }

  slideshow.addEventListener('pointermove', function (event) {
    if (lowMotion() || event.pointerType !== 'mouse') return;
    const bounds = slideshow.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    if (pointerFrame === null) pointerFrame = requestAnimationFrame(updateParallax);
  });

  slideshow.addEventListener('pointerleave', function () {
    pointerX = pointerY = 0;
    if (pointerFrame === null) pointerFrame = requestAnimationFrame(updateParallax);
  });

  function updateMotionPreference() {
    slideshow.classList.toggle('is-low-power', lowMotion());
    if (lowMotion()) {
      cancelRipple();
      pointerX = pointerY = 0;
      updateParallax();
    }
    resetProgress();
  }

  reducedMotionQuery.addEventListener('change', updateMotionPreference);
  lowPowerQuery.addEventListener('change', updateMotionPreference);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopAutoplay();
      cancelRipple();
    } else restartAutoplay();
  });

  slideshow.classList.toggle('is-low-power', lowMotion());
  warm(0);
  releaseFarImages();
  restartAutoplay();
})();
