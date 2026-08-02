import { File } from 'expo-file-system';

import type { Attachment } from '@/types/attachments';

/**
 * The experimental fallback for a channel with no confirmed upload path (see
 * `useAttachments.ts`): embed the attachment's own bytes as a base64 data URI
 * directly in the text sent to the agent. This is a real attempt, not a fake
 * one — but it is a genuine gamble on whether the connected agent's model
 * treats an inline data URI as an actual image/file or just a wall of text.
 * Nothing here can promise the agent understands it.
 */

/**
 * Base64 inflates a file to about 4/3 its raw size, and this goes straight
 * into the agent's text input with no chunking — an unbounded attachment
 * risks silently blowing past the request or context limit. Kept well under
 * that, so a refusal here is a clear, attributable error instead of an
 * opaque failure downstream.
 */
export const MAX_ATTACHMENT_BYTES = 512 * 1024;

export class AttachmentTooLargeError extends Error {
  readonly attachment: Attachment;

  constructor(attachment: Attachment) {
    super(
      `"${attachment.name}" is too large to attach (limit ${Math.round(MAX_ATTACHMENT_BYTES / 1024)}KB).`,
    );
    this.name = 'AttachmentTooLargeError';
    this.attachment = attachment;
  }
}

const DEFAULT_MIME_TYPE: Record<Attachment['kind'], string> = {
  image: 'image/jpeg',
  file: 'application/octet-stream',
};

/**
 * @throws {AttachmentTooLargeError} if the attachment is over
 *   `MAX_ATTACHMENT_BYTES`.
 */
export async function encodeAttachmentForPrompt(attachment: Attachment): Promise<string> {
  const file = new File(attachment.uri);
  const size = attachment.size ?? file.size ?? 0;
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError(attachment);
  }

  const mimeType = attachment.mimeType ?? DEFAULT_MIME_TYPE[attachment.kind];
  const base64 = await file.base64();
  const dataUri = `data:${mimeType};base64,${base64}`;

  // Images as a markdown image tag: the one format with any real chance of
  // being recognized as an image without a confirmed contract, since it is
  // the standard way an inline image is embedded in text almost everywhere.
  if (attachment.kind === 'image') {
    return `![${attachment.name}](${dataUri})`;
  }

  // Anything else as an explicit, clearly delimited block — there is no
  // equivalent inline convention for an arbitrary file, so the framing has
  // to say plainly what it is.
  return [
    `[ATTACHED FILE: ${attachment.name} — ${mimeType}]`,
    dataUri,
    `[END ATTACHED FILE: ${attachment.name}]`,
  ].join('\n');
}
