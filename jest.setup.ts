jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  wrap: (c: unknown) => c,
}));

// expo-audio is a native module and cannot load under Jest. The recorder
// adapter around it (src/voice/recorder.ts) is tested directly against a fake;
// this only has to keep the module importable for everything above it.
jest.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  setAudioModeAsync: jest.fn(async () => undefined),
  RecordingPresets: {
    HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2 },
  },
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    uri: null,
    getStatus: () => ({ metering: -160 }),
  }),
  // Edge TTS playback: a player whose status event fires didJustFinish when
  // the test tells it to, so playback completion is observable under Jest.
  createAudioPlayer: jest.fn(() => {
    const listeners: ((status: unknown) => void)[] = [];
    return {
      uri: 'file:///cache/edge-tts/test.mp3',
      addListener: jest.fn((_event: string, cb: (status: unknown) => void) => {
        listeners.push(cb);
        return { remove: jest.fn() };
      }),
      play: jest.fn(() => {
        setImmediate(() => {
          for (const cb of listeners) cb({ didJustFinish: true });
        });
      }),
      pause: jest.fn(),
      remove: jest.fn(),
      __listeners: listeners,
    };
  }),
}));

// expo-speech drives the platform engine; under Jest it only has to be
// importable and to run its completion callbacks.
jest.mock('expo-speech', () => ({
  speak: jest.fn((_text: string, options?: { onDone?: () => void }) => {
    options?.onDone?.();
  }),
  stop: jest.fn(async () => undefined),
}));

// expo-crypto is a native module; the Edge TTS token only needs a digest that
// is deterministic under test.
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async () => 'A'.repeat(64)),
}));

// expo-image-picker is a native module. The avatar flow under test only
// needs the permission gate and a fixed picked asset.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///cache/picked-avatar.jpg' }],
  })),
}));

// expo-file-system is a native module. Avatar persistence is exercised by
// the real code path against this in-memory stand-in: it models copy/delete
// against a set of "created" files, and exposes a __tracking handle so tests
// can assert exactly what the util did (copied, deleted, dir created).
jest.mock('expo-file-system', () => {
  const createdFiles = new Set<string>();
  const createdDirs = new Set<string>();
  const tracking = {
    copies: [] as string[],
    deletes: [] as string[],
    dirCreates: [] as string[],
    // Written clip contents, so audio tests can tell which sentence a file
    // holds and assert the order they were played in.
    writes: [] as { uri: string; content: string | Uint8Array }[],
    files: createdFiles,
    dirs: createdDirs,
  };

  class FakeFile {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
        .join('/');
    }
    get exists() {
      return createdFiles.has(this.uri);
    }
    get extension() {
      return '.jpg';
    }
    // `File` implements Blob, and that is the whole reason the ASR upload
    // hands one to fetch instead of a `{ uri }` object. Modelled here so a
    // regression to the bare uri fails in tests rather than on a phone.
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get type() {
      return this.name.endsWith('.m4a') ? 'audio/m4a' : 'image/jpeg';
    }
    async bytes() {
      return new Uint8Array([0, 1, 2, 3]);
    }
    get size() {
      return 4;
    }
    async base64() {
      return 'AAECAw==';
    }
    create() {
      createdFiles.add(this.uri);
    }
    write(content: string | Uint8Array) {
      tracking.writes.push({ uri: this.uri, content });
      createdFiles.add(this.uri);
    }
    async copy(dest: FakeFile) {
      tracking.copies.push(dest.uri);
      createdFiles.add(dest.uri);
    }
    delete() {
      tracking.deletes.push(this.uri);
      createdFiles.delete(this.uri);
    }
  }

  class FakeDirectory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
        .join('/');
    }
    get exists() {
      return createdDirs.has(this.uri);
    }
    create() {
      tracking.dirCreates.push(this.uri);
      createdDirs.add(this.uri);
    }
  }

  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { document: new FakeDirectory('file:///documents'), cache: new FakeDirectory('file:///cache') },
    __tracking: tracking,
  };
});
