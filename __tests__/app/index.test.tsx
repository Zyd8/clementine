import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Alert, FlatList } from 'react-native';

import { darkTheme } from '@/constants/theme';
import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore } from '@/stores/settings';
import type { Attachment } from '@/types/attachments';

import ChatScreen from '../../app/(tabs)/index';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

// The lift value itself is covered by useKeyboardOverlap's own tests; here we
// only care that the composer actually consumes it.
jest.mock('@/hooks/useKeyboardOverlap', () => ({
  useKeyboardOverlap: () => 268,
}));

jest.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    send: jest.fn(),
    stop: jest.fn(),
    isStreaming: false,
  }),
}));

const mockPickImage = jest.fn();
const mockPickFile = jest.fn();
const mockRemoveAttachment = jest.fn();
let mockAttachments: Attachment[] = [];
jest.mock('@/hooks/useAttachments', () => ({
  useAttachments: () => ({
    attachments: mockAttachments,
    pickImage: mockPickImage,
    pickFile: mockPickFile,
    remove: mockRemoveAttachment,
    clear: jest.fn(),
  }),
}));

const STABLE_FEED: never[] = [];
let mockUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

jest.mock('@/stores/chat', () => {
  const zustand = jest.requireActual('zustand');
  return {
    useChatStore: zustand.create(() => ({
      feed: () => STABLE_FEED,
      activeRun: () => null,
      reset: () => {},
      appendUserMessage: () => {},
      applyEvent: () => {},
      byProfile: {},
    })),
    profileKey: () => '\u0000default',
  };
});

jest.mock('@/stores/usage', () => {
  const zustand = jest.requireActual('zustand');
  return {
    useUsageStore: zustand.create(() => ({
      total: () => mockUsage,
      addUsage: () => {},
      reset: () => {},
      byProfile: {},
    })),
  };
});

describe('ChatScreen — header', () => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

  beforeEach(() => {
    mockUsage = { inputTokens: 40_000, outputTokens: 26_809, totalTokens: 66_809 };
    useSettingsStore.setState({ theme: 'dark', hydrated: true });
    useConnectionStore.setState({
      connection: {
        name: 'Hermes Laptop',
        baseUrl: 'http://100.106.162.39:8642',
        apiKey: 'test-key',
        connectedAt: 1,
      },
      hydrated: true,
    });
  });

  it('shows the endpoint name in full rather than clipping it to fit the nav', async () => {
    await render(<ChatScreen />);
    expect(screen.getByText('Hermes Laptop')).toBeTruthy();
  });

  /** DESIGN.md: usage badge is a pill — raised bg, steel border, muted text. */
  it('renders the token count as a pill badge, per the design tokens', async () => {
    await render(<ChatScreen />);
    const badge = screen.getByTestId('usage-badge');
    const style = flatten(badge.props.style);
    expect(style.backgroundColor).toBe(darkTheme.colors.canvasRaised);
    expect(style.borderColor).toBe(darkTheme.colors.steel);
    // The design abbreviates and says what the number means.
    expect(screen.getByText('66.8K tok used today')).toBeTruthy();
  });

  it('shows the active profile as a chip that opens the switcher', async () => {
    await render(<ChatScreen />);
    expect(screen.getByLabelText('Switch profile')).toBeTruthy();
    expect(screen.getByText('default')).toBeTruthy();
  });

  /**
   * Phase 10's audit flagged this: the label looked like a readout but
   * navigated to setup. It is now purely a readout — reconfiguring lives on
   * the settings tab.
   */
  it('keeps the token readout inert', async () => {
    const { router } = jest.requireMock('expo-router') as {
      router: { push: jest.Mock };
    };
    router.push.mockClear();

    await render(<ChatScreen />);
    fireEvent.press(screen.getByTestId('usage-badge'));
    expect(router.push).not.toHaveBeenCalled();
  });

  /** The tab bar owns navigation now — the header must not duplicate it. */
  it('no longer carries its own nav row', async () => {
    await render(<ChatScreen />);
    for (const label of ['SESSIONS', 'VOICE', 'SETUP']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });
});

describe('ChatScreen — composer', () => {
  beforeEach(() => {
    mockAttachments = [];
    mockPickImage.mockClear();
    mockPickFile.mockClear();
    mockRemoveAttachment.mockClear();
    useSettingsStore.setState({ theme: 'dark', hydrated: true });
    useConnectionStore.setState({
      connection: {
        name: 'Hermes Laptop',
        baseUrl: 'http://100.106.162.39:8642',
        apiKey: 'test-key',
        connectedAt: 1,
      },
      hydrated: true,
    });
  });

  /**
   * The handoff spec's composer is "text input + send button + round mic
   * button". Phase 7 built and tested MicButton but never mounted it, so
   * tap-to-talk was unreachable from the app.
   */
  it('mounts the mic button beside the send button', async () => {
    await render(<ChatScreen />);
    expect(screen.getByLabelText('Tap to talk')).toBeTruthy();
  });

  const flatten = (style: unknown): Record<string, unknown> =>
    Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

  it('lifts the composer by however much the keyboard covers it', async () => {
    await render(<ChatScreen />);
    const composer = screen.getByLabelText('Message').parent;
    expect(flatten(composer?.props.style).marginBottom).toBe(268);
  });

  /**
   * The lift comes out of the list's height. A list that grows but cannot
   * shrink overflows the column instead, pushing the composer further under
   * the keyboard — which is exactly what happened on device.
   */
  it('lets the feed shrink so the lift has somewhere to come from', async () => {
    await render(<ChatScreen />);
    // The FlatList renders as a scroll view; find it by its testID-free role.
    const list = screen.getByTestId('chat-feed');
    expect(flatten(list.props.style).flex).toBe(1);
  });

  /**
   * A long reply grows past the bottom of the screen as it streams — without
   * this, reading it means scrolling down by hand, repeatedly, while it is
   * still arriving.
   */
  /**
   * `onContentSizeChange`, not a `feed`-keyed effect: an effect fires the
   * instant state updates, before FlatList has measured the newly grown
   * content, so `scrollToEnd` computed against a stale height and landed
   * short — most visible on a bubble still growing sentence by sentence.
   * `onContentSizeChange` fires after real layout, so it's simulated
   * directly here rather than via a state change RNTL's renderer never
   * actually lays out.
   */
  it('scrolls to the end when the feed content grows', async () => {
    const scrollSpy = jest
      .spyOn(FlatList.prototype, 'scrollToEnd')
      .mockImplementation(() => undefined);

    await render(<ChatScreen />);
    const list = screen.getByTestId('chat-feed');
    scrollSpy.mockClear(); // ignore whatever the initial mount triggered

    await act(async () => {
      list.props.onContentSizeChange(320, 900);
    });

    expect(scrollSpy).toHaveBeenCalled();

    scrollSpy.mockRestore();
  });

  /** Landing at the bottom on open must not be seen sliding into place. */
  /**
   * A streaming reply fires this many times a second (once per token).
   * Animated scrolls that frequent interrupt each other before any one of
   * them finishes, so the visible position perpetually lagged behind the
   * true bottom — reported as the reply looking cut off on screen, while a
   * tool message (which fires this rarely) reached the bottom fully because
   * its one animated scroll had time to complete. Always instant avoids the
   * interruption entirely, on the first paint and on every one after it.
   */
  it('always jumps to the bottom instantly, never animated', async () => {
    const scrollSpy = jest
      .spyOn(FlatList.prototype, 'scrollToEnd')
      .mockImplementation(() => undefined);

    await render(<ChatScreen />);
    const list = screen.getByTestId('chat-feed');
    scrollSpy.mockClear();

    for (const height of [900, 950, 1000]) {
      await act(async () => {
        list.props.onContentSizeChange(320, height);
      });
      expect(scrollSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ animated: false }),
      );
    }

    scrollSpy.mockRestore();
  });

  describe('attachments', () => {
    it('offers a photo or a file when tapped', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

      await render(<ChatScreen />);
      fireEvent.press(screen.getByLabelText('Attach a file or photo'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Attach',
        undefined,
        expect.arrayContaining([
          expect.objectContaining({ text: 'Photo' }),
          expect.objectContaining({ text: 'File' }),
        ]),
      );

      alertSpy.mockRestore();
    });

    it('picking Photo calls the image picker', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.find((b) => b.text === 'Photo')?.onPress?.();
      });

      await render(<ChatScreen />);
      fireEvent.press(screen.getByLabelText('Attach a file or photo'));

      expect(mockPickImage).toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it('picking File calls the document picker', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.find((b) => b.text === 'File')?.onPress?.();
      });

      await render(<ChatScreen />);
      fireEvent.press(screen.getByLabelText('Attach a file or photo'));

      expect(mockPickFile).toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it('shows nothing extra when there is nothing attached', async () => {
      await render(<ChatScreen />);
      expect(
        screen.queryByText('Attached here, not sent to the agent yet.'),
      ).toBeNull();
    });

    it('previews a staged attachment by name', async () => {
      mockAttachments = [
        { id: 'a1', uri: 'file:///photo.jpg', name: 'photo.jpg', kind: 'image' },
      ];

      await render(<ChatScreen />);

      expect(screen.getByTestId('attachment-a1')).toBeTruthy();
      expect(screen.getByText(/photo\.jpg/)).toBeTruthy();
    });

    /**
     * Honest, not hidden: there is no confirmed way for this to actually
     * reach the agent yet (see useAttachments.ts), so the row stays visible
     * and says so rather than disappearing into a message that doesn't
     * carry it.
     */
    it('is explicit that a staged attachment is not sent yet', async () => {
      mockAttachments = [
        { id: 'a1', uri: 'file:///photo.jpg', name: 'photo.jpg', kind: 'image' },
      ];

      await render(<ChatScreen />);

      expect(
        screen.getByText('Attached here, not sent to the agent yet.'),
      ).toBeTruthy();
    });

    it('removes an attachment on tap', async () => {
      mockAttachments = [
        { id: 'a1', uri: 'file:///photo.jpg', name: 'photo.jpg', kind: 'image' },
      ];

      await render(<ChatScreen />);
      fireEvent.press(screen.getByLabelText('Remove photo.jpg'));

      expect(mockRemoveAttachment).toHaveBeenCalledWith('a1');
    });
  });
});
