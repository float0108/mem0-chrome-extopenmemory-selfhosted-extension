import { CONFIGURATION_KEYS, isConfigured } from '../utils/configuration';
import { memoryFetch } from '../utils/memory_fetch';

const answerSelector = '.ds-assistant-message-main-content';
const hostClass = 'openmemory-save-answer';

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
          button { all:initial; display:inline-flex; align-items:center; gap:4px; box-sizing:border-box;
            min-height:28px; padding:4px 7px; border-radius:7px; color:var(--dsw-alias-label-secondary, inherit);
            font:11px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; cursor:pointer; white-space:nowrap; }
          button:hover { background:var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
          button:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
          button:disabled { cursor:default; opacity:.65; }
          svg { width:14px; height:14px; flex:none; }
        `;
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/></svg><span aria-live="polite">OpenMemory</span>';
        button.title = '保存这条回答到 OpenMemory';
        button.setAttribute('aria-label', button.title);
        shadow.append(style, button);
        record = { host, button, saved: '', pending: false };
        records.set(answer, record);
        const state = record;
        const status = (text: string, title: string) => {
          const label = button.querySelector('span');
          if (label) {
            label.textContent = text;
          }
          button.title = title;
          button.setAttribute('aria-label', title);
        };
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
          status('保存中…', '正在保存这条回答');
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
            status('已保存', '已保存到 OpenMemory');
          } catch (error) {
            status('保存失败 · 重试', error instanceof Error ? error.message : '保存失败，请重试');
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
        const label = record.button.querySelector('span');
        if (label) {
          label.textContent = 'OpenMemory';
        }
        record.button.title = '保存这条回答到 OpenMemory';
        record.button.setAttribute('aria-label', record.button.title);
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
