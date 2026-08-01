import { z } from 'zod';

/**
 * The one configured Hermes instance.
 *
 * There is deliberately no `id` — the app targets exactly one instance at a
 * time, so nothing needs to key off it. (If multi-instance support returns,
 * this is the type that gains an `id` again.)
 */

/** Trailing slashes break naive path joins (`${baseUrl}/v1/...`). Strip once, here. */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

const httpUrl = z
  .string()
  .trim()
  .min(1, 'Server URL is required')
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a full URL, e.g. http://100.106.162.39:8642');

const apiKey = z.string().trim().min(1, 'API key is required');

export const connectionSchema = z.object({
  name: z.string().trim().min(1).optional(),
  baseUrl: httpUrl,
  apiKey,
  connectedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().optional(),
});

export type Connection = z.infer<typeof connectionSchema>;

/**
 * What the setup form collects. Normalizes as it parses so every downstream
 * consumer sees a canonical URL, and an all-whitespace label becomes absent
 * rather than an empty string masquerading as a name.
 */
export const setupFormSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional(),
  baseUrl: httpUrl.transform(normalizeBaseUrl),
  apiKey,
});

export type SetupFormValues = z.input<typeof setupFormSchema>;
export type SetupFormParsed = z.output<typeof setupFormSchema>;
