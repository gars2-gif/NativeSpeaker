// ── Chat message rendering ────────────────────────────────────────────────────
// Builds and appends message bubbles to #msgs.
// Uses CSS classes everywhere — no inline style strings in JS.
// _msgStore maps message IDs to their text for the TTS speak buttons.
// _msgRefs  tracks DOM wrappers + role for long-press delete/modify.

import { getState, setState } from '../store.js';
import { speak, stop as stopTTS } from '../tts.js';
import { cancelAPI } from '../api.js';

const _msgStore = new Map(); // id → text (for speak buttons)
let   _msgRefs  = [];        // [{dom, role}] — ordered list of message rows

// ── Public: speak button state sync (called by TTS onPlayChange) ──────────────

export function syncSpeakButtons(prevId, nextId) {
  if (prevId) {
    const b = document.getElementById('spk-' + prevId);
    if (b) { b.textContent = 'Écouter'; b.classList.remove('on'); }
  }
  if (nextId && !nextId.startsWith('error:')) {
    const b = document.getElementById('spk-' + nextId);
    if (b) { b.textContent = 'Stop'; b.classList.add('on'); }
  }
}

// ── Internal: speak handler attached to each main speak button ────────────────

function _handleSpeak(id) {
  const text = _msgStore.get(id);
  if (!text) return;
  const { selLang, ttsRate } = getState();
  speak(id, text, selLang.tts, ttsRate);
}

// ── Public: clear ─────────────────────────────────────────────────────────────

export function clearMessages() {
  _msgStore.clear();
  _msgRefs = [];
  const msgs = document.getElementById('msgs');
  if (msgs) msgs.innerHTML = '';
}

// ── Internal: scroll helper ───────────────────────────────────────────────────

function _scrollToBottom(el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ── Long-press detector ───────────────────────────────────────────────────────

function _attachLongPress(el, cb) {
  let timer = null, startX = 0, startY = 0, moved = false;
  el.style.cursor = 'pointer';
  el.addEventListener('pointerdown', e => {
    moved = false; startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => {
      if (!moved) {
        try { navigator.vibrate && navigator.vibrate(40); } catch (_) {}
        cb();
      }
    }, 520);
  });
  el.addEventListener('pointermove', e => {
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
      moved = true; clearTimeout(timer);
    }
  });
  el.addEventListener('pointerup',     () => clearTimeout(timer));
  el.addEventListener('pointercancel', () => clearTimeout(timer));
  el.addEventListener('pointerleave',  () => clearTimeout(timer));
  el.addEventListener('contextmenu',   e  => e.preventDefault());
}

// ── Message context menu (modify / delete) ────────────────────────────────────

function _closeMsgMenu() {
  const m = document.getElementById('msg-menu');
  if (m && m.parentNode) m.parentNode.removeChild(m);
  document.removeEventListener('pointerdown', _msgMenuOutside, true);
}

function _msgMenuOutside(e) {
  const m = document.getElementById('msg-menu');
  if (m && !m.contains(e.target)) _closeMsgMenu();
}

function _showMsgMenu(wrap, bubble, text, onModify, onDelete) {
  _closeMsgMenu();
  const menu = document.createElement('div');
  menu.id = 'msg-menu';
  menu.style.cssText =
    'position:fixed;background:#1a2230;border:1px solid #2a3a50;border-radius:11px;' +
    'padding:5px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.6);' +
    'display:flex;flex-direction:column;gap:2px;min-width:180px;font-family:sans-serif';

  function _mkBtn(color, icon, label, handler) {
    const btn = document.createElement('button');
    btn.style.cssText =
      `background:none;border:none;color:${color};padding:11px 14px;` +
      'text-align:left;cursor:pointer;font-size:14px;border-radius:7px;' +
      'display:flex;align-items:center;gap:10px';
    btn.innerHTML = `<span style="font-size:15px">${icon}</span> ${label}`;
    btn.addEventListener('pointerover', () => { btn.style.background = 'rgba(74,157,224,.15)'; });
    btn.addEventListener('pointerout',  () => { btn.style.background = 'none'; });
    btn.addEventListener('click', handler);
    return btn;
  }

  const modBtn = _mkBtn('#c8d4e0', '✏️', 'Modifier', () => {
    _deleteFromTurn(wrap);
    if (onModify) onModify(text);
    _closeMsgMenu();
  });
  const delBtn = _mkBtn('#e0a0a0', '🗑️', 'Supprimer', () => {
    _deleteFromTurn(wrap);
    if (onDelete) onDelete();
    _closeMsgMenu();
  });
  menu.appendChild(modBtn);
  menu.appendChild(delBtn);
  document.body.appendChild(menu);

  // Position above the bubble (or below if not enough space)
  const rect   = bubble.getBoundingClientRect();
  const menuW  = menu.offsetWidth;
  const menuH  = menu.offsetHeight;
  let top  = rect.top - menuH - 8;
  let left = rect.right - menuW;
  if (top  < 60) top  = rect.bottom + 8;
  if (left < 10) left = 10;
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';

  setTimeout(() => document.addEventListener('pointerdown', _msgMenuOutside, true), 80);
}

// ── Delete from a turn onwards (and truncate convo in store) ─────────────────

function _deleteFromTurn(wrap) {
  const idx = _msgRefs.findIndex(r => r.dom === wrap);
  if (idx < 0) return;

  // Abort any in-flight API call and reset busy
  cancelAPI();
  setState('busy', false);

  // Remove DOM elements from idx onwards
  _msgRefs.slice(idx).forEach(r => { if (r.dom?.parentNode) r.dom.parentNode.removeChild(r.dom); });
  _msgRefs.splice(idx);

  // Truncate convo to match remaining msgRefs
  const userTurns = _msgRefs.filter(r => r.role === 'user').length;
  const keep = 2 + userTurns * 2; // __init__ user + assistant + subsequent pairs
  const convo = getState().convo;
  if (convo.length > keep) setState('convo', convo.slice(0, keep));

  // Clean up TTS and thinking indicator
  stopTTS();
  showThinking(false);
}

// ── Corrected-sentence speak button ──────────────────────────────────────────

/**
 * Build a standalone ▶ Écouter button that speaks arbitrary text.
 * Used for the corrected_sentence block.
 */
export function makeSpeakBtn(text) {
  const btn = document.createElement('button');
  btn.style.cssText =
    'background:rgba(88,192,96,.1);border:1px solid rgba(88,192,96,.3);' +
    'border-radius:14px;padding:3px 10px;cursor:pointer;font-size:11px;' +
    'font-family:sans-serif;color:#90d8a0;display:inline-flex;align-items:center;' +
    'gap:4px;margin-left:8px;vertical-align:middle';
  btn.textContent = '▶ Écouter';
  let playing = false;

  btn.addEventListener('click', () => {
    if (playing) {
      try { speechSynthesis.cancel(); } catch (_) {}
      btn.textContent = '▶ Écouter'; playing = false; return;
    }
    try { speechSynthesis.cancel(); } catch (_) {}
    if (!window.speechSynthesis) { return; }
    const { selLang, ttsRate } = getState();
    const doSpeak = voices => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = selLang.tts; u.rate = ttsRate; u.pitch = 1;
      const base = selLang.tts.split('-')[0];
      const v = voices.find(v => v.lang === selLang.tts) ||
                voices.find(v => v.lang.startsWith(base));
      if (v) u.voice = v;
      let done = false;
      const fin = () => { if (done) return; done = true; playing = false; btn.textContent = '▶ Écouter'; };
      const fb  = setTimeout(fin, Math.max(text.split(/\s+/).length * 500, 2500));
      u.onend  = () => { clearTimeout(fb); fin(); };
      u.onerror = () => { clearTimeout(fb); fin(); };
      playing = true; btn.textContent = '■ Stop';
      speechSynthesis.speak(u);
    };
    const vs = speechSynthesis.getVoices();
    if (vs.length) doSpeak(vs);
    else speechSynthesis.onvoiceschanged = () => doSpeak(speechSynthesis.getVoices());
  });
  return btn;
}

// ── Public: add messages ──────────────────────────────────────────────────────

/**
 * Add a native-speaker bubble with optional translation, notes, corrected_sentence,
 * and speak button.
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
  bbl.setAttribute('lang', selLang.tts.split('-')[0]);
  bbl.textContent = parsed.reply;
  right.appendChild(bbl);

  // Speak button
  const spk   = document.createElement('button');
  spk.className   = 'spkbtn';
  spk.id          = 'spk-' + id;
  spk.textContent = 'Écouter';
  spk.addEventListener('click', () => _handleSpeak(id));
  right.appendChild(spk);

  // Translation toggle ("Voir traduction" / "Cacher traduction")
  if (parsed.translation) {
    const trBtn = document.createElement('button');
    trBtn.style.cssText =
      'margin-top:6px;margin-left:6px;background:rgba(180,160,90,.08);' +
      'border:1px solid rgba(180,160,90,.22);border-radius:16px;padding:4px 11px;' +
      'cursor:pointer;font-size:12px;font-family:sans-serif;color:#b09060';
    trBtn.textContent = 'Voir traduction';
    const tr    = document.createElement('div');
    tr.className    = 'tr';
    tr.textContent  = parsed.translation;
    tr.style.display = 'none';
    trBtn.addEventListener('click', () => {
      const shown = tr.style.display !== 'none';
      tr.style.display  = shown ? 'none' : '';
      trBtn.textContent = shown ? 'Voir traduction' : 'Cacher traduction';
    });
    right.appendChild(trBtn);
    right.appendChild(tr);
  }

  // Notes: corrections + pronunciation tips + corrected_sentence
  const hasCorrections = parsed.corrections && parsed.corrections.length;
  const hasTips        = parsed.pronunciation_tips && parsed.pronunciation_tips.length;
  const hasSentence    = parsed.corrected_sentence && parsed.corrected_sentence.trim();

  if (hasCorrections || hasTips || hasSentence) {
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
      const o    = document.createElement('span'); o.className = 'no';    o.textContent = c.original;
      const arr  = document.createElement('span'); arr.className = 'nr-arrow'; arr.textContent = ' > ';
      const f    = document.createElement('span'); f.className = 'nf';    f.textContent = c.corrected;
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

    // Corrected sentence block
    if (hasSentence) {
      const fix = document.createElement('div');
      fix.style.cssText =
        'padding:8px 12px;background:rgba(88,192,96,.07);border-top:1px solid #0e1a14;' +
        'font-size:12.5px;font-family:sans-serif;line-height:1.5';

      const lblRow = document.createElement('div');
      lblRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:3px';
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:9px;letter-spacing:.18em;color:#90d8a0;text-transform:uppercase;font-weight:600';
      lbl.textContent = 'Version correcte';
      const playBtn = makeSpeakBtn(parsed.corrected_sentence);
      lblRow.appendChild(lbl);
      lblRow.appendChild(playBtn);

      const sen = document.createElement('div');
      sen.style.cssText = 'color:#b8e8c0;font-style:italic';
      sen.textContent = parsed.corrected_sentence;

      fix.appendChild(lblRow);
      fix.appendChild(sen);
      notes.appendChild(fix);
    }

    right.appendChild(notes);
  }

  row.appendChild(av);
  row.appendChild(right);
  msgs.appendChild(row);
  _msgRefs.push({ dom: row, role: 'assistant' });
  _scrollToBottom(row);

  // Auto-speak unless muted
  if (!muted) setTimeout(() => _handleSpeak(id), 150);
}

/**
 * Add a user text bubble (right-aligned, italic) with long-press menu.
 * @param {string}        text
 * @param {function|null} onModify - called with (text) when user chooses Modify
 * @param {function|null} onDelete - called when user chooses Delete
 */
export function addUserMsg(text, onModify, onDelete) {
  const msgs = document.getElementById('msgs');
  const wrap = document.createElement('div');
  wrap.className = 'fi msg-row-user';
  const b = document.createElement('div');
  b.className   = 'bbl-u no-sel';
  b.textContent = text;
  _attachLongPress(b, () => _showMsgMenu(wrap, b, text, onModify, onDelete));
  wrap.appendChild(b);
  msgs.appendChild(wrap);
  _msgRefs.push({ dom: wrap, role: 'user' });
  _scrollToBottom(wrap);
}

/** Add an error bubble. */
export function addErrMsg(msg) {
  const msgs = document.getElementById('msgs');
  const d    = document.createElement('div');
  d.className   = 'bbl-err fi';
  d.setAttribute('role', 'alert');
  d.textContent = 'Erreur : ' + msg;
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
  const msgs        = document.getElementById('msgs');
  const { selLang } = getState();

  if (on && !_thinkEl) {
    _thinkEl = document.createElement('div');
    _thinkEl.className = 'dots-row fi';

    const av   = document.createElement('div'); av.className = 'av'; av.textContent = s