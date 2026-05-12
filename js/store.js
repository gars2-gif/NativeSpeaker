// ── Centralized state store ───────────────────────────────────────────────────
// Single source of truth for all runtime state.
// Use setState() to mutate — never write _state directly from outside.

import { LANGS } from './constants.js';

const _listeners = {};

const _state = {
  apiKey:   '',
  selLang:  LANGS[0],
  selLevel: 'intermediate',
  scenario: '',
  convo:    [],
  busy:     false,
  playId:   null,
  muted:    false,
  ttsRate:  0.88,
  chatFs:   16,
};

/** Read current state (returns the live object — do not mutate). */
export function getState() {
  return _state;
}

/** Update a single key and notify subscribers. */
export function setState(key, value) {
  _state[key] = value;
  const fns = _listeners[key];
  if (fns) fns.forEach(fn => fn(value, _state));
}

/** Subscribe to changes on a specific key. */
export function subscribe(key, fn) {
  if (!_listeners[key]) _listeners[key] = [];
  _listeners[key].push(fn);
}

/** Load persisted preferences from localStorage. Call once at startup. */
export function initStore() {
  _state.apiKey = localStorage.getItem('nk') || '';

  const rate = parseFloat(localStorage.getItem('rate'));
  if (!isNaN(rate)) _state.ttsRate = rate;

  _state.muted = localStorage.getItem('muted') === '1';

  const cfs = parseInt(localStorage.getItem('cfs'), 10);
  if (!isNaN(cfs)) _state.chatFs = cfs;
}
