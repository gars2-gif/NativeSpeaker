// ── Speech-to-text engine ─────────────────────────────────────────────────────
// Wraps the Web Speech API (SpeechRecognition).
// Fires callbacks rather than touching the DOM or global state directly.

let _rec      = null;
let _recState = 'idle';   // 'idle' | 'listening'
let _finalT   = '';
let _cb       = {};       // callbacks set by initSTT

export function getRecState() { return _recState; }

/**
 * Register all callbacks once at startup.
 * @param {{ onStateChange, onLive, onFinal, onError }} callbacks
 *   onStateChange(state: 'idle'|'listening')
 *   onLive(text: string, visible: boolean)
 *   onFinal(text: string)
 *   onError(message: string)
 */
export function initSTT(callbacks) {
  _cb = callbacks || {};
}

/** Stop recognition immediately (safe to call when already idle). */
export function stop() {
  try { if (_rec) _rec.stop(); } catch (_) {}
}

/**
 * Toggle mic on/off. Requests microphone permission on first use.
 * @param {string}  lang    - BCP-47 recognition language e.g. 'it-IT'
 * @param {boolean} isBusy  - if true, ignores the call (API in flight)
 */
export function toggle(lang, isBusy) {
  if (isBusy) return;
  if (_recState === 'listening') {
    try { _rec.stop(); } catch (_) {}
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      stream.getTracks().forEach(t => t.stop()); // release mic; SpeechRecognition grabs it itself
      _start(lang);
    })
    .catch(e => { if (_cb.onError) _cb.onError('Micro refuse: ' + e.name); });
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _setState(s) {
  _recState = s;
  if (_cb.onStateChange) _cb.onStateChange(s);
}

function _start(lang) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (_cb.onError) _cb.onError('Reconnaissance vocale non disponible. Utilisez Chrome.');
    return;
  }
  try {
    _rec                = new SR();
    _rec.lang           = lang;
    _rec.interimResults = true;
    _rec.continuous     = false;
    _finalT             = '';
    if (_cb.onLive) _cb.onLive('', false);

    _rec.onstart = () => _setState('listening');

    _rec.onresult = e => {
      let interim = '', fin = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin    += e.results[i][0].transcript;
        else                      interim += e.results[i][0].transcript;
      }
      if (fin) _finalT = fin;
      if (_cb.onLive) _cb.onLive(fin || interim, true);
    };

    _rec.onend = () => {
      _setState('idle');
      if (_cb.onLive) _cb.onLive('', false);
      const t = _finalT.trim();
      if (t && _cb.onFinal) _cb.onFinal(t);
    };

    _rec.onerror = e => {
      _setState('idle');
      if (_cb.onLive) _cb.onLive('', false);
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        if (_cb.onError) _cb.onError('Micro: ' + e.error);
      }
    };

    _rec.start();
  } catch (e) {
    if (_cb.onError) _cb.onError('Demarrage micro: ' + e.message);
    _setState('idle');
  }
}
