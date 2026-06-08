import { createContext, useContext } from "react";

// SKINS / TEMES VISUALS
// Cada tema defineix la mateixa estructura de variables de color.
// `pattern` és opcional (background-image pel fons del root).
export const THEMES = {
  normal: {
    label: "Normal", emoji: "🟠",
    bg: "#0a0c10", surface: "#111318", border: "#2a3340",
    accent: "#ffb84d", accentDim: "#ffb84d2a", accentGlow: "#ffb84d66",
    mossos: "#60a5fa", guardia: "#4ade80", local: "#c084fc",
    text: "#f5f7fb", textDim: "#b8c0cc", textMuted: "#8a92a3",
    danger: "#ff5757", warning: "#ffb020", success: "#22d97a",
  },
  terror: {
    label: "Terror", emoji: "💀",
    bg: "#0a0303", surface: "#170808", border: "#3a1414",
    accent: "#dc2626", accentDim: "#dc262622", accentGlow: "#dc262677",
    mossos: "#a78bfa", guardia: "#84cc16", local: "#ec4899",
    text: "#f0e8e0", textDim: "#b8a098", textMuted: "#7a5f55",
    danger: "#ef4444", warning: "#f59e0b", success: "#84cc16",
  },
  camo: {
    // Paleta woodland real (US M81): olive drab + forest green + dark brown + black khaki.
    // Pensat per contrastar bé amb pins vermells del mapa sense semblar artificial.
    label: "Camuflatge", emoji: "🪖",
    bg: "#2a2e1c",         // olive drab fosc (base)
    surface: "#363a22",     // olive drab mitjà (cards)
    border: "#54592e",      // olive verd-oliva (separadors)
    accent: "#d4b56a",       // khaki/tan (focus principal — bo per contrastar)
    accentDim: "#d4b56a22",
    accentGlow: "#d4b56a66",
    mossos: "#7a9c5e",       // verd oliva més clar
    guardia: "#a08a5e",       // marró khaki
    local: "#c4b89a",         // beix arena
    text: "#ede8d0",          // beix lluminós (alt contrast)
    textDim: "#b8b094",       // beix mitjà
    textMuted: "#7a755e",     // beix fosc
    danger: "#c63d2f",        // vermell militar (no neon)
    warning: "#d9883a",        // ambre cremat
    success: "#7d9b3d",        // verd oliva més viu
    // Patró woodland autèntic: 4 capes de blob irregulars + algunes ratlles, en colors M81.
    pattern: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><rect width='240' height='240' fill='%232a2e1c'/><path d='M5,40 C 25,15 70,25 90,50 C 110,75 90,110 60,100 C 30,90 -15,65 5,40 Z' fill='%234a5a2d' opacity='0.7'/><path d='M150,15 C 185,5 220,35 215,65 C 210,90 175,95 155,80 C 135,65 125,30 150,15 Z' fill='%234a5a2d' opacity='0.65'/><path d='M40,180 C 65,160 110,180 105,210 C 100,232 55,235 35,215 C 18,200 25,190 40,180 Z' fill='%234a5a2d' opacity='0.6'/><path d='M180,140 C 210,135 230,170 215,195 C 200,218 165,210 155,185 C 148,165 158,143 180,140 Z' fill='%234a5a2d' opacity='0.7'/><path d='M70,10 C 95,5 110,30 95,45 C 80,55 55,45 60,25 C 62,18 65,12 70,10 Z' fill='%23231905' opacity='0.85'/><path d='M195,90 C 215,85 225,110 210,125 C 195,135 175,125 180,105 C 183,98 188,92 195,90 Z' fill='%23231905' opacity='0.8'/><path d='M15,120 C 35,115 50,140 35,155 C 22,165 5,150 8,130 C 10,124 12,121 15,120 Z' fill='%23231905' opacity='0.8'/><path d='M130,205 C 150,202 165,225 150,235 C 135,243 115,232 118,215 C 120,210 124,206 130,205 Z' fill='%23231905' opacity='0.85'/><path d='M105,90 C 130,80 155,110 140,135 C 122,158 90,148 92,120 C 93,106 98,93 105,90 Z' fill='%238b7d4f' opacity='0.55'/><path d='M165,40 C 178,35 188,55 175,68 C 162,78 148,65 153,48 C 156,43 160,41 165,40 Z' fill='%238b7d4f' opacity='0.5'/><path d='M30,80 C 42,75 52,93 42,103 C 30,112 18,100 22,85 C 25,82 27,80 30,80 Z' fill='%238b7d4f' opacity='0.5'/></svg>")`,
  },
  candy: {
    label: "Candy", emoji: "🍭",
    bg: "#1a0a14", surface: "#2a1528", border: "#5e3252",
    accent: "#ff5fb3", accentDim: "#ff5fb322", accentGlow: "#ff5fb377",
    mossos: "#fbb6ce", guardia: "#c4b5fd", local: "#fde68a",
    text: "#ffe4f1", textDim: "#f9a8d4", textMuted: "#b87aa0",
    danger: "#f43f5e", warning: "#fb923c", success: "#5eead4",
  },
  neon: {
    label: "Futurista", emoji: "🛸",
    bg: "#040618", surface: "#0c1230", border: "#1e2a60",
    accent: "#00f0ff", accentDim: "#00f0ff22", accentGlow: "#00f0ff88",
    mossos: "#5eaaff", guardia: "#39ff14", local: "#bf5cff",
    text: "#e0f7ff", textDim: "#7fc8e5", textMuted: "#5183a8",
    danger: "#ff2d75", warning: "#ffd60a", success: "#00ff88",
  },
  hacker: {
    label: "Hacker", emoji: "💻",
    bg: "#000000", surface: "#050a05", border: "#114411",
    accent: "#00ff41", accentDim: "#00ff4122", accentGlow: "#00ff4188",
    mossos: "#00d4ff", guardia: "#88ff00", local: "#ff8800",
    text: "#a0ffa0", textDim: "#5fbf5f", textMuted: "#3a7f3a",
    danger: "#ff3333", warning: "#ffcc00", success: "#00ff66",
  },
};

export const ThemeContext = createContext(THEMES.normal);
export const useC = () => useContext(ThemeContext);
