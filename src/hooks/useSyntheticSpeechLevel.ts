import { useEffect, useRef, useState } from 'react';

/**
 * A plausible-looking "the AI is talking" motion for the waveform.
 *
 * There is no real level to show here: `expo-audio`'s player exposes no
 * playback metering, and the mic is deliberately closed for the whole of
 * PLAYING (see `useVoiceChat.ts`), so the waveform's usual `audioLevel` prop
 * is just stale silence while the AI actually speaks. This fills that gap
 * with motion, not a measurement — it must never be read as a real
 * amplitude, only as "something is being said right now."
 *
 * A random walk rather than fresh random values each tick, so the bars
 * glide between heights instead of flickering — closer to how a waveform
 * reads when it's real.
 */
export function useSyntheticSpeechLevel(active: boolean, intervalMs = 120): number {
  const [level, setLevel] = useState(0);
  const current = useRef(0.5);

  useEffect(() => {
    if (!active) {
      // Reset the walk's starting point for next time, but don't setState
      // here — the return below already zeroes the value for this render,
      // synchronously, without waiting on an effect to fire.
      current.current = 0.5;
      return;
    }

    const id = setInterval(() => {
      const target = 0.25 + Math.random() * 0.6;
      current.current += (target - current.current) * 0.5;
      setLevel(current.current);
    }, intervalMs);

    return () => clearInterval(id);
  }, [active, intervalMs]);

  return active ? level : 0;
}
