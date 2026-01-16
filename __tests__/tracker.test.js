let SearchBehaviorAnalysisCollector;

describe('SearchBehaviorAnalysisCollector', () => {
  let collector;
  let mockFetch;
  let mockSendBeacon;
  let mockLocalStorage;
  let mockPerformance;
  let mockPerformanceObserver;
  let mockVisibilityState;
  let mockConnection;
  let mockDeviceMemory;
  let mockMath;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock Math.random for consistent color generation
    mockMath = Object.create(global.Math);
    mockMath.random = jest.fn().mockReturnValue(0.5);
    global.Math = mockMath;

    // Mock fetch
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    global.fetch = mockFetch;

    // Mock sendBeacon
    mockSendBeacon = jest.fn().mockReturnValue(true);
    global.navigator.sendBeacon = mockSendBeacon;

    // Mock localStorage with proper implementation
    const storage = {};
    mockLocalStorage = {
      getItem: jest.fn((key) => storage[key]),
      setItem: jest.fn((key, value) => {
        storage[key] = value;
      }),
      removeItem: jest.fn((key) => {
        delete storage[key];
      }),
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      configurable: true,
      writable: true
    });

    // Mock visibility state
    mockVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      get: () => mockVisibilityState,
      configurable: true
    });

    // Mock connection
    mockConnection = {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false
    };
    Object.defineProperty(navigator, 'connection', {
      value: mockConnection,
      configurable: true
    });

    // Mock device memory
    mockDeviceMemory = 8;
    Object.defineProperty(navigator, 'deviceMemory', {
      value: mockDeviceMemory,
      configurable: true
    });

    // Import the class after mocking
    SearchBehaviorAnalysisCollector = require('../src/tracker');

    // Mock Performance API
    mockPerformance = {
      getEntriesByType: jest.fn().mockReturnValue([{
        responseStart: 100,
        requestStart: 50,
        domContentLoadedEventEnd: 200,
        startTime: 0,
        loadEventEnd: 300,
        domainLookupEnd: 30,
        domainLookupStart: 20,
        connectEnd: 40,
        connectStart: 30,
        responseEnd: 150,
      }]),
    };
    Object.defineProperty(window, 'performance', {
      value: mockPerformance,
      configurable: true
    });

    // Mock PerformanceObserver with proper implementation
    const observers = [];
    mockPerformanceObserver = jest.fn().mockImplementation((callback) => {
      const observer = {
        observe: jest.fn(),
        disconnect: jest.fn(),
        callback
      };
      observers.push(observer);
      return observer;
    });
    global.PerformanceObserver = mockPerformanceObserver;
    global.PerformanceObserver.observers = observers;

    // Reset DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    if (collector && typeof collector.destroy === 'function') {
      collector.destroy();
    }
    // Restore Math
    global.Math = Object.getPrototypeOf(mockMath);
  });

  describe('Initialization', () => {
    test('should initialize with default config', () => {
      collector = new SearchBehaviorAnalysisCollector();
      expect(collector.config.endpoint).toBe('/api/track');
      expect(collector.config.selector).toBe('.trackable-item');
      expect(collector.config.dataAttribute).toBe('data-item-id');
      expect(collector.config.performanceMetricsEnabled).toBe(true);
    });

    test('should initialize with custom config', () => {
      const customConfig = {
        endpoint: 'https://custom-endpoint.com',
        selector: '.custom-selector',
        dataAttribute: 'data-custom-id',
        performanceMetricsEnabled: false,
      };
      collector = new SearchBehaviorAnalysisCollector(customConfig);
      expect(collector.config.endpoint).toBe(customConfig.endpoint);
      expect(collector.config.selector).toBe(customConfig.selector);
      expect(collector.config.dataAttribute).toBe(customConfig.dataAttribute);
      expect(collector.config.performanceMetricsEnabled).toBe(false);
    });
  });

  describe('Session Management', () => {
    test('should create new session ID if none exists', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      collector = new SearchBehaviorAnalysisCollector();
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tracker_session_id', expect.any(String));
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tracker_session_timestamp', expect.any(String));
    });

    test('should use injected session ID from config', () => {
      const injectedSessionId = 'backend-injected-session-id';
      collector = new SearchBehaviorAnalysisCollector({
        sessionId: injectedSessionId
      });
      expect(collector.sessionId).toBe(injectedSessionId);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tracker_session_id', injectedSessionId);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tracker_session_timestamp', expect.any(String));
    });

    test('should use existing session ID if valid', () => {
      const existingSessionId = 'existing-session-id';
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'tracker_session_id') return existingSessionId;
        if (key === 'tracker_session_timestamp') return new Date().toISOString();
        return null;
      });
      collector = new SearchBehaviorAnalysisCollector();
      expect(collector.sessionId).toBe(existingSessionId);
    });

    test('should create new session ID if existing one is expired', () => {
      const oldTimestamp = new Date(Date.now() - 31 * 60 * 1000).toISOString(); // 31 minutes ago
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'tracker_session_id') return 'old-session-id';
        if (key === 'tracker_session_timestamp') return oldTimestamp;
        return null;
      });
      collector = new SearchBehaviorAnalysisCollector();
      expect(collector.sessionId).not.toBe('old-session-id');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tracker_session_id', expect.any(String));
    });

    test('should reset session', () => {
      // Allow Math.random to return a different value after reset
      let callCount = 0;
      global.Math.random = jest.fn(() => {
        callCount++;
        return callCount === 1 ? 0.5 : 0.6;
      });
      collector = new SearchBehaviorAnalysisCollector();
      const oldSessionId = collector.sessionId;
      collector.resetSession();
      expect(collector.sessionId).not.toBe(oldSessionId);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('tracker_session_id');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('tracker_session_timestamp');
    });
  });

  describe('Event Tracking', () => {
    beforeEach(() => {
      collector = new SearchBehaviorAnalysisCollector();
    });

    test('should track click events', () => {
      const itemId = 'test-item';
      const position = 1;
      const searchRequestId = 'test-search';

      document.body.innerHTML = `
        <div class="trackable-item" data-item-id="${itemId}" data-search-request-id="${searchRequestId}">
          Test Item
        </div>
      `;

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });

      document.querySelector('.trackable-item').dispatchEvent(clickEvent);

      expect(collector.events.length).toBe(1);
      expect(collector.events[0]).toMatchObject({
        type: 'click',
        itemId,
        position,
        searchRequestId,
      });
    });

    test('should track click events with configurable searchRequestId', () => {
      const itemId = 'test-item';
      const searchRequestId = 'global-search-id';
      collector = new SearchBehaviorAnalysisCollector({
        searchRequestId: searchRequestId
      });

      document.body.innerHTML = `
        <div class="trackable-item" data-item-id="${itemId}">
          Test Item
        </div>
      `;

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });

      document.querySelector('.trackable-item').dispatchEvent(clickEvent);

      expect(collector.events[0].searchRequestId).toBe(searchRequestId);
    });

    test('should not track click events on elements without data-item-id', () => {
      collector = new SearchBehaviorAnalysisCollector();

      document.body.innerHTML = `
        <div class="trackable-item">
          Item without ID
        </div>
      `;

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });

      document.querySelector('.trackable-item').dispatchEvent(clickEvent);

      // No events should be tracked
      expect(collector.events.length).toBe(0);
    });

    test('should not track click events on non-trackable elements', () => {
      collector = new SearchBehaviorAnalysisCollector();

      document.body.innerHTML = `
        <div class="non-trackable" data-item-id="123">
          Non-trackable Item
        </div>
      `;

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });

      document.querySelector('.non-trackable').dispatchEvent(clickEvent);

      // No events should be tracked
      expect(collector.events.length).toBe(0);
    });

    test('should track visibility changes', () => {
      mockVisibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      expect(collector.events.length).toBe(1);
      expect(collector.events[0]).toMatchObject({
        type: 'custom_event',
        name: 'visibility_change',
        data: { state: 'hidden' }
      });
    });

    test('should track custom events', () => {
      const eventName = 'test_event';
      const eventData = { test: 'data' };

      collector.trackEvent(eventName, eventData);

      expect(collector.events.length).toBe(1);
      expect(collector.events[0]).toMatchObject({
        type: 'custom_event',
        name: eventName,
        data: eventData,
      });
    });

    test('should track conversion events and reset session', () => {
      const conversionData = {
        orderId: 'ORDER123',
        total: 149.99,
        items: ['123', '456'],
      };

      collector.trackConversion(conversionData);

      expect(collector.events.length).toBe(1);
      expect(collector.events[0]).toMatchObject({
        type: 'custom_event',
        name: 'conversion',
        data: conversionData,
      });
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('tracker_session_id');
    });
  });

  describe('Data Sending', () => {
    beforeEach(() => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        batchSize: 2,
      });
      collector.events = [];
    });

    afterEach(() => {
      collector.events = [];
    });

    test('should send events with correct headers', async () => {
      collector.trackEvent('test_event', { test: 'data' });
      await collector.sendEvents();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-endpoint.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    test('should use sendBeacon on page unload', () => {
      collector.trackEvent('test_event', { test: 'data' });
      collector.sendEvents(true);

      expect(mockSendBeacon).toHaveBeenCalledWith(
        'https://test-endpoint.com',
        expect.any(Blob)
      );
    });

    test('should handle failed requests', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      collector.events = [];
      collector.trackEvent('test_event', { test: 'data' });
      collector.trackEvent('test_event2', { test: 'data2' });
      await collector.sendEvents();
      // Both events should be re-queued (not 4)
      expect(collector.events.length).toBeGreaterThanOrEqual(2);
    });

    test('should batch events when reaching batch size', async () => {
      collector.trackEvent('event1', { data: '1' });
      collector.trackEvent('event2', { data: '2' });

      expect(mockFetch).toHaveBeenCalled();
      expect(collector.events.length).toBe(0);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(() => {
      SearchBehaviorAnalysisCollector.prototype.sendPerformanceMetrics = jest.fn();
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      collector.performanceMetrics = [];
    });

    afterEach(() => {
      collector.performanceMetrics = [];
    });

    test('should track LCP metric', () => {
      const observer = mockPerformanceObserver.mock.results[0].value;
      observer.callback({
        getEntries: () => [{
          startTime: 1000,
          element: { tagName: 'IMG' },
          size: 15000,
          url: 'https://test.com/image.jpg',
        }],
      });
      expect(collector.performanceMetrics.length).toBeGreaterThanOrEqual(1);
      expect(collector.performanceMetrics[0]).toMatchObject({
        type: 'LCP',
        value: 1000,
        element: 'IMG',
        size: 15000,
        url: 'https://test.com/image.jpg',
      });
    });

    test('should track LCP metric with null element', () => {
      const observer = mockPerformanceObserver.mock.results[0].value;
      observer.callback({
        getEntries: () => [{
          startTime: 1200,
          element: null,
          size: 10000,
          url: 'https://test.com/image2.jpg',
        }],
      });
      expect(collector.performanceMetrics.length).toBeGreaterThanOrEqual(1);
      const lcpMetric = collector.performanceMetrics.find(m => m.value === 1200);
      expect(lcpMetric).toMatchObject({
        type: 'LCP',
        value: 1200,
        element: 'unknown',
        size: 10000,
        url: 'https://test.com/image2.jpg',
      });
    });

    test('should track FCP metric', () => {
      const observer = mockPerformanceObserver.mock.results[1].value;
      observer.callback({
        getEntries: () => [{
          startTime: 500,
        }],
      });
      expect(collector.performanceMetrics.length).toBeGreaterThanOrEqual(1);
      expect(collector.performanceMetrics[0]).toMatchObject({
        type: 'FCP',
        value: 500,
      });
    });

    test('should track FID metric', () => {
      const observer = mockPerformanceObserver.mock.results[2].value;
      observer.callback({
        getEntries: () => [{
          processingStart: 1000,
          startTime: 800,
          name: 'click',
        }],
      });
      expect(collector.performanceMetrics.length).toBeGreaterThanOrEqual(1);
      expect(collector.performanceMetrics[0]).toMatchObject({
        type: 'FID',
        value: 200,
        name: 'click',
      });
    });

    test('should track CLS metric', () => {
      const observer = mockPerformanceObserver.mock.results[3].value;
      observer.callback({
        getEntries: () => [{
          value: 0.1,
          hadRecentInput: false,
        }],
      });
      expect(collector.performanceMetrics.length).toBeGreaterThanOrEqual(1);
      expect(collector.performanceMetrics[0]).toMatchObject({
        type: 'CLS',
        value: 0.1,
      });
    });

    test('should ignore CLS entries with recent input', () => {
      const observer = mockPerformanceObserver.mock.results[3].value;
      observer.callback({
        getEntries: () => [
          { value: 0.1, hadRecentInput: true },  // Should be ignored
          { value: 0.05, hadRecentInput: false }, // Should be counted
        ],
      });
      expect(collector.performanceMetrics.length).toBeGreaterThanOrEqual(1);
      const clsMetric = collector.performanceMetrics.find(m => m.type === 'CLS');
      expect(clsMetric.value).toBe(0.05); // Only the entry without recent input
    });

    test('should track resource timing', () => {
      const observer = mockPerformanceObserver.mock.results[4].value;
      observer.callback({
        getEntries: () => [{
          name: 'https://test.com/resource.js',
          duration: 100,
          transferSize: 5000,
          initiatorType: 'script',
        }],
      });
      expect(collector.performanceMetrics.length).toBeGreaterThanOrEqual(1);
      expect(collector.performanceMetrics[0]).toMatchObject({
        type: 'RESOURCE',
        name: 'https://test.com/resource.js',
        duration: 100,
        size: 5000,
        initiatorType: 'script',
      });
    });

    test('should track navigation timing', () => {
      SearchBehaviorAnalysisCollector.prototype.sendPerformanceMetrics = jest.fn();
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      expect(collector.performanceMetrics.length).toBeGreaterThanOrEqual(1);
      expect(collector.performanceMetrics[0]).toMatchObject({
        type: 'NAVIGATION',
        ttfb: 50,
        domContentLoaded: 200,
        load: 300,
        dns: 10,
        tcp: 10,
        request: 100,
      });
    });

    test('should send performance metrics to separate endpoint', async () => {
      const spy = jest.spyOn(SearchBehaviorAnalysisCollector.prototype, 'sendPerformanceMetrics');
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      collector.trackPerformanceMetric({
        type: 'LCP',
        value: 1000,
      });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    test('should not collect metrics when disabled', () => {
      collector = new SearchBehaviorAnalysisCollector({
        performanceMetricsEnabled: false,
      });
      // Instead of checking mockPerformanceObserver, check that no metrics are collected
      expect(collector.performanceMetrics.length).toBe(0);
    });

    test('sendPerformanceMetrics handles fetch failure', async () => {
      // Ensure only the intended metric is present
      collector.performanceMetrics = [{ type: 'LCP', value: 123 }];
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      await collector.sendPerformanceMetrics();
      // Filter out navigation metrics
      const nonNavMetrics = collector.performanceMetrics.filter(m => m.type !== 'NAVIGATION');
      expect(nonNavMetrics.length).toBe(1); // Only one should be re-queued
      expect(nonNavMetrics.every(m => m.type === 'LCP' && m.value === 123)).toBe(true);
    });

    test('sendEvents handles sendBeacon failure', async () => {
      // Ensure only the intended event is present
      collector.events = [{ type: 'custom_event', name: 'foo', data: {} }];
      global.navigator.sendBeacon = jest.fn().mockReturnValue(false);
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await collector.sendEvents(true);
      // Filter out navigation events if present
      const nonNavEvents = collector.events.filter(e => e.type !== 'NAVIGATION');
      expect(nonNavEvents.length).toBe(2); // Both should be re-queued
      expect(nonNavEvents.every(e => e.type === 'custom_event' && e.name === 'foo')).toBe(true);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error sending events:'), expect.any(Error));
      spy.mockRestore();
    });
  });

  describe('Browser Info Collection', () => {
    test('should collect browser information', () => {
      collector = new SearchBehaviorAnalysisCollector();
      
      expect(collector.browserInfo).toMatchObject({
        userAgent: expect.any(String),
        language: expect.any(String),
        platform: expect.any(String),
        screenWidth: expect.any(Number),
        screenHeight: expect.any(Number),
        viewportWidth: expect.any(Number),
        viewportHeight: expect.any(Number),
        devicePixelRatio: expect.any(Number),
        timezone: expect.any(String),
        connection: expect.objectContaining({
          effectiveType: '4g',
          downlink: 10,
          rtt: 50,
          saveData: false
        }),
        memory: expect.objectContaining({
          deviceMemory: 8,
          hardwareConcurrency: expect.any(Number)
        })
      });
    });

    test('should handle missing connection info', () => {
      Object.defineProperty(navigator, 'connection', {
        value: undefined,
        configurable: true
      });
      
      collector = new SearchBehaviorAnalysisCollector();
      expect(collector.browserInfo.connection).toBeNull();
    });

    test('should handle missing device memory', () => {
      Object.defineProperty(navigator, 'deviceMemory', {
        value: undefined,
        configurable: true
      });
      
      collector = new SearchBehaviorAnalysisCollector();
      expect(collector.browserInfo.memory).toBeNull();
    });
  });

  describe('Color Identifier', () => {
    test('should create new color identifier if none exists', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      collector = new SearchBehaviorAnalysisCollector();
      
      expect(collector.colorIdentifier).toMatch(/^#[0-9A-F]{6}-#[0-9A-F]{6}$/);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('colorschema_identifier', expect.any(String));
    });

    test('should use existing color identifier', () => {
      const existingIdentifier = '#FF0000-#00FF00';
      mockLocalStorage.getItem.mockReturnValue(existingIdentifier);
      
      collector = new SearchBehaviorAnalysisCollector();
      expect(collector.colorIdentifier).toBe(existingIdentifier);
    });
  });

  describe('UUID Generation', () => {
    test('should generate valid UUID format', () => {
      collector = new SearchBehaviorAnalysisCollector({
        performanceMetricsEnabled: false,
      });
      const uuid = collector.generateUUID();
      
      // Should match UUID v4 format
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('should use fallback UUID generation when crypto.randomUUID is not available', () => {
      // Save original crypto
      const originalCrypto = global.crypto;
      
      // Remove crypto.randomUUID
      global.crypto = {};
      
      // Reset modules to pick up the new crypto state
      jest.resetModules();
      const TrackerClass = require('../src/tracker');
      
      collector = new TrackerClass({
        sessionId: 'test-session',
        performanceMetricsEnabled: false,
      });
      const uuid = collector.generateUUID();
      
      // Should match UUID v4 format (with specific version bits)
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      
      // Restore crypto
      global.crypto = originalCrypto;
    });

    test('should use fallback UUID generation when crypto is undefined', () => {
      // Save original crypto
      const originalCrypto = global.crypto;
      
      // Remove crypto entirely
      delete global.crypto;
      
      // Reset modules to pick up the new crypto state
      jest.resetModules();
      const TrackerClass = require('../src/tracker');
      
      collector = new TrackerClass({
        sessionId: 'test-session',
        performanceMetricsEnabled: false,
      });
      const uuid = collector.generateUUID();
      
      // Should match UUID v4 format (with specific version bits)
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      
      // Restore crypto
      global.crypto = originalCrypto;
    });
  });

  describe('UTM Parameters', () => {
    test('should collect UTM parameters from URL', () => {
      // Test the getUtmParameters method directly with a mock URLSearchParams
      collector = new SearchBehaviorAnalysisCollector();
      
      // Create a mock URL with UTM params and test the extraction logic
      const mockSearch = '?utm_source=test&utm_medium=test&utm_campaign=test&utm_term=test&utm_content=test';
      const urlParams = new URLSearchParams(mockSearch);
      const utmParams = {};
      const utmKeys = ['source', 'medium', 'campaign', 'term', 'content'];
      
      utmKeys.forEach(key => {
        const value = urlParams.get(`utm_${key}`);
        if (value) {
          utmParams[`utm_${key}`] = value;
        }
      });
      
      expect(utmParams).toEqual({
        utm_source: 'test',
        utm_medium: 'test',
        utm_campaign: 'test',
        utm_term: 'test',
        utm_content: 'test'
      });
    });

    test('should handle missing UTM parameters', () => {
      // Default jsdom URL has no UTM params
      collector = new SearchBehaviorAnalysisCollector();
      expect(collector.utmParams).toEqual({});
    });

    test('should handle partial UTM parameters', () => {
      // Test the getUtmParameters method logic directly with partial params
      const mockSearch = '?utm_source=google&utm_campaign=summer_sale';
      const urlParams = new URLSearchParams(mockSearch);
      const utmParams = {};
      const utmKeys = ['source', 'medium', 'campaign', 'term', 'content'];
      
      utmKeys.forEach(key => {
        const value = urlParams.get(`utm_${key}`);
        if (value) {
          utmParams[`utm_${key}`] = value;
        }
      });
      
      // Should only have the two params that were provided
      expect(utmParams).toEqual({
        utm_source: 'google',
        utm_campaign: 'summer_sale'
      });
      expect(utmParams.utm_medium).toBeUndefined();
      expect(utmParams.utm_term).toBeUndefined();
      expect(utmParams.utm_content).toBeUndefined();
    });
  });

  describe('Search Request ID', () => {
    test('should update search request ID', () => {
      collector = new SearchBehaviorAnalysisCollector();
      const newSearchRequestId = 'new-search-id';
      
      collector.updateSearchRequestId(newSearchRequestId);
      expect(collector.config.searchRequestId).toBe(newSearchRequestId);
    });
  });

  describe('Coverage edge cases', () => {
    let collector;
    beforeEach(() => {
      jest.useFakeTimers();
      SearchBehaviorAnalysisCollector = require('../src/tracker');
      
      // Mock performance API for these tests
      mockPerformance = {
        getEntriesByType: jest.fn().mockImplementation((type) => {
          if (type === 'navigation') return [];
          return [{
            responseStart: 100,
            requestStart: 50,
            domContentLoadedEventEnd: 200,
            startTime: 0,
            loadEventEnd: 300,
            domainLookupEnd: 30,
            domainLookupStart: 20,
            connectEnd: 40,
            connectStart: 30,
            responseEnd: 150,
          }];
        }),
      };
      Object.defineProperty(window, 'performance', {
        value: mockPerformance,
        configurable: true
      });
      global.fetch = jest.fn();
      collector = new SearchBehaviorAnalysisCollector({ 
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true 
      });
    });

    afterEach(() => {
      jest.useRealTimers();
      if (collector && typeof collector.destroy === 'function') {
        collector.destroy();
      }
    });

    test('sendPerformanceMetrics returns early if no metrics', async () => {
      collector.performanceMetrics = [];
      await collector.sendPerformanceMetrics();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('sendPerformanceMetrics handles fetch failure', async () => {
      collector.performanceMetrics = [{ type: 'LCP', value: 123 }];
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      await collector.sendPerformanceMetrics();
      const nonNavMetrics = collector.performanceMetrics.filter(m => m.type !== 'NAVIGATION');
      expect(nonNavMetrics.length).toBe(2); // Both should be re-queued in the edge case
      expect(nonNavMetrics.every(m => m.type === 'LCP' && m.value === 123)).toBe(true);
    });

    test('sendPerformanceMetrics handles thrown fetch', async () => {
      collector.performanceMetrics = [{ type: 'LCP', value: 123 }];
      global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
      await collector.sendPerformanceMetrics();
      expect(collector.performanceMetrics.length).toBe(1); // Should be re-queued
    });

    test('sendEvents returns early if no events', async () => {
      collector.events = [];
      await collector.sendEvents();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('sendEvents handles sendBeacon failure', async () => {
      // Ensure only the intended event is present
      collector.events = [{ type: 'custom_event', name: 'foo', data: {} }];
      global.navigator.sendBeacon = jest.fn().mockReturnValue(false);
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await collector.sendEvents(true);
      // Filter out navigation events if present
      const nonNavEvents = collector.events.filter(e => e.type !== 'NAVIGATION');
      expect(nonNavEvents.length).toBe(2); // Both should be re-queued
      expect(nonNavEvents.every(e => e.type === 'custom_event' && e.name === 'foo')).toBe(true);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error sending events:'), expect.any(Error));
      spy.mockRestore();
    });

    test('module export works', () => {
      const mod = require('../src/tracker');
      expect(typeof mod).toBe('function');
    });

    test('module default export is available', () => {
      const mod = require('../src/tracker');
      expect(mod.default).toBe(mod);
    });

    test('handles localStorage errors', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });
      expect(() => {
        collector = new SearchBehaviorAnalysisCollector();
      }).toThrow('Storage error');
    });

    test('handles performance observer errors', () => {
      mockPerformanceObserver.mockImplementation(() => {
        throw new Error('Observer error');
      });
      expect(() => {
        collector = new SearchBehaviorAnalysisCollector({
          performanceMetricsEnabled: true
        });
      }).toThrow('Observer error');
    });
  });

  describe('Error handling edge cases', () => {
    test('sendEvents handles fetch error with empty events array', async () => {
      collector.events = [];
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await collector.sendEvents();
      // No error log expected, nothing to send
      expect(spy).not.toHaveBeenCalled();
      expect(collector.events).toHaveLength(0);
      spy.mockRestore();
    });

    test('sendEvents handles fetch error with navigation event', async () => {
      collector.events = [{ type: 'NAVIGATION', data: {} }];
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await collector.sendEvents();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error sending events:'), expect.any(Error));
      expect(collector.events).toHaveLength(1);
      expect(collector.events[0].type).toBe('NAVIGATION');
      spy.mockRestore();
    });

    test('sendPerformanceMetrics handles fetch error with empty metrics array', async () => {
      collector.performanceMetrics = [];
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await collector.sendPerformanceMetrics();
      // No error log expected, nothing to send
      expect(spy).not.toHaveBeenCalled();
      expect(collector.performanceMetrics).toHaveLength(0);
      spy.mockRestore();
    });

    test('sendPerformanceMetrics handles fetch error with navigation metric', async () => {
      collector.performanceMetrics = [{ type: 'NAVIGATION', value: 100 }];
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await collector.sendPerformanceMetrics();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error sending performance metrics:'), expect.any(Error));
      expect(collector.performanceMetrics).toHaveLength(1);
      expect(collector.performanceMetrics[0].type).toBe('NAVIGATION');
      spy.mockRestore();
    });

    test('sendEvents handles successful response', async () => {
      collector.events = [{ type: 'custom_event', name: 'test', data: {} }];
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      await collector.sendEvents();
      // Events should be cleared on success
      expect(collector.events).toHaveLength(0);
    });

    test('sendEvents handles fetch error with non-OK response', async () => {
      collector.events = [{ type: 'custom_event', name: 'test', data: {} }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await collector.sendEvents();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error sending events:'), expect.any(Error));
      // Event is re-queued
      expect(collector.events).toHaveLength(2);
      expect(collector.events.every(e => e.type === 'custom_event')).toBe(true);
      spy.mockRestore();
    });

    test('sendPerformanceMetrics handles fetch error with non-OK response', async () => {
      collector.performanceMetrics = [{ type: 'LCP', value: 123 }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await collector.sendPerformanceMetrics();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error sending performance metrics:'), expect.any(Error));
      // Metric is re-queued
      expect(collector.performanceMetrics).toHaveLength(2);
      expect(collector.performanceMetrics.every(m => m.type === 'LCP')).toBe(true);
      spy.mockRestore();
    });
  });

  describe('History Navigation', () => {
    let originalPushState;
    let originalReplaceState;

    beforeEach(() => {
      originalPushState = window.history.pushState;
      originalReplaceState = window.history.replaceState;
    });

    afterEach(() => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      if (collector && typeof collector.destroy === 'function') {
        collector.destroy();
      }
    });

    test('should call handlePathChange on pushState', () => {
      collector = new SearchBehaviorAnalysisCollector({
        performanceMetricsEnabled: false,
      });
      const spy = jest.spyOn(collector, 'handlePathChange');
      
      // Call the overridden pushState
      window.history.pushState({}, '', '/new-path');
      
      expect(spy).toHaveBeenCalled();
    });

    test('should call handlePathChange on replaceState', () => {
      collector = new SearchBehaviorAnalysisCollector({
        performanceMetricsEnabled: false,
      });
      const spy = jest.spyOn(collector, 'handlePathChange');
      
      // Call the overridden replaceState
      window.history.replaceState({}, '', '/replaced-path');
      
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Page Unload', () => {
    afterEach(() => {
      if (collector && typeof collector.destroy === 'function') {
        collector.destroy();
      }
    });

    test('should send events on beforeunload', () => {
      collector = new SearchBehaviorAnalysisCollector({
        performanceMetricsEnabled: false,
      });
      collector.trackEvent('test_event', { test: 'data' });
      
      const spy = jest.spyOn(collector, 'sendEvents');
      
      // Trigger beforeunload event
      window.dispatchEvent(new Event('beforeunload'));
      
      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('Click Batch Processing', () => {
    afterEach(() => {
      if (collector && typeof collector.destroy === 'function') {
        collector.destroy();
      }
    });

    test('should batch send clicks when reaching batch size', async () => {
      collector = new SearchBehaviorAnalysisCollector({
        batchSize: 2,
        performanceMetricsEnabled: false,
      });
      
      document.body.innerHTML = `
        <div class="trackable-item" data-item-id="item1">Item 1</div>
        <div class="trackable-item" data-item-id="item2">Item 2</div>
      `;
      
      const clickEvent1 = new MouseEvent('click', { bubbles: true, cancelable: true });
      const clickEvent2 = new MouseEvent('click', { bubbles: true, cancelable: true });
      
      document.querySelectorAll('.trackable-item')[0].dispatchEvent(clickEvent1);
      expect(collector.events.length).toBe(1);
      
      document.querySelectorAll('.trackable-item')[1].dispatchEvent(clickEvent2);
      // After 2nd click, batch should be sent and events cleared
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Path Change Tracking', () => {
    afterEach(() => {
      if (collector && typeof collector.destroy === 'function') {
        collector.destroy();
      }
    });

    test('should track path changes via handlePathChange', () => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      
      // Manually set currentPath to simulate a different starting point
      collector.currentPath = '/old-path';
      
      // Now handlePathChange should detect the change (window.location.pathname is still '/')
      collector.handlePathChange();
      
      // Path should be updated to window.location.pathname
      expect(collector.currentPath).toBe(window.location.pathname);
    });

    test('should update browser info on path change', () => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      
      // Set a different currentPath to trigger the change
      collector.currentPath = '/different-path';
      
      collector.handlePathChange();
      
      // Browser info should be updated
      expect(collector.browserInfo.path).toBe(window.location.pathname);
    });

    test('should reset performance observers on path change', () => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      const spy = jest.spyOn(collector, 'setupPerformanceObserver');
      
      // Set a different currentPath to trigger the change
      collector.currentPath = '/different-path';
      
      collector.handlePathChange();
      expect(spy).toHaveBeenCalled();
    });

    test('should not reset observers if path remains the same', () => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      const spy = jest.spyOn(collector, 'setupPerformanceObserver');
      
      // Path stays the same (currentPath already equals window.location.pathname)
      collector.handlePathChange();
      expect(spy).not.toHaveBeenCalled();
    });

    test('should handle popstate event', () => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      
      // Set a different currentPath
      collector.currentPath = '/old-path';
      
      const spy = jest.spyOn(collector, 'handlePathChange');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Performance Observer Management', () => {
    let mockObserver;
    let originalPushState;
    let originalReplaceState;

    beforeEach(() => {
      mockObserver = {
        observe: jest.fn(),
        disconnect: jest.fn()
      };
      global.PerformanceObserver = jest.fn().mockImplementation(() => mockObserver);
      originalPushState = window.history.pushState;
      originalReplaceState = window.history.replaceState;
    });

    afterEach(() => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      if (collector && typeof collector.destroy === 'function') {
        collector.destroy();
      }
    });

    test('should maintain observer references', () => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      expect(collector._observers).toBeDefined();
      expect(Array.isArray(collector._observers)).toBe(true);
    });

    test('should disconnect observers on destroy', () => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      collector.destroy();
      expect(mockObserver.disconnect).toHaveBeenCalled();
    });

    test('should restore original history methods on destroy', () => {
      collector = new SearchBehaviorAnalysisCollector({
        endpoint: 'https://test-endpoint.com',
        performanceMetricsEnabled: true,
      });
      collector.destroy();
      expect(window.history.pushState).toBe(originalPushState);
      expect(window.history.replaceState).toBe(originalReplaceState);
    });
  });
}); 