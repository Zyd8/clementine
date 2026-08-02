import * as FileSystem from 'expo-file-system/legacy';

/**
 * The on-device Whisper weights.
 *
 * Downloaded on first use rather than bundled: `tiny.en` is ~75MB, which is
 * most of an APK, and most installs never open voice mode. It lands in the
 * app's document directory, so it survives restarts and is removed with the
 * app.
 *
 * `tiny.en` specifically — `base.en` is roughly twice the size and several
 * times slower per utterance on a phone, and this is a command-and-control
 * surface where latency is the whole experience.
 */

export const MODEL_FILENAME = 'ggml-tiny.en.bin';

export const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin';

/** Roughly 75MB — used to sanity-check a finished download. */
const MIN_PLAUSIBLE_BYTES = 30_000_000;

export type ModelProgress = { received: number; total: number };

const modelPath = (): string => `${FileSystem.documentDirectory}${MODEL_FILENAME}`;

/**
 * Path to a ready-to-use model, downloading it if this is the first run.
 *
 * A partial file from an interrupted download is deleted rather than reused:
 * whisper.rn given a truncated GGML fails deep in native code with a message
 * that points nowhere near the real cause.
 */
export async function ensureModel(
  onProgress?: (progress: ModelProgress) => void,
): Promise<string> {
  const path = modelPath();
  const info = await FileSystem.getInfoAsync(path);

  if (info.exists && 'size' in info && (info.size ?? 0) >= MIN_PLAUSIBLE_BYTES) {
    return path;
  }

  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }

  const download = FileSystem.createDownloadResumable(
    MODEL_URL,
    path,
    {},
    onProgress
      ? ({ totalBytesWritten, totalBytesExpectedToWrite }) =>
          onProgress({
            received: totalBytesWritten,
            total: totalBytesExpectedToWrite,
          })
      : undefined,
  );

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error('Whisper model download failed');
  }

  const written = await FileSystem.getInfoAsync(result.uri);
  if (!written.exists || !('size' in written) || (written.size ?? 0) < MIN_PLAUSIBLE_BYTES) {
    // Leaving a truncated file behind would make every later run fail in
    // native code instead of retrying the download.
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new Error('Whisper model download was incomplete');
  }

  return result.uri;
}

/** Whether the model is already on disk, for a no-surprise-download UI. */
export async function isModelReady(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(modelPath());
  return info.exists && 'size' in info && (info.size ?? 0) >= MIN_PLAUSIBLE_BYTES;
}
