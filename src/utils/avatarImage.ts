import { Directory, File, Paths } from 'expo-file-system';

/** App-private directory under `Paths.document` where avatar images live. */
const AVATARS_DIR = 'avatars';

/**
 * Copies a picked image (which lives in a temporary cache location) into the
 * app's persistent document directory, so the avatar survives restarts and
 * cache eviction. Returns the stable `file://` URI to store on the profile.
 */
export async function persistAvatarImage(sourceUri: string, profileId: string): Promise<string> {
  const avatars = new Directory(Paths.document, AVATARS_DIR);
  if (!avatars.exists) {
    avatars.create({ intermediates: true });
  }

  // Keep the picked file's extension so the image decodes with the right
  // format; the profile id makes the filename stable and unique.
  const extension = new File(sourceUri).extension || '.jpg';
  const dest = new File(avatars, `${profileId}${extension}`);
  if (dest.exists) {
    dest.delete();
  }

  await new File(sourceUri).copy(dest);
  return dest.uri;
}
