import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * App-level preferences. Not secret — AsyncStorage, deliberately not
 * SecureStore (that tier is reserved for the connection key and profile
 * credentials, per ARCHITECTURE.md).
 */
export const SETTINGS_STORAGE_KEY = 'clementine.settings.theme';

export type ThemePreference = 'system' | 'light' | 'dark';

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === 'string' && PREFERENCES.includes(value as ThemePreference);

type SettingsState = {
  theme: ThemePreference;
  /** False until `hydrate()` has run, so the UI can avoid a wrong-theme flash. */
  hydrated: boolean;
  setTheme: (theme: ThemePreference) => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'system',
  hydrated: false,

  setTheme: async (theme) => {
    set({ theme });
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, theme);
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      // A corrupt or unknown value falls back to 'system' rather than
      // blocking boot on a preference that cannot matter this much.
      set({ theme: isThemePreference(stored) ? stored : 'system', hydrated: true });
    } catch {
      set({ theme: 'system', hydrated: true });
    }
  },
}));
