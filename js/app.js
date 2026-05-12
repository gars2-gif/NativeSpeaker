// ── Application orchestrator ──────────────────────────────────────────────────
// Wires all modules together and owns the four pages' logic:
//   • Key page    — save/test/delete API key
//   • Setup page  — pick language, level, scenario
//   • Chat page   — send messages, receive replies, TTS/STT (Push-To-Talk)
//   • Vocab page  — browse & delete the saved vocabulary dictionary

import { LANGS, LEVELS, SCENS }                    from './constants.js';
import { getState, setState, initStore }            from './store.js';
import { navigate, onLeave }                        from './router.js';
import { initTTS, stop as stopTTS }                from './tts.js';
import {
  initSTT, startPTT, movePTT, stopPTT,
  preWarmMic, stop as stopSTT, getRecState,
}                                                   from './stt.js';
import { callAPI, testAPIKey, makeSystem }         from './api.js';
import { initSettings }                            from './ui/settings.js';
import {
  clearMessages, addNativeMsg, addUserMsg,
  addErrMsg, addRawMsg, showThinking, syncSpeakButtons,
} from './ui/messages.js';
import { getVocab, getAllVocabLangs, deleteVocabEntry } from './vocab.js';

// ── DOM shorthand ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ════════════════════════════════════════════════════════════════════════════
// KEY PAGE
// ════════════════════════════════════════════════════════════════════════════

function setStatus(msg, type) {
  const s = $('status');
  s.textContent = msg;
  s.className   = 'show ' + (type || 'info');
}

function initKeyPage() {
  $('btn-save-key').addEventListener('click', _saveKey);
  $('btn-test-key').addEventListener('click', _testKey);
  $('btn-delete-key').addEventListener('click', () => {
    localStorage.removeItem('nk');
    location.reload();
  });
}

function _saveKey() {
  const k = ($('ki').value || '').trim();
  if (!k) { setStatus('Entrez votre cle', 'err'); return; }
  setState('apiKey', k);
  localStorage.setItem('nk', k);
  navigate('p-setup');
}

async function _testKey() {
  const k = ($('ki').value || '').trim();
  if (!k) { setStatus('Entrez d abord la cle', 'err'); return; }
  setStatus('Test en cours...', 'info');
  try {
    await testAPIKey(k);
    setStatus('Cle valide! Vous pouvez continuer.', 'ok');
  } catch (e) {
    setStatus('Erreur: ' + e.message, 'err');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SETUP PAGE
// ════════════════════════════════════════════════════════════════════════════

function initSetupPage() {
  $('settings-btn-setup').addEventListener('click', () => _togglePanel('settings-panel-setup'));
  $('btn-start-chat').addEventListener('click', _startChat);
  $('btn-change-key').addEventListener('click', () => navigate('p-key'));
}

/** Rebuild the language / level / scenario selectors. */
function buildSetupUI() {
  const { selLang, selLevel, scenario } = getState();

  // ── Languages ─────────────────────────────────────────────────────────────
  const ll = $('ll'); ll.innerHTML = '';
  LANGS.forEach(l => {
    const b = document.createElement('button');
    b.className = 'lang-btn' + (l.code === selLang.code ? ' sel' : '');

    const fl = document.createElement('span'); fl.className = 'lang-flag';  fl.textContent = l.flag;
    const n  = document.createElement('span');
    n.className   = 'lang-name' + (l.code === selLang.code ? ' sel' : '');
    n.textContent = l.name;
    const s  = document.createElement('span'); s.className = 'lang-with'; s.textContent = 'avec ' + l.native;

    b.appendChild(fl); b.appendChild(n); b.appendChild(s);
    if (l.code === selLang.code) {
      const chk = document.createElement('span'); chk.className = 'lang-check'; chk.textContent = 'v';
      b.appendChild(chk);
    }
    b.addEventListener('click', () => { setState('selLang', l); buildSetupUI(); });
    ll.appendChild(b);
  });

  // ── Levels ────────────────────────────────────────────────────────────────
  const lr = $('lr'); lr.innerHTML = '';
  LEVELS.forEach(lv => {
    const b = document.createElement('button');
    b.className   = 'lvl-btn' + (lv.id === selLevel ? ' sel' : '');
    b.textContent = lv.l;
    b.addEventListener('click', () => { setState('selLevel', lv.id); buildSetupUI(); });
    lr.appendChild(b);
  });

  // ── Scenario chips ────────────────────────────────────────────────────────
  const ch = $('ch'); ch.innerHTML = '';
  SCENS.forEach(sc => {
    const c = document.createElement('div');
    c.className   = 'chip' + (scenario === sc.t && sc.t ? ' sel' : '');
    c.textContent = sc.e;
    c.addEventListener('click', () => {
      setState('scenario', sc.t);
      $('sctx').value = sc.t;
      buildSetupUI();
    });
    ch.appendChild(c);
  });
}

// ── Setup → Chat ──────────────────────────────────────────────────────────────

function _startChat() {
  const scText = ($('sctx').value || '').trim();
  if (scText) setState('scenario', scText);

  setState('convo', []);
  clearMessages();

  const { selLang, selLevel, scenario } = getState();

  // Hide settings panel if open
  const sp = $('settings-panel'); if (sp) sp.classList.remove('open');

  // Update topbar
  $('tf').textContent = selLang.flag;
  $('tn').textContent = selLang.native + ' - ' + selLang.city;
  $('ts').textContent = LEVELS.find(l => l.id === selLevel).l + (scenario ? ' - Role' : '');

  // Context bar
  const cb = $('ctx-bar');
  if (scenario) { cb.textContent = scenario; cb.style.display = ''; }
  else          { cb.style.display = 'none'; }

  navigate('p-chat');

  // Pre-warm mic for instant first PTT response
  preWarmMic().catch(() => {});

  _doCallAPI('__init__');
}

function _goSetup() {
  stopTTS();
  stopSTT();
  setState('convo', []);
  navigate('p-setup');
}

// ════════════════════════════════════════════════════════════════════════════
// CHAT PAGE
// ════════════════════════════════════════════════════════════════════════════

function initChatPage() {
  $('settings-btn').addEventListener('click', () => _togglePanel('settings-panel'));
  $('btn-gosetup').addEventListener('click', _goSetup);

  // Text input
  $('ti').addEventListener('input', () => { _resizeTextarea($('ti')); _syncSendBtn(); });
  $('ti').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendText(); }
  });
  $('bs').addEventListener('click', _sendText);

  // Push-to-talk mic button — pointer events (not click)
  const bm = $('bm');
  bm.addEventListener('pointerdown',   e => startPTT(e, getState().selLang.sr));
  bm.addEventListener('pointermove',   e => {
    const tr   = $('trash');
    const rect = tr && tr.style.display !== 'none' ? tr.getBoundingClientRect() : null;
    movePTT(e, rect);
  });
  bm.addEventListener('pointerup',     e => stopPTT(e));
  bm.addEventListener('pointercancel', e => stopPTT(e));
  bm.addEventListener('contextmenu',   e => e.preventDefault());
}

// ── Text send ─────────────────────────────────────────────────────────────────

function _sendText() {
  const ta = $('ti');
  const t  = ta.value.trim();
  if (!t || getState().busy) return;
  ta.value = '';
  _resizeTextarea(ta);
  _syncSendBtn();
  addUserMsg(t, _onModifyMessage, _onDeleteMessage);
  _doCallAPI(t);
}

function _syncSendBtn() {
  $('bs').disabled = !$('ti').value.trim() || getState().busy;
}

function _resizeTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 88) + 'px';
}

// ── Modify / Delete callbacks (from long-press menu) ─────────────────────────

function _onModifyMessage(text) {
  const ta = $('ti');
  ta.value = text;
  _resizeTextarea(ta);
  _syncSendBtn();
  ta.focus();
}

function _onDeleteMessage() {
  // deleteFromTurn already handled everything in messages.js
}

// ── Step indicator ────────────────────────────────────────────────────────────

function _setStep(txt) { $('step').textContent = txt; }

// ── Mic / rec-banner / trash UI ───────────────────────────────────────────────

function _setLive(text, visible) {
  const el = $('live');
  el.textContent = text || '...';
  el.style.opacity = visible ? '1' : '0';
}

/** Called by STT onTrashState: 'hidden' | 'visible' | 'armed' */
function _onTrashState(state) {
  const tr = $('trash');
  if (!tr) return;
  if (state === 'hidden') {
    tr.style.display = 'none';
    tr.classList.remove('armed');
  } else if (state === 'visible') {
    tr.style.display = 'flex';
    tr.classList.remove('armed');
  } else if (state === 'armed') {
    tr.style.display = 'flex';
    tr.classList.add('armed');
  }
  // Update hint text
  const mh = $('mh');
  if (mh && state === 'armed') {
    mh.textContent = 'Relachez pour annuler';
    mh.style.color = '#e08080';
  } else if (mh && state === 'visible') {
    mh.textContent = 'Relachez pour envoyer';
    mh.style.color = '#e08080';
  }
}

/** Called by STT onRecBanner */
function _onRecBanner(visible) {
  const bn = $('rec-banner');
  if (bn) bn.style.display = visible ? 'flex' : 'none';
}

function _updateMicBtn() {
  const { busy } = getState();
  const recState = getRecState();
  const bm = $('bm');
  bm.className = (busy ? 'off' : recState) + ' no-sel';
  bm.disabled  = busy;
  _syncSendBtn();
}

function _onRecStateChange(s) {
  const mh = $('mh');
  if (mh) {
    mh.textContent = s === 'listening' ? 'Relachez pour envoyer' : 'Maintenez pour parler';
    mh.style.color = s === 'listening' ? '#e08080' : '#2a3a4a';
  }

  // Ring animations
  const mw = $('mw');
  mw.querySelectorAll('.ring').forEach(r => r.remove());
  if (s === 'listening') {
    const r1 = document.createElement('div'); r1.className = 'ring';
    const r2 = document.createElement('div'); r2.className = 'ring ring2';
    mw.insertBefore(r2, mw.firstChild);
    mw.insertBefore(r1, mw.firstChild);
  }
  _updateMicBtn();
}

// ── API orchestration ─────────────────────────────────────────────────────────

async function _doCallAPI(userText) {
  const state = getState();
  if (state.busy) return;
  setState('busy', true);

  const content = userText === '__init__'
    ? 'You are starting the conversation. Greet the user and ask a simple opening question. Set corrections:[] and pronunciation_tips:[] and corrected_sentence:"".'
    : userText;

  // Add user turn to history
  const convo = state.convo;
  convo.push({ role: 'user', content });
  setState('convo', convo);

  _setStep('Envoi...');
  showThinking(true);
  _updateMicBtn();

  try {
    _setStep('Appel API...');
    const system = makeSystem(state.selLang, state.selLevel, state.scenario);
    const { rawText, parsed } = await callAPI(state.apiKey, convo, system);

    _setStep('Lecture reponse...');
    console.log('RAW:', rawText);
    _setStep('Parsing...');
    showThinking(false);
    _updateMicBtn();

    if (!parsed) {
      addRawMsg('Reponse non-JSON recu:\n' + rawText.substring(0, 400));
      _setStep('Erreur JSON');
      setState('busy', false);
      _updateMicBtn();
      return;
    }
    if (!parsed.reply) {
      addRawMsg('Champ reply absent. JSON recu: ' + JSON.stringify(parsed).substring(0, 300));
      _setStep('Erreur reply');
      setState('busy', false);
      _updateMicBtn();
      return;
    }

    // Add assistant turn to history
    convo.push({ role: 'assistant', content: rawText });
    setState('convo', convo);

    const id = 'm' + Date.now();
    addNativeMsg(parsed, id);
    _setStep('');

  } catch (e) {
    showThinking(false);
    _updateMicBtn();
    // Ignore AbortError (user deleted the turn)
    if (e.name !== 'AbortError') {
      console.error('callAPI error:', e);
      addErrMsg(e.message);
      _setStep('Erreur');
    } else {
      _setStep('');
    }
  }

  setState('busy', false);
  _updateMicBtn();
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function _togglePanel(panelId) {
  const p = $(panelId);
  if (!p) return;
  p.classList.toggle('open');
}

// ════════════════════════════════════════════════════════════════════════════
// VOCAB PAGE
// ════════════════════════════════════════════════════════════════════════════

// Remembers which language tab is active while on the vocab page
let _vocabActiveLang = null;

function _openVocab(returnPage) {
  // Store the page we came from so the back button knows where to go
  $('btn-vocab-back')._returnPage = returnPage;
  _renderVocabPage();
  navigate('p-vocab');
}

function _renderVocabPage() {
  const langs     = getAllVocabLangs();
  const tabsEl    = $('vocab-tabs');
  const listEl    = $('vocab-list');

  // Pick active lang: keep current if still valid, otherwise first available
  if (!langs.includes(_vocabActiveLang)) {
    _vocabActiveLang = langs[0] || null;
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  tabsEl.innerHTML = '';
  if (!langs.length) {
    listEl.innerHTML = '<div class="vocab-empty">Aucun mot enregistré pour l\'instant.<br>Les corrections de vocabulaire apparaîtront ici automatiquement.</div>';
    return;
  }

  langs.forEach(code => {
    const langMeta = LANGS.find(l => l.code === code);
    const count    = getVocab(code).length;
    const btn      = document.createElement('button');
    btn.className  = 'vocab-tab' + (code === _vocabActiveLang ? ' active' : '');
    btn.innerHTML  = `${langMeta ? langMeta.flag + ' ' + langMeta.name : code} <span class="vocab-tab-count">${count}</span>`;
    btn.addEventListener('click', () => { _vocabActiveLang = code; _renderVocabPage(); });
    tabsEl.appendChild(btn);
  });

  // ── Entry list ─────────────────────────────────────────────────────────────
  listEl.innerHTML = '';
  const entries = getVocab(_vocabActiveLang);

  if (!entries.length) {
    listEl.innerHTML = '<div class="vocab-empty">Aucun mot enregistré dans cette langue.</div>';
    return;
  }

  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'vocab-card fi';

    card.innerHTML = `
      <div class="vocab-card-top">
        <span class="vocab-word">${entry.word}</span>
        ${entry.count > 1 ? `<span class="vocab-count">${entry.count}×</span>` : ''}
        <button class="vocab-delete" aria-label="Supprimer ${entry.word}" data-word="${entry.word}">✕</button>
      </div>
      ${entry.original ? `<div class="vocab-original"><span class="vocab-original-word">${entry.original}</span> → <span class="vocab-corrected-word">${entry.word}</span></div>` : ''}
      ${entry.explanation ? `<div class="vocab-explanation">${entry.explanation}</div>` : ''}
      <div class="vocab-date">${entry.date}</div>
    `;

    card.querySelector('.vocab-delete').addEventListener('click', () => {
      deleteVocabEntry(_vocabActiveLang, entry.word);
      _renderVocabPage();
    });

    listEl.appendChild(card);
  });
}

function initVocabPage() {
  $('btn-vocab-back').addEventListener('click', () => {
    const returnPage = $('btn-vocab-back')._returnPage || 'p-setup';
    navigate(returnPage);
  });
  $('vocab-btn-setup').addEventListener('click', () => _openVocab('p-setup'));
  $('vocab-btn-chat').addEventListener('click',  () => _openVocab('p-chat'));
}

// ════════════════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {

  // 1. Load persisted state (apiKey, ttsRate, muted, chatFs)
  initStore();

  // 2. Apply saved font size
  const { chatFs } = getState();
  document.documentElement.style.setProperty('--cfs', chatFs + 'px');

  // 3. TTS — pass callback that syncs speak buttons and shows errors
  initTTS((prevId, nextId) => {
    if (nextId && nextId.startsWith('error:')) {
      addErrMsg(nextId.slice(6));
      syncSpeakButtons(prevId, null);
    } else {
      syncSpeakButtons(prevId, nextId);
    }
  });

  // 4. STT — wire callbacks into UI
  initSTT({
    onStateChange: _onRecStateChange,
    onLive:        (text, visible) => _setLive(text, visible),
    onFinal:       text => {
      addUserMsg(text, _onModifyMessage, _onDeleteMessage);
      _doCallAPI(text);
    },
    onError:       msg  => addErrMsg(msg),
    onTrashState:  _onTrashState,
    onRecBanner:   _onRecBanner,
  });

  // 5. Render settings panels (both pages)
  initSettings();

  // 6. Init page-specific event listeners
  initKeyPage();
  initSetupPage();
  initChatPage();
  initVocabPage();

  // 7. Build the dynamic setup UI (language/level/scenario selectors)
  buildSetupUI();

  // 8. Lifecycle: stop TTS + STT automatically when leaving the chat page
  onLeave('p-chat', () => { stopTTS(); stopSTT(); });

  // 9. Navigate to the right starting page
  const { apiKey } = getState();
  if (apiKey) navigate('p-setup');
  // else stay on p-key (already visible via HTML class="page on")
});
