import * as Sentry from '@sentry/react-native';

import { initTelemetry } from './telemetry';

const KEY = 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b';

type InitOptions = {
  dsn?: string;
  sendDefaultPii?: boolean;
  beforeSend: (event: unknown) => unknown;
  beforeBreadcrumb: (crumb: unknown) => unknown;
};

const optionsFrom = (): InitOptions =>
  (Sentry.init as jest.Mock).mock.calls[0]?.[0] as InitOptions;

describe('initTelemetry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not initialise without a DSN — no silent no-op reporter', () => {
    initTelemetry({ dsn: undefined });
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initialises when a DSN is configured', () => {
    initTelemetry({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });
    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });

  it('never sends default PII', () => {
    initTelemetry({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });
    expect(optionsFrom().sendDefaultPii).toBe(false);
  });

  it('scrubs the API key out of events before they leave the device', () => {
    initTelemetry({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });
    const scrubbed = optionsFrom().beforeSend({ extra: { apiKey: KEY } });
    expect(JSON.stringify(scrubbed)).not.toContain(KEY);
  });

  it('scrubs the base URL out of breadcrumbs before they leave the device', () => {
    initTelemetry({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' });
    const scrubbed = optionsFrom().beforeBreadcrumb({
      data: { baseUrl: 'http://100.106.162.39:8642' },
    });
    expect(JSON.stringify(scrubbed)).not.toContain('100.106.162.39');
  });
});
