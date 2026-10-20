'use strict';

/**
 * Dependency-free real-browser checks (Node 22.4+ and Chrome/Edge required).
 * Run: node tests/browser-smoke.cjs
 * BROWSER_EXE can override the detected browser. Artifacts go to the OS temp
 * folder, never to the repository. The Google Memory Wall is ALWAYS mocked:
 * no test GET or POST is sent to the live Apps Script service.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const errors = [];
let mockedPosts = 0;
let memoryMode = 'success';
let failPhoto = '';
const fixtures = [{ name: 'Preview test', message: '<b>A safe, local test memory.</b>', timestamp: '2026-10-20T00:00:00Z' }];

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Cannot connect to browser')), { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timeout);
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
        else entry.resolve(message.result);
      } else {
        for (const handler of this.handlers.get(message.method) || []) {
          Promise.resolve(handler(message.params)).catch((error) => errors.push(String(error)));
        }
      }
    });
  }
  on(name, callback) {
    this.handlers.set(name, [...(this.handlers.get(name) || []), callback]);
  }
  async send(method, params = {}) {
    await this.opened;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 25000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  close() { this.socket.close(); }
}

function serve(request, response) {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) || relative.startsWith('.') ||
        !/^(index\.html|[\w-]+\.(?:js|css)|(?:photos|audio)\/[^\0]+)$/.test(relative)) {
      response.writeHead(404).end(); return;
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mpeg': 'audio/mpeg' };
    const size = fs.statSync(target).size;
    const headers = { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
      if (start > end) { response.writeHead(416).end(); return; }
      response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(target, { start, end }).pipe(response);
    } else {
      response.writeHead(200, { ...headers, 'Content-Length': size });
      fs.createReadStream(target).pipe(response);
    }
  } catch (_) { response.writeHead(400).end(); }
}

async function main() {
  const executable = [process.env.BROWSER_EXE,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome'].find((file) => file && fs.existsSync(file));
  assert.ok(executable, 'Set BROWSER_EXE to an installed Chrome/Edge browser');
  assert.ok(typeof WebSocket === 'function', 'Use Node 22.4 or newer');
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'memorial-cinematic-review-'));
  const profile = path.join(artifacts, 'browser-profile');
  const server = http.createServer(serve);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  let cdp;
  try {
    browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', '--mute-audio',
      '--user-data-dir=' + profile, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    browser.stderr.on('data', (data) => { stderr += data.toString(); });
    for (let i = 0; i < 150 && !/DevTools listening on (ws:\/\/\S+)/.test(stderr); i += 1) await sleep(100);
    const ws = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
    assert.ok(ws, 'Browser did not start: ' + stderr.slice(-1000));
    const endpoint = new URL(ws[1]);
    const pages = await (await fetch('http://' + endpoint.host + '/json/list')).json();
    cdp = new CDP(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.exceptionThrown', (event) => errors.push(event.exceptionDetails.text + ': ' + (event.exceptionDetails.exception?.description || '')));
    cdp.on('Fetch.requestPaused', async function (event) {
      const { request, requestId } = event;
      const url = new URL(request.url);
      if (url.hostname === 'script.google.com') {
        let body = fixtures;
        let code = 200;
        if (request.method === 'POST') {
          mockedPosts += 1;
          const payload = JSON.parse(request.postData);
          assert.deepEqual(Object.keys(payload).sort(), ['message', 'name', 'website']);
          body = memoryMode === 'success' ? { result: 'success' } : { result: 'error' };
        } else if (memoryMode === 'empty') body = [];
        else if (memoryMode === 'offline') { body = {}; code = 503; }
        await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: code,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
          body: Buffer.from(JSON.stringify(body)).toString('base64') });
      } else if (url.origin === origin && failPhoto && decodeURIComponent(url.pathname).endsWith(failPhoto)) {
        await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 404, body: '' });
      } else if ((url.origin === origin || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) && request.method === 'GET') {
        await cdp.send('Fetch.continueRequest', { requestId });
      } else {
        // Fail closed: tests may not submit anything to another remote service.
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      }
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

    async function waitFor(expression, label, timeout = 10000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await cdp.evaluate(expression)) return;
        await sleep(80);
      }
      throw new Error('Timed out: ' + label);
    }
    async function check(name, callback) {
      const detail = await callback();
      results.push({ name, result: 'PASS', ...(detail ? { detail } : {}) });
      console.log('PASS ' + name + (detail ? ' ' + JSON.stringify(detail) : ''));
    }
    async function load(width, height, reduced = false, mobile = false) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
      await cdp.send('Page.navigate', { url: origin + '/' });
      await waitFor('document.readyState === "complete" && document.querySelector(".slide.active .slide-photo")?.naturalWidth > 0', 'page and first image');
      await cdp.evaluate('document.fonts.ready');
      await sleep(180);
    }
    async function screenshot(name, fullPage = false) {
      const metrics = await cdp.send('Page.getLayoutMetrics');
      const options = { format: 'png', captureBeyondViewport: fullPage };
      if (fullPage) options.clip = { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 };
      const image = await cdp.send('Page.captureScreenshot', options);
      fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(image.data, 'base64'));
      if (fullPage) {
        const thumbnail = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 30,
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: Math.min(metrics.cssContentSize.height, 1200), scale: 0.5 } });
        fs.writeFileSync(path.join(artifacts, name + '-hero.jpg'), Buffer.from(thumbnail.data, 'base64'));
      }
    }
    const currentIndex = 'Array.from(document.querySelectorAll(".slide")).findIndex(s => s.classList.contains("active"))';
    await load(1440, 960);
    await check('desktop initialization: 55 slides, 3 resident photos, audio enhancement', async () => {
      await waitFor('document.querySelectorAll(".slide-photo[src]").length === 3', 'bounded initial loading');
      const state = await cdp.evaluate('({slides:document.querySelectorAll(".slide").length, images:document.querySelectorAll(".slide-photo[src]").length, enhanced:document.querySelector(".music-card").classList.contains("audio-enhanced")})');
      assert.equal(state.slides, 55); assert.equal(state.images, 3); assert.ok(state.enhanced);
      return state;
    });
    await check('manual next, previous and wraparound', async () => {
      await cdp.evaluate('document.querySelector(".slideshow-btn.pause").click(); document.querySelector(".slideshow-btn.prev").click()');
      await waitFor(currentIndex + ' === 54', 'previous wraps');
      await cdp.evaluate('document.querySelector(".slideshow-btn.next").click()');
      await waitFor(currentIndex + ' === 0', 'next wraps');
    });
    await check('all 55 images load and decode in the browser', async () => {
      for (let index = 1; index < 55; index += 1) {
        await cdp.evaluate('document.querySelector(".slideshow-btn.next").click()');
        await waitFor(currentIndex + ' === ' + index + ' && document.querySelector(".slide.active .slide-photo").naturalWidth > 0', 'photo ' + (index + 1));
      }
      await sleep(1650);
      assert.ok(await cdp.evaluate('document.querySelectorAll(".slide-photo[src]").length <= 3'));
      return { decoded: 55 };
    });
    await check('rapid clicks and keyboard navigation', async () => {
      await cdp.evaluate('for(let i=0;i<5;i++)document.querySelector(".slideshow-btn.next").click()');
      await waitFor(currentIndex + ' === 4', 'queued rapid clicks');
      await cdp.evaluate('document.querySelector(".slideshow").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}))');
      await waitFor(currentIndex + ' === 3', 'keyboard previous');
      assert.equal(await cdp.evaluate('document.querySelectorAll(".slide.active").length'), 1);
    });
    await check('pause persists through navigation; resume advances automatically', async () => {
      const index = await cdp.evaluate(currentIndex);
      await sleep(6800);
      assert.equal(await cdp.evaluate(currentIndex), index);
      await cdp.evaluate('document.querySelector(".slideshow-btn.pause").click()');
      await waitFor(currentIndex + ' !== ' + index, 'automatic advance', 9000);
      await cdp.evaluate('document.querySelector(".slideshow-btn.pause").click()');
    });
    await check('desktop parallax, live ripple and offscreen autoplay suspension', async () => {
      await cdp.evaluate('document.querySelector(".slideshow-btn.pause").click()');
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1140, y: 360 });
      await waitFor('parseFloat(document.querySelector(".slideshow").style.getPropertyValue("--parallax-x")) !== 0', 'pointer parallax');
      await cdp.evaluate('document.querySelector(".slideshow-btn.next").click()');
      await waitFor('Number(document.querySelector("#memorial-liquid-displacement").getAttribute("scale")) > 1', 'visible liquid ripple');
      await cdp.evaluate('document.querySelector("#music").scrollIntoView({behavior:"instant"})');
      await waitFor('document.querySelector(".slideshow").classList.contains("is-paused")', 'offscreen suspension');
      const index = await cdp.evaluate(currentIndex);
      await sleep(6700);
      assert.equal(await cdp.evaluate(currentIndex), index);
      assert.ok(await cdp.evaluate('Array.from(document.querySelectorAll("#music [data-reveal]")).every(e => e.classList.contains("in-view"))'));
      await cdp.evaluate('window.scrollTo({top:0,behavior:"instant"})');
      await waitFor('!document.querySelector(".slideshow").classList.contains("is-paused")', 'return to hero');
      await cdp.evaluate('document.querySelector(".slideshow-btn.pause").click()');
    });
    await check('Memory Wall safely renders text and handles validation / success / rejection', async () => {
      await waitFor('document.querySelector(".memory-card") !== null', 'mock memory');
      assert.equal(await cdp.evaluate('document.querySelectorAll(".memory-message b").length'), 0);
      await cdp.evaluate('document.querySelector("#memory-form").requestSubmit()');
      assert.equal(mockedPosts, 0);
      assert.match(await cdp.evaluate('document.querySelector(".memory-status").textContent'), /Please write/);
      await cdp.evaluate('document.querySelector("#memory-name").value="Automated preview check"; document.querySelector("#memory-message").value="Local test only"; document.querySelector("#memory-form").requestSubmit()');
      await waitFor('document.querySelector(".memory-status").textContent.includes("Thank you")', 'mock submit success');
      assert.equal(mockedPosts, 1);
      memoryMode = 'reject';
      await cdp.evaluate('document.querySelector("#memory-message").value="Local rejection check"; document.querySelector("#memory-form").requestSubmit()');
      await waitFor('document.querySelector(".memory-status").textContent.includes("Something went wrong")', 'mock rejection');
      assert.equal(mockedPosts, 2);
      assert.equal(await cdp.evaluate('document.querySelector(".memory-submit-btn").disabled'), false);
      memoryMode = 'success';
      return { realSubmissions: 0, interceptedSubmissions: mockedPosts };
    });
    await check('audio plays, pauses, seeks and mutes', async () => {
      await waitFor('Number.isFinite(document.querySelector("audio").duration) && document.querySelector("audio").duration > 0', 'audio metadata');
      await cdp.evaluate('document.querySelector(".audio-toggle").click()');
      await waitFor('!document.querySelector("audio").paused', 'audio play');
      await cdp.evaluate('document.querySelector(".audio-mute").click(); document.querySelector("#audio-seek").value="10"; document.querySelector("#audio-seek").dispatchEvent(new Event("input"))');
      assert.ok(await cdp.evaluate('document.querySelector("audio").muted && document.querySelector("audio").currentTime >= 9'));
      await cdp.evaluate('document.querySelector(".audio-toggle").click()');
      assert.ok(await cdp.evaluate('document.querySelector("audio").paused'));
    });
    await check('desktop and responsive layouts have no horizontal overflow or hero overlap', async () => {
      const sizes = [[1440, 960], [1024, 768], [768, 1024], [390, 844], [320, 740]];
      const details = [];
      for (const [width, height] of sizes) {
        await load(width, height, true, width <= 768);
        const layout = await cdp.evaluate(`(() => {
          const rect = s => document.querySelector(s).getBoundingClientRect();
          const photo = rect('.slide.active .slide-photo'), text = rect('.hero-copy'), header = rect('.site-header');
          return {width:innerWidth, content:document.documentElement.scrollWidth,
            overlap: Math.max(0,Math.min(photo.right,text.right)-Math.max(photo.left,text.left))*Math.max(0,Math.min(photo.bottom,text.bottom)-Math.max(photo.top,text.top)),
            photoTop:photo.top, photoBottom:photo.bottom, textTop:text.top, headerBottom:header.bottom};
        })()`);
        details.push(layout);
        assert.ok(layout.content <= width + 1, 'Horizontal overflow: ' + JSON.stringify(layout));
        assert.ok(layout.overlap <= 1, 'Photo overlaps hero copy: ' + JSON.stringify(layout));
        assert.ok(layout.photoTop >= layout.headerBottom - 1, 'Photo under header: ' + JSON.stringify(layout));
        const overflowing = await cdp.evaluate(`Array.from(document.querySelectorAll('h1,h2,h3,.track-details,input,textarea,button,.site-nav')).filter(element => {
          if (element.closest('[aria-hidden="true"]')) return false;
          const r=element.getBoundingClientRect();
          return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
        }).map(element => element.className || element.id)`);
        assert.deepEqual(overflowing, [], 'Overflowing content or controls at ' + width);
        for (const id of ['music', 'tribute', 'story', 'memory-wall']) {
          await cdp.evaluate(`document.getElementById('${id}').scrollIntoView({behavior:'instant'})`);
          await sleep(40);
        }
        await cdp.evaluate('window.scrollTo({top:0,behavior:"instant"})');
        if (width === 1440 || width === 390) await screenshot(width === 1440 ? 'desktop-full' : 'mobile-full', true);
      }
      return details;
    });
    await check('reduced motion is static until explicitly played', async () => {
      const index = await cdp.evaluate(currentIndex);
      await sleep(6700);
      assert.equal(await cdp.evaluate(currentIndex), index);
      assert.equal(await cdp.evaluate('document.querySelector(".slideshow-btn.pause").getAttribute("aria-pressed")'), 'true');
      assert.equal(await cdp.evaluate('getComputedStyle(document.querySelector(".slide.active .slide-photo")).transform'), 'none');
    });
    await check('touch swipe navigates on mobile', async () => {
      await cdp.evaluate(`(() => {
        const element = document.querySelector('.slideshow');
        const start = new Event('touchstart'); Object.defineProperty(start,'touches',{value:[{clientX:250,clientY:220}]}); element.dispatchEvent(start);
        const end = new Event('touchend'); Object.defineProperty(end,'changedTouches',{value:[{clientX:90,clientY:222}]}); element.dispatchEvent(end);
      })()`);
      await waitFor(currentIndex + ' === 1', 'swipe next');
    });
    await check('missing first image recovers to a valid photo', async () => {
      failPhoto = 'photos/photo1.jpg';
      await load(390, 844, true, true);
      await waitFor(currentIndex + ' === 1', 'first photo fallback');
      failPhoto = '';
    });
    await check('empty and unavailable Memory Wall render graceful messages', async () => {
      for (const mode of ['empty', 'offline']) {
        memoryMode = mode;
        await load(390, 844, true, true);
        await waitFor('document.querySelector(".memory-empty") !== null', 'memory ' + mode);
      }
      memoryMode = 'success';
    });
    await check('no-JavaScript content, photo and native audio fallback', async () => {
      await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
      await cdp.send('Page.navigate', { url: origin + '/' });
      await sleep(900);
      const dom = await cdp.send('DOM.getDocument', { depth: -1 });
      const audio = await cdp.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#bg-audio' });
      const attributes = await cdp.send('DOM.getAttributes', { nodeId: audio.nodeId });
      assert.ok(attributes.attributes.includes('controls'));
      const photo = await cdp.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: 'noscript .slide-photo' });
      assert.ok(photo.nodeId > 0);
      await screenshot('mobile-no-javascript', true);
      await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
    });
    assert.deepEqual(errors, [], 'Browser runtime / interception errors');
    const report = { browser: executable, results, errors, realBackendSubmissions: 0, mockedPosts, artifacts };
    fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
    console.log('ARTIFACTS ' + artifacts);
    console.log('ALL ' + results.length + ' BROWSER CHECKS PASSED');
  } catch (error) {
    if (cdp) {
      try {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(artifacts, 'failure.png'), Buffer.from(screenshot.data, 'base64'));
      } catch (_) { /* preserve the original failure */ }
    }
    console.error('ARTIFACTS ' + artifacts);
    console.error('BROWSER ERRORS ' + JSON.stringify(errors));
    throw error;
  } finally {
    if (cdp) {
      try { await cdp.send('Browser.close'); } catch (_) { /* browser may close before its reply */ }
      cdp.close();
    }
    if (browser && browser.exitCode === null) browser.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
