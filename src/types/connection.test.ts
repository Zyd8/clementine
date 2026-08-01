import {
  connectionSchema,
  normalizeBaseUrl,
  setupFormSchema,
} from './connection';

const VALID = {
  baseUrl: 'http://100.106.162.39:8642',
  apiKey: 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b',
  connectedAt: 1_754_000_000_000,
};

describe('connectionSchema', () => {
  it('accepts a minimal valid connection', () => {
    expect(connectionSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts an optional label and lastUsedAt', () => {
    const result = connectionSchema.safeParse({
      ...VALID,
      name: 'laptop hermes',
      lastUsedAt: 1_754_000_001_000,
    });
    expect(result.success).toBe(true);
  });

  it('has no id field — there is only ever one connection', () => {
    const parsed = connectionSchema.parse({ ...VALID, id: 'abc' });
    expect(parsed).not.toHaveProperty('id');
  });

  it('rejects a missing apiKey', () => {
    expect(connectionSchema.safeParse({ ...VALID, apiKey: undefined }).success).toBe(
      false,
    );
  });

  it('rejects an empty apiKey', () => {
    expect(connectionSchema.safeParse({ ...VALID, apiKey: '   ' }).success).toBe(false);
  });

  it('rejects a malformed baseUrl', () => {
    expect(connectionSchema.safeParse({ ...VALID, baseUrl: 'not a url' }).success).toBe(
      false,
    );
  });

  it('rejects a non-http(s) scheme', () => {
    expect(
      connectionSchema.safeParse({ ...VALID, baseUrl: 'ftp://host:8642' }).success,
    ).toBe(false);
  });

  it('accepts https', () => {
    expect(
      connectionSchema.safeParse({ ...VALID, baseUrl: 'https://api.zyldjan.com' })
        .success,
    ).toBe(true);
  });
});

describe('normalizeBaseUrl', () => {
  it('strips a trailing slash so path joins never double up', () => {
    expect(normalizeBaseUrl('http://host:8642/')).toBe('http://host:8642');
  });

  it('strips repeated trailing slashes', () => {
    expect(normalizeBaseUrl('http://host:8642///')).toBe('http://host:8642');
  });

  it('trims surrounding whitespace from a pasted URL', () => {
    expect(normalizeBaseUrl('  http://host:8642  ')).toBe('http://host:8642');
  });

  it('leaves an already-clean URL untouched', () => {
    expect(normalizeBaseUrl('https://api.zyldjan.com')).toBe('https://api.zyldjan.com');
  });
});

describe('setupFormSchema', () => {
  it('normalizes the baseUrl as part of parsing', () => {
    const parsed = setupFormSchema.parse({
      baseUrl: ' http://host:8642/ ',
      apiKey: VALID.apiKey,
    });
    expect(parsed.baseUrl).toBe('http://host:8642');
  });

  it('trims a pasted API key', () => {
    const parsed = setupFormSchema.parse({
      baseUrl: 'http://host:8642',
      apiKey: `  ${VALID.apiKey}\n`,
    });
    expect(parsed.apiKey).toBe(VALID.apiKey);
  });

  it('treats a blank optional name as absent rather than an empty label', () => {
    const parsed = setupFormSchema.parse({
      baseUrl: 'http://host:8642',
      apiKey: VALID.apiKey,
      name: '   ',
    });
    expect(parsed.name).toBeUndefined();
  });

  it('reports a field-level error for a bad URL so the form can show it inline', () => {
    const result = setupFormSchema.safeParse({ baseUrl: 'nope', apiKey: VALID.apiKey });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['baseUrl']);
    }
  });
});
