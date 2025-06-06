class SearchBehaviorAnalysisCollector {
  constructor(config = {}) {
    this.config = {
      endpoint: config.endpoint || '/api/track',
      selector: config.selector || '.trackable-item',
      dataAttribute: config.dataAttribute || 'data-item-id',
      searchRequestIdAttribute: config.searchRequestIdAttribute || 'data-search-request-id',
      sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30 minutes
      batchSize: config.batchSize || 10,
      sendInterval: config.sendInterval || 10000, // 10 seconds
      sessionId: config.sessionId || null, // Allow session ID injection
      searchRequestId: config.searchRequestId || null, // Allow searchRequestId injection
    };

    this.events = [];
    this.sessionId = this.getOrCreateSessionId();
    this.browserInfo = this.getBrowserInfo();
    this.colorIdentifier = this.getOrCreateColorIdentifier();
    this.utmParams = this.getUtmParameters();
    this.setupEventListeners();
    this.setupBatchSending();
    this.setupPerformanceObserver();
  }

  getBrowserInfo() {
    const ua = navigator.userAgent;
    const browserInfo = {
      userAgent: ua,
      language: navigator.language,
      platform: navigator.platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString(),
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      } : null,
      memory: navigator.deviceMemory ? {
        deviceMemory: navigator.deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency
      } : null
    };

    // Detect browser
    if (ua.includes('Chrome')) browserInfo.browser = 'Chrome';
    else if (ua.includes('Firefox')) browserInfo.browser = 'Firefox';
    else if (ua.includes('Safari')) browserInfo.browser = 'Safari';
    else if (ua.includes('Edge')) browserInfo.browser = 'Edge';
    else browserInfo.browser = 'Unknown';

    return browserInfo;
  }

  setupPerformanceObserver() {
    if ('PerformanceObserver' in window) {
      // LCP Observer
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.trackEvent('performance_metric', {
          type: 'LCP',
          value: lastEntry.startTime,
          element: lastEntry.element?.tagName || 'unknown',
          size: lastEntry.size,
          url: lastEntry.url
        });
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // FCP Observer
      const fcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        this.trackEvent('performance_metric', {
          type: 'FCP',
          value: entries[0].startTime
        });
      });
      fcpObserver.observe({ entryTypes: ['paint'] });

      // FID Observer (First Input Delay)
      const fidObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          this.trackEvent('performance_metric', {
            type: 'FID',
            value: entry.processingStart - entry.startTime,
            name: entry.name
          });
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // CLS Observer (Cumulative Layout Shift)
      const clsObserver = new PerformanceObserver((entryList) => {
        let clsValue = 0;
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        this.trackEvent('performance_metric', {
          type: 'CLS',
          value: clsValue
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

      // Resource Timing Observer
      const resourceObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          this.trackEvent('performance_metric', {
            type: 'RESOURCE',
            name: entry.name,
            duration: entry.duration,
            size: entry.transferSize,
            initiatorType: entry.initiatorType
          });
        });
      });
      resourceObserver.observe({ entryTypes: ['resource'] });

      // Navigation Timing
      const navigationEntry = performance.getEntriesByType('navigation')[0];
      if (navigationEntry) {
        this.trackEvent('performance_metric', {
          type: 'NAVIGATION',
          ttfb: navigationEntry.responseStart - navigationEntry.requestStart,
          domContentLoaded: navigationEntry.domContentLoadedEventEnd - navigationEntry.startTime,
          load: navigationEntry.loadEventEnd - navigationEntry.startTime,
          dns: navigationEntry.domainLookupEnd - navigationEntry.domainLookupStart,
          tcp: navigationEntry.connectEnd - navigationEntry.connectStart,
          request: navigationEntry.responseEnd - navigationEntry.requestStart
        });
      }
    }
  }

  getOrCreateSessionId() {
    // If session ID is provided in config, use it
    if (this.config.sessionId) {
      sessionStorage.setItem('tracker_session_id', this.config.sessionId);
      return this.config.sessionId;
    }

    // Otherwise, get existing or create new session ID
    const sessionId = sessionStorage.getItem('tracker_session_id');
    if (sessionId) {
      return sessionId;
    }
    const newSessionId = this.generateUUID();
    sessionStorage.setItem('tracker_session_id', newSessionId);
    return newSessionId;
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  setupEventListeners() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest(this.config.selector);
      if (target) {
        const itemId = target.getAttribute(this.config.dataAttribute);
        if (itemId) {
          // Find all matching elements and get the index of the clicked one
          const allElements = document.querySelectorAll(this.config.selector);
          const position = Array.from(allElements).indexOf(target) + 1; // +1 for 1-based indexing
          
          // Get searchRequestId from data attribute or use the one from config
          const searchRequestId = target.getAttribute(this.config.searchRequestIdAttribute) || this.config.searchRequestId;
          
          this.trackClick({
            itemId,
            position,
            searchRequestId,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.trackEvent('visibility_change', {
        state: document.visibilityState
      });
    });

    // Track page unload
    window.addEventListener('beforeunload', () => {
      this.sendEvents(true); // Force send on page unload
    });
  }

  setupBatchSending() {
    setInterval(() => {
      if (this.events.length > 0) {
        this.sendEvents();
      }
    }, this.config.sendInterval);
  }

  trackEvent(eventName, eventData = {}) {
    this.events.push({
      type: 'custom_event',
      name: eventName,
      data: eventData,
      sessionId: this.sessionId,
      colorIdentifier: this.colorIdentifier,
      timestamp: new Date().toISOString()
    });

    if (this.events.length >= this.config.batchSize) {
      this.sendEvents();
    }
  }

  trackClick(clickData) {
    this.events.push({
      type: 'click',
      ...clickData,
      sessionId: this.sessionId,
      colorIdentifier: this.colorIdentifier
    });

    if (this.events.length >= this.config.batchSize) {
      this.sendEvents();
    }
  }

  async sendEvents(useSendBeacon = false) {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    const data = {
      events: eventsToSend,
      sessionId: this.sessionId,
      colorIdentifier: this.colorIdentifier,
      browserInfo: this.browserInfo,
      utmParams: this.utmParams,
      timestamp: new Date().toISOString()
    };

    try {
      if (useSendBeacon && navigator.sendBeacon) {
        // Use sendBeacon for more reliable sending, especially during page unload
        const success = navigator.sendBeacon(
          this.config.endpoint,
          new Blob([JSON.stringify(data)], { type: 'application/json' })
        );
        
        if (!success) {
          // If sendBeacon fails, put events back in the queue
          this.events = [...eventsToSend, ...this.events];
          throw new Error('Failed to send events via sendBeacon');
        }
      } else {
        // Fallback to fetch for normal operation
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          // If sending fails, put events back in the queue
          this.events = [...eventsToSend, ...this.events];
          throw new Error('Failed to send events');
        }
      }
    } catch (error) {
      console.error('Error sending events:', error);
      // Put events back in the queue
      this.events = [...eventsToSend, ...this.events];
    }
  }

  resetSession() {
    sessionStorage.removeItem('tracker_session_id');
    this.sessionId = this.getOrCreateSessionId();
  }

  // Utility method to track conversion events
  trackConversion(conversionData) {
    this.trackEvent('conversion', conversionData);
    this.resetSession();
  }

  getOrCreateColorIdentifier() {
    let colorIdentifier = localStorage.getItem('colorschema_identifier');
    if (!colorIdentifier) {
      // Generate two random colors for anonymous identification
      const color1 = this.generateRandomColor();
      const color2 = this.generateRandomColor();
      colorIdentifier = `${color1}-${color2}`;
      localStorage.setItem('colorschema_identifier', colorIdentifier);
    }
    return colorIdentifier;
  }

  generateRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  getUtmParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmParams = {};
    const utmKeys = ['source', 'medium', 'campaign', 'term', 'content'];
    
    utmKeys.forEach(key => {
      const value = urlParams.get(`utm_${key}`);
      if (value) {
        utmParams[`utm_${key}`] = value;
      }
    });

    return utmParams;
  }

  // Add method to update searchRequestId
  updateSearchRequestId(searchRequestId) {
    this.config.searchRequestId = searchRequestId;
  }
}

// Export for both module and global usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchBehaviorAnalysisCollector;
} else {
  window.SearchBehaviorAnalysisCollector = SearchBehaviorAnalysisCollector;
} 