import { DEFAULT_USER_ID, OSS_API_BASE_DEFAULT } from './types/api';
import { SidebarAction } from './types/messages';
import { StorageKey } from './types/storage';
import { storageSyncGet, storageSyncSet } from './utils/extension_storage';

const CHATGPT_URL = 'https://chatgpt.com/';
const DASHBOARD_DEFAULT = 'http://127.0.0.1:3000';

async function verifyApiKey(serverUrl: string, apiKey: string): Promise<void> {
  const url = `${serverUrl.replace(/\/$/, '')}/memories?user_id=${encodeURIComponent(DEFAULT_USER_ID)}&top_k=1`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
}

function setStatus(el: HTMLElement, text: string, kind: 'error' | 'success' | ''): void {
  el.textContent = text;
  el.className = kind ? kind : '';
}

async function storageSet(data: Record<string, unknown>): Promise<void> {
  await storageSyncSet(data);
}

async function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return storageSyncGet(keys);
}

function showConnectedView(
  setupView: HTMLElement,
  connectedView: HTMLElement,
  serverUrl: string,
  hintEl: HTMLElement
): void {
  setupView.classList.add('hidden');
  connectedView.classList.remove('hidden');
  hintEl.textContent = serverUrl;
}

function showSetupView(setupView: HTMLElement, connectedView: HTMLElement): void {
  connectedView.classList.add('hidden');
  setupView.classList.remove('hidden');
}

function tryOpenSidebarOnActiveTab(): Promise<boolean> {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tabId = tabs[0]?.id;
      if (tabId === undefined || tabId === null) {
        resolve(false);
        return;
      }
      chrome.tabs
        .sendMessage(tabId, { action: SidebarAction.TOGGLE_SIDEBAR })
        .then(() => resolve(true))
        .catch(() => resolve(false));
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const setupView = document.getElementById('setupView') as HTMLElement;
  const connectedView = document.getElementById('connectedView') as HTMLElement;
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn') as HTMLButtonElement;
  const apiKeyInput = document.getElementById('popupApiKeyInput') as HTMLInputElement;
  const serverUrlInput = document.getElementById('popupServerUrlInput') as HTMLInputElement;
  const statusMessage = document.getElementById('statusMessage') as HTMLElement;
  const connectedServerHint = document.getElementById('connectedServerHint') as HTMLElement;
  const openSidebarBtn = document.getElementById('openSidebarBtn') as HTMLButtonElement;
  const openChatBtn = document.getElementById('openChatBtn') as HTMLButtonElement;
  const openDashboardBtn = document.getElementById('openDashboardBtn') as HTMLButtonElement;
  const editSettingsBtn = document.getElementById('editSettingsBtn') as HTMLButtonElement;

  if (!setupView || !connectedView || !saveApiKeyBtn || !apiKeyInput || !serverUrlInput) {
    return;
  }

  let lastServerUrl = OSS_API_BASE_DEFAULT;

  const goConnected = (serverUrl: string) => {
    lastServerUrl = serverUrl;
    showConnectedView(setupView, connectedView, serverUrl, connectedServerHint);
  };

  void (async () => {
    try {
      const data = await storageGet([
        StorageKey.API_KEY,
        StorageKey.API_BASE_URL,
        StorageKey.USER_ID,
      ]);
      const serverUrl =
        typeof data[StorageKey.API_BASE_URL] === 'string'
          ? (data[StorageKey.API_BASE_URL] as string)
          : OSS_API_BASE_DEFAULT;
      serverUrlInput.value = serverUrl;
      if (typeof data[StorageKey.API_KEY] === 'string' && data[StorageKey.API_KEY]) {
        apiKeyInput.value = data[StorageKey.API_KEY] as string;
        goConnected(serverUrl);
      }
    } catch {
      serverUrlInput.value = OSS_API_BASE_DEFAULT;
    }
  })();

  saveApiKeyBtn.addEventListener('click', () => {
    void (async () => {
      const apiKey = apiKeyInput.value.trim();
      const serverUrl = serverUrlInput.value.trim() || OSS_API_BASE_DEFAULT;

      if (!apiKey) {
        if (statusMessage) {
          setStatus(statusMessage, 'Enter your API key (from mem0 dashboard).', 'error');
        }
        apiKeyInput.focus();
        return;
      }

      saveApiKeyBtn.disabled = true;
      if (statusMessage) {
        setStatus(statusMessage, 'Checking key…', '');
      }

      try {
        await verifyApiKey(serverUrl, apiKey);
        await storageSet({
          [StorageKey.API_KEY]: apiKey,
          [StorageKey.API_BASE_URL]: serverUrl,
          [StorageKey.USER_ID]: DEFAULT_USER_ID,
          [StorageKey.USER_ID_CAMEL]: DEFAULT_USER_ID,
          [StorageKey.MEMORY_ENABLED]: true,
        });
        goConnected(serverUrl);
        if (statusMessage) {
          setStatus(statusMessage, 'Saved and verified.', 'success');
        }
        const opened = await tryOpenSidebarOnActiveTab();
        if (opened) {
          window.close();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Save failed';
        if (statusMessage) {
          setStatus(statusMessage, msg, 'error');
        }
      } finally {
        saveApiKeyBtn.disabled = false;
      }
    })();
  });

  openSidebarBtn?.addEventListener('click', () => {
    void (async () => {
      const opened = await tryOpenSidebarOnActiveTab();
      if (opened) {
        window.close();
        return;
      }
      chrome.tabs.create({ url: CHATGPT_URL }, () => {
        window.close();
      });
    })();
  });

  openChatBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: CHATGPT_URL }, () => {
      window.close();
    });
  });

  openDashboardBtn?.addEventListener('click', () => {
    const dash =
      lastServerUrl.replace(/:8888\/?$/, ':3000') ||
      DASHBOARD_DEFAULT;
    chrome.tabs.create({ url: dash });
  });

  editSettingsBtn?.addEventListener('click', () => {
    showSetupView(setupView, connectedView);
  });
});