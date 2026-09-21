/**
 * Memorial Site — memory-wall.js
 *
 * "Leave a Memory" wall backed by a Google Sheet via Apps Script.
 *  - GET  APPS_SCRIPT_URL  -> loads approved memories, newest first
 *  - POST APPS_SCRIPT_URL  -> submits a new memory (goes in unapproved
 *    until a family member marks it Approved = TRUE in the Sheet)
 *
 * Note: POST uses Content-Type: text/plain to avoid a CORS preflight
 * request, which Apps Script web apps don't handle. The body is still
 * valid JSON and is parsed as such server-side.
 */

(function () {
  'use strict';

  /* ── Config ── */
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz_E8uxyDmiTx7_U_It3fRTTC_tZ4BlVcn1_06NsCa3ZIsNqt6RsH6WUv29e3yX4EtLLQ/exec';

  /* ── DOM refs ── */
  var form          = document.getElementById('memory-form');
  var nameInput     = document.getElementById('memory-name');
  var messageInput  = document.getElementById('memory-message');
  var honeypotInput = document.getElementById('memory-website');
  var statusEl      = document.querySelector('.memory-status');
  var listEl        = document.getElementById('memory-list');
  var submitBtn     = form ? form.querySelector('.memory-submit-btn') : null;

  if (!form || !listEl) return;

  /* ── Helpers ── */
  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function renderMemories(memories) {
    listEl.innerHTML = '';

    if (!memories || !memories.length) {
      var empty = document.createElement('p');
      empty.className = 'memory-empty text-center';
      empty.textContent = 'Be the first to leave a memory.';
      listEl.appendChild(empty);
      return;
    }

    memories.forEach(function (m) {
      var card = document.createElement('div');
      card.className = 'memory-card';

      var msg = document.createElement('p');
      msg.className = 'memory-message';
      msg.textContent = m.message; // textContent — never injects HTML

      var meta = document.createElement('p');
      meta.className = 'memory-meta';
      var name = (m.name && String(m.name).trim()) ? m.name : 'Anonymous';
      var date = formatDate(m.timestamp);
      meta.textContent = '\u2014 ' + name + (date ? ', ' + date : '');

      card.appendChild(msg);
      card.appendChild(meta);
      listEl.appendChild(card);
    });
  }

  function loadMemories() {
    fetch(APPS_SCRIPT_URL)
      .then(function (res) { return res.json(); })
      .then(function (data) { renderMemories(data); })
      .catch(function () {
        listEl.innerHTML = '<p class="memory-empty text-center">Memories will appear here soon.</p>';
      });
  }

  /* ── Submit handler ── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var message = messageInput.value.trim();
    if (!message) {
      statusEl.textContent = 'Please write a message before submitting.';
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    statusEl.textContent = 'Sending…';

    var payload = {
      name: nameInput ? nameInput.value.trim() : '',
      message: message,
      website: honeypotInput ? honeypotInput.value : '' // honeypot
    };

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.result === 'success') {
          form.reset();
          statusEl.textContent = 'Thank you \u2014 your memory has been received and will appear once reviewed.';
        } else {
          statusEl.textContent = 'Something went wrong. Please try again.';
        }
      })
      .catch(function () {
        statusEl.textContent = 'Something went wrong. Please try again.';
      })
      .then(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  });

  /* ── Init ── */
  loadMemories();

})();
