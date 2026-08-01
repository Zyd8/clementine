import AsyncStorage from '@react-native-async-storage/async-storage';

import { SETTINGS_STORAGE_KEY, useSettingsStore } from './settings';

describe('settings store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useSettingsStore.setState({ theme: 'system', hydrated: false });
    jest.clearAllMocks();
  });

  it('defaults to following the system theme', () => {
    expect(useSettingsStore.getState().theme).toBe('system');
  });

  it('starts un-hydrated so the UI can avoid flashing the wrong theme', () => {
    expect(useSettingsStore.getState().hydrated).toBe(false);
  });

  it.each(['light', 'dark', 'system'] as const)('sets the theme to %s', async (theme) => {
    await useSettingsStore.getState().setTheme(theme);
    expect(useSettingsStore.getState().theme).toBe(theme);
  });

  it('persists the choice to AsyncStorage', async () => {
    await useSettingsStore.getState().setTheme('dark');
    await expect(AsyncStorage.getItem(SETTINGS_STORAGE_KEY)).resolves.toBe('dark');
  });

  it('is not a secret — never touches SecureStore', async () => {
    const secureStore = require('expo-secure-store');
    await useSettingsStore.getState().setTheme('dark');
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('hydrates a previously stored choice', async () => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, 'light');
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().theme).toBe('light');
    expect(useSettingsStore.getState().hydrated).toBe(true);
  });

  it('hydrates to the system default when nothing was stored', async () => {
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().theme).toBe('system');
    expect(useSettingsStore.getState().hydrated).toBe(true);
  });

  it('ignores a corrupted stored value rather than crashing on boot', async () => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, 'chartreuse');
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().theme).toBe('system');
    expect(useSettingsStore.getState().hydrated).toBe(true);
  });

  it('still marks itself hydrated if storage throws, so the app can boot', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().theme).toBe('system');
    expect(useSettingsStore.getState().hydrated).toBe(true);
  });
});
