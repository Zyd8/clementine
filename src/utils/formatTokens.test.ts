import { formatTokens } from './formatTokens';

describe('formatTokens', () => {
  it('leaves counts under a thousand alone', () => {
    expect(formatTokens(0)).toBe('0 tok');
    expect(formatTokens(1)).toBe('1 tok');
    expect(formatTokens(999)).toBe('999 tok');
  });

  it('switches to K at a thousand, to one decimal', () => {
    expect(formatTokens(1000)).toBe('1.0K tok');
    expect(formatTokens(142_300)).toBe('142.3K tok');
    expect(formatTokens(66_809)).toBe('66.8K tok');
  });

  /** Truncates rather than rounds up, so a readout never overstates usage. */
  it('does not round a count up past what was actually used', () => {
    expect(formatTokens(1999)).toBe('1.9K tok');
  });

  it('handles a negative or absent count without printing nonsense', () => {
    expect(formatTokens(-5)).toBe('0 tok');
    expect(formatTokens(Number.NaN)).toBe('0 tok');
  });
});
