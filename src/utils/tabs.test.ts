import { hrefForTab, tabKeyForPath } from './tabs';

describe('tabKeyForPath', () => {
  it('maps the chat route to the chat tab', () => {
    expect(tabKeyForPath('/')).toBe('index');
    expect(tabKeyForPath('')).toBe('index');
  });

  it('maps each named tab route to its tab', () => {
    expect(tabKeyForPath('/sessions')).toBe('sessions');
    expect(tabKeyForPath('/profiles')).toBe('profiles');
    expect(tabKeyForPath('/settings')).toBe('settings');
  });

  /**
   * A route outside the group (setup, the voice overlay) must not light up a
   * tab — the design hides the bar there, and highlighting CHAT while sitting
   * on setup would misreport where the user is.
   */
  it('falls back to chat for routes outside the group', () => {
    expect(tabKeyForPath('/setup')).toBe('index');
    expect(tabKeyForPath('/voice-profile')).toBe('index');
  });

  it('ignores a trailing slash', () => {
    expect(tabKeyForPath('/sessions/')).toBe('sessions');
  });
});

describe('hrefForTab', () => {
  it('routes the chat tab to the group root', () => {
    expect(hrefForTab('index')).toBe('/');
  });

  it('routes named tabs to their own path', () => {
    expect(hrefForTab('sessions')).toBe('/sessions');
    expect(hrefForTab('profiles')).toBe('/profiles');
    expect(hrefForTab('settings')).toBe('/settings');
  });

  it('round-trips every tab key', () => {
    for (const key of ['index', 'sessions', 'profiles', 'settings'] as const) {
      expect(tabKeyForPath(hrefForTab(key))).toBe(key);
    }
  });
});
