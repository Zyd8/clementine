import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { darkTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import { SPEECH_FLOOR, SpeechPulse } from './SpeechPulse';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

beforeEach(() => {
  // Pin to dark theme so the color assertion is deterministic.
  useSettingsStore.setState({ theme: 'dark' });
});

describe('SpeechPulse', () => {
  /**
   * The whole point of the halo: a static "listening" label looks identical
   * whether the mic is working or dead, so it can't tell you your voice is
   * getting through. Only a level above the floor may light it.
   */
  it('shows while the mic is hearing speech', async () => {
    await render(<SpeechPulse level={0.6} listening testID="pulse" />);
    expect(screen.getByTestId('pulse')).toBeTruthy();
  });

  it('stays dark on room tone below the speech floor', async () => {
    await render(
      <SpeechPulse level={SPEECH_FLOOR - 0.01} listening testID="pulse" />,
    );
    expect(screen.queryByTestId('pulse')).toBeNull();
  });

  it('lights at the floor exactly', async () => {
    await render(<SpeechPulse level={SPEECH_FLOOR} listening testID="pulse" />);
    expect(screen.getByTestId('pulse')).toBeTruthy();
  });

  /**
   * The level is sampled, not cleared, when the mic closes — without the
   * `listening` gate the last loud frame would leave the halo lit for the
   * whole of the agent's reply.
   */
  it('goes dark when the mic closes, even on a stale loud level', async () => {
    await render(
      <SpeechPulse level={0.9} listening={false} testID="pulse" />,
    );
    expect(screen.queryByTestId('pulse')).toBeNull();
  });

  it('drops when speech stops mid-turn', async () => {
    const view = await render(
      <SpeechPulse level={0.6} listening testID="pulse" />,
    );
    expect(screen.getByTestId('pulse')).toBeTruthy();

    await view.rerender(<SpeechPulse level={0.02} listening testID="pulse" />);
    expect(screen.queryByTestId('pulse')).toBeNull();
  });

  /**
   * Green, not gold: gold already means "this is the live element", so a gold
   * halo on a gold circle would carry no new information.
   */
  it('draws in the ok color, not the gold signal color', async () => {
    await render(<SpeechPulse level={0.6} listening testID="pulse" />);
    const style = flatten(screen.getByTestId('pulse').props.style);
    expect(style.borderColor).toBe(darkTheme.colors.ok);
    expect(style.borderColor).not.toBe(darkTheme.colors.gold);
  });

  /** It sits outside the parent's edge so it never covers the content. */
  it('insets outside its parent on every side', async () => {
    await render(<SpeechPulse level={0.6} listening inset={6} testID="pulse" />);
    const style = flatten(screen.getByTestId('pulse').props.style);
    expect(style.position).toBe('absolute');
    expect(style.top).toBe(-6);
    expect(style.bottom).toBe(-6);
    expect(style.left).toBe(-6);
    expect(style.right).toBe(-6);
  });

  /** A halo over a button must not eat the press that opens the mic. */
  it('does not intercept touches', async () => {
    await render(<SpeechPulse level={0.6} listening testID="pulse" />);
    expect(screen.getByTestId('pulse').props.pointerEvents).toBe('none');
  });

  it('names itself for screen readers', async () => {
    await render(<SpeechPulse level={0.6} listening testID="pulse" />);
    expect(screen.getByLabelText('Hearing you')).toBeTruthy();
  });
});

/**
 * In a noisy room the VAD raises its speech threshold, and the halo has to
 * move with it — a fixed visual floor would glow at room tone the VAD is
 * correctly ignoring, which is the opposite of the reassurance it exists for.
 */
describe('SpeechPulse against a learned floor', () => {
  it('stays dark at a level below the floor it was given', async () => {
    await render(
      <SpeechPulse level={0.35} floor={0.47} listening testID="pulse" />,
    );
    expect(screen.queryByTestId('pulse')).toBeNull();
  });

  it('lights once the level clears that floor', async () => {
    await render(
      <SpeechPulse level={0.8} floor={0.47} listening testID="pulse" />,
    );
    expect(screen.getByTestId('pulse')).toBeTruthy();
  });

  it('falls back to the quiet-room floor when none is given', async () => {
    await render(<SpeechPulse level={SPEECH_FLOOR} listening testID="pulse" />);
    expect(screen.getByTestId('pulse')).toBeTruthy();
  });
});
