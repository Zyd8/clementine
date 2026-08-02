import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import type { Attachment } from '@/types/attachments';

/**
 * Staging area for files and images picked in the composer.
 *
 * Picker only — nothing here sends an attachment anywhere. `POST /v1/runs`
 * only documents a plain-text `input` field (see ARCHITECTURE.md); until an
 * actual upload contract exists, wiring this into `send()` would mean
 * silently dropping whatever the user attached. This hook's whole job is to
 * make picking, previewing, and removing attachments real and usable on
 * their own, without pretending the rest of the pipeline exists yet.
 */

let counter = 0;
const nextId = () => `attachment_${(counter += 1)}`;

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;

    setAttachments((current) => [
      ...current,
      ...result.assets.map(
        (asset): Attachment => ({
          id: nextId(),
          uri: asset.uri,
          // Some sources hand back no filename at all (e.g. certain camera
          // roll items) — a blank row label reads as broken, not empty.
          name: asset.fileName || 'Photo',
          ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
          ...(asset.fileSize === undefined ? {} : { size: asset.fileSize }),
          kind: 'image',
        }),
      ),
    ]);
  }, []);

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true });
    if (result.canceled) return;

    setAttachments((current) => [
      ...current,
      ...result.assets.map(
        (asset): Attachment => ({
          id: nextId(),
          uri: asset.uri,
          name: asset.name,
          ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
          ...(asset.size === undefined ? {} : { size: asset.size }),
          kind: 'file',
        }),
      ),
    ]);
  }, []);

  const remove = useCallback((id: string) => {
    setAttachments((current) => current.filter((a) => a.id !== id));
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
  }, []);

  return { attachments, pickImage, pickFile, remove, clear };
}
