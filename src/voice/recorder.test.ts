import { AudioModule, setAudioModeAsync } from 'expo-audio';

import { createRecorder, meteringToLevel } from './recorder';

jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  RecordingPresets: { HIGH_QUALITY: { bitRate: 128000 } },
}));

const fakeRecorder = (uri: string | null = 'file:///clip.wav', metering = -20) => ({
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  record: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  uri,
  getStatus: jest.fn().mockReturnValue({ metering }) as never,
});

describe('meteringToLevel', () => {
  it('treats room tone as silence', () => {
    expect(meteringToLevel(-60)).toBe(0);
    expect(meteringToLevel(-100)).toBe(0);
  });

  it('treats clipping as full scale', () => {
    expect(meteringToLevel(0)).toBe(1);
  });

  it('scales between the two', () => {
    expect(meteringToLevel(-30)).toBeCloseTo(0.5);
  });

  /** A missing or NaN reading must not poison the VAD with a false level. */
  it('reports silence when there is no reading', () => {
    expect(meteringToLevel(undefined)).toBe(0);
    expect(meteringToLevel(Number.NaN)).toBe(0);
  });
});

describe('createRecorder', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports whether the user granted the mic', async () => {
    (AudioModule.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    await expect(createRecorder(fakeRecorder()).requestPermission()).resolves.toBe(true);

    (AudioModule.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    await expect(createRecorder(fakeRecorder()).requestPermission()).resolves.toBe(false);
  });

  it('records at whisper’s 16kHz mono so nothing has to resample', async () => {
    const inner = fakeRecorder();
    await createRecorder(inner).start();

    expect(inner.prepareToRecordAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 16_000, numberOfChannels: 1 }),
    );
    expect(inner.record).toHaveBeenCalled();
  });

  /** Android otherwise records via the earpiece route and never hears anything. */
  it('puts the session in recording mode first, and releases it after', async () => {
    const inner = fakeRecorder();
    const recorder = createRecorder(inner);

    await recorder.start();
    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: true }),
    );

    await recorder.stop();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });

  it('returns the clip', async () => {
    const recorder = createRecorder(fakeRecorder('file:///clip.wav'));
    await recorder.start();
    await expect(recorder.stop()).resolves.toBe('file:///clip.wav');
  });

  it('returns nothing when stopped without having started', async () => {
    await expect(createRecorder(fakeRecorder()).stop()).resolves.toBeNull();
  });

  it('ignores a second start while already recording', async () => {
    const inner = fakeRecorder();
    const recorder = createRecorder(inner);

    await recorder.start();
    await recorder.start();
    expect(inner.record).toHaveBeenCalledTimes(1);
  });

  it('cancels without handing back a clip', async () => {
    const inner = fakeRecorder();
    const recorder = createRecorder(inner);

    await recorder.start();
    await recorder.cancel();
    expect(inner.stop).toHaveBeenCalled();
    await expect(recorder.stop()).resolves.toBeNull();
  });

  it('reports a level while recording and silence when idle', async () => {
    const recorder = createRecorder(fakeRecorder('file:///clip.wav', -30));
    expect(recorder.level()).toBe(0);

    await recorder.start();
    expect(recorder.level()).toBeCloseTo(0.5);

    await recorder.stop();
    expect(recorder.level()).toBe(0);
  });
});
