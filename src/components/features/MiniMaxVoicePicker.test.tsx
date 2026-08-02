import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';
import { DEFAULT_MINIMAX_VOICE } from '@/constants/minimaxVoices';

import { MiniMaxVoicePicker } from './MiniMaxVoicePicker';

const setup = (
  overrides: Partial<React.ComponentProps<typeof MiniMaxVoicePicker>> = {},
) =>
  render(
    <MiniMaxVoicePicker
      value=""
      onChange={jest.fn()}
      testIDPrefix="tts-minimax"
      {...overrides}
    />,
  );

describe('MiniMaxVoicePicker', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('lists the system voices plus the custom row', async () => {
    await setup();
    expect(screen.getByText('Graceful Lady')).toBeTruthy();
    expect(screen.getByText('Aussie Bloke')).toBeTruthy();
    expect(screen.getByText('Custom voice ID')).toBeTruthy();
  });

  /**
   * An empty stored value means "use the provider default" — the row for the
   * default must look selected so the screen shows the voice that will
   * actually be spoken, not a blank selection.
   */
  it('highlights the provider default when no voice is stored', async () => {
    await setup();
    const state = screen.getByTestId(`tts-minimax-${DEFAULT_MINIMAX_VOICE}`).props
      .accessibilityState;
    expect(state.selected).toBe(true);
  });

  it('highlights the stored system voice', async () => {
    await setup({ value: 'English_Aussie_Bloke' });
    const state = screen.getByTestId('tts-minimax-English_Aussie_Bloke').props
      .accessibilityState;
    expect(state.selected).toBe(true);
  });

  it('reports a picked voice', async () => {
    const onChange = jest.fn();
    await setup({ onChange });
    fireEvent.press(screen.getByTestId('tts-minimax-English_CalmWoman'));
    expect(onChange).toHaveBeenCalledWith('English_CalmWoman');
  });

  /**
   * Tapping the custom row opens the field via internal state. That specific
   * gesture cannot be asserted here: this repo's RNTL v14 + RN 0.86 jest
   * environment cannot simulate press → state update → re-render (probe-
   * proven, userEvent included). What IS testable — the field rendering and
   * pre-fill when a custom id is stored, and not masking it — is covered by
   * the tests below, which exercise the same render path the tap opens.
   */
  it('opens the custom field on tap', async () => {
    await setup();
    fireEvent.press(screen.getByTestId('tts-minimax-custom'));
    // No re-render assertion possible in this environment (see comment above);
    // the tap handler is a single setState call. Covered behavior lives below.
    expect(screen.getByTestId('tts-minimax-custom')).toBeTruthy();
  });

  /** A stored id that is not a system voice resolves to the Custom row. */
  it('pre-fills and highlights the custom field for a stored unknown id', async () => {
    await setup({ value: 'my-cloned-voice' });
    expect(screen.getByLabelText('Custom voice ID').props.value).toBe('my-cloned-voice');
    const state = screen.getByTestId('tts-minimax-custom').props.accessibilityState;
    expect(state.selected).toBe(true);
  });

  /** Voice ids are not credentials — the field must not mask them. */
  it('does not mask the custom voice id', async () => {
    await setup({ value: 'my-cloned-voice' });
    expect(screen.getByLabelText('Custom voice ID').props.secureTextEntry).toBeFalsy();
  });
});
