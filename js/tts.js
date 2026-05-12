// ── Text-to-speech engine ─────────────────────────────────────────────────────
// Manages playback state and the local-before-remote voice fallback chain.
// Fires an onPlayChange callback instead of touching the DOM directly.
//
// Fallback strategy (preserving original logic exactly):
//   1. Exact-match local voices
//   2. Base-language local voices
//   3. Engine auto-pick (exact lang code, then base)
//   4. Exact-match remote (network) voices
//   5. Base-language remote voices
//   6. System default (no lang hint)
//
// This avoids the Chrome bug where picking a Network voice that is unavailable
// causes synthesis-failed while the equivalent local voice would work fine.

let _playId       = null;
let _kaTimer      = null;   // keep-alive interval (Chrome long-utterance bug)
let _cachedVoices = [];
let _onPlayChange = null;   // (prevId: string|null, nextId: string|null) => void

/** Call once at startup. Pass a callback that receives (prevId, nextId). */
export function initTTS(onPlayChange) {
  _onPlayChange = onPlayChange;
  if (!window.speechSynthesis) return;
  const load = () => {
    const vs = speechSynthesis.getVoices();
    if (vs.length) _cachedVoices = vs;
  };
  speechSynthesis.onvoiceschanged = load;
  load();
}

export function getCurrentPlayId() { return _playId; }

/** Stop any current utterance immediately. */
export function stop() {
  try { clearInterval(_kaTimer); window.speechSynthesis && speechSynthesis.cancel(); } catch (_) {}
  _setPlayId(null);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _setPlayId(id) {
  const prev = _playId;
  _playId = id;
  if (_onPlayChange) _onPlayChange(prev, id);
}

function _buildAttempts(langCode) {
  // Re-fetch voices each time — list can change after page load
  let fresh = [];
  try { fresh = speechSynthesis.getVoices() || []; } catch (_) {}
  if (fresh.length) _cachedVoices = fresh;

  const voices = _cachedVoices;
  const base   = langCode.split('-')[0].toLowerCase();
  const want   = langCode.toLowerCase();
  const vl     = v => (v.lang || '').toLowerCase().replace('_', '-');

  const exactLocal  = voices.filter(v => vl(v) === want && v.localService === true);
  const exactRemote = voices.filter(v => vl(v) === want && v.localService === false);
  const baseLocal   = voices.filter(v => vl(v).split('-')[0] === base && vl(v) !== want && v.localService === true);
  const baseRemote  = voices.filter(v => vl(v).split('-')[0] === base && vl(v) !== want && v.localService === false);

  const list = [];
  exactLocal .forEach(v => list.push({ voice:v, lang:v.lang, label:`local ${v.name} (${v.lang})` }));
  baseLocal  .forEach(v => list.push({ voice:v, lang:v.lang, label:`local ${v.name} (${v.lang})` }));
  list.push({ voice:null, lang:langCode, label:`engine default (${langCode})` });
  list.push({ voice:null, lang:base,     label:`engine default (${base})` });
  exactRemote.forEach(v => list.push({ voice:v, lang:v.lang, label:`remote ${v.name} (${v.lang})` }));
  baseRemote .forEach(v => list.push({ voice:v, lang:v.lang, label:`remote ${v.name} (${v.lang})` }));
  list.push({ voice:null, lang:null, label:'system default' });
  return list;
}

/**
 * Speak a message, identified by id (used for button toggling).
 * Calling speak() with the currently-playing id stops playback.
 *
 * @param {string} id       - unique message identifier
 * @param {string} text     - text to speak
 * @param {string} langCode - BCP-47 code e.g. 'it-IT'
 * @param {number} rate     - speech rate (0.1 – 10)
 */
export function speak(id, text, langCode, rate) {
  if (!text) return;

  if (!window.speechSynthesis) {
    if (_onPlayChange) _onPlayChange(null, 'error:TTS non disponible sur ce navigateur.');
    return;
  }

  // Tap the same message again → stop
  if (_playId === id) { stop(); return; }

  // Cancel any in-progress utterance, then wait a tick if needed
  let wasSpeaking = false;
  try { wasSpeaking = speechSynthesis.speaking || speechSynthesis.pending; } catch (_) {}
  try { clearInterval(_kaTimer); } catch (_) {}
  if (wasSpeaking) {
    try { speechSynthesis.cancel(); } catch (_) {}
  }
  _setPlayId(null);

  const attempts = _buildAttempts(langCode);
  console.log('TTS attempts:', attempts.map(a => a.label));
  console.log('TTS voices:', _cachedVoices.map(v => `${v.name} [${v.lang}]${v.localService ? ' local' : ' net'}`));

  function tryAttempt(i) {
    if (i >= attempts.length) {
      _setPlayId(null);
      if (_onPlayChange) {
        _onPlayChange(null,
          `error:Aucune voix ${langCode} ne fonctionne. ` +
          `Verifiez que le pack de langue est installe (Parametres > Heure et langue > Langue).`
        );
      }
      return;
    }
    const a = attempts[i];
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate  = rate;
      u.pitch = 1;
      if (a.lang)  u.lang  = a.lang;
      if (a.voice) u.voice = a.voice;

      u.onstart = () => { _setPlayId(id); };
      u.onend   = () => { clearInterval(_kaTimer); _setPlayId(null); };
      u.onerror = e => {
        clearInterval(_kaTimer);
        const er = (e && e.error) || '';
        console.warn(`TTS attempt ${i} (${a.label}) error:`, er);
        if (er === 'canceled' || er === 'interrupted') { _setPlayId(null); return; }
        tryAttempt(i + 1);
      };

      // Optimistic: set playId before onstart so the button updates immediately
      _setPlayId(id);
      speechSynthesis.speak(u);

      // Keep-alive: Chrome stops synthesis silently on long texts
      _kaTimer = setInterval(() => {
        if (!speechSynthesis.speaking) { clearInterval(_kaTimer); return; }
        try { speechSynthesis.pause(); speechSynthesis.resume(); } catch (_) {}
      }, 10000);

    } catch (e) {
      console.warn(`TTS attempt ${i} threw:`, e.message);
      tryAttempt(i + 1);
    }
  }

  // Give the engine a tick after cancelling to avoid the Chrome "blink" bug
  if (wasSpeaking) setTimeout(() => tryAttempt(0), 120);
  else tryAttempt(0);
}
