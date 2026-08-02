import { persistAvatarImage } from './avatarImage';

type Tracking = {
  copies: string[];
  deletes: string[];
  dirCreates: string[];
  files: Set<string>;
  dirs: Set<string>;
};

const tracking = (): Tracking =>
  (jest.requireMock('expo-file-system') as { __tracking: Tracking }).__tracking;

describe('persistAvatarImage', () => {
  beforeEach(() => {
    // Fresh in-memory filesystem per test.
    const t = tracking();
    t.copies.length = 0;
    t.deletes.length = 0;
    t.dirCreates.length = 0;
    t.files.clear();
    t.dirs.clear();
  });

  it('copies the picked image into the documents avatars dir with a stable name', async () => {
    const uri = await persistAvatarImage('file:///cache/picked.jpg', 'default');
    // The picker's cache URI must not be stored — it can be evicted.
    expect(uri).not.toMatch(/^file:\/\/\/cache\//);
    expect(uri).toMatch(/^file:\/\/\/documents\/avatars\/default\.jpg$/);
    expect(tracking().copies).toContain('file:///documents/avatars/default.jpg');
  });

  it('creates the avatars directory when missing', async () => {
    await persistAvatarImage('file:///cache/picked.jpg', 'default');
    expect(tracking().dirCreates).toContain('file:///documents/avatars');
  });

  it('deletes a stale avatar before copying the replacement', async () => {
    // First pick creates the file; the second pick of a new image must
    // replace it, so the old one is deleted first.
    await persistAvatarImage('file:///cache/picked.jpg', 'default');
    await persistAvatarImage('file:///cache/picked-2.jpg', 'default');
    expect(tracking().deletes).toContain('file:///documents/avatars/default.jpg');
  });

  it('keeps the source file untouched — the copy is a copy', async () => {
    await persistAvatarImage('file:///cache/picked.jpg', 'default');
    expect(tracking().copies).toContain('file:///documents/avatars/default.jpg');
    expect(tracking().deletes).not.toContain('file:///cache/picked.jpg');
  });

  it('names each profile avatar separately', async () => {
    await persistAvatarImage('file:///cache/picked.jpg', 'default');
    await persistAvatarImage('file:///cache/picked.jpg', 'p_work');
    expect(tracking().copies).toEqual([
      'file:///documents/avatars/default.jpg',
      'file:///documents/avatars/p_work.jpg',
    ]);
  });
});
