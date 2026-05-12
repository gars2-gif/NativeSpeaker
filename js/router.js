// ── Page router ───────────────────────────────────────────────────────────────
// Handles .page visibility and fires lifecycle hooks on page leave.
// This lets modules (tts, stt) clean up automatically without each
// navigation callsite having to remember to do it.

const _leaveHooks = {};

/**
 * Navigate to a page by its element ID.
 * Fires all onLeave hooks registered for the current page first.
 */
export function navigate(pageId) {
  const current = document.querySelector('.page.on');
  if (current && current.id !== pageId) {
    const hooks = _leaveHooks[current.id];
    if (hooks) hooks.forEach(fn => fn());
    current.classList.remove('on');
  }
  const next = document.getElementById(pageId);
  if (next) next.classList.add('on');
}

/**
 * Register a cleanup function to run when leaving a specific page.
 * Multiple hooks can be registered for the same page.
 */
export function onLeave(pageId, fn) {
  if (!_leaveHooks[pageId]) _leaveHooks[pageId] = [];
  _leaveHooks[pageId].push(fn);
}
