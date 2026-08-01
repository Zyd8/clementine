import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { darkTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import { Field } from './Field';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Field', () => {
  // Gold Focus is dark-first; pin the scheme so token assertions are exact.
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('renders its label', async () => {
    await render(<Field label="SERVER URL" value="" onChangeText={jest.fn()} />);
    expect(screen.getByText('SERVER URL')).toBeTruthy();
  });

  it('reports typed text', async () => {
    const onChangeText = jest.fn();
    await render(<Field label="SERVER URL" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('SERVER URL'), 'http://host:8642');
    expect(onChangeText).toHaveBeenCalledWith('http://host:8642');
  });

  it('masks a secret field so the key is not shoulder-surfable', async () => {
    await render(<Field label="API KEY" value="" onChangeText={jest.fn()} secret />);
    expect(screen.getByLabelText('API KEY').props.secureTextEntry).toBe(true);
  });

  it('does not mask a normal field', async () => {
    await render(<Field label="SERVER URL" value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('SERVER URL').props.secureTextEntry).toBeFalsy();
  });

  it('never autocorrects or autocapitalizes a URL or key', async () => {
    await render(<Field label="SERVER URL" value="" onChangeText={jest.fn()} />);
    const input = screen.getByLabelText('SERVER URL');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
  });

  it('wears a steel border when idle', async () => {
    await render(<Field label="SERVER URL" value="" onChangeText={jest.fn()} />);
    expect(flatten(screen.getByLabelText('SERVER URL').props.style).borderColor).toBe(
      darkTheme.colors.steel,
    );
  });

  it('wears the error color when invalid', async () => {
    await render(
      <Field label="SERVER URL" value="" onChangeText={jest.fn()} invalid />,
    );
    expect(flatten(screen.getByLabelText('SERVER URL').props.style).borderColor).toBe(
      darkTheme.colors.err,
    );
  });

  it('announces invalidity to assistive tech, not just by color', async () => {
    await render(
      <Field label="SERVER URL" value="" onChangeText={jest.fn()} invalid />,
    );
    expect(screen.getByLabelText('SERVER URL').props.accessibilityHint).toMatch(
      /invalid/i,
    );
  });

  it('adds no hint when the field is fine', async () => {
    await render(<Field label="SERVER URL" value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('SERVER URL').props.accessibilityHint).toBeUndefined();
  });

  it('shows placeholder guidance', async () => {
    await render(
      <Field
        label="SERVER URL"
        value=""
        onChangeText={jest.fn()}
        placeholder="http://100.106.162.39:8642"
      />,
    );
    expect(screen.getByPlaceholderText('http://100.106.162.39:8642')).toBeTruthy();
  });
});
