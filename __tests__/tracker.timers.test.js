const SearchBehaviorAnalysisCollector = require('../src/tracker');

describe('Fake Timers Integration', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });
  afterAll(() => {
    jest.useRealTimers();
  });
  test('should check session expiration periodically', () => {
    const mockLocalStorage = {
      getItem: jest.fn((key) => {
        if (key === 'tracker_session_id') return 'old-session-id';
        if (key === 'tracker_session_timestamp') return new Date(Date.now() - 31 * 60 * 1000).toISOString();
        return null;
      }),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      configurable: true,
      writable: true
    });
    const collector = new SearchBehaviorAnalysisCollector();
    jest.advanceTimersByTime(60000); // Advance by 1 minute
    expect(collector.sessionId).not.toBe('old-session-id');
    collector.destroy();
  });
  test('should send events periodically', () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;
    const collector = new SearchBehaviorAnalysisCollector({ sendInterval: 1000 });
    collector.trackEvent('test_event', { test: 'data' });
    jest.advanceTimersByTime(1000);
    expect(mockFetch).toHaveBeenCalled();
    collector.destroy();
  });
}); 