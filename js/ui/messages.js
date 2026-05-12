// ── Chat message rendering ────────────────────────────────────────────────────
// Builds and appends message bubbles to #msgs.
// Uses CSS classes everywhere — no inline style strings in JS.
// msgStore maps message IDs to their text for the TTS speak buttons.

import { getState } from '../store.js';
import { speak } from '../tts.js';

const _msgStore = new Map(); // id → text (for speak buttons)

// ── Public: speak button state sync (called by TTS onPlayChange) ──────────────

/**
 * Update the visual state of speak buttons when playback changes.
 * Called from app.js via the TTS onPlayChange callback.
 */
export function syncSpeakButtons(prevId, nextId) {
  if (prevId) {
    const b = document.getElementById('spk-' + prevId);
    if (b) { b.textContent = 'Ecouter'; b.classList.remove('on'); }
  }
  if (nextId && !nextId.startsWith('error:')) {
    const b = document.getElementById('spk-' + nextId);
    if (b) { b.textContent = 'Stop'; b.classList.add('on'); }
  }
}

// ── Internal: speak handler attached to each button ───────────────────────────

function _handleSpeak(id) {
  const text = _msgStore.get(id);
  if (!text) return;
  const { selLang, ttsRate } = getState();
  speak(id, text, selLang.tts, ttsRate);
}

// ── Public: clear ─────────────────────────────────────────────────────────────

export function clearMessages() {
  _msgStore.clear();
  const msgs = document.getElementById('msgs');
  if (msgs) msgs.innerHTML = '';
}

// ── Internal: scroll helper ───────────────────────────────────────────────────

function _scrollToBottom(el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ── Public: add messages ──────────────────────────────────────────────────────

/**
 * Add a native-speaker bubble with optional translation, notes, and speak button.
 */
export function addNativeMsg(parsed, id) {
  const { selLang, muted } = getState();
  _msgStore.set(id, parsed.reply);

  const msgs = document.getElementById('msgs');

  // Row wrapper
  const row   = document.createElement('div');
  row.className = 'fi msg-row';

  // Avatar
  const av    = document.createElement('div');
  av.className = 'av';
  av.textContent = selLang.native[0];

  // Right column
  const right = document.createElement('div');
  right.className = 'msg-right';

  // Main bubble
  const bbl   = document.createElement('div');
  bbl.className = 'bbl-n';
  bbl.textContent = parsed.reply;
  right.appendChild(bbl);

  // Speak button
  const spk   = document.createElement('button');
  spk.className = 'spkbtn';
  spk.id        = 'spk-' + id;
  spk.textContent = 'Ecouter';
  spk.addEventListener('click', () => _handleSpeak(id));
  right.appendChild(spk);

  // Translation toggle
  if (parsed.translation) {
    const trBtn = document.createElement('button');
    trBtn.className   = 'spkbtn';
    trBtn.textContent = 'Traduire';
    const tr    = document.createElement('div');
    tr.className    = 'tr';
    tr.textContent  = parsed.translation;
    tr.style.display = 'none';
    trBtn.addEventListener('click', () => {
      const shown = tr.style.display !== 'none';
      tr.style.display  = shown ? 'none' : 'block';
      trBtn.textContent = shown ? 'Traduire' : 'Masquer';
    });
    right.appendChild(trBtn);
    right.appendChild(tr);
  }

  // Notes: corrections + pronunciation tips + encouragement
  const hasNotes = (parsed.corrections && parsed.corrections.length) ||
                   (parsed.pronunciation_tips && parsed.pronunciation_tips.length);
  if (hasNotes) {
    const notes = document.createElement('div');
    notes.className = 'notes';

    const nh = document.createElement('div');
    nh.className   = 'nh';
    nh.textContent = 'Notes';
    notes.appendChild(nh);

    // Corrections
    (parsed.corrections || []).forEach(c => {
      const r   = document.createElement('div'); r.className = 'nr';
      const ico = document.createElement('span');
      ico.className   = 'nr-ico nr-ico-correction';
      ico.textContent = ({ grammaire:'Gr', vocabulaire:'Vo', orthographe:'Or' }[c.type] || '?') + ' ';

      const body = document.createElement('div');
      const wds  = document.createElement('div'); wds.className = 'nw';
      const o    = document.createElement('span'); o.className = 'no';  o.textContent = c.original;
      const arr  = document.createElement('span'); arr.className = 'nr-arrow'; arr.textContent = ' > ';
      const f    = document.createElement('span'); f.className = 'nf';  f.textContent = c.corrected;
      wds.appendChild(o); wds.appendChild(arr); wds.appendChild(f);

      const ex = document.createElement('div'); ex.className = 'ne'; ex.textContent = c.explanation;
      body.appendChild(wds); body.appendChild(ex);
      r.appendChild(ico); r.appendChild(body);
      notes.appendChild(r);
    });

    // Pronunciation tips
    (parsed.pronunciation_tips || []).forEach(pt => {
      const r   = document.createElement('div'); r.className = 'nr';
      const ico = document.createElement('span');
      ico.className   = 'nr-ico nr-ico-sound';
      ico.textContent = 'Son ';

      const body = document.createElement('div');
      const wds  = document.createElement('div'); wds.className = 'nw';
      const w    = document.createElement('span'); w.className = 'pt-word';     w.textContent = pt.word;
      const arr  = document.createElement('span'); arr.className = 'nr-arrow';  arr.textContent = ' > ';
      const ph   = document.createElement('span'); ph.className = 'pt-phonetic'; ph.textContent = pt.phonetic;
      wds.appendChild(w); wds.appendChild(arr); wds.appendChild(ph);

      const tip = document.createElement('div'); tip.className = 'ne'; tip.textContent = pt.tip;
      body.appendChild(wds); body.appendChild(tip);
      r.appendChild(ico); r.appendChild(body);
      notes.appendChild(r);
    });

    // Encouragement
    if (parsed.encouragement) {
      const enc = document.createElement('div');
      enc.className   = 'enc';
      enc.textContent = parsed.encouragement;
      notes.appendChild(enc);
    }

    right.appendChild(notes);
  }

  row.appendChild(av);
  row.appendChild(right);
  msgs.appendChild(row);
  _scrollToBottom(row);

  // Auto-speak unless muted
  if (!muted) setTimeout(() => _handleSpeak(id), 150);
}

/** Add a user text bubble (right-aligned, italic). */
export function addUserMsg(text) {
  const msgs = document.getElementById('msgs');
  const wrap = document.createElement('div');
  wrap.className = 'fi msg-row-user';
  const b    = document.createElement('div');
  b.className   = 'bbl-u';
  b.textContent = text;
  wrap.appendChild(b);
  msgs.appendChild(wrap);
  _scrollToBottom(wrap);
}

/** Add an error bubble. */
export function addErrMsg(msg) {
  const msgs = document.getElementById('msgs');
  const d    = document.createElement('div');
  d.className   = 'bbl-err fi';
  d.textContent = 'Erreur: ' + msg;
  msgs.appendChild(d);
  _scrollToBottom(d);
}

/** Add a raw/debug bubble (when JSON parsing fails). */
export function addRawMsg(text) {
  const msgs = document.getElementById('msgs');
  const d    = document.createElement('div');
  d.className   = 'bbl-raw fi';
  d.textContent = text;
  msgs.appendChild(d);
  _scrollToBottom(d);
}

// ── Typing indicator ──────────────────────────────────────────────────────────

let _thinkEl = null;

/**
 * Show or hide the animated typing indicator (three dots).
 * @param {boolean} on
 */
export function showThinking(on) {
  const msgs      = document.getElementById('msgs');
  const { selLang } = getState();

  if (on && !_thinkEl) {
    _thinkEl = document.createElement('div');
    _thinkEl.className = 'dots-row fi';

    const av   = document.createElement('div'); av.className = 'av'; av.textContent = selLang.native[0];
    const dots = document.createElement('div'); dots.className = 'dots';
    [0, 0.18, 0.36].forEach(delay => {
      const dot = document.createElement('div');
      dot.className = 'dot';
      // Delays are per-dot so must stay inline
      dot.style.animation = `dt 1.2s ease ${delay}s infinite`;
      dots.appendChild(dot);
    });

    _thinkEl.appendChild(av);
    _thinkEl.appendChild(dots);
    msgs.appendChild(_thinkEl);
    _scrollToBottom(_thinkEl);

  } else if (!on && _thinkEl) {
    _thinkEl.remove();
    _thinkEl = null;
  }
}
