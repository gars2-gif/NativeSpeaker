// ── Settings panel component ──────────────────────────────────────────────────
// Renders mute / speed / font-size controls into both the setup-page panel
// and the chat-page panel simultaneously, eliminating the -2 ID duplication.
//
// Each group is stateless-rendered: clicking a button re-renders only that
// group, which keeps both panels in sync automatically.

import { getState, setState } from '../store.js';
import { SPEEDS, FONT_SIZES } from '../constants.js';
import { stop as stopTTS } from '../tts.js';

// ── Generic group renderer ────────────────────────────────────────────────────

/**
 * Render a group of option buttons into each container in containerIds.
 * @param {string[]}  containerIds  - element IDs to render into
 * @param {object[]}  items         - data items
 * @param {function}  isActiveFn    - (item) => boolean
 * @param {function}  onClickFn     - (item) => void, called on click
 * @param {function}  labelFn       - (item) => HTML string for button content
 * @param {string}    [extraClass]  - additional class added to every button
 */
function renderGroup(containerIds, items, isActiveFn, onClickFn, labelFn, extraClass) {
  containerIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    items.forEach(item => {
      const b = document.createElement('button');
      b.className = 'set-btn' + (extraClass ? ' ' + extraClass : '') + (isActiveFn(item) ? ' on' : '');
      b.innerHTML = labelFn(item);
      b.addEventListener('click', () => onClickFn(item));
      el.appendChild(b);
    });
  });
}

// ── Individual group renders ──────────────────────────────────────────────────

function renderMute() {
  const { muted } = getState();
  const opts = [
    { v: false, label: '🔊 Actif' },
    { v: true,  label: '🔇 Muet'  },
  ];
  renderGroup(
    ['set-mute', 'set-mute2'],
    opts,
    o  => muted === o.v,
    o  => {
      setState('muted', o.v);
      localStorage.setItem('muted', o.v ? '1' : '0');
      if (o.v) stopTTS();
      renderMute();
    },
    o  => o.label,
    'set-btn-mute'
  );
}

function renderSpeed() {
  const { ttsRate } = getState();
  renderGroup(
    ['set-speed', 'set-speed2'],
    SPEEDS,
    s  => Math.abs(ttsRate - s.v) < 0.01,
    s  => {
      setState('ttsRate', s.v);
      localStorage.setItem('rate', String(s.v));
      renderSpeed();
    },
    s  => `<div class="set-btn-val">${s.v}x</div><div class="set-btn-lbl">${s.l}</div>`
  );
}

function renderFontSize() {
  const { chatFs } = getState();
  renderGroup(
    ['set-fontsize', 'set-fontsize2'],
    FONT_SIZES,
    f  => chatFs === f.v,
    f  => {
      setState('chatFs', f.v);
      localStorage.setItem('cfs', String(f.v));
      document.documentElement.style.setProperty('--cfs', f.v + 'px');
      renderFontSize();
    },
    // font-size on the "A" preview is dynamic — keep that one inline
    f  => `<div class="set-btn-val" style="font-size:${f.v - 2}px">A</div><div class="set-btn-lbl">${f.l}</div>`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Render all settings groups into their containers. Call once after DOM ready. */
export function initSettings() {
  renderMute();
  renderSpeed();
  renderFontSize();
}
