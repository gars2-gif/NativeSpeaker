// ── Vocabulary dictionary ─────────────────────────────────────────────────────
// Persists "vocabulaire"-type corrections to localStorage, keyed by language.
// Deduplicates on the corrected word — repeated mistakes increment a counter.

const _PREFIX = 'vocab_';

// ── Internal helpers ──────────────────────────────────────────────────────────

function _key(langCode) {
  return _PREFIX + langCode;
}

function _load(langCode) {
  try {
    return JSON.parse(localStorage.getItem(_key(langCode))) || [];
  } catch (_) {
    return [];
  }
}

function _save(langCode, entries) {
  localStorage.setItem(_key(langCode), JSON.stringify(entries));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Persist all "vocabulaire" corrections from an API response.
 * Deduplicates by corrected word — increments count on repeat.
 * @param {string}   langCode   - e.g. 'it', 'es'
 * @param {object[]} corrections - parsed.corrections array from API
 */
export function saveVocabCorrections(langCode, corrections) {
  if (!corrections || !corrections.length) return;
  const vocab = corrections.filter(c => c.type === 'vocabulaire');
  if (!vocab.length) return;

  const entries = _load(langCode);
  const today   = new Date().toISOString().slice(0, 10);

  vocab.forEach(c => {
    const word = (c.corrected || '').trim().toLowerCase();
    if (!word) return;
    const existing = entries.find(e => e.word === word);
    if (existing) {
      existing.count++;
      existing.date = today;
    } else {
      entries.unshift({
        word:        c.corrected || '',
        original:    c.original  || '',
        explanation: c.explanation || '',
        date:        today,
        count:       1,
      });
    }
  });

  _save(langCode, entries);
}

/**
 * Return all vocab entries for a language, sorted newest first.
 * @param {string} langCode
 * @returns {object[]}
 */
export function getVocab(langCode) {
  return _load(langCode);
}

/**
 * Return the list of language codes that have at least one entry.
 * @returns {string[]}
 */
export function getAllVocabLangs() {
  return Object.keys(localStorage)
    .filter(k => k.startsWith(_PREFIX) && _load(k.slice(_PREFIX.length)).length)
    .map(k => k.slice(_PREFIX.length));
}

/**
 * Delete a single entry by its corrected word.
 * @param {string} langCode
 * @param {string} word  - the corrected form (as stored)
 */
export function deleteVocabEntry(langCode, word) {
  const entries = _load(langCode).filter(e => e.word !== word);
  _save(langCode, entries);
}
