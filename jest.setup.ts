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
}));

// whisper.rn's native binding likewise; asr.ts's contract is tested with its
// own local mock where the transcript matters.
jest.mock('whisper.rn/index', () => ({
  initWhisper: jest.fn(async () => ({
    transcribe: () => ({ promise: Promise.resolve({ result: '' }) }),
  })),
}));
