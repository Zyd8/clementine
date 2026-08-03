import { act, renderHook } from '@testing-library/react-native';

import { useChatStore } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { DEFAULT_PROFILE_ID, useProfilesStore } from '@/stores/profiles';
import { useUsageStore } from '@/stores/usage';

import { useDisconnect, useReconfigure } from './useConnectionActions';

const CONNECTION = {
  name: 'laptop hermes',
  baseUrl: 'http://100.106.162.39:8642',
  apiKey: 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b',
  connectedAt: 1_754_000_000_000,
};

const NEXT_CONNECTION = {
  ...CONNECTION,
  name: 'vps hermes',
  baseUrl: 'https://api.zyldjan.com',
  apiKey: 'b7e2d1c0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2',
  connectedAt: 1_754_000_900_000,
};

/** Puts a real footprint into every instance-scoped store, as a live session would. */
const seedInstanceState = async () => {
  await useProfilesStore.getState().add('Work');
  const added = useProfilesStore.getState().profiles.find((p) => p.name === 'Work');
  await useProfilesStore.getState().setAvatar(added!.id, 'WK');
  await useProfilesStore.getState().select(added!.id);
  useChatStore.getState().appendUserMessage(null, 'hello from the old instance');
  useUsageStore
    .getState()
    .addUsage(null, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
};

const expectInstanceStateWiped = () => {
  expect(useProfilesStore.getState().profiles).toHaveLength(1);
  expect(useProfilesStore.getState().activeId).toBe(DEFAULT_PROFILE_ID);
  expect(useChatStore.getState().feed(null)).toHaveLength(0);
  expect(useUsageStore.getState().total(null)).toEqual({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
};

describe('useConnectionActions', () => {
  beforeEach(async () => {
    await useConnectionStore.getState().connect(CONNECTION);
    jest.clearAllMocks();
  });

  describe('useDisconnect', () => {
    /**
     * The regression this guards: profiles (and their avatars) are accounts
     * on ONE Hermes instance, but nothing reset that store — or the chat
     * feed, or usage totals — when disconnecting. The old instance's
     * profile list and avatar kept showing until the user happened to
     * reconnect to the SAME instance again.
     */
    it('wipes profiles, the chat feed, and usage totals on disconnect', async () => {
      await seedInstanceState();
      const { result } = await renderHook(() => useDisconnect());

      await act(async () => {
        await result.current();
      });

      expect(useConnectionStore.getState().connection).toBeNull();
      expectInstanceStateWiped();
    });
  });

  describe('useReconfigure', () => {
    it('wipes profiles, the chat feed, and usage totals when switching instances', async () => {
      await seedInstanceState();
      const { result } = await renderHook(() => useReconfigure());

      await act(async () => {
        await result.current(NEXT_CONNECTION);
      });

      expect(useConnectionStore.getState().connection?.baseUrl).toBe(
        NEXT_CONNECTION.baseUrl,
      );
      expectInstanceStateWiped();
    });

    it('still ends up connected to the new instance', async () => {
      const { result } = await renderHook(() => useReconfigure());
      await act(async () => {
        await result.current(NEXT_CONNECTION);
      });
      expect(useConnectionStore.getState().connection).toMatchObject({
        baseUrl: NEXT_CONNECTION.baseUrl,
        apiKey: NEXT_CONNECTION.apiKey,
      });
    });
  });
});
