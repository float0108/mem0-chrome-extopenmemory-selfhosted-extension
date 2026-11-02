import { CONFIGURATION_KEYS, isConfigured } from '../utils/configuration';
let reconcileButton: (() => void) | undefined;

function findAttachmentButton(editor: HTMLElement): HTMLElement | undefined {
  let scope = editor.parentElement;
  for (
    let depth = 0;
    scope && scope !== document.body && depth < 6;
    depth++, scope = scope.parentElement
  ) {
    for (const input of Array.from(
      scope.querySelectorAll<HTMLInputElement>('input[type="file"]')
    )) {
      // DeepSeek puts its paperclip button immediately before the hidden file input.
      const sibling = input.previousElementSibling;
      if (
        sibling instanceof HTMLElement &&
        sibling.matches('button, [role="button"], label') &&
        sibling.getClientRects().length &&
        !sibling.closest('.mem0-root')
      ) {
        return sibling;
      }
    }
  }
  return undefined;
}

/** One controller per page; no async anchor cache or competing focus mounts. */
export function mountDeepseekMemoryButton(onClick: () => void): void {
  if (reconcileButton) {
    reconcileButton();
    return;
  }
  let enabled = false;
  let host: HTMLDivElement | undefined;
  let scheduled = false;

  const reconcile = () => {
    scheduled = false;
    const editor = Array.from(
      document.querySelectorAll<HTMLElement>('#chat-input, textarea, [contenteditable="true"]')
    ).find(el => !el.closest('#mem0-sidebar') && el.getClientRects().length > 0);
    const anchor = editor?.closest('form') || editor?.parentElement;
    const attachment = editor ? findAttachmentButton(editor) : undefined;
    if (!enabled || !editor || !anchor || anchor === document.body) {
      host?.remove();
      return;
    }
    // Also clean up duplicate hosts left behind by older mounting paths.
    document.querySelectorAll('#mem0-icon-button').forEach(el => {
      if (el !== host) {
        el.remove();
      }
    });
    if (!host) {
      host = document.createElement('div');
      host.id = 'mem0-icon-button';
      host.className = 'mem0-root';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `
        :host { color-scheme: light dark; color:var(--dsw-alias-label-primary, inherit); }
        .row { display:flex; align-items:center; justify-content:flex-end; height:100%; box-sizing:border-box; }
        button { all:initial; color:inherit; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; position:relative; width:34px; height:34px; border-radius:50%; cursor:pointer; flex:none; transition:background-color .15s; }
        button:hover { background:var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
        button:focus-visible { outline:2px solid #6478e8; outline-offset:2px; }
        svg { width:18px; height:18px; display:block; pointer-events:none; }
      `;
      const row = document.createElement('div');
      row.className = 'row';
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'OpenMemory：检索记忆');
      button.title = '记忆 · OpenMemory';
      button.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>';
      row.append(button);
      shadow.append(style, row);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
    }
    const mode = attachment ? 'toolbar' : 'fallback';
    if (host.dataset.placement !== mode) {
      host.dataset.placement = mode;
      host.style.cssText = attachment
        ? 'display:inline-flex;align-items:center;justify-content:center;position:relative;box-sizing:border-box;width:34px;height:34px;min-width:34px;flex:0 0 34px;margin:0 10px 0 0;align-self:center;color:var(--dsw-alias-label-primary, inherit);'
        : 'display:block;position:relative;box-sizing:border-box;width:100%;min-width:0;height:38px;min-height:38px;flex:0 0 38px;grid-column:1 / -1;margin:4px 0;clear:both;';
    }
    if (attachment) {
      if (attachment.previousElementSibling !== host) {
        attachment.before(host);
      }
    } else if (anchor.nextElementSibling !== host) {
      anchor.insertAdjacentElement('afterend', host);
    }
    const text = editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent || '';
    const hasText = text.trim() ? '1' : '0';
    if (host.dataset.hasText !== hasText) {
      host.dataset.hasText = hasText;
    }
  };
  const schedule = () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(reconcile);
  };
  reconcileButton = schedule;
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('input', schedule, true);
  document.addEventListener('focusin', schedule, true);
  window.addEventListener('resize', schedule);
  const refreshSettings = () =>
    chrome.storage.sync.get([...CONFIGURATION_KEYS, 'memory_enabled'], data => {
      enabled = isConfigured(data) && data.memory_enabled === true;
      schedule();
    });
  refreshSettings();
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') {
      refreshSettings();
    }
  });
}
