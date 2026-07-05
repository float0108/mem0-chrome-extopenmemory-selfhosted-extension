import { DEFAULT_USER_ID } from './types/api';
import type { HistoryStateData, HistoryUrl } from './types/browser';
import type { Settings } from './types/settings';
import { StorageKey } from './types/storage';
import { hasExtensionContext, storageSyncGet } from './utils/extension_storage';

(function () {
  if (!hasExtensionContext()) {
    return;
  }
  // Utilities
  function normalize(text: string): string {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function getSettings(): Promise<Settings> {
    return storageSyncGet([
      StorageKey.API_KEY,
      StorageKey.ACCESS_TOKEN,
      StorageKey.USER_ID,
      StorageKey.SELECTED_ORG,
      StorageKey.SELECTED_PROJECT,
      StorageKey.MEMORY_ENABLED,
      StorageKey.API_BASE_URL,
    ]).then(d => ({
      hasCreds: Boolean(d[StorageKey.API_KEY] || d[StorageKey.ACCESS_TOKEN]),
      apiKey: d[StorageKey.API_KEY] as string | undefined,
      accessToken: d[StorageKey.ACCESS_TOKEN] as string | undefined,
      userId: (d[StorageKey.USER_ID] as string | undefined) || DEFAULT_USER_ID,
      orgId: d[StorageKey.SELECTED_ORG] as string | undefined,
      projectId: d[StorageKey.SELECTED_PROJECT] as string | undefined,
      memoryEnabled: d[StorageKey.MEMORY_ENABLED] !== false,
      baseUrl: (d[StorageKey.API_BASE_URL] as string | undefined) || 'https://api.mem0.ai',
    }));
  }

  function maybeSend(engine: string, query: string): void {
    const q = normalize(query);
    if (!q || q.length < 2) {
      return;
    }

    getSettings().then(async settings => {
      if (!settings.hasCreds || settings.memoryEnabled === false) {
        return;
      }
      // Gate by track_searches toggle (default off if undefined)
      const allow = await storageSyncGet([StorageKey.TRACK_SEARCHES]).then(
        d => d[StorageKey.TRACK_SEARCHES] === true
      );
      if (!allow) {
        return;
      }
    });
  }

  // URL based capture for results pages
  function urlCapture(): void {
    const host = location.hostname || '';
    const path = location.pathname || '';
    const params = new URLSearchParams(location.search || '');

    // Google results
    if (/(^|\.)google\./.test(host) && path.startsWith('/search')) {
      const q = params.get('q');
      if (q) {
        maybeSend('Google', q);
      }
      return;
    }

    // Bing results
    if (host.endsWith('bing.com') && (path === '/search' || path === '/')) {
      const q = params.get('q');
      if (q) {
        maybeSend('Bing', q);
      }
      return;
    }

    // Brave results
    if (host === 'search.brave.com' && (path === '/search' || path === '/images')) {
      const q = params.get('q');
      if (q) {
        maybeSend('Brave', q);
      }
      return;
    }

    // Arc results
    if (host === 'search.arc.net' && (path === '/search' || path.startsWith('/search'))) {
      const q = params.get('q') || params.get('query');
      if (q) {
        maybeSend('Arc', q);
      }
      return;
    }
  }

  function installSpaUrlWatcher(): void {
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    const onUrlChange = () => {
      try {
        urlCapture();
      } catch {
        return;
      }
    };

    history.pushState = function (data: HistoryStateData, unused: string, url?: HistoryUrl) {
      origPush(data, unused, url);
      onUrlChange();
    };

    history.replaceState = function (data: HistoryStateData, unused: string, url?: HistoryUrl) {
      origReplace(data, unused, url);
      onUrlChange();
    };

    window.addEventListener('popstate', onUrlChange);
  }

  // Run
  urlCapture();
  installSpaUrlWatcher();
})();
