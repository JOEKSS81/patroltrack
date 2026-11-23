// Detecta el sistema del mòbil per mostrar només la guia que li toca.
//   "ios"     → iPhone / iPad (inclou iPadOS, que s'anuncia com a Mac amb pantalla tàctil)
//   "android" → Android (Huawei sense Google inclòs)
//   "other"   → ordinador o desconegut
export function detectPlatform(nav = typeof navigator !== "undefined" ? navigator : null) {
  if (!nav) return "other";
  const ua = nav.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/macintosh/i.test(ua) && (nav.maxTouchPoints || 0) > 1) return "ios";
  return "other";
}

// Enllaç iCloud de la drecera «PatrolTrack» (Dreceres d'Apple). Es crea un sol cop des
// d'un iPhone (vegeu cloudflare/tasker/SETUP_IPHONE.md) i es posa a VITE_IOS_SHORTCUT_URL.
// Mentre no hi sigui, l'app mostra com crear-la a mà.
export const IOS_SHORTCUT_URL = (import.meta.env?.VITE_IOS_SHORTCUT_URL || "").trim();

// Nom del "grup" amb què arriben els avisos enviats amb la drecera de l'iPhone.
export const IOS_GROUP_NAME = "Drecera iPhone";
