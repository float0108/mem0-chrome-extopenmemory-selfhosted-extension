import { StorageKey } from '../types/storage';

export const CONFIGURATION_KEYS = [
  StorageKey.SETUP_COMPLETE,
  StorageKey.API_BASE_URL,
  StorageKey.API_KEY,
  StorageKey.USER_ID,
];

/** A fresh installation cannot send or retrieve memories until setup is saved. */
export function isConfigured(data: Record<string, unknown>): boolean {
  return (
    data[StorageKey.SETUP_COMPLETE] === true &&
    [StorageKey.API_BASE_URL, StorageKey.API_KEY, StorageKey.USER_ID].every(
      key => typeof data[key] === 'string' && (data[key] as string).trim().length > 0
    )
  );
}
