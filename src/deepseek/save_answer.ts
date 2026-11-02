import { CONFIGURATION_KEYS, isConfigured } from '../utils/configuration';
import { memoryFetch } from '../utils/memory_fetch';

const answerSelector = '.ds-assistant-message-main-content';
const hostClass = 'openmemory-save-answer';
const saveIcons = {
  idle: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/>',
  pending: '<path d="M20 12a8 8 0 1 1-8-8"/>',
  saved: '<path d="m5 12 4 4L19 6"/>',
  error:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11-1l3 6M4 12l3 6a7 7 0 0 0 11-1"/>',
};

function setSaveStatus(
  button: HTMLButtonElement,
  state: keyof typeof saveIcons,
  title: string
): void {
  button.dataset.saveState = state;
  button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${saveIcons[state]}</svg>`;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.setAttribute('aria-busy', String(state === 'pending'));
}

function answerText(answer: HTMLElement): string {
  const clone = answer.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      '[data-citation-group], .ds-markdown-cite, button, [aria-hidden="true"], script, style'
    )
    .forEach(el => el.remove());
  clone
    .querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre, tr, blockquote, br')
    .forEach(el => el.after(document.createTextNode('\n')));
  return (clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function shareButton(answer: HTMLElement): HTMLElement | undefined {
  const message = answer.closest('.ds-message');
  const row = message?.parentElement;
  if (!message || !row || row.querySelectorAll(answerSelector).length !== 1) {
    return;
  }
  return Array.from(row.querySelectorAll<HTMLElement>('button, [role="button"]')).find(button => {
    if (message.contains(button) || button.closest(`.${hostClass}`)) {
      return false;
    }
    const label = `${button.getAttribute('aria-label') || ''} ${button.title}`;
    if (/分享|share/i.test(label)) {
      return true;
    }
    // The saved DeepSeek page has no label on Share; recognize its arrow icon.
    return Boolean(button.querySelector('path[d^="M7.95889 1.52285"]'));
  });
}

/** Each rendered answer owns one manual-save action; virtualized rows may be reused. */
export function mountAnswerSaveButtons(): void {
  const records = new WeakMap<
    HTMLElement,
    { host: HTMLElement; button: HTMLButtonElement; saved: string; pending: boolean }
  >();
  let configured = false;
  let scheduled = false;
  const reconcile = () => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(answerSelector).forEach(answer => {
      const share = shareButton(answer);
      let record = records.get(answer);
      if (!configured || !share) {
        record?.host.remove();
        return;
      }
      if (!record) {
        const host = document.createElement('span');
        host.className = hostClass;
        host.style.cssText = 'display:inline-flex;align-items:center;flex:none;color:inherit;';
        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          button { all:initial; display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box;
            width:28px; height:28px; padding:6px; border-radius:7px; color:var(--dsw-alias-label-secondary, inherit);
            cursor:pointer; }
          button:hover { background:var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
          button:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
          button:disabled { cursor:default; opacity:.65; }
          svg { width:16px; height:16px; flex:none; }
          button[data-save-state="pending"] svg { animation:spin 1s linear infinite; }
          @keyframes spin { to { transform:rotate(360deg); } }
          @media (prefers-reduced-motion:reduce) { button[data-save-state="pending"] svg { animation:none; } }
        `;
        const button = document.createElement('button');
        button.type = 'button';
        setSaveStatus(button, 'idle', '保存这条回答到 OpenMemory');
        shadow.append(style, button);
        record = { host, button, saved: '', pending: false };
        records.set(answer, record);
        const state = record;
        button.addEventListener('click', async event => {
          event.preventDefault();
          event.stopPropagation();
          if (state.pending) {
            return;
          }
          const content = answerText(answer);
          if (!content || state.saved === content) {
            return;
          }
          state.pending = true;
          button.disabled = true;
          setSaveStatus(button, 'pending', '正在保存这条回答');
          try {
            const settings = await chrome.storage.sync.get(CONFIGURATION_KEYS);
            if (!isConfigured(settings)) {
              throw new Error('请先在扩展弹窗完成服务器、用户名和密钥设置');
            }
            const response = await memoryFetch(
              `${String(settings.baseUrl).replace(/\/+$/, '')}/memories`,
              {
                method: 'POST',
                body: JSON.stringify({
                  messages: [{ role: 'assistant', content }],
                  user_id: settings.user_id,
                  infer: false,
                  metadata: {
                    provider: 'deepseek',
                    category: 'assistant_answer',
                    page_url: location.href,
                  },
                }),
              }
            );
            if (!response.ok) {
              throw new Error(`保存失败 (HTTP ${response.status})`);
            }
            await response.json();
            state.saved = content;
            setSaveStatus(button, 'saved', '已保存到 OpenMemory');
          } catch (error) {
            setSaveStatus(
              button,
              'error',
              `${error instanceof Error ? error.message : '保存失败'}，点击重试`
            );
          } finally {
            state.pending = false;
            button.disabled = state.saved === answerText(answer);
          }
        });
      }
      // React/virtual-list rerenders can clone or replace the toolbar.
      const currentRecord = record;
      share.parentElement?.querySelectorAll(`.${hostClass}`).forEach(el => {
        if (el !== currentRecord.host) {
          el.remove();
        }
      });
      if (share.nextElementSibling !== record.host) {
        share.after(record.host);
      }
      if (!record.pending && record.saved && record.saved !== answerText(answer)) {
        record.saved = '';
        record.button.disabled = false;
        setSaveStatus(record.button, 'idle', '保存这条回答到 OpenMemory');
      }
    });
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(reconcile);
    }
  };
  const refresh = () =>
    chrome.storage.sync.get(CONFIGURATION_KEYS, data => {
      configured = isConfigured(data);
      schedule();
    });
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') {
      refresh();
    }
  });
  refresh();
}
