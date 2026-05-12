// ── Immutable configuration data ─────────────────────────────────────────────
// These are never mutated at runtime. Import from here, not from store.

export const LANGS = [
  { code:'it', name:'Italiano',  flag:'🇮🇹', native:'Marco',   city:'Roma',      sr:'it-IT', tts:'it-IT' },
  { code:'es', name:'Espanol',   flag:'🇪🇸', native:'Sofia',   city:'Madrid',    sr:'es-ES', tts:'es-ES' },
  { code:'en', name:'English',   flag:'🇬🇧', native:'James',   city:'London',    sr:'en-GB', tts:'en-GB' },
  { code:'de', name:'Deutsch',   flag:'🇩🇪', native:'Anna',    city:'Berlin',    sr:'de-DE', tts:'de-DE' },
  { code:'pt', name:'Portugues', flag:'🇧🇷', native:'Isabela', city:'Sao Paulo', sr:'pt-BR', tts:'pt-BR' },
];

export const LEVELS = [
  { id:'beginner',     l:'Debutant'      },
  { id:'intermediate', l:'Intermediaire' },
  { id:'advanced',     l:'Avance'        },
];

export const SCENS = [
  { e:'Restaurant', t:'Nous sommes dans un restaurant. Tu es serveur, je suis touriste.' },
  { e:'Cafe',       t:'Au cafe entre amis, conversation detendue.' },
  { e:'Marche',     t:'Tu es vendeur au marche. Je veux acheter et discuter.' },
  { e:'Taxi',       t:'Tu es chauffeur de taxi. On discute pendant le trajet.' },
  { e:'Entretien',  t:'Tu es recruteur. Tu menes un entretien d embauche.' },
  { e:'Libre',      t:'' },
];

export const SPEEDS = [
  { v:0.75, l:'Lent'   },
  { v:0.88, l:'Normal' },
  { v:1.05, l:'Rapide' },
  { v:1.25, l:'Vif'    },
];

export const FONT_SIZES = [
  { v:14, l:'Petit' },
  { v:16, l:'Moyen' },
  { v:18, l:'