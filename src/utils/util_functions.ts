import { OSS_API_BASE_DEFAULT } from '../types/api';
import { StorageKey, type StorageData } from '../types/storage';

export async function getApiBaseUrl(): Promise<string> {
  return new Promise(resolve => {
    chrome.storage.sync.get(StorageKey.API_BASE_URL, (data: StorageData) => {
      resolve(data.baseUrl || OSS_API_BASE_DEFAULT);
    });
  });
}

export function buildDashboardUrl(dashboardUrl: string, apiBaseUrl: string): string {
  if (dashboardUrl) return dashboardUrl;
  if (apiBaseUrl.includes('api.mem0.ai')) return 'https://app.mem0.ai';
  try {
    const u = new URL(apiBaseUrl);
    if (u.port === '8888' || u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      u.port = '3000';
    }
    return u.origin;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

export function buildAuthHeaders(apiKey?: string, accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  } else if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

export const sendExtensionEvent = (): void => {
  // Analytics events are a no-op for self-hosted instances
};

export const getBrowser = (): 'Edge' | 'Opera' | 'Chrome' | 'Firefox' | 'Safari' | 'Unknown' => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Edg/')) {
    return 'Edge';
  }
  if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) {
    return 'Opera';
  }
  if (userAgent.includes('Chrome/')) {
    return 'Chrome';
  }
  if (userAgent.includes('Firefox/')) {
    return 'Firefox';
  }
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    return 'Safari';
  }
  return 'Unknown';
};
