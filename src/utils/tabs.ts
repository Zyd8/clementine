/** The four tabbed routes. Chat is `index`, the group root. */
export type TabKey = 'index' | 'sessions' | 'profiles' | 'settings';

/** Tab routes other than chat, which lives at the group root. */
const NAMED_TABS = ['sessions', 'profiles', 'settings'] as const;

type NamedTab = (typeof NAMED_TABS)[number];

const isNamedTab = (value: string): value is NamedTab =>
  (NAMED_TABS as readonly string[]).includes(value);

/**
 * Which tab a pathname belongs to.
 *
 * Anything outside the group resolves to chat rather than throwing — setup
 * and the voice overlay hide the bar entirely, so the value is never rendered
 * there, and a sensible default beats a crash on an unexpected route.
 */
export function tabKeyForPath(pathname: string): TabKey {
  const segment = pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ?? '';
  return isNamedTab(segment) ? segment : 'index';
}

/** Where a tab press should navigate. */
export function hrefForTab(key: TabKey): '/' | '/sessions' | '/profiles' | '/settings' {
  return key === 'index' ? '/' : `/${key}`;
}
