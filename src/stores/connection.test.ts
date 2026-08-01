import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { CONNECTION_STORAGE_KEY, useConnectionStore } from './connection';

const CONNECTION = {
  name: 'laptop hermes',
  baseUrl: 'http://100.106.162.39:8642',
  apiKey: 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b',
  connectedAt: 1_754_000_000_000,
};

const reset = () =>
  useConnectionStore.setState({ connection: null, hydrated: false });

describe('connection store', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(CONNECTION_STORAGE_KEY);
    reset();
    jest.clearAllMocks();
  });

  it('starts with no connection', () => {
    expect(useConnectionStore.getState().connection).toBeNull();
  });

  it('stores a single object, not a list', async () => {
    await useConnectionStore.getState().connect(CONNECTION);
    expect(Array.isArray(useConnectionStore.getState().connection)).toBe(false);
    expect(useConnectionStore.getState().connection).toMatchObject({
      baseUrl: CONNECTION.baseUrl,
    });
  });

  it('persists the credential to SecureStore, never AsyncStorage', async () => {
    await useConnectionStore.getState().connect(CONNECTION);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      CONNECTION_STORAGE_KEY,
      expect.stringContaining(CONNECTION.apiKey),
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('replaces the previous connection rather than accumulating', async () => {
    await useConnectionStore.getState().connect(CONNECTION);
    await useConnectionStore
      .getState()
      .connect({ ...CONNECTION, baseUrl: 'https://api.zyldjan.com', name: 'other' });
    expect(useConnectionStore.getState().connection?.baseUrl).toBe(
      'https://api.zyldjan.com',
    );
    expect(useConnectionStore.getState().connection?.name).toBe('other');
  });

  it('hydrates a stored connection on boot', async () => {
    await SecureStore.setItemAsync(CONNECTION_STORAGE_KEY, JSON.stringify(CONNECTION));
    await useConnectionStore.getState().hydrate();
    expect(useConnectionStore.getState().connection?.baseUrl).toBe(CONNECTION.baseUrl);
    expect(useConnectionStore.getState().hydrated).toBe(true);
  });

  it('hydrates to null when nothing is stored, so setup is shown', async () => {
    await useConnectionStore.getState().hydrate();
    expect(useConnectionStore.getState().connection).toBeNull();
    expect(useConnectionStore.getState().hydrated).toBe(true);
  });

  it('discards a corrupted stored blob rather than crashing on boot', async () => {
    await SecureStore.setItemAsync(CONNECTION_STORAGE_KEY, '{not json');
    await useConnectionStore.getState().hydrate();
    expect(useConnectionStore.getState().connection).toBeNull();
    expect(useConnectionStore.getState().hydrated).toBe(true);
  });

  it('discards a stored blob that fails schema validation', async () => {
    await SecureStore.setItemAsync(
      CONNECTION_STORAGE_KEY,
      JSON.stringify({ baseUrl: 'nope', apiKey: '' }),
    );
    await useConnectionStore.getState().hydrate();
    expect(useConnectionStore.getState().connection).toBeNull();
  });

  it('records lastUsedAt without rewriting connectedAt', async () => {
    await useConnectionStore.getState().connect(CONNECTION);
    await useConnectionStore.getState().touch(1_754_000_555_000);
    const state = useConnectionStore.getState().connection;
    expect(state?.lastUsedAt).toBe(1_754_000_555_000);
    expect(state?.connectedAt).toBe(CONNECTION.connectedAt);
  });

  it('ignores touch when there is no connection', async () => {
    await expect(useConnectionStore.getState().touch(1)).resolves.toBeUndefined();
    expect(useConnectionStore.getState().connection).toBeNull();
  });

  describe('reconfigure — replacing the instance entirely', () => {
    const NEXT = {
      ...CONNECTION,
      name: 'vps hermes',
      baseUrl: 'https://api.zyldjan.com',
      apiKey: 'b7e2d1c0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2',
      connectedAt: 1_754_000_900_000,
    };

    it('ends up on the new connection', async () => {
      await useConnectionStore.getState().connect(CONNECTION);
      await useConnectionStore.getState().reconfigure(NEXT);
      expect(useConnectionStore.getState().connection?.baseUrl).toBe(NEXT.baseUrl);
    });

    it('clears the previous credential before writing the new one', async () => {
      await useConnectionStore.getState().connect(CONNECTION);
      jest.clearAllMocks();
      await useConnectionStore.getState().reconfigure(NEXT);

      const [deleteOrder] = (SecureStore.deleteItemAsync as jest.Mock).mock
        .invocationCallOrder;
      const [setOrder] = (SecureStore.setItemAsync as jest.Mock).mock
        .invocationCallOrder;
      expect(deleteOrder).toBeDefined();
      expect(setOrder).toBeDefined();
      expect(deleteOrder as number).toBeLessThan(setOrder as number);
    });

    it('leaves no trace of the old instance in SecureStore', async () => {
      await useConnectionStore.getState().connect(CONNECTION);
      await useConnectionStore.getState().reconfigure(NEXT);
      const stored = await SecureStore.getItemAsync(CONNECTION_STORAGE_KEY);
      expect(stored).not.toContain(CONNECTION.apiKey);
      expect(stored).not.toContain(CONNECTION.baseUrl);
    });

    it('does not carry the old lastUsedAt onto the new connection', async () => {
      await useConnectionStore.getState().connect(CONNECTION);
      await useConnectionStore.getState().touch(1_754_000_555_000);
      await useConnectionStore.getState().reconfigure(NEXT);
      expect(useConnectionStore.getState().connection?.lastUsedAt).toBeUndefined();
    });

    it('never contacts either instance — reconfigure is local too', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      await useConnectionStore.getState().connect(CONNECTION);
      await useConnectionStore.getState().reconfigure(NEXT);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('clears the in-memory connection', async () => {
      await useConnectionStore.getState().connect(CONNECTION);
      await useConnectionStore.getState().disconnect();
      expect(useConnectionStore.getState().connection).toBeNull();
    });

    it('wipes the credential out of SecureStore', async () => {
      await useConnectionStore.getState().connect(CONNECTION);
      await useConnectionStore.getState().disconnect();
      await expect(
        SecureStore.getItemAsync(CONNECTION_STORAGE_KEY),
      ).resolves.toBeNull();
    });

    it('never touches the remote instance — disconnect is purely local', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      await useConnectionStore.getState().connect(CONNECTION);
      await useConnectionStore.getState().disconnect();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('leaves the store hydrated so the app routes to setup, not to a spinner', async () => {
      await useConnectionStore.getState().connect(CONNECTION);
      await useConnectionStore.getState().disconnect();
      expect(useConnectionStore.getState().hydrated).toBe(true);
    });
  });
});
