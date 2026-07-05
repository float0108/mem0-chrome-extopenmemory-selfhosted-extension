/** Opt-in tracing — must not touch chrome.storage on every keystroke. */
const STORAGE_KEY = 'openmemory_debug';

let cachedDebug: boolean | null = null;

export function initOpenMemoryDebugCache(): void {
  try {
    chrome.storage.sync.get([STORAGE_KEY], items => {
      cachedDebug = items[STORAGE_KEY] === true;
      if (cachedDebug) {
        console.log('[OpenMemory] debug trace enabled (content script)');
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[STORAGE_KEY]) return;
      cachedDebug = changes[STORAGE_KEY].newValue === true;
    });
  } catch {
    cachedDebug = false;
  }
}

export function isOpenMemoryDebugEnabled(): boolean {
  if ((globalThis as { __OPENMEMORY_DEBUG__?: boolean }).__OPENMEMORY_DEBUG__ === true) {
    return true;
  }
  return cachedDebug === true;
}

/** Fire-and-forget; no await, no storage I/O when debug is off. */
export function openMemoryLog(label: string, data?: unknown): void {
  if (!isOpenMemoryDebugEnabled()) return;
  if (data === undefined) {
    console.log(`[OpenMemory] ${label}`);
  } else {
    console.log(`[OpenMemory] ${label}`, data);
  }
}