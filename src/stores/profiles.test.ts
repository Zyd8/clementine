import AsyncStorage from '@react-native-async-storage/async-storage';

import { useProfilesStore, PROFILES_STORAGE_KEY } from './profiles';

const reset = () =>
  useProfilesStore.setState({
    profiles: [{ id: 'default', name: 'default', avatar: 'DF' }],
    activeId: 'default',
    hydrated: true,
  });

describe('profiles store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    reset();
  });

  it('starts with the one implicit profile every host has', () => {
    const { profiles, activeId } = useProfilesStore.getState();
    expect(profiles).toHaveLength(1);
    expect(activeId).toBe('default');
  });

  it('renames a profile', async () => {
    await useProfilesStore.getState().rename('default', 'personal');
    expect(useProfilesStore.getState().profiles[0]?.name).toBe('personal');
  });

  /** The design's avatar input is `maxlength=2`, uppercased. */
  it('caps an avatar at two uppercase characters', async () => {
    await useProfilesStore.getState().setAvatar('default', 'personal');
    expect(useProfilesStore.getState().profiles[0]?.avatar).toBe('PE');
  });

  it('keeps an avatar that is already short', async () => {
    await useProfilesStore.getState().setAvatar('default', 'wk');
    expect(useProfilesStore.getState().profiles[0]?.avatar).toBe('WK');
  });

  it('adds a profile and can switch to it', async () => {
    await useProfilesStore.getState().add('work');
    const { profiles } = useProfilesStore.getState();
    expect(profiles).toHaveLength(2);

    const work = profiles.find((p) => p.name === 'work');
    await useProfilesStore.getState().select(work!.id);
    expect(useProfilesStore.getState().activeId).toBe(work!.id);
  });

  it('derives an avatar from the name when one is added', async () => {
    await useProfilesStore.getState().add('work');
    expect(useProfilesStore.getState().profiles[1]?.avatar).toBe('WO');
  });

  it('ignores a request to switch to a profile that does not exist', async () => {
    await useProfilesStore.getState().select('nope');
    expect(useProfilesStore.getState().activeId).toBe('default');
  });

  /**
   * The chat and usage stores key everything by `profileId | null`, so the
   * active profile id is what partitions their state. It must therefore
   * survive a restart, or a relaunch silently shows another profile's feed.
   */
  it('persists across a restart', async () => {
    await useProfilesStore.getState().add('work');
    const added = useProfilesStore.getState().profiles[1]!;
    await useProfilesStore.getState().select(added.id);

    useProfilesStore.setState({ profiles: [], activeId: 'default', hydrated: false });
    await useProfilesStore.getState().hydrate();

    const { profiles, activeId } = useProfilesStore.getState();
    expect(profiles.map((p) => p.name)).toEqual(['default', 'work']);
    expect(activeId).toBe(added.id);
  });

  it('falls back to the implicit profile when storage holds junk', async () => {
    await AsyncStorage.setItem(PROFILES_STORAGE_KEY, 'not json');
    useProfilesStore.setState({ profiles: [], activeId: 'x', hydrated: false });
    await useProfilesStore.getState().hydrate();

    expect(useProfilesStore.getState().profiles).toHaveLength(1);
    expect(useProfilesStore.getState().activeId).toBe('default');
    expect(useProfilesStore.getState().hydrated).toBe(true);
  });

  /**
   * `null` is the no-profile key the chat/usage stores were built around.
   * The implicit default profile must resolve to it, so existing state does
   * not orphan the moment this store lands.
   */
  it('maps the implicit default profile to the null profile key', () => {
    expect(useProfilesStore.getState().activeProfileId()).toBeNull();
  });

  it('maps a real profile to its own key', async () => {
    await useProfilesStore.getState().add('work');
    const work = useProfilesStore.getState().profiles[1]!;
    await useProfilesStore.getState().select(work.id);
    expect(useProfilesStore.getState().activeProfileId()).toBe(work.id);
  });
});
