# Langue Natif

A mobile-first web app for conversational language practice with an AI native speaker. Runs entirely in the browser — no build step, no server, no dependencies. Deploy directly to GitHub Pages.

## Features

- **Conversational AI** — powered by Claude (Anthropic API), responds as a native speaker in the target language
- **Push-to-talk mic** — hold the mic button to record, release to send; slide to the trash zone to cancel
- **Text input** — type and send with Enter or the ↑ button
- **TTS playback** — replies are read aloud automatically using the Web Speech API, with a local-before-network voice fallback chain
- **Inline corrections** — grammar, vocabulary, and spelling errors highlighted with explanations; full corrected sentence with its own replay button
- **Pronunciation tips** — phonetic guide for tricky words
- **Translation toggle** — show/hide French translation per reply
- **Long-press message menu** — hold any of your messages to modify (puts text back in the input) or delete (removes that turn and all subsequent ones from the conversation)
- **5 languages** — Italian, Spanish, English, German, Brazilian Portuguese
- **3 levels** — Beginner, Intermediate, Advanced
- **Scenario / roleplay** — preset scenes (restaurant, café, market…) or free-form context
- **Settings** — mute TTS, adjust voice speed (0.75×–1.25×), adjust chat font size; persisted in localStorage

## Getting started

1. Open [the app](https://gars2-gif.github.io/NativeSpeaker/) (or deploy your own — see below)
2. Enter your [Anthropic API key](https://console.anthropic.com/settings/keys) (stored only in your browser's localStorage)
3. Pick a language, level, and optional scenario
4. Start talking

## Self-hosting / GitHub Pages

The app is a plain ES-module site with zero build tooling required.

```
index.html
styles.css
js/
  app.js          ← orchestrator, page logic
  constants.js    ← LANGS, LEVELS, SCENS, SPEEDS, FONT_SIZES
  store.js        ← centralized state + subscribe()
  router.js       ← page navigation with onLeave hooks
  api.js          ← Anthropic API calls, makeSystem(), cancelAPI()
  tts.js          ← Web Speech TTS with local-first voice fallback
  stt.js          ← Push-to-talk STT (continuous, mergeNoDup)
  ui/
    settings.js   ← mute / speed / font-size panels (both pages)
    messages.js   ← bubble rendering, long-press menu, deleteFromTurn
```

Fork the repo, enable GitHub Pages from your branch root, and it works immediately — no npm, no bundler.

## Browser support

Chrome / Edge on Android or desktop (Web Speech API required for mic and TTS). Safari supports TTS but mic recognition is limited.

## Privacy

Your API key never leaves your browser. All requests go directly from your browser to `api.anthropic.com`.
