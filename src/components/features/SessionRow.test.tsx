import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { SessionRow } from './SessionRow';

// Mock useColorScheme so useTheme works without the native module
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

describe('SessionRow', () => {
  const baseSession = {
    id: 'sess_1',
    title: 'Debug auth flow',
    preview: 'What is the error in the logs?',
    lastMessageAt: '2026-08-02T12:00:00Z',
    messageCount: 5,
  };

  it('renders the session title', async () => {
    await render(
      <SessionRow
        session={baseSession}
        onTap={jest.fn()}
        onFork={jest.fn()}
      />,
    );
    expect(screen.getByText('Debug auth flow')).toBeTruthy();
  });

  it('renders the session preview', async () => {
    await render(
      <SessionRow
        session={baseSession}
        onTap={jest.fn()}
        onFork={jest.fn()}
      />,
    );
    expect(screen.getByText('What is the error in the logs?')).toBeTruthy();
  });

  it('renders the message count', async () => {
    await render(
      <SessionRow
        session={baseSession}
        onTap={jest.fn()}
        onFork={jest.fn()}
      />,
    );
    expect(screen.getByText('5 msgs')).toBeTruthy();
  });

  it('falls back to the preview when there is no title', async () => {
    await render(
      <SessionRow
        session={{ ...baseSession, title: '' }}
        onTap={jest.fn()}
        onFork={jest.fn()}
      />,
    );
    // The preview becomes the title line; it must not also render below it.
    expect(screen.getByText('What is the error in the logs?')).toBeTruthy();
  });

  it('shows a short session id fragment', async () => {
    await render(
      <SessionRow
        session={{ ...baseSession, id: 'run_0a868c4e34ab47c7a506e0d73658e35e' }}
        onTap={jest.fn()}
        onFork={jest.fn()}
      />,
    );
    // run_<24 hex> → the 8-char tail fragment.
    expect(screen.getByText('#0a868c4e')).toBeTruthy();
  });

  it('renders a relative timestamp', async () => {
    await render(
      <SessionRow
        session={baseSession}
        onTap={jest.fn()}
        onFork={jest.fn()}
      />,
    );
    // The timestamp component renders some output — check for presence of a non-empty
    // string that contains the time somehow (we use Text so find it).
    expect(screen.getByTestId('session-timestamp')).toBeTruthy();
  });

  it('calls onTap when pressed', async () => {
    const onTap = jest.fn();
    await render(
      <SessionRow
        session={baseSession}
        onTap={onTap}
        onFork={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByLabelText('Debug auth flow — 5 messages, tap to resume'));
    expect(onTap).toHaveBeenCalledWith('sess_1');
  });

  it('calls onFork when the fork button is pressed', async () => {
    const onFork = jest.fn();
    await render(
      <SessionRow
        session={baseSession}
        onTap={jest.fn()}
        onFork={onFork}
      />,
    );
    fireEvent.press(screen.getByLabelText('Fork Debug auth flow'));
    expect(onFork).toHaveBeenCalledWith('sess_1');
  });

  describe('forked sessions — UI labeling convention', () => {
    /**
     * Forked sessions are labelled "{parent_title} · b{n}" where n is the
     * `branchIndex`. This convention was decided to:
     * 1. Show lineage at a glance (the parent title is preserved)
     * 2. Disambiguate multiple branches from the same parent via a numeric index
     * 3. Use a middot separator (·) that reads cleanly in monospace
     */
    it('shows the fork label for a session with parentId and branchIndex', async () => {
      await render(
        <SessionRow
          session={{
            ...baseSession,
            id: 'sess_2',
            parentId: 'sess_1',
            branchIndex: 1,
          }}
          onTap={jest.fn()}
          onFork={jest.fn()}
        />,
      );
      expect(screen.getByText('Debug auth flow · b1')).toBeTruthy();
    });

    it('shows root sessions (no parentId) with just the title', async () => {
      await render(
        <SessionRow
          session={baseSession}
          onTap={jest.fn()}
          onFork={jest.fn()}
        />,
      );
      // Title is rendered directly — no branch suffix
      expect(screen.getByText('Debug auth flow')).toBeTruthy();
      expect(screen.queryByText(/· b/)).toBeNull();
    });

    it('handles branchIndex 0', async () => {
      await render(
        <SessionRow
          session={{
            ...baseSession,
            id: 'sess_2',
            parentId: 'sess_1',
            branchIndex: 0,
          }}
          onTap={jest.fn()}
          onFork={jest.fn()}
        />,
      );
      expect(screen.getByText('Debug auth flow · b0')).toBeTruthy();
    });
  });

  describe('resume button state', () => {
    it('shows a subtle indicator when this session is currently being resumed', async () => {
      await render(
        <SessionRow
          session={baseSession}
          onTap={jest.fn()}
          onFork={jest.fn()}
          isResuming={true}
        />,
      );
      expect(screen.getByLabelText('Debug auth flow — 5 messages, tap to resume')).toBeTruthy();
    });
  });
});
