import {
  AttachmentTooLargeError,
  encodeAttachmentForPrompt,
  MAX_ATTACHMENT_BYTES,
} from './attachmentEncoding';

/**
 * There is no confirmed upload path (see useAttachments.ts) — this is the
 * experimental fallback: embed the file's own bytes as a data URI directly
 * in the text sent to the agent. Real, but a genuine gamble on whether the
 * model treats it as an actual image/file rather than a wall of text.
 */
describe('encodeAttachmentForPrompt', () => {
  it('embeds an image as a markdown data-URI image tag', async () => {
    const result = await encodeAttachmentForPrompt({
      id: 'a1',
      uri: 'file:///photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      kind: 'image',
      size: 4,
    });

    expect(result).toBe('![photo.jpg](data:image/jpeg;base64,AAECAw==)');
  });

  it('embeds a non-image file as a clearly labelled block, not an image tag', async () => {
    const result = await encodeAttachmentForPrompt({
      id: 'a1',
      uri: 'file:///report.pdf',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      kind: 'file',
      size: 4,
    });

    expect(result).toContain('ATTACHED FILE: report.pdf');
    expect(result).toContain('application/pdf');
    expect(result).toContain('data:application/pdf;base64,AAECAw==');
    expect(result).not.toMatch(/^!\[/);
  });

  it('falls back to a generic mime type when the picker gave none', async () => {
    const image = await encodeAttachmentForPrompt({
      id: 'a1',
      uri: 'file:///photo.jpg',
      name: 'photo.jpg',
      kind: 'image',
      size: 4,
    });
    expect(image).toContain('data:image/jpeg;base64,');

    const file = await encodeAttachmentForPrompt({
      id: 'a2',
      uri: 'file:///thing',
      name: 'thing',
      kind: 'file',
      size: 4,
    });
    expect(file).toContain('data:application/octet-stream;base64,');
  });

  /**
   * Base64 inflates ~33% over raw bytes, and this goes straight into the
   * agent's text input with no chunking — an unbounded attachment risks
   * blowing past the request or context limit in a way that's opaque to the
   * user (a request that just silently fails). Caught here instead, with a
   * message that says which attachment and why.
   */
  it('refuses an attachment over the size cap, naming it in the error', async () => {
    const oversized = {
      id: 'a1',
      uri: 'file:///huge.jpg',
      name: 'huge.jpg',
      kind: 'image' as const,
      size: MAX_ATTACHMENT_BYTES + 1,
    };

    await expect(encodeAttachmentForPrompt(oversized)).rejects.toThrow(
      AttachmentTooLargeError,
    );
    await expect(encodeAttachmentForPrompt(oversized)).rejects.toThrow(/huge\.jpg/);
  });

  it('allows an attachment exactly at the cap', async () => {
    await expect(
      encodeAttachmentForPrompt({
        id: 'a1',
        uri: 'file:///photo.jpg',
        name: 'photo.jpg',
        kind: 'image',
        size: MAX_ATTACHMENT_BYTES,
      }),
    ).resolves.toContain('data:image/jpeg;base64,');
  });

  /** No size captured at pick time — falls back to reading it off the file. */
  it('checks the real file size when the picker did not report one', async () => {
    await expect(
      encodeAttachmentForPrompt({
        id: 'a1',
        uri: 'file:///photo.jpg',
        name: 'photo.jpg',
        kind: 'image',
      }),
    ).resolves.toContain('data:image/jpeg;base64,');
  });
});
