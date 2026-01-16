class SearchBehaviorAnalysisCollector {
  constructor(config = {}) {
    this.config = {
      endpoint: config.endpoint || '/api/track',
      metricsEndpoint: config.metricsEndpoint || '/api/metrics',
      selector: config.selector || '.trackable-item',
      dataAttribute: config.dataAttribute || 'data-item-id',
      searchRequestIdAttribute: config.searchRequestIdAttribute || 'data-search-request-id',
      sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30 minutes
      batchSize: config.batchSize || 10,
      sendInterval: config.sendInterval || 10000, // 10 seconds
      sessionId: config.sessionId || null, // Allow session ID injection
      searchRequestId: config.searchRequestId || null, // Allow searchRequestId injection
      performanceMetricsEnabled: config.performanceMetricsEnabled !== false, // Default to true
    };

    this.events = [];
    this.performanceMetrics = []; // Separate array for performance metrics
    this.sessionId = this.getOrCreateSessionId();
    this.browserInfo = this.getBrowserInfo();
    this.colorIdentifier = this.getOrCreateColorIdentifier();
    this.utmParams = this.getUtmParameters();
    this.currentPath = window.location.pathname;
    this.setupEventListeners();
   
    if (this.config.performanceMetricsEnabled) {
      this.setupPerformanceObserver();
    }
    
    // Check session expiration periodically
    this._sessionInterval = setInterval(() => this.checkSessionExpiration(), 60000); // Check every minute
    // Batch sending interval
    this._batchInterval = setInterval(() => {
      if (this.events.length > 0) {
        this.sendEvents();
      }
    }, this.config.sendInterval);
  }

  getBrowserInfo() {
    const ua = navigator.userAgent;
    const browserInfo = {
      userAgent: ua,
      language: navigator.language,
      platform: navigator.userAgentData?.platform || navigator.platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString(),
      domain: window.location.hostname,
      path: window.location.pathname,
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
    // Disconnect existing observers if any
    if (this._observers) {
      this._observers.forEach(observer => observer.disconnect());
    }
    this._observers = [];

    if ('PerformanceObserver' in window) {
      // LCP Observer
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.trackPerformanceMetric({
          type: 'LCP',
          value: lastEntry.startTime,
          element: lastEntry.element?.tagName || 'unknown',
          size: lastEntry.size,
          url: lastEntry.url
        });
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this._observers.push(lcpObserver);

      // FCP Observer
      const fcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        this.trackPerformanceMetric({
          type: 'FCP',
          value: entries[0].startTime
        });
      });
      fcpObserver.observe({ entryTypes: ['paint'] });
      this._observers.push(fcpObserver);

      // FID Observer (First Input Delay)
      const fidObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          this.trackPerformanceMetric({
            type: 'FID',
            value: entry.processingStart - entry.startTime,
            name: entry.name
          });
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
      this._observers.push(fidObserver);

      // CLS Observer (Cumulative Layout Shift)
      const clsObserver = new PerformanceObserver((entryList) => {
        let clsValue = 0;
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        this.trackPerformanceMetric({
          type: 'CLS',
          value: clsValue
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this._observers.push(clsObserver);

      // Resource Timing Observer
      const resourceObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          this.trackPerformanceMetric({
            type: 'RESOURCE',
            name: entry.name,
            duration: entry.duration,
            size: entry.transferSize,
            initiatorType: entry.initiatorType
          });
        });
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
      this._observers.push(resourceObserver);

      // Navigation Timing
      const navigationEntry = performance.getEntriesByType('navigation')[0];
      if (navigationEntry) {
        this.trackPerformanceMetric({
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

  trackPerformanceMetric(metricData) {
    this.performanceMetrics.push({
      ...metricData,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    });

    // Send performance metrics immediately to ensure timely data
    this.sendPerformanceMetrics();
  }

  async sendPerformanceMetrics() {
    if (this.performanceMetrics.length === 0) return;

    const metricsToSend = [...this.performanceMetrics];
    this.performanceMetrics = [];

    const data = {
      performanceMetrics: metricsToSend,
      sessionId: this.sessionId,
      colorIdentifier: this.colorIdentifier,
      browserInfo: this.browserInfo,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(this.config.metricsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        // Put metrics back in the queue
        this.performanceMetrics = [...metricsToSend, ...this.performanceMetrics];
        throw new Error('Failed to send performance metrics');
      }
    } catch (error) {
      console.error('Error sending performance metrics:', error);
      // Put metrics back in the queue
      this.performanceMetrics = [...metricsToSend, ...this.performanceMetrics];
    }
  }

  getOrCreateSessionId() {
    // If session ID is provided in config, use it
    if (this.config.sessionId) {
      localStorage.setItem('tracker_session_id', this.config.sessionId);
      localStorage.setItem('tracker_session_timestamp', new Date().toISOString());
      return this.config.sessionId;
    }

    // Get existing session ID from localStorage
    const sessionId = localStorage.getItem('tracker_session_id');
    const sessionTimestamp = localStorage.getItem('tracker_session_timestamp');

    // Check if session exists and hasn't expired
    if (sessionId && sessionTimestamp) {
      const sessionAge = new Date().getTime() - new Date(sessionTimestamp).getTime();
      if (sessionAge < this.config.sessionTimeout) {
        return sessionId;
      }
    }

    // Create new session if none exists or if expired
    const newSessionId = this.generateUUID();
    localStorage.setItem('tracker_session_id', newSessionId);
    localStorage.setItem('tracker_session_timestamp', new Date().toISOString());
    return newSessionId;
  }

  generateUUID() {
    // Use native crypto.randomUUID() if available (modern browsers)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  setupEventListeners() {
    // Store listener references for cleanup
    this._clickListener = (event) => {
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
    };
    document.addEventListener('click', this._clickListener);

    // Track page visibility changes
    this._visibilityListener = () => {
      this.trackEvent('visibility_change', {
        state: document.visibilityState
      });
    };
    document.addEventListener('visibilitychange', this._visibilityListener);

    // Track path changes - store original methods as instance properties
    this._originalPushState = history.pushState;
    this._originalReplaceState = history.replaceState;

    history.pushState = function(state, title, url) {
      this._originalPushState.call(history, state, title, url);
      this.handlePathChange();
    }.bind(this);

    history.replaceState = function(state, title, url) {
      this._originalReplaceState.call(history, state, title, url);
      this.handlePathChange();
    }.bind(this);

    // Listen for popstate events (back/forward navigation)
    this._popstateListener = () => {
      this.handlePathChange();
    };
    window.addEventListener('popstate', this._popstateListener);

    // Track page unload
    this._beforeunloadListener = () => {
      this.sendEvents(true); // Force send on page unload
    };
    window.addEventListener('beforeunload', this._beforeunloadListener);
  }

  handlePathChange() {
    const newPath = window.location.pathname;
    if (newPath !== this.currentPath) {
      this.currentPath = newPath;
      this.browserInfo = this.getBrowserInfo(); // Update browser info with new path
      
      // Reset performance observers for the new page
      if (this.config.performanceMetricsEnabled) {
        this.setupPerformanceObserver();
      }
    }
  }

  trackEvent(eventName, eventData = {}) {
    this.events.push({
      type: 'custom_event',
      name: eventName,
      data: eventData,
      sessionId: this.sessionId,
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
      sessionId: this.sessionId
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          // Put events back in the queue
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
    localStorage.removeItem('tracker_session_id');
    localStorage.removeItem('tracker_session_timestamp');
    this.sessionId = this.getOrCreateSessionId();
  }

  // Add method to check session expiration
  checkSessionExpiration() {
    const sessionTimestamp = localStorage.getItem('tracker_session_timestamp');
    if (sessionTimestamp) {
      const sessionAge = new Date().getTime() - new Date(sessionTimestamp).getTime();
      if (sessionAge >= this.config.sessionTimeout) {
        this.resetSession();
      }
    }
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

  destroy() {
    // Clear intervals
    if (this._sessionInterval) {
      clearInterval(this._sessionInterval);
    }
    if (this._batchInterval) {
      clearInterval(this._batchInterval);
    }

    // Disconnect performance observers
    if (this._observers) {
      this._observers.forEach(observer => observer.disconnect());
    }

    // Remove event listeners
    if (this._clickListener) {
      document.removeEventListener('click', this._clickListener);
    }
    if (this._visibilityListener) {
      document.removeEventListener('visibilitychange', this._visibilityListener);
    }
    if (this._popstateListener) {
      window.removeEventListener('popstate', this._popstateListener);
    }
    if (this._beforeunloadListener) {
      window.removeEventListener('beforeunload', this._beforeunloadListener);
    }

    // Restore original history methods
    if (this._originalPushState) {
      history.pushState = this._originalPushState;
    }
    if (this._originalReplaceState) {
      history.replaceState = this._originalReplaceState;
    }
  }
}

// Export for both module and global usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchBehaviorAnalysisCollector;
  module.exports.default = SearchBehaviorAnalysisCollector;
} else {
  window.SearchBehaviorAnalysisCollector = SearchBehaviorAnalysisCollector;
} 