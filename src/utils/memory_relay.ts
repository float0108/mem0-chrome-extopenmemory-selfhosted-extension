import { StorageKey } from '../types/storage';

import { normalizeApiUrl, requireJson } from './api_url';
import { CONFIGURATION_KEYS, isConfigured } from './configuration';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'LOCAL_MEMORY_FETCH') {
    return;
  }
  if (sender.id !== chrome.runtime.id) {
    return;
  }
  void (async () => {
    try {
      const settings = await chrome.storage.sync.get([
        ...CONFIGURATION_KEYS,
        StorageKey.ACCESS_TOKEN,
      ]);
      if (!isConfigured(settings)) {
        throw new Error(
          'Complete setup in the extension popup: server URL, user ID and API key are required.'
        );
      }
      const normalized = normalizeApiUrl(settings.baseUrl);
      const base = new URL(normalized + '/');
      let target = new URL(request.url);
      target.pathname = target.pathname.replace(/\/{2,}/g, '/');
      const path = target.pathname.slice(base.pathname.length);
      const method = request.method || 'GET';
      if (
        !['http:', 'https:'].includes(base.protocol) ||
        target.origin !== base.origin ||
        !target.pathname.startsWith(base.pathname) ||
        target.username ||
        target.password ||
        !(
          (path === 'memories' && ['GET', 'POST'].includes(method)) ||
          (path === 'search' && method === 'POST')
        )
      ) {
        throw new Error('Request outside configured memory API');
      }
      if (normalized !== settings.baseUrl.replace(/\/+$/, '')) {
        await chrome.storage.sync.set({ [StorageKey.API_BASE_URL]: normalized });
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.apiKey) {
        headers['X-API-Key'] = settings.apiKey;
      } else if (settings.access_token) {
        headers.Authorization = `Bearer ${settings.access_token}`;
      }
      const response = await fetch(target, {
        method,
        headers,
        body: request.body,
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
      });
      requireJson(response.headers.get('content-type'));
      sendResponse({
        status: response.status,
        body: await response.text(),
        headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
      });
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : 'Memory request failed' });
    }
  })();
  return true;
});
