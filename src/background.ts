import { DEFAULT_USER_ID, OSS_API_BASE_DEFAULT } from './types/api';
import { initContextMenuMemory } from './context-menu-memory';
import { initDirectUrlTracking } from './direct-url-tracker';
import { type OpenDashboardMessage, SidebarAction } from './types/messages';
import { StorageKey } from './types/storage';

const DEFAULT_SYNC = {
  [StorageKey.API_BASE_URL]: OSS_API_BASE_DEFAULT,
  [StorageKey.USER_ID]: DEFAULT_USER_ID,
  [StorageKey.USER_ID_CAMEL]: DEFAULT_USER_ID,
  [StorageKey.MEMORY_ENABLED]: true,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get([StorageKey.API_BASE_URL], existing => {
    const patch: Record<string, unknown> = { ...DEFAULT_SYNC };
    if (existing[StorageKey.API_BASE_URL]) {
      delete patch[StorageKey.API_BASE_URL];
    }
    chrome.storage.sync.set(patch, () => {
      console.log('OpenMemory defaults applied');
    });
  });
});

chrome.runtime.onMessage.addListener((request: OpenDashboardMessage) => {
  if (request.action === SidebarAction.OPEN_DASHBOARD && request.url) {
    chrome.tabs.create({ url: request.url });
  }
  return undefined;
});

chrome.runtime.onMessage.addListener(
  (request: { action?: string; enabled?: boolean }, sender: chrome.runtime.MessageSender) => {
    if (request.action === SidebarAction.SIDEBAR_SETTINGS) {
      const tabId = sender.tab?.id;
      if (tabId !== null && tabId !== undefined) {
        chrome.tabs.sendMessage(tabId, { action: SidebarAction.SIDEBAR_SETTINGS });
      }
    }
    if (request.action === SidebarAction.TOGGLE_MEM0 && typeof request.enabled === 'boolean') {
      chrome.storage.sync.set({ [StorageKey.MEMORY_ENABLED]: request.enabled });
    }
    return undefined;
  }
);

// Context menu registered on install; also ensure once per worker wake (idempotent remove+create)
initContextMenuMemory();
initDirectUrlTracking();
