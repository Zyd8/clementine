import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';

import { VoiceMeter, VAD_MARGIN_MAX, VAD_MARGIN_MIN, VAD_MARGIN_STEP } from './VoiceMeter';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

beforeEach(() => {
  useSettingsStore.setState({ theme: 'dark' });
});

const setup = (props: Partial<React.ComponentProps<typeof VoiceMeter>> = {}) =>
  render(
    <VoiceMeter
      level={0.2}
      threshold={0.4}
      margin={0.12}
      onMarginChange={jest.fn()}
      listening
      {...props}
    />,
  );

describe('VoiceMeter', () => {
  it('draws a bar for the live level', async () => {
    await setup({ level: 0.5 });
    expect(screen.getByTestId('voice-meter-level')).toBeTruthy();
  });

  /** The threshold is the whole point — without it the bar means nothing. */
  it('marks where the speech threshold sits', async () => {
    await setup({ threshold: 0.4 });
    expect(screen.getByTestId('voice-meter-threshold')).toBeTruthy();
  });

  it('places the threshold marker proportionally to its value', async () => {
    await setup({ threshold: 0.5 });
    const style = flatten(screen.getByTestId('voice-meter-threshold').props.style);
    expect(style.left).toBe('50%');
  });

  it('scales the level bar to the level', async () => {
    await setup({ level: 0.25 });
    const style = flatten(screen.getByTestId('voice-meter-level').props.style);
    expect(style.width).toBe('25%');
  });

  /**
   * Reading a number off a bar is guesswork; the numbers are what make it
   * tunable, so they are shown as well as drawn.
   */
  it('shows the level and threshold as numbers', async () => {
    await setup({ level: 0.42, threshold: 0.55 });
    expect(screen.getByText(/0\.42/)).toBeTruthy();
    expect(screen.getByText(/0\.55/)).toBeTruthy();
  });

  it('says whether the level currently counts as speech', async () => {
    await setup({ level: 0.6, threshold: 0.4 });
    expect(screen.getByTestId('voice-meter-verdict').props.children).toMatch(/speech/i);
  });

  it('says when the level is being treated as room noise', async () => {
    await setup({ level: 0.2, threshold: 0.4 });
    expect(screen.getByTestId('voice-meter-verdict').props.children).toMatch(/room/i);
  });

  // ---- tuning ----

  it('raises the margin when the user nudges it up', async () => {
    const onMarginChange = jest.fn();
    await setup({ margin: 0.12, onMarginChange });

    fireEvent.press(screen.getByLabelText('Increase sensitivity margin'));

    // Rounded to two places: nudging must not accumulate float drift.
    expect(onMarginChange).toHaveBeenCalledWith(
      Number((0.12 + VAD_MARGIN_STEP).toFixed(2)),
    );
  });

  it('lowers the margin when the user nudges it down', async () => {
    const onMarginChange = jest.fn();
    await setup({ margin: 0.12, onMarginChange });

    fireEvent.press(screen.getByLabelText('Decrease sensitivity margin'));

    expect(onMarginChange).toHaveBeenCalledWith(
      Number((0.12 - VAD_MARGIN_STEP).toFixed(2)),
    );
  });

  /** Clamped, so tuning can never make the mic deaf or permanently triggered. */
  it('will not push the margin above its maximum', async () => {
    const onMarginChange = jest.fn();
    await setup({ margin: VAD_MARGIN_MAX, onMarginChange });

    fireEvent.press(screen.getByLabelText('Increase sensitivity margin'));

    expect(onMarginChange).toHaveBeenCalledWith(VAD_MARGIN_MAX);
  });

  it('will not push the margin below its minimum', async () => {
    const onMarginChange = jest.fn();
    await setup({ margin: VAD_MARGIN_MIN, onMarginChange });

    fireEvent.press(screen.getByLabelText('Decrease sensitivity margin'));

    expect(onMarginChange).toHaveBeenCalledWith(VAD_MARGIN_MIN);
  });

  it('shows the margin so a tweak is visible', async () => {
    await setup({ margin: 0.2 });
    expect(screen.getByText(/margin 0\.20/)).toBeTruthy();
  });

  /**
   * The turn ending is exactly when the reading matters — it is the level the
   * decision was made on. Zeroing the bar there threw it away just as it
   * became worth looking at.
   */
  it('holds the last live reading when the mic closes', async () => {
    const { rerender } = await setup({ listening: true, level: 0.62 });

    await rerender(
      <VoiceMeter
        level={0}
        threshold={0.4}
        margin={0.12}
        onMarginChange={jest.fn()}
        listening={false}
      />,
    );

    const style = flatten(screen.getByTestId('voice-meter-level').props.style);
    expect(style.width).toBe('62%');
  });

  it('marks a held reading so it is not read as live', async () => {
    const { rerender } = await setup({ listening: true, level: 0.62 });
    await rerender(
      <VoiceMeter
        level={0}
        threshold={0.4}
        margin={0.12}
        onMarginChange={jest.fn()}
        listening={false}
      />,
    );

    expect(screen.getByTestId('voice-meter-verdict').props.children).toBe('held');
    const style = flatten(screen.getByTestId('voice-meter-level').props.style);
    expect(style.opacity).toBeLessThan(1);
  });
});
