// ── Anthropic API layer ───────────────────────────────────────────────────────
// Pure async functions — no DOM access, no global state.
// Callers are responsible for updating the UI based on returned values.

const API_URL     = 'https://api.anthropic.com/v1/messages';
const MODEL       = 'claude-haiku-4-5-20251001';
const API_VERSION = '2023-06-01';

function _headers(apiKey) {
  return {
    'Content-Type':  'application/json',
    'x-api-key':     apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

// ── System prompt ─────────────────────────────────────────────────────────────

/**
 * Build the system prompt from current session config.
 * @param {object} lang    - selected LANGS entry
 * @param {string} level   - 'beginner' | 'intermediate' | 'advanced'
 * @param {string} scenario - free text or ''
 */
export function makeSystem(lang, level, scenario) {
  const ctx = scenario ? ` ROLEPLAY: ${scenario} Stay in character.` : '';
  return (
    `You are ${lang.native}, a native ${lang.name} speaker from ${lang.city}.${ctx}` +
    ` Converse naturally with a French learner at ${level} level.` +
    ` CRITICAL: Reply with ONLY a JSON object. No text before or after. No markdown. No backticks. Just JSON.` +
    ` Format: {"reply":"your response in ${lang.name}","translation":"french translation","corrections":[],"pronunciation_tips":[],"encouragement":""}` +
    ` Keep reply to 1-3 short spoken sentences. corrections and pronunciation_tips are arrays of correction objects.`
  );
}

// ── JSON extraction ───────────────────────────────────────────────────────────

/**
 * Very permissive JSON extractor — handles markdown fences and leading/trailing
 * noise that the model occasionally adds despite instructions.
 * Returns null if no valid JSON object can be found.
 */
export function parseReply(text) {
  // Try 1: direct parse
  try { return JSON.parse(text); } catch (_) {}
  // Try 2: strip markdown code fence
  const stripped = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(stripped); } catch (_) {}
  // Try 3: find first { … last }
  const i = text.indexOf('{');
  const j = text.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try { return JSON.parse(text.slice(i, j + 1)); } catch (_) {}
  }
  return null;
}

// ── Main chat call ────────────────────────────────────────────────────────────

/**
 * Send a conversation turn to the API.
 * @param {string}   apiKey
 * @param {object[]} messages  - full conversation history (role/content pairs)
 * @param {string}   system    - system prompt from makeSystem()
 * @returns {Promise<{rawText: string, parsed: object|null}>}
 * @throws  on HTTP errors or API-level errors
 */
export async function callAPI(apiKey, messages, system) {
  const res = await fetch(API_URL, {
    method:  'POST',
    headers: _headers(apiKey),
    body:    JSON.stringify({ model: MODEL, max_tokens: 800, system, messages }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.substring(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const rawText = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  return { rawText, parsed: parseReply(rawText) };
}

// ── Key validation ────────────────────────────────────────────────────────────

/**
 * Validate an API key by making a minimal real request.
 * @throws on network error or API-level error
 */
export async function testAPIKey(key) {
  const res = await fetch(API_URL, {
    method:  'POST',
    headers: _headers(key),
    body:    JSON.stringify({ model: MODEL, max_tokens: 5, messages: [{ role:'user', content:'Hi' }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return true;
}
