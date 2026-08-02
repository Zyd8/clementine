import { act, renderHook } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { useAttachments } from './useAttachments';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

const mockedGetDocument = DocumentPicker.getDocumentAsync as jest.MockedFunction<
  typeof DocumentPicker.getDocumentAsync
>;
const mockedRequestMediaPermission =
  ImagePicker.requestMediaLibraryPermissionsAsync as jest.MockedFunction<
    typeof ImagePicker.requestMediaLibraryPermissionsAsync
  >;
const mockedLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedRequestMediaPermission.mockResolvedValue({
    granted: true,
    status: 'granted' as never,
    expires: 'never',
    canAskAgain: true,
  });
});

describe('useAttachments', () => {
  it('starts empty', async () => {
    const { result } = await renderHook(() => useAttachments());
    expect(result.current.attachments).toEqual([]);
  });

  describe('pickImage', () => {
    it('adds the picked image', async () => {
      mockedLaunchLibrary.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' }],
      } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickImage();
      });

      expect(result.current.attachments).toEqual([
        expect.objectContaining({
          uri: 'file:///photo.jpg',
          name: 'photo.jpg',
          kind: 'image',
        }),
      ]);
    });

    /** No filename comes back from some pickers/sources — must not crash the row. */
    it('falls back to a generic name when the picker gives none', async () => {
      mockedLaunchLibrary.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///photo.jpg', fileName: null, mimeType: 'image/jpeg' }],
      } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickImage();
      });

      expect(result.current.attachments[0]?.name.length).toBeGreaterThan(0);
    });

    it('adds nothing when the permission is refused', async () => {
      mockedRequestMediaPermission.mockResolvedValue({
        granted: false,
        status: 'denied' as never,
        expires: 'never',
        canAskAgain: true,
      });

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickImage();
      });

      expect(result.current.attachments).toEqual([]);
      expect(mockedLaunchLibrary).not.toHaveBeenCalled();
    });

    it('adds nothing when the picker is cancelled', async () => {
      mockedLaunchLibrary.mockResolvedValue({ canceled: true, assets: null } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickImage();
      });

      expect(result.current.attachments).toEqual([]);
    });
  });

  describe('pickFile', () => {
    it('adds the picked file', async () => {
      mockedGetDocument.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///report.pdf',
            name: 'report.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            lastModified: 0,
          },
        ],
      } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickFile();
      });

      expect(result.current.attachments).toEqual([
        expect.objectContaining({
          uri: 'file:///report.pdf',
          name: 'report.pdf',
          kind: 'file',
          size: 1024,
        }),
      ]);
    });

    it('supports picking more than one file at once', async () => {
      mockedGetDocument.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///a.pdf', name: 'a.pdf', lastModified: 0 },
          { uri: 'file:///b.pdf', name: 'b.pdf', lastModified: 0 },
        ],
      } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickFile();
      });

      expect(result.current.attachments).toHaveLength(2);
    });

    it('adds nothing when the picker is cancelled', async () => {
      mockedGetDocument.mockResolvedValue({ canceled: true, assets: null } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickFile();
      });

      expect(result.current.attachments).toEqual([]);
    });
  });

  describe('remove / clear', () => {
    it('removes one attachment by id, leaving the rest', async () => {
      mockedGetDocument.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///a.pdf', name: 'a.pdf', lastModified: 0 },
          { uri: 'file:///b.pdf', name: 'b.pdf', lastModified: 0 },
        ],
      } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickFile();
      });
      const [first] = result.current.attachments;

      await act(async () => {
        result.current.remove(first!.id);
      });

      expect(result.current.attachments).toHaveLength(1);
      expect(result.current.attachments[0]?.name).toBe('b.pdf');
    });

    it('clears everything', async () => {
      mockedGetDocument.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///a.pdf', name: 'a.pdf', lastModified: 0 }],
      } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickFile();
      });

      await act(async () => {
        result.current.clear();
      });

      expect(result.current.attachments).toEqual([]);
    });

    /** Two picks must not collide on id, or removing one could remove both. */
    it('gives every attachment a unique id, across separate picks', async () => {
      mockedGetDocument.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///a.pdf', name: 'a.pdf', lastModified: 0 }],
      } as never);

      const { result } = await renderHook(() => useAttachments());
      await act(async () => {
        await result.current.pickFile();
      });
      await act(async () => {
        await result.current.pickFile();
      });

      const [a, b] = result.current.attachments;
      expect(a?.id).not.toBe(b?.id);
    });
  });
});
