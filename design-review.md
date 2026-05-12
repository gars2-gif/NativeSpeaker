# NativeSpeaker — Design & Accessibility Review
_Full review: Design Critique · WCAG 2.1 AA · UX Copy_

---

## 1. Design Critique

### Strengths
- The dark color scheme is visually cohesive, with a consistent accent color (`#4a9de0`) used for all active/selected states across language buttons, level chips, and settings toggles.
- The three-screen flow (Key → Setup → Chat) is logically ordered and focused.
- Message bubble differentiation (assistant vs. user) is clear: different alignments, border-radii, and italic user text give immediate visual context.
- The Notes panel (corrections + pronunciation tips) is a well-thought-out feature and the visual separation from the main bubble is appropriate.
- The animated typing indicator and the recording banner provide good real-time feedback.

### Issues

**Inline styles are scattered throughout** — the recording banner (`#rec-banner`), the topbar, the context bar, translation toggle buttons, and the entire corrected-sentence block in `messages.js` are all styled with `style.cssText` strings or inline `style=""` attributes in the HTML. This means styles are spread across four files and are nearly impossible to theme or override consistently. Move these into `styles.css` as named classes.

**Typography is fragmented.** The app uses `font-family:sans-serif` written inline or scattered across dozens of rules, while the base `body` font is `Georgia, serif`. The result is an implicit two-font system that isn't declared intentionally. Define `--font-ui: system-ui, sans-serif` and `--font-body: Georgia, serif` in `:root` and reference them consistently.

**The hint text "Maintenez pour parler"** (`#mh`) is `font-size: 11px` and uses `color: #2a3a4a` — it is nearly invisible on the dark background and is the primary instruction for the core interaction. It should be at least 13px and use a legible contrast color.

**Settings panel is discoverable only via a gear icon** with no label. New users have no indication that the `⚙` button opens sound and font-size settings. A brief label ("Réglages") next to the icon, or a tooltip, would help.

**The "Changer" button** in the chat topbar is very small (11px, minimal padding, low-contrast `#8090a0`). It is a navigation action that takes users back to Setup, which is a consequential step — it should be styled more deliberately and its purpose made clearer (e.g., "Changer de langue").

**Level buttons (`.lvl-btn`) are 12px text** packed into flex cells. On small screens these can become extremely narrow and hard to tap or read. Consider allowing them to wrap or stack below a breakpoint.

**No empty state for the chat** — when a conversation begins, the `#msgs` area is blank. A brief welcome message or instruction nudge (e.g., the AI sending a first message) would reduce the blank-screen moment and prompt the user to speak or type.

---

## 2. Accessibility (WCAG 2.1 AA)

### 🔴 Critical

**`user-scalable=no` in the viewport meta (WCAG 1.4.4 — Resize Text, Level AA)**
```html
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
```
This prevents users from pinching to zoom, which is a failure for anyone with low vision. Remove `maximum-scale=1,user-scalable=no` entirely.

**No accessible names on icon-only buttons (WCAG 4.1.2 — Name, Role, Value)**
The following buttons have no visible text, no `aria-label`, and no `title`:
- Gear icon button (`⚙`, `#settings-btn`, `#settings-btn-setup`) — screen reader announces "button" only
- Send button (`↑`, `#bs`) — announces "button"
- Mic button (`🎙️`, `#bm`) — the emoji is read as "microphone" by some readers but not all; an explicit `aria-label="Démarrer l'enregistrement"` is needed
- Trash/cancel zone (`🗑`, `#trash`) — not focusable but shown during a gesture

**Fix:** Add `aria-label` to each:
```html
<button id="settings-btn" aria-label="Ouvrir les réglages">⚙</button>
<button id="bs" aria-label="Envoyer">↑</button>
<button id="bm" aria-label="Maintenir pour parler">🎙️</button>
```

**No `<label>` for form inputs (WCAG 1.3.1 — Info and Relationships)**
All three inputs rely solely on placeholder text:
- `#ki` (API key) — placeholder `sk-ant-api03-...` disappears on input
- `#ti` (chat text input) — placeholder "Écrivez ici..." disappears on focus
- `#sctx` (context textarea) — placeholder "Décrivez le contexte..." disappears on focus

Placeholders are not a substitute for labels. Add visually-hidden `<label>` elements or use `aria-label`:
```html
<label for="ki" class="sr-only">Clé API Anthropic</label>
<input id="ki" type="password" .../>
```

**Custom toggle buttons have no ARIA state (WCAG 4.1.2)**
Language buttons (`.lang-btn`), level buttons (`.lvl-btn`), chip buttons (`.chip`), and settings buttons (`.set-btn`) all use a `.sel` / `.on` CSS class to indicate selection, but convey nothing to assistive technologies. These behave like radio buttons or toggles and should expose their state:
```html
<button class="lvl-btn sel" aria-pressed="true">B1</button>
<button class="lvl-btn" aria-pressed="false">B2</button>
```
Or group them with `role="radiogroup"` + `role="radio"` + `aria-checked`.

**No focus ring on interactive elements (WCAG 2.4.7 — Focus Visible)**
The CSS sets `outline: none` globally on inputs. Buttons have no `:focus-visible` style at all. Keyboard users cannot see where focus is. Add:
```css
:focus-visible {
  outline: 2px solid #4a9de0;
  outline-offset: 2px;
}
```

**No live regions for dynamic content (WCAG 4.1.3 — Status Messages)**
- `#msgs` — new messages are injected here but never announced to screen readers. Add `aria-live="polite"` (or render messages with `role="log"`).
- `#live` — live speech transcription has `opacity: 0` and no `aria-live`.
- `.bbl-err` — error bubbles are injected dynamically. Add `role="alert"` so they are announced immediately.
- `#rec-banner` — the recording banner should have `role="status"` or `aria-live="assertive"`.

### 🟡 Moderate

**Color contrast failures (WCAG 1.4.3 — Contrast Minimum, AA requires 4.5:1 for small text)**
The following text colors used on the dark `#0f1318` background fail or are at risk:

| Element | Color | Background | Estimated ratio | Status |
|---|---|---|---|---|
| `.lbl` labels | `#2a3a4a` | `#0f1318` | ~1.6:1 | ❌ Fails |
| `#mh` "Maintenez pour parler" | `#2a3a4a` | `#0a0c10` | ~1.6:1 | ❌ Fails |
| `#ts` session subtitle | `#2a3a4a` | `#080c12` | ~1.6:1 | ❌ Fails |
| `#step` counter | `#2a4060` | `#080c12` | ~1.8:1 | ❌ Fails |
| `.nh` notes header | `#243650` | `#060c14` | ~1.5:1 | ❌ Fails |
| `.ne` explanation text | `#384858` | `#060c14` | ~2.1:1 | ❌ Fails |
| `.lang-with` sub-label | `#2a3848` | `#0f1318` | ~1.7:1 | ❌ Fails |
| `.nr-arrow` arrow | `#2a3a4a` | `#060c14` | ~1.6:1 | ❌ Fails |
| `.set-btn-lbl` labels | `#5a6878` | `#0f1318` | ~3.0:1 | ⚠️ Borderline (also 9px) |
| `.enc` | `#406070` | `#0f1318` | ~2.8:1 | ❌ Fails |

Many of these are intentionally subtle (secondary/tertiary hierarchy), but they need to be at minimum ~3:1 (large text) or 4.5:1 (small text). Raising them to around `#5a7a9a` range would maintain the subdued feel while passing.

**`.set-btn-lbl` uses 9px font size** — below the minimum readable size for any user, and there is no WCAG exception for text this small. Use at least 11px.

**No `lang` attribute on AI reply content** — the AI replies in the target foreign language, but no `lang=""` attribute is set on the bubble element. Screen readers will read the text with the wrong language/accent. When building a native message bubble, set `lang` to the reply's language code:
```js
bbl.setAttribute('lang', selLang.tts.split('-')[0]); // e.g., 'en', 'es', 'de'
```

**Touch target size (WCAG 2.5.5 — Target Size)**
- The `#btn-delete-key` "Supprimer la clé enregistrée" button has no padding and relies on font size alone for its tap target.
- Gear icon buttons have 5px 9px padding — below the 44×44px recommended minimum.
- Chip buttons are 5px 11px padding — borderline.

All interactive touch targets should be at least 44×44px in effective tap area.

### 🔵 Minor

- No skip-navigation link for keyboard users who want to jump past the topbar to the message area.
- The `<title>` element never changes between pages; it should update to reflect the current screen (e.g., "Configuration — Langue Natif").
- `autocomplete="off"` on `#ki` blocks password managers from autofilling saved API keys. Consider `autocomplete="current-password"` or removing the attribute if user convenience is valued.
- The long-press gesture for message editing/deletion has no keyboard equivalent, making it inaccessible to non-touch users.

---

## 3. UX Copy

The app is in French, which is appropriate, but several words are missing their accents — a noticeable quality issue in a language-learning product.

### Missing Accents (high priority for a language app)

| Current | Corrected |
|---|---|
| `cle API Anthropic` | `clé API Anthropic` |
| `Tester la cle` | `Tester la clé` |
| `Supprimer la cle enregistree` | `Supprimer la clé enregistrée` |
| `Jeu de role` | `Jeu de rôle` |
| `Decrivez le contexte...` | `Décrivez le contexte...` |
| `RELACHEZ POUR ENVOYER` | `RELÂCHEZ POUR ENVOYER` |
| `Ecrivez ici...` | `Écrivez ici...` |
| `Ecouter` (buttons + code) | `Écouter` |

### French Typography
In French, a space is required before `:`, `;`, `!`, and `?`. The error message renders as `"Erreur: " + msg` — it should be `"Erreur : " + msg` (non-breaking space before colon).

### Button Copy Clarity

- **"Continuer"** (key page) — after entering the API key, "Continuer" is ambiguous. Does it save the key? Does it just move forward? Clarify: **"Enregistrer et continuer"**.
- **"Changer"** (chat topbar) — too terse. Rename to **"Changer de langue"** so users know what they're changing before tapping.
- **"Voir traduction" / "Cacher traduction"** — clear and idiomatic. ✅
- **"Ecouter" → "Stop"** toggle on speak buttons works well conceptually but should use **"Écouter"** and **"■ Arrêter"** (more natural than "Stop" in French UI context).

### Empty / Hint States
- The `placeholder` on `#ki` is `sk-ant-api03-...` — this is a technical format hint, not a label. Consider adding a visual label above the field instead of relying on this.
- `#mh` "Maintenez pour parler" is the sole instruction for voice input. Consider adding a short sub-hint when the mic is not supported: "Microphone non disponible".
- No in-context error message is shown when the API key is empty and "Continuer" is pressed — only the `#status` bar at the top updates. Consider inline validation.

### Notes Panel Labels
- The correction type abbreviations `Gr`, `Vo`, `Or` (grammaire, vocabulaire, orthographe) are opaque without a legend. Consider full labels: **"Grammaire"**, **"Vocabulaire"**, **"Orthographe"** — or add a tooltip/title attribute.
- "Version correcte" is accurate but "Version corrigée" would be more natural French.

---

## Priority Summary

| Priority | Item |
|---|---|
| 🔴 Critical | Remove `user-scalable=no` from viewport |
| 🔴 Critical | Add `aria-label` to gear, send, and mic buttons |
| 🔴 Critical | Add `<label>` elements (or `aria-label`) to all inputs |
| 🔴 Critical | Add `aria-pressed` / `aria-checked` to custom toggle buttons |
| 🔴 Critical | Add `:focus-visible` styles — keyboard users are blind to focus |
| 🔴 Critical | Add `aria-live="polite"` to `#msgs` and `role="alert"` to error bubbles |
| 🟡 Moderate | Fix failing contrast on `.lbl`, `#mh`, `#ts`, `.nh`, `.ne`, `.nr-arrow` |
| 🟡 Moderate | Set `lang` attribute on AI reply bubbles |
| 🟡 Moderate | Increase touch target size on gear, mic, and delete-key buttons |
| 🟡 Moderate | Fix all missing accents in French copy |
| 🔵 Minor | Move inline styles into CSS classes |
| 🔵 Minor | Clarify "Continuer" → "Enregistrer et continuer" |
| 🔵 Minor | Expand correction type abbreviations (Gr/Vo/Or) |
| 🔵 Minor | Add `<title>` updates per page |
