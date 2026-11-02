/** Themes are scoped to extension surfaces, never the host page. */
export type Theme = 'dark' | 'light';
const themeKey = 'ui_theme';
const styleId = 'openmemory-theme-styles';
const palettes = `
[data-om-theme] {
  --om-bg: #18181b; --om-card: #242427; --om-button: #343438;
  --om-hover: #45454a; --om-text: #f4f4f5; --om-muted: #a1a1aa;
  --om-border: #3f3f46; --om-action: #f4f4f5; --om-on-action: #18181b;
  --om-success: #4ade80; --om-error: #f87171;
  color-scheme: dark; color: var(--om-text); font-size: 12px;
}
[data-om-theme="light"] {
  --om-bg: #ffffff; --om-card: #f4f4f5; --om-button: #e4e4e7;
  --om-hover: #d4d4d8; --om-text: #18181b; --om-muted: #61616b;
  --om-border: #d4d4d8; --om-action: #18181b; --om-on-action: #ffffff;
  --om-success: #15803d; --om-error: #b91c1c;
  color-scheme: light;
}
[data-om-theme] button { font-family: inherit; }
[data-om-theme="light"] img[src*="mem0-claude-icon.png"] { filter: invert(1); }
[data-om-theme] button:focus-visible, [data-om-theme] input:focus-visible {
  outline: 2px solid var(--om-text); outline-offset: 2px;
}
[data-om-theme] .om-theme-switch {
  display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--om-border);
  border-radius: 7px; background: var(--om-card); flex-shrink: 0;
}
[data-om-theme] .om-theme-switch button {
  border: 0; border-radius: 4px; background: transparent; color: var(--om-muted);
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 24px; padding: 4px; cursor: pointer;
}
[data-om-theme] .om-theme-switch svg { width: 15px; height: 15px; }
[data-om-theme="dark"] .om-theme-switch [data-theme-value="dark"],
[data-om-theme="light"] .om-theme-switch [data-theme-value="light"] {
  background: var(--om-action); color: var(--om-on-action);
}
`;

function applyTheme(theme: Theme): void {
  document.querySelectorAll<HTMLElement>('[data-om-theme]').forEach(root => {
    root.dataset.omTheme = theme;
    root.querySelectorAll<HTMLElement>('[data-theme-value]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeValue === theme));
    });
  });
}

export function bindTheme(root: HTMLElement): void {
  root.dataset.omTheme =
    document.querySelector<HTMLElement>('[data-om-theme]')?.dataset.omTheme || 'dark';
  const initial = root.dataset.omTheme;
  // Read for each newly opened surface, even if the previous dialog was removed.
  chrome.storage.sync.get(themeKey, data => {
    if (!chrome.runtime.lastError && root.dataset.omTheme === initial) {
      root.dataset.omTheme = data[themeKey] === 'light' ? 'light' : 'dark';
      root.querySelectorAll<HTMLElement>('[data-theme-value]').forEach(button => {
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.themeValue === root.dataset.omTheme)
        );
      });
    }
  });
  if (document.getElementById(styleId)) {
    return;
  }
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = palettes;
  (document.head || document.documentElement).appendChild(style);
  let revision = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[themeKey]) {
      revision++;
      applyTheme(changes[themeKey].newValue === 'light' ? 'light' : 'dark');
    }
  });
  chrome.storage.sync.get(themeKey, data => {
    if (!chrome.runtime.lastError && revision === 0) {
      applyTheme(data[themeKey] === 'light' ? 'light' : 'dark');
    }
  });
}

export function createThemeSwitch(): HTMLElement {
  const group = document.createElement('div');
  group.className = 'om-theme-switch';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '配色 / Appearance');
  (['light', 'dark'] as const).forEach(theme => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML =
      theme === 'light'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>';
    button.dataset.themeValue = theme;
    button.title = theme === 'dark' ? '夜间模式 / Dark' : '日间模式 / Light';
    button.setAttribute('aria-label', button.title);
    const current =
      document.querySelector<HTMLElement>('[data-om-theme]')?.dataset.omTheme || 'dark';
    button.setAttribute('aria-pressed', String(current === theme));
    button.addEventListener('click', () => {
      applyTheme(theme);
      void chrome.storage.sync.set({ [themeKey]: theme });
    });
    group.appendChild(button);
  });
  return group;
}
