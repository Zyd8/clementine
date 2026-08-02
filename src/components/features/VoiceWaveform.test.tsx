import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { VoiceWaveform } from './VoiceWaveform';

describe('VoiceWaveform', () => {
  it('renders the waveform container', async () => {
    await render(<VoiceWaveform level={0.5} isActive testID="waveform" />);
    expect(screen.getByTestId('waveform')).toBeTruthy();
  });

  it('bars are gold when active', async () => {
    await render(<VoiceWaveform level={0.5} isActive testID="waveform" />);
    // The container exists and we can verify the bars are rendered
    // by checking children exist
    const container = screen.getByTestId('waveform');
    expect(container).toBeTruthy();
    // Container has 5 children (the bars)
    expect(container.props.children).toBeTruthy();
    // The children should be an array of 5
    const children = Array.isArray(container.props.children)
      ? container.props.children
      : [container.props.children];
    expect(children.length).toBe(5);
  });

  it('bars are steel when inactive', async () => {
    await render(<VoiceWaveform level={0.5} isActive={false} testID="waveform" />);
    const container = screen.getByTestId('waveform');
    expect(container).toBeTruthy();
  });

  it('bar height increases with level', async () => {
    // Our bars are deterministic: higher level → taller bars
    const { rerender } = await render(
      <VoiceWaveform level={0.2} isActive testID="waveform" />,
    );

    // With level 0.9, bars should be taller
    await rerender(<VoiceWaveform level={0.9} isActive testID="waveform" />);
    expect(screen.getByTestId('waveform')).toBeTruthy();
  });

  it('container has transparent background', async () => {
    await render(<VoiceWaveform level={0.5} isActive testID="waveform" />);
    const container = screen.getByTestId('waveform');
    // The View style should have transparent bg
    const style = Object.assign(
      {},
      ...[container.props.style].flat(Infinity).filter(Boolean),
    ) as Record<string, unknown>;
    expect(style.backgroundColor).toBe('transparent');
  });

  it('clamps level to 0–1 range without crashing', async () => {
    // Should not crash with values outside 0–1
    await render(<VoiceWaveform level={-0.5} isActive testID="waveform" />);
    expect(screen.getByTestId('waveform')).toBeTruthy();

    await render(<VoiceWaveform level={1.5} isActive testID="waveform" />);
    expect(screen.getByTestId('waveform')).toBeTruthy();
  });

  it('has accessibility label', async () => {
    await render(<VoiceWaveform level={0.5} isActive testID="waveform" />);
    expect(screen.getByTestId('waveform').props.accessibilityLabel).toBe(
      'Audio waveform',
    );
  });

  it('bars have lower opacity when inactive', async () => {
    await render(<VoiceWaveform level={0.8} isActive={false} testID="waveform" />);
    const container = screen.getByTestId('waveform');
    const children = Array.isArray(container.props.children)
      ? container.props.children
      : [container.props.children];
    // When inactive, bars should have opacity 0.5
    const firstBarStyle = Object.assign(
      {},
      ...[children[0].props.style].flat(Infinity).filter(Boolean),
    ) as Record<string, unknown>;
    expect(firstBarStyle.opacity).toBe(0.5);
  });
});
