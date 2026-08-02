/**
 * Session domain types — UI-facing shapes, independent of the API layer.
 *
 * `types/` imports nothing (strict dependency direction). The API layer
 * (`api/sessions.ts`) imports these and re-exports them so callers can
 * import from either place; components import from `@/types/sessions`
 * directly so the UI never reaches into `api/`.
 */

export type SessionSummary = {
  id: string;
  title: string;
  preview: string;
  lastMessageAt: string;
  messageCount: number;
  parentId?: string;
  branchIndex?: number;
};

export type SessionMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: string;
  tool?: string;
  ok?: boolean;
  durationMs?: number;
};
