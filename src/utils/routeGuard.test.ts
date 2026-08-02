import { redirectTarget } from './routeGuard';

describe('redirectTarget', () => {
  it('sends a user with no stored connection to setup', () => {
    expect(redirectTarget({ hasConnection: false, rootSegment: undefined })).toBe(
      '/setup',
    );
    expect(redirectTarget({ hasConnection: false, rootSegment: 'index' })).toBe(
      '/setup',
    );
  });

  /**
   * The header's SETUP link is how an existing connection gets reconfigured,
   * and `app/setup.tsx` routes to chat itself once a new one validates. A
   * guard that bounced connected users off setup would make that link
   * unusable — it would eject them the instant they arrived.
   */
  it('leaves a connected user on setup so they can reconfigure', () => {
    expect(redirectTarget({ hasConnection: true, rootSegment: 'setup' })).toBeNull();
  });

  /**
   * The point of the guard. Returning a target unconditionally makes the
   * layout effect re-enter expo-router's navigation store on every pass —
   * "Maximum update depth exceeded". Once the route is already correct there
   * is nothing to do.
   */
  it('returns null when the current route is already right', () => {
    expect(redirectTarget({ hasConnection: true, rootSegment: undefined })).toBeNull();
    expect(redirectTarget({ hasConnection: true, rootSegment: 'index' })).toBeNull();
    expect(redirectTarget({ hasConnection: false, rootSegment: 'setup' })).toBeNull();
  });

  /** The guard only ever pushes toward setup — it never pulls anyone off it. */
  it('never routes to chat, leaving that to the screens themselves', () => {
    for (const rootSegment of [undefined, 'index', 'setup', 'sessions']) {
      expect(redirectTarget({ hasConnection: true, rootSegment })).not.toBe('/');
    }
  });

  it('leaves a connected user alone on the app’s other routes', () => {
    for (const rootSegment of ['sessions', 'voice-profile']) {
      expect(redirectTarget({ hasConnection: true, rootSegment })).toBeNull();
    }
  });

  /** Without a connection every route is unreachable, including those two. */
  it('pulls a disconnected user out of any route back to setup', () => {
    for (const rootSegment of ['sessions', 'voice-profile']) {
      expect(redirectTarget({ hasConnection: false, rootSegment })).toBe('/setup');
    }
  });
});
