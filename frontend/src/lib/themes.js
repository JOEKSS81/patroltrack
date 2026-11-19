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
    label: "Camuflatge", emoji: "🪖",
    bg: "#1f2818", surface: "#2c3823", border: "#4d5e36",
    accent: "#c5d18a", accentDim: "#c5d18a22", accentGlow: "#c5d18a66",
    mossos: "#9ccc65", guardia: "#bcaaa4", local: "#d7ccc8",
    text: "#f0f2dc", textDim: "#c4c8a8", textMuted: "#929679",
    danger: "#d84747", warning: "#e8a52c", success: "#aed581",
    pattern: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' fill='%231f2818'/><path d='M20,20 q30,-10 60,5 t60,15 q-30,20 -70,10 t-50,-30z' fill='%232c3823' opacity='0.6'/><path d='M-10,90 q40,-20 80,0 t80,10 q-30,30 -90,15 t-70,-25z' fill='%23394a23' opacity='0.5'/><ellipse cx='130' cy='130' rx='35' ry='20' fill='%23475a39' opacity='0.4'/><ellipse cx='40' cy='130' rx='25' ry='15' fill='%231a2210' opacity='0.5'/></svg>")`,
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
