import * as FileSystem from 'expo-file-system/legacy';

import { ensureModel, isModelReady, MODEL_FILENAME } from './whisperModel';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
}));

const fs = FileSystem as jest.Mocked<typeof FileSystem>;

const COMPLETE = { exists: true, size: 75_000_000 } as never;
const TRUNCATED = { exists: true, size: 1_200_000 } as never;
const MISSING = { exists: false } as never;

const downloadYielding = (uri: string | undefined) => {
  const downloadAsync = jest.fn().mockResolvedValue(uri ? { uri } : undefined);
  fs.createDownloadResumable.mockReturnValue({ downloadAsync } as never);
  return downloadAsync;
};

describe('whisperModel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reuses a model already on disk instead of re-downloading 75MB', async () => {
    fs.getInfoAsync.mockResolvedValue(COMPLETE);

    await expect(ensureModel()).resolves.toBe(`file:///docs/${MODEL_FILENAME}`);
    expect(fs.createDownloadResumable).not.toHaveBeenCalled();
  });

  it('downloads when nothing is on disk', async () => {
    fs.getInfoAsync.mockResolvedValueOnce(MISSING).mockResolvedValueOnce(COMPLETE);
    const downloadAsync = downloadYielding('file:///docs/ggml-tiny.en.bin');

    await expect(ensureModel()).resolves.toBe('file:///docs/ggml-tiny.en.bin');
    expect(downloadAsync).toHaveBeenCalled();
  });

  /**
   * A truncated GGML makes whisper.rn fail deep in native code with a message
   * that points nowhere near the real cause, so a partial file is never kept.
   */
  it('discards a partial file and downloads again', async () => {
    fs.getInfoAsync.mockResolvedValueOnce(TRUNCATED).mockResolvedValueOnce(COMPLETE);
    downloadYielding('file:///docs/ggml-tiny.en.bin');

    await ensureModel();
    expect(fs.deleteAsync).toHaveBeenCalledWith(`file:///docs/${MODEL_FILENAME}`, {
      idempotent: true,
    });
  });

  it('refuses a download that finished short, and cleans it up', async () => {
    fs.getInfoAsync.mockResolvedValueOnce(MISSING).mockResolvedValueOnce(TRUNCATED);
    downloadYielding('file:///docs/ggml-tiny.en.bin');

    await expect(ensureModel()).rejects.toThrow(/incomplete/);
    expect(fs.deleteAsync).toHaveBeenCalledWith('file:///docs/ggml-tiny.en.bin', {
      idempotent: true,
    });
  });

  it('reports a download that produced nothing', async () => {
    fs.getInfoAsync.mockResolvedValueOnce(MISSING);
    downloadYielding(undefined);

    await expect(ensureModel()).rejects.toThrow(/failed/);
  });

  it('reports progress so a 75MB wait is not a blank screen', async () => {
    fs.getInfoAsync.mockResolvedValueOnce(MISSING).mockResolvedValueOnce(COMPLETE);
    downloadYielding('file:///docs/ggml-tiny.en.bin');
    const onProgress = jest.fn();

    await ensureModel(onProgress);

    const callback = fs.createDownloadResumable.mock.calls[0]?.[3] as
      | ((p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void)
      | undefined;
    callback?.({ totalBytesWritten: 40, totalBytesExpectedToWrite: 100 });
    expect(onProgress).toHaveBeenCalledWith({ received: 40, total: 100 });
  });

  describe('isModelReady', () => {
    it('is true for a complete model', async () => {
      fs.getInfoAsync.mockResolvedValue(COMPLETE);
      await expect(isModelReady()).resolves.toBe(true);
    });

    it('is false when missing or partial', async () => {
      fs.getInfoAsync.mockResolvedValue(MISSING);
      await expect(isModelReady()).resolves.toBe(false);

      fs.getInfoAsync.mockResolvedValue(TRUNCATED);
      await expect(isModelReady()).resolves.toBe(false);
    });
  });
});
