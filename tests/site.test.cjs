'use strict';

// Run from the repository root: node --test tests/site.test.cjs
// These checks do not contact the Memory Wall or change any project files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
// Immutable approved baseline, so the checks still work after merging into main.
const baseline = '4a5abbcf2cc47313bae4a45836449c98f9dc9a8c';
const original = (name) => execFileSync('git', ['show', baseline + ':' + name], { cwd: root, encoding: 'utf8' });
const html = read('index.html');
const context = {};
vm.runInNewContext(read('photos.js') + '\nthis.photos=PHOTOS;', context);
const photos = Array.from(context.photos);
const plainText = (text) => text.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '\u2014')
  .replace(/&ndash;/g, '\u2013').replace(/&rsquo;/g, '\u2019')
  .replace(/&ldquo;|&rdquo;|[\u201c\u201d]/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('the original 55 slideshow images remain in order, allowing future additions', () => {
  const old = {};
  vm.runInNewContext(original('photos.js') + '\nthis.photos=PHOTOS;', old);
  assert.deepEqual(photos.slice(0, old.photos.length), Array.from(old.photos));
  assert.ok(photos.length >= 55);
  assert.equal(new Set(photos).size, photos.length);
  const hashes = new Set();
  for (const photo of photos) {
    const data = fs.readFileSync(path.join(root, photo));
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    assert.ok(!hashes.has(hash), 'Repeated image contents: ' + photo);
    hashes.add(hash);
  }
});

test('all four biography paragraphs are preserved verbatim', () => {
  const main = original('index.html');
  const originalBlock = main.match(/<div class="about-text">([\s\S]*?)<\/div>/)[1];
  const paragraphs = Array.from(originalBlock.matchAll(/<p>([\s\S]*?)<\/p>/g), (m) => plainText(m[1]));
  assert.equal(paragraphs.length, 4);
  const current = plainText(html);
  paragraphs.forEach((paragraph) => assert.ok(current.includes(paragraph), 'Missing biography paragraph'));
});

test('name, dates, quote and family attribution are preserved', () => {
  const current = plainText(html);
  assert.ok(current.includes('Querbin Roy'));
  for (const date of ['1999-03-04', '2024-07-16']) assert.ok(html.includes('datetime="' + date + '"'));
  const main = original('index.html');
  const quote = main.match(/<blockquote class="family-quote">([\s\S]*?)<\/blockquote>/)[1];
  assert.ok(current.includes(plainText(quote).replace(/\s*\u2014 Angeles Family$/, ' Angeles Family')));
  assert.equal(html.match(/<title>(.*?)<\/title>/)[1], main.match(/<title>(.*?)<\/title>/)[1]);
});

test('Memory Wall integration is unchanged from the approved baseline', () => {
  assert.equal(read('memory-wall.js').replace(/\r\n/g, '\n'), original('memory-wall.js').replace(/\r\n/g, '\n'));
  for (const id of ['memory-form', 'memory-name', 'memory-message', 'memory-website', 'memory-list']) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.ok(html.includes('maxlength="1000"'));
  assert.ok(html.includes('maxlength="100"'));
});

test('every local asset and page anchor resolves', () => {
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML IDs');
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    if (value.startsWith('#')) assert.ok(ids.includes(value.slice(1)), 'Missing anchor ' + value);
    else if (!/^[a-z]+:/i.test(value)) assert.ok(fs.existsSync(path.join(root, value)), 'Missing asset ' + value);
  }
  assert.ok(!html.includes('bootstrap'), 'Removed Bootstrap must not remain required');
});

test('scripts parse and execute after their required markup', () => {
  for (const name of ['photos.js', 'script.js', 'memory-wall.js', 'site-effects.js']) {
    new vm.Script(read(name), { filename: name });
    assert.ok(html.indexOf('src="' + name + '"') > html.indexOf('</main>'));
  }
  assert.ok(html.indexOf('src="photos.js"') < html.indexOf('src="script.js"'));
});

test('fallbacks and motion controls remain available', () => {
  assert.ok(/<noscript>[\s\S]*?photos\/photo1.jpg[\s\S]*?<\/noscript>/.test(html));
  assert.ok(/<audio[^>]+controls[^>]+loop/.test(html));
  assert.ok(html.includes('aria-label="Pause slideshow"'));
  assert.ok(html.includes('class="skip-link"'));
  assert.ok(read('style.css').includes('prefers-reduced-motion: reduce'));
  assert.ok(read('script.js').includes('let userPaused = reduced.matches;'));
});
