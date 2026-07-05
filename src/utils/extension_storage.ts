import { StorageKey } from '../types/storage';

/** True when this JS context can use extension APIs (not a blocked iframe / detached frame). */
export function hasExtensionContext(): boolean {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function swallowLastError(): void {
  const err = chrome.runtime.lastError;
  if (err && !/message port closed|Receiving end does not exist/i.test(err.message || '')) {
    console.debug('[OpenMemory] runtime.lastError:', err.message);
  }
}

export function storageSyncGet(keys: string[] | string | null): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (!hasExtensionContext()) {
      reject(new Error('Extension storage unavailable in this page context'));
      return;
    }
    chrome.storage.sync.get(keys, result => {
      swallowLastError();
      resolve(result);
    });
  });
}

export function storageSyncSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!hasExtensionContext()) {
      reject(new Error('Extension storage unavailable in this page context'));
      return;
    }
    chrome.storage.sync.set(data, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

export function storageSyncRemove(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!hasExtensionContext()) {
      reject(new Error('Extension storage unavailable in this page context'));
      return;
    }
    chrome.storage.sync.remove(keys, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

export const OSS_SETTINGS_KEYS = [
  StorageKey.API_KEY,
  StorageKey.API_BASE_URL,
  StorageKey.USER_ID,
  StorageKey.ACCESS_TOKEN,
] as const;