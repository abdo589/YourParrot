export type Theme = "light" | "dark";
export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("mf-theme", t); } catch { /* ignore */ }
}
