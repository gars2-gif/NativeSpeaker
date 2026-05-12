// ── Speech-to-text engine (Push-To-Talk) ──────────────────────────────────────
// Wraps the Web Speech API with a push-to-talk interface.
// Fires callbacks only — no DOM access, no global state.

let _rec         = null;
let _recState    = 'idle';   // 'idle' | 'listening'
let _finalT      = '';       // accumulated final transcript across SR sessions
let _isPressing  = false;
let _cancelArmed = false;
let _micPermitted = false;
let _lang        = '';
let _cb          = {};

export function getRecState() { return _recState; }

/**
 * Register all callbacks once at startup.
 * @param {{
 *   onStateChange: (state: 'idle'|'listening') => void,
 *   onLive:        (text: string, visible: boolean) => void,
 *   onFinal:       (text: string) => void,
 *   onError:       (message: string) => void,
 *   onTrashState:  (state: 'hidden'|'visible'|'armed') => void,
 *   onRecBanner:   (visible: boolean) => void,
 * }} callbacks
 */
export function initSTT(callbacks) {
  _cb = callbacks || {};
}

/** Pre-warm mic permission so the first PTT press starts instantly. */
export function preWarmMic() {
  if (_micPermitted) return Promise.resolve();
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    stream.getTracks().forEach(t => t.stop());
    _micPermitted = true;
  });
}

/** Stop recognition immediately (safe to call when already idle). */
export function stop() {
  _isPressing = false;
  try { if (_rec) _rec.stop(); } catch (_) {}
}

// ── PTT pointer handlers ──────────────────────────────────────────────────────
// Wire these to #bm: pointerdown → startPTT, pointermove → movePTT,
// pointerup/pointercancel → stopPTT

/**
 * @param {PointerEvent} e
 * @param {string} lang - BCP-47 recognition language e.g. 'it-IT'
 */
export function startPTT(e, lang) {
  if (_recState === 'listening') return;
  e.preventDefault();
  _isPressing  = true;
  _cancelArmed = false;
  _finalT      = '';
  _lang        = lang;
  try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
  if (_cb.onTrashState) _cb.onTrashState('visible');

  if (_micPermitted) {
    if (_isPressing) _startRec();
  } else {
    preWarmMic()
      .then(() => { if (_isPressing) _startRec(); })
      .catch(err => {
        _isPressing = false;
        if (_cb.onTrashState) _cb.onTrashState('hidden');
        if (_cb.onError) _cb.onError('Micro refuse: ' + err.name);
      });
  }
}

/**
 * @param {PointerEvent} e
 * @param {DOMRect|null} trashRect - getBoundingClientRect() of #trash, or null
 */
export function movePTT(e, trashRect) {
  if (!_isPressing || !trashRect) return;
  const cx = trashRect.left + trashRect.width  / 2;
  const cy = trashRect.top  + trashRect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const armed = Math.sqrt(dx * dx + dy * dy) < trashRect.width * 0.8;
  if (armed !== _cancelArmed) {
    _cancelArmed = armed;
    if (_cb.onTrashState) _cb.onTrashState(armed ? 'armed' : 'visible');
  }
}

/** @param {PointerEvent} e */
export function stopPTT(e) {
  if (!_isPressing) return;
  const wasArmed = _cancelArmed;
  _isPressing  = false;
  _cancelArmed = false;
  if (e) e.preventDefault();
  if (_cb.onTrashState) _cb.onTrashState('hidden');

  if (wasArmed) {
    // Cancel: discard transcript, stop rec
    _finalT = '';
    try { if (_rec) { (_rec.abort || _rec.stop).call(_rec); } } catch (_) {}
    if (_cb.onLive)      _cb.onLive('', false);
    if (_cb.onRecBanner) _cb.onRecBanner(false);
    _setState('idle');
    return;
  }

  if (_recState !== 'listening') return;
  try { if (_rec) _rec.stop(); } catch (_) {}
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _setState(s) {
  _recState = s;
  if (_cb.onStateChange) _cb.onStateChange(s);
}

function _mergeNoDup(prev, next) {
  if (!prev) return next.trim();
  if (!next) return prev;
  const prevW = prev.trim().split(/\s+/);
  const nextW = next.trim().split(/\s+/);
  const maxN  = Math.min(prevW.length, nextW.length, 6);
  for (let n = maxN; n > 0; n--) {
    if (prevW.slice(-n).join(' ').toLowerCase() === nextW.slice(0, n).join(' ').toLowerCase()) {
      const rest = nextW.slice(n).join(' ');
      return rest ? (prev + ' ' + rest).replace(/\s+/g, ' ').trim() : prev;
    }
  }
  return (prev + ' ' + next).replace(/\s+/g, ' ').trim();
}

function _finishRec() {
  _setState('idle');
  if (_cb.onLive)      _cb.onLive('', false);
  if (_cb.onRecBanner) _cb.onRecBanner(false);
  if (_cb.onTrashState) _cb.onTrashState('hidden');
  const t = _finalT.trim();
  if (t && _cb.onFinal) _cb.onFinal(t);
  _finalT = '';
}

function _startRec() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (_cb.onError) _cb.onError('Reconnaissance vocale non disponible. Utilisez Chrome.');
    _isPressing = false;
    return;
  }
  let sessionFinal = '';
  try {
    _rec = new SR();
    _rec.lang           = _lang;
    _rec.interimResults = true;
    _rec.continuous     = true;

    _rec.onstart = () => {
      _setState('listening');
      if (_cb.onRecBanner) _cb.onRecBanner(true);
      try { navigator.vibrate && navigator.vibrate(35); } catch (_) {}
    };

    _rec.onresult = e => {
      let interim = '', sf = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) sf = _mergeNoDup(sf, e.results[i][0].transcript);
        else                      interim += e.results[i][0].transcript;
      }
      sessionFinal = sf;
      const preview = (_finalT + ' ' + sessionFinal + ' ' + interim)
        .replace(/\s+/g, ' ').trim();
      if (_cb.onLive) _cb.onLive(preview, true);
    };

    _rec.onend = () => {
      if (sessionFinal) _finalT = _mergeNoDup(_finalT, sessionFinal);
      if (_isPressing) {
        // Restart immediately (continuous mode restart workaround)
        setTimeout(() => {
          if (_isPressing) {
            try { _startRec(); } catch (_) { _finishRec(); }
          } else {
            _finishRec();
          }
        }, 80);
      } else {
        _finishRec();
      }
    };

    _rec.onerror = e => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      _isPressing = false;
      if (_cb.onError) _cb.onError('Micro