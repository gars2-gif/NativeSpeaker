// ── Application orchestrator ──────────────────────────────────────────────────
// Wires all modules together and owns the four pages' logic:
//   Key page    -- save/test/delete API key
//   Setup page  -- pick language, level, scenario
//   Chat page   -- send messages, receive replies, TTS/STT (Push-To-Talk)
//   Vocab page  -- browse & delete the saved vocabulary dictionary

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
  if (!k) { setStatus('Entrez dabord la cle', 'err'); return; }
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

function buildSetupUI() {
  const { selLang, selLevel, scenario } = getState();

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

  const lr = $('lr'); lr.innerHTML = '';
  LEVELS.forEach(lv => {
    const b = document.createElement('button');
    b.className   = 'lvl-btn' + (lv.id === selLevel ? ' sel' : '');
    b.textContent = lv.l;
    b.addEventListener('click', () => { setState('selLevel', lv.id); buildSetupUI(); });
    lr.appendChild(b);
  });

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

function _startChat() {
  const scText = ($('sctx').value || '').trim();
  if (scText) setState('scenario', scText);
  setState('convo', []);
  clearMessages();
  const { selLang, selLevel, scenario } = getState();
  const sp = $('settings-panel'); if (sp) sp.classList.remove('open');
  $('tf').textContent = selLang.flag;
  $('tn').textContent = selLang.native + ' - ' + selLang.city;
  $('ts').textContent = LEVELS.find(l => l.id === selLevel).l + (scenario ? ' - Role' : '');
  const cb = $('ctx-bar');
  if (scenario) { cb.textContent = scenario; cb.style.display = ''; }
  else          { cb.style.display = 'none'; }
  navigate('p-chat');
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
  $('ti').addEventListener('input', () => { _resizeTextarea($('ti')); _syncSendBtn(); });
  $('ti').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendText(); }
  });
  $('bs').addEventListener('click', _sendText);
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

function _onModifyMessage(text) {
  const ta = $('ti');
  ta.value = text;
  _resizeTextarea(ta);
  _syncSendBtn();
  ta.focus();
}

function _onDeleteMessage() {}

function _setStep(txt) { $('step').textContent = txt; }

function _setLive(text, visible) {
  const el = $('live');
  el.textContent = text || '...';
  el.style.opacity = visible ? '1' : '0';
}

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
  const mh = $('mh');
  if (mh && state === 'armed') {
    mh.textContent = 'Relachez pour annuler';
    mh.style.color = '#e08080';
  } else if (mh && state === 'visible') {
    mh.textContent = 'Relachez pour envoyer';
    mh.style.color = '#e08080';
  }
}

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

async function _doCallAPI(userText) {
  const state = getState();
  if (state.busy) return;
  setState('busy', true);
  const content = userText === '__init__'
    ? 'You are starting the conversation. Greet the user and ask a simple opening question. Set corrections:[] and pronunciation_tips:[] and corrected_sentence:"".'
    : userText;
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
    convo.push({ role: 'assistant', content: rawText });
    setState('convo', convo);
    const id = 'm' + Date.now();
    addNativeMsg(parsed, id);
    _setStep('');
  } catch (e) {
    showThinking(false);
    _updateMicBtn();
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

function _togglePanel(panelId) {
  const p = $(panelId);
  if (!p) return;
  p.classList.toggle('open');
}

// ════════════════════════════════════════════════════════════════════════════
// VOCAB PAGE
// ════════════════════════════════════════════════════════════════════════════

let _vocabActiveLang = null;

function _openVocab(returnPage) {
  $('btn-vocab-back')._returnPage = returnPage;
  _renderVocabPage();
  navigate('p-vocab');
}

function _renderVocabPage() {
  const langs  = getAllVocabLangs();
  const tabsEl = $('vocab-tabs');
  const listEl = $('vocab-list');

  if (!langs.includes(_vocabActiveLang)) {
    _vocabActiveLang = langs[0] || null;
  }

  tabsEl.innerHTML = '';

  if (!langs.length) {
    listEl.innerHTML = '<div class="vocab-empty">Aucun mot enregistre. Les corrections de vocabulaire apparaitront ici automatiquement.</div>';
    return;
  }

  langs.forEach(function(code) {
    var langMeta = LANGS.find(function(l) { return l.code === code; });
    var count    = getVocab(code).length;
    var btn      = document.createElement('button');
    btn.className = 'vocab-tab' + (code === _vocabActiveLang ? ' active' : '');
    var badge = document.createElement('span');
    badge.className = 'vocab-tab-count';
    badge.textContent = count;
    btn.textContent = (langMeta ? langMeta.flag + ' ' + langMeta.name : code) + ' ';
    btn.appendChild(badge);
    btn.addEventListener('click', function() { _vocabActiveLang = code; _renderVocabPage(); });
    tabsEl.appendChild(btn);
  });

  listEl.innerHTML = '';
  var entries = getVocab(_vocabActiveLang);

  if (!entries.length) {
    listEl.innerHTML = '<div class="vocab-empty">Aucun mot enregistre dans cette langue.</div>';
    return;
  }

  entries.forEach(function(entry) {
    var card = document.createElement('div');
    card.className = 'vocab-card fi';

    var top = document.createElement('div');
    top.className = 'vocab-card-top';

    var wordEl = document.createElement('span');
    wordEl.className = 'vocab-word';
    wordEl.textContent = entry.word;
    top.appendChild(wordEl);

    if (entry.count > 1) {
      var countEl = document.createElement('span');
      countEl.className = 'vocab-count';
      countEl.textContent = entry.count + 'x';
      top.appendChild(countEl);
    }

    var delBtn = document.createElement('button');
    delBtn.className = 'vocab-delete';
    delBtn.setAttribute('aria-label', 'Supprimer');
    delBtn.textContent = 'x';
    (function(w) {
      delBtn.addEventListener('click', function() {
        deleteVocabEntry(_vocabActiveLang, w);
        _renderVocabPage();
      });
    })(entry.word);
    top.appendChild(delBtn);
    card.appendChild(top);

    if (entry.original) {
      var origRow = document.createElement('div');
      origRow.className = 'vocab-original';
      var origWord = document.createElement('span');
      origWord.className = 'vocab-original-word';
      origWord.textContent = entry.original;
      var corrWord = document.createElement('span');
      corrWord.className = 'vocab-corrected-word';
      corrWord.textContent = entry.word;
      origRow.appendChild(origWord);
      origRow.appendChild(document.createTextNode(' > '));
      origRow.appendChild(corrWord);
      card.appendChild(origRow);
    }

    if (entry.explanation) {
      var expEl = document.createElement('div');
      expEl.className = 'vocab-explanation';
      expEl.textContent = entry.explanation;
      card.appendChild(expEl);
    }

    var dateEl = document.createElement('div');
    dateEl.className = 'vocab-date';
    dateEl.textContent = entry.date;
    card.appendChild(dateEl);

    listEl.appendChild(card);
  });
}

function initVocabPage() {
  $('btn-vocab-back').addEventListener('click', function() {
    var returnPage = $('btn-vocab-back')._returnPage || 'p-setup';
    navigate(returnPage);
  });
  $('vocab-btn-setup').addEventListener('click', function() { _openVocab('p-setup'); });
  $('vocab-btn-chat').addEventListener('click',  function() { _openVocab('p-chat'); });
}

// ════════════════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', function() {
  initStore();
  const { chatFs } = getState();
  document.documentElement.style.setProperty('--cfs', chatFs + 'px');

  initTTS(function(prevId, nextId) {
    if (nextId && nextId.startsWith('error:')) {
      addErrMsg(nextId.slice(6));
      syncSpeakButtons(prevId, null);
    } else {
      syncSpeakButtons(prevId, nextId);
    }
  });

  initSTT({
    onStateChange: _onRecStateChange,
    onLive:        function(text, visible) { _setLive(text, visible); },
    onFinal:       function(text) {
      addUserMsg(text, _onModifyMessage, _onDeleteMessage);
      _doCallAPI(text);
    },
    onError:       function(msg)  { addErrMsg(msg); },
    onTrashState:  _onTrashState,
    onRecBanner:   _onRecBanner,
  });

  initSettings();
  initKeyPage();
  initSetupPage();
  initChatPage();
  initVocabPage();
  buildSetupUI();

  onLeave('p-chat', function() { stopTTS(); stopSTT(); });

  const { apiKey } = getState();
  if (apiKey) navigate('p-setup');
});
