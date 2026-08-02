import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';

import { ProviderPicker } from './ProviderPicker';

const OPTIONS = [
  { value: 'device', label: 'On-device voice', keyless: true },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'openai', label: 'OpenAI' },
] as const;

const setup = (
  overrides: Partial<React.ComponentProps<typeof ProviderPicker<string>>> = {},
) =>
  render(
    <ProviderPicker
      options={OPTIONS}
      selected="elevenlabs"
      onSelect={jest.fn()}
      keyLabel="TTS API Key"
      keys={{}}
      onKeyChange={jest.fn()}
      testIDPrefix="tts"
      {...overrides}
    />,
  );

describe('ProviderPicker', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('lists every provider', async () => {
    await setup();
    for (const option of OPTIONS) {
      expect(screen.getByText(option.label)).toBeTruthy();
    }
  });

  /** The key belongs to one provider, so it opens inside that provider's row. */
  it('reveals the key field under the selected provider only', async () => {
    await setup({ selected: 'elevenlabs' });
    expect(screen.getByTestId('tts-elevenlabs-key')).toBeTruthy();
    expect(screen.queryByTestId('tts-openai-key')).toBeNull();
  });

  it('opens nothing for a keyless provider', async () => {
    await setup({ selected: 'device' });
    expect(screen.queryByTestId('tts-device-key')).toBeNull();
    expect(screen.queryByLabelText('TTS API Key')).toBeNull();
  });

  it('reports the picked provider', async () => {
    const onSelect = jest.fn();
    await setup({ onSelect });
    fireEvent.press(screen.getByTestId('tts-openai'));
    expect(onSelect).toHaveBeenCalledWith('openai');
  });

  it('reports the typed key against the provider it belongs to', async () => {
    const onKeyChange = jest.fn();
    await setup({ onKeyChange });
    fireEvent.changeText(screen.getByLabelText('TTS API Key'), 'el_key');
    expect(onKeyChange).toHaveBeenCalledWith('elevenlabs', 'el_key');
  });

  /**
   * Each provider keeps its own key. Switching used to carry the previous
   * provider's key across, so the new one was called with a credential it
   * would reject — and going back had lost the original.
   */
  it('shows each provider its own stored key', async () => {
    await setup({
      selected: 'elevenlabs',
      keys: { elevenlabs: 'el_key', openai: 'oa_key' },
    });
    expect(screen.getByLabelText('TTS API Key').props.value).toBe('el_key');
  });

  it('shows the other provider’s key once it is selected', async () => {
    await setup({
      selected: 'openai',
      keys: { elevenlabs: 'el_key', openai: 'oa_key' },
    });
    expect(screen.getByLabelText('TTS API Key').props.value).toBe('oa_key');
  });

  /** Paste in, no copy out — masking is what suppresses copy on both platforms. */
  it('masks the key without blocking paste', async () => {
    await setup();
    const input = screen.getByLabelText('TTS API Key');
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.contextMenuHidden).toBeFalsy();
  });

  it('tells screen readers which row is selected and open', async () => {
    await setup({ selected: 'elevenlabs' });
    const state = screen.getByTestId('tts-elevenlabs').props.accessibilityState;
    expect(state.selected).toBe(true);
    expect(state.expanded).toBe(true);

    const keyless = screen.getByTestId('tts-device').props.accessibilityState;
    expect(keyless.selected).toBe(false);
  });
});
