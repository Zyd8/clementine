import { act, renderHook } from '@testing-library/react-native';

import { validateConnection } from '@/api/capabilities';
import { ApiError } from '@/api/client';
import { useConnectionStore } from '@/stores/connection';

import { useConnectionSetup } from './useConnectionSetup';

jest.mock('@/api/capabilities', () => ({
  ...jest.requireActual('@/api/capabilities'),
  validateConnection: jest.fn(),
}));

const mockedValidate = validateConnection as jest.MockedFunction<typeof validateConnection>;

const FORM = {
  name: 'laptop hermes',
  baseUrl: 'http://100.106.162.39:8642',
  apiKey: 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b',
};

const CAPABILITIES = {
  platform: 'hermes-agent',
  supportsRuns: true,
  supportsSse: true,
  supportsSessions: true,
  supportsApproval: true,
  supportsProfiles: false,
};

describe('useConnectionSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedValidate.mockResolvedValue(CAPABILITIES);
    useConnectionStore.setState({ connection: null, hydrated: true });
  });

  it('starts idle with no error', async () => {
    const { result } = await renderHook(() => useConnectionSetup());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('validates against the instance before saving anything', async () => {
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(mockedValidate).toHaveBeenCalledWith(FORM.baseUrl, FORM.apiKey);
  });

  it('saves the connection on success', async () => {
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(useConnectionStore.getState().connection).toMatchObject({
      baseUrl: FORM.baseUrl,
      apiKey: FORM.apiKey,
      name: FORM.name,
    });
  });

  it('stamps connectedAt so the connection has a real age', async () => {
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(useConnectionStore.getState().connection?.connectedAt).toBeGreaterThan(0);
  });

  it('normalizes a pasted URL with a trailing slash before saving', async () => {
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit({ ...FORM, baseUrl: ' http://host:8642/ ' });
    });
    expect(useConnectionStore.getState().connection?.baseUrl).toBe('http://host:8642');
  });

  it('reports success so the screen can navigate to chat', async () => {
    const { result } = await renderHook(() => useConnectionSetup());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.submit(FORM);
    });
    expect(outcome).toBe(true);
    expect(result.current.status).toBe('success');
  });

  it('saves nothing when validation fails — no half-configured connection', async () => {
    mockedValidate.mockRejectedValue(new ApiError('auth', 401));
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(useConnectionStore.getState().connection).toBeNull();
  });

  it('surfaces a wrong key with an actionable message', async () => {
    mockedValidate.mockRejectedValue(new ApiError('auth', 401));
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(result.current.error).toMatch(/key/i);
    expect(result.current.status).toBe('error');
  });

  it('distinguishes an unreachable host from a wrong key', async () => {
    mockedValidate.mockRejectedValue(new ApiError('network'));
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(result.current.error).toMatch(/reach/i);
  });

  it('distinguishes a reachable non-Hermes host', async () => {
    mockedValidate.mockRejectedValue(new ApiError('not-hermes'));
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(result.current.error).toMatch(/hermes/i);
  });

  it('rejects a malformed URL locally without any network call', async () => {
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit({ ...FORM, baseUrl: 'not a url' });
    });
    expect(mockedValidate).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
  });

  it('never leaks the credential into the surfaced error', async () => {
    mockedValidate.mockRejectedValue(new ApiError('auth', 401));
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(result.current.error).not.toContain(FORM.apiKey);
  });

  it('reports an unexpected failure without crashing the screen', async () => {
    mockedValidate.mockRejectedValue(new Error('kaboom'));
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeTruthy();
  });

  it('replaces an existing connection through reconfigure, wiping the old key', async () => {
    await useConnectionStore.getState().connect({
      baseUrl: 'https://old.example.com',
      apiKey: 'old-key-old-key-old-key',
      connectedAt: 1,
    });
    const { result } = await renderHook(() => useConnectionSetup());
    await act(async () => {
      await result.current.submit(FORM);
    });
    const saved = useConnectionStore.getState().connection;
    expect(saved?.baseUrl).toBe(FORM.baseUrl);
    expect(saved?.apiKey).not.toBe('old-key-old-key-old-key');
  });
});
