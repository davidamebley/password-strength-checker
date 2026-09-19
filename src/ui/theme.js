// Theme control. The choice lasts for the session only: nothing is persisted,
// which keeps the application free of any stored state.

export const THEMES = Object.freeze({ light: 'light', dark: 'dark' });

function prefersDark() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * @param {HTMLElement} root Element carrying the `data-theme` attribute.
 * @returns {{ get: () => string, set: (theme: string) => void, toggle: () => string }}
 */
export function createThemeController(root) {
  let current = prefersDark() ? THEMES.dark : THEMES.light;

  const apply = (theme) => {
    current = theme === THEMES.dark ? THEMES.dark : THEMES.light;
    root.setAttribute('data-theme', current);
    return current;
  };

  apply(current);

  return {
    get: () => current,
    set: apply,
    toggle: () => apply(current === THEMES.dark ? THEMES.light : THEMES.dark),
  };
}
