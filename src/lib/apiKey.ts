import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const KEY = 'anthropic-api-key';
const listeners = new Set<(key: string | null) => void>();

// SecureStore (iOS Keychain / Android Keystore) isn't available on web, where
// the app is only used for quick UI checks.
const storage =
  Platform.OS === 'web'
    ? {
        get: async () => globalThis.localStorage?.getItem(KEY) ?? null,
        set: async (v: string) => globalThis.localStorage?.setItem(KEY, v),
        remove: async () => globalThis.localStorage?.removeItem(KEY),
      }
    : {
        get: () => SecureStore.getItemAsync(KEY),
        set: (v: string) => SecureStore.setItemAsync(KEY, v),
        remove: () => SecureStore.deleteItemAsync(KEY),
      };

export async function saveApiKey(value: string) {
  const key = value.trim();
  if (key) await storage.set(key);
  else await storage.remove();
  listeners.forEach((l) => l(key || null));
}

/** `undefined` while loading, `null` when no key has been saved. */
export function useApiKey() {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    storage.get().then(setKey, () => setKey(null));
    listeners.add(setKey);
    return () => {
      listeners.delete(setKey);
    };
  }, []);
  return key;
}
