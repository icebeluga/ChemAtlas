export type Theme = "light" | "dark";
export const THEME_KEY = "chematlas-theme";
// Keep the identical, blocking bootstrap in both Pages HTML entry points.
// It runs before styles/app code and defaults to the approved light theme.
export const THEME_INIT = 'try{document.documentElement.dataset.theme=localStorage.getItem("chematlas-theme")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}';

export const getTheme = (): Theme => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
export const getServerTheme = (): Theme => "light";

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* Restricted storage: the current page still works. */ }
  window.dispatchEvent(new Event("chematlas:theme"));
}

export function subscribeTheme(callback: () => void) {
  function storage(event: StorageEvent) {
    if (event.key !== THEME_KEY && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    callback();
  }
  window.addEventListener("chematlas:theme", callback);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("chematlas:theme", callback);
    window.removeEventListener("storage", storage);
  };
}
