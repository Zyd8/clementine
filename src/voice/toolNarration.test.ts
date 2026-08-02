import { describeTool, pickThinkingFiller, pickToolFiller } from './toolNarration';

describe('describeTool', () => {
  it.each([
    ['web_search', 'searching for that'],
    ['browse_url', 'searching for that'],
    ['browser_navigate', 'opening that page'],
    ['read_file', 'looking that up'],
    ['write_file', 'saving that'],
    ['delete_file', 'cleaning that up'],
    ['terminal', 'running that command'],
    ['run_shell_command', 'running that command'],
    ['calculator', 'working that out'],
    ['memory_recall', 'checking what I remember'],
    ['vision_describe', 'taking a look'],
    ['send_email', 'sending that'],
    ['calendar_lookup', 'checking the calendar'],
  ])('maps %s to a plain description', (tool, expected) => {
    expect(describeTool(tool)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(describeTool('WEB_SEARCH')).toBe(describeTool('web_search'));
  });

  /**
   * The whole point: an unrecognized or unusually-named tool must never
   * fall through to speaking its raw internal name — that's exactly the
   * confusing jargon this module exists to avoid.
   */
  it('falls back to a generic line for an unrecognized tool, never the name', () => {
    const result = describeTool('xyz_internal_tool_42');
    expect(result).not.toContain('xyz');
    expect(result).not.toContain('internal');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('pickThinkingFiller', () => {
  it('always returns a non-empty phrase', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickThinkingFiller().length).toBeGreaterThan(0);
    }
  });

  /** Not a hard guarantee of variety, but a fixed single string would fail this. */
  it('is not always the same phrase', () => {
    const seen = new Set(Array.from({ length: 30 }, () => pickThinkingFiller()));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('pickToolFiller', () => {
  it('never speaks the tool name itself', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickToolFiller('web_search')).not.toContain('web_search');
    }
  });

  it('always includes what the tool does', () => {
    expect(pickToolFiller('read_file')).toContain('looking that up');
  });

  it('is not always the same phrasing', () => {
    const seen = new Set(
      Array.from({ length: 30 }, () => pickToolFiller('web_search')),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  /** The literal ask: not always "One moment". */
  it('does not always say "One moment"', () => {
    const results = Array.from({ length: 30 }, () => pickToolFiller('web_search'));
    expect(results.some((r) => !r.startsWith('One moment'))).toBe(true);
  });
});
