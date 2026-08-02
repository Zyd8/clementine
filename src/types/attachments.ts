/**
 * A file or image staged in the composer, before it has anywhere to go.
 *
 * `POST /v1/runs` only documents a plain-text `input` field (see
 * ARCHITECTURE.md) — there is no confirmed way for an attachment to actually
 * reach the agent yet. This type exists so the picker UI has something real
 * to hold, without pretending a send pipeline exists that doesn't.
 */
export type Attachment = {
  id: string;
  uri: string;
  name: string;
  mimeType?: string;
  kind: 'image' | 'file';
  size?: number;
};
