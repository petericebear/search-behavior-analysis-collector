# Search Behavior Analysis Collector

A lightweight, vanilla JavaScript collector for user behavior and click tracking. This collector is designed to gather data for training learn-to-rank models.

## Features

- Click position tracking for specified elements
- Custom event tracking
- Session management with automatic reset after conversion
- Batch sending of events using both fetch and sendBeacon APIs
- Configurable selectors and data attributes
- Minified output for production use
- Browser information collection
- Comprehensive performance metrics tracking
- Anonymous user tracking with color codes
- Local IP address collection
- Page visibility and unload tracking

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the collector:
```bash
npm run build
```

The minified collector will be available in the `dist` directory as `tracker.min.js`.

## Usage

Include the collector in your HTML:

```html
<script src="path/to/tracker.min.js"></script>
```

Initialize the collector with your configuration:

```javascript
const collector = new SearchBehaviorAnalysisCollector({
  endpoint: 'https://your-api-endpoint.com/track',
  selector: '.your-item-class', // CSS selector for trackable items
  dataAttribute: 'data-item-id', // Attribute containing the item ID
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  batchSize: 10, // Number of events to batch before sending
  sendInterval: 10000, // Send interval in milliseconds (10 seconds)
  sessionId: 'backend-generated-session-id' // Optional: Inject session ID from backend
});
```

### Session Management

The collector supports two session management modes:

1. **Automatic Session Generation** (default):
   - Generates a new UUID for each session
   - Stores session ID in sessionStorage
   - Resets on conversion or timeout

2. **Backend Session Injection**:
   - Accepts session ID from backend through config
   - Useful for maintaining session consistency across page loads
   - Example:
   ```javascript
   // Server-side rendered session ID
   const sessionId = document.querySelector('meta[name="session-id"]').content;
   
   const collector = new SearchBehaviorAnalysisCollector({
     sessionId: sessionId,
     // ... other config options
   });
   ```

### Tracking Clicks

Add the specified class and data attribute to your trackable elements:

```html
<div class="your-item-class" data-item-id="123">
  Item content
</div>
```

### Custom Events

Track custom events:

```javascript
collector.trackEvent('view_item', {
  itemId: '123',
  category: 'electronics',
  price: 99.99
});
```

### Conversion Tracking

Track conversions and reset the session:

```javascript
collector.trackConversion({
  orderId: 'ORDER123',
  total: 149.99,
  items: ['123', '456']
});
```

## Configuration Options

- `endpoint`: API endpoint for sending tracking data
- `selector`: CSS selector for trackable items
- `dataAttribute`: Attribute name containing the item ID
- `sessionTimeout`: Session timeout in milliseconds
- `batchSize`: Number of events to batch before sending
- `sendInterval`: Interval for sending batched events

## Performance Metrics

The collector automatically collects the following performance metrics:

### Core Web Vitals
- **LCP (Largest Contentful Paint)**: Measures when the largest content element becomes visible
  - Includes element size and URL
- **FCP (First Contentful Paint)**: Measures when the browser renders the first piece of content
- **FID (First Input Delay)**: Measures the time from when a user first interacts with your site to the time when the browser is able to respond
- **CLS (Cumulative Layout Shift)**: Measures the sum total of all individual layout shift scores for every unexpected layout shift

### Navigation Timing
- **TTFB (Time to First Byte)**: Time between request and first byte of response
- **DOM Content Loaded**: Time until DOM is fully loaded
- **Page Load**: Total page load time
- **DNS Lookup**: Time spent in DNS lookup
- **TCP Connection**: Time spent establishing TCP connection
- **Request/Response**: Time spent in request/response cycle

### Resource Timing
- Resource loading durations
- Resource sizes
- Resource types
- Individual resource performance metrics

## Browser Information

The collector collects the following browser information with each event:

- User Agent
- Language
- Platform
- Screen dimensions
- Viewport dimensions
- Device pixel ratio
- Timezone
- Browser type
- IP Address
- Network Information
  - Connection type (4G, 5G, etc.)
  - Downlink speed
  - Round-trip time (RTT)
  - Data saver mode
- Device Capabilities
  - Device memory
  - CPU cores (hardware concurrency)

## Anonymous User Tracking

The collector implements anonymous user tracking using a unique identifier composed of two random colors (e.g., "#FF5733-#33FF57"). This identifier is:
- Stored in localStorage as 'colorschema_identifier'
- Persists across sessions
- Provides visual identification without personal data
- Included with every event as colorIdentifier

## IP Address Collection

The collector uses WebRTC to collect the user's IP address locally, without relying on external services. This approach:
- Works without external API calls
- Respects user privacy
- Filters out private IP addresses
- Provides public IP address information
- Handles cleanup automatically

## Data Structure

The collector sends data in the following format:

```javascript
{
  events: [
    {
      type: 'click',
      itemId: '123',
      x: 100,
      y: 200,
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid',
      colorIdentifier: '#FF5733-#33FF57',
      browserInfo: {
        userAgent: '...',
        language: 'en-US',
        platform: 'MacIntel',
        screenWidth: 1920,
        screenHeight: 1080,
        viewportWidth: 1280,
        viewportHeight: 800,
        devicePixelRatio: 2,
        timezone: 'America/New_York',
        browser: 'Chrome',
        ipAddress: '123.45.67.89',
        connection: {
          effectiveType: '4g',
          downlink: 10,
          rtt: 50,
          saveData: false
        },
        memory: {
          deviceMemory: 8,
          hardwareConcurrency: 4
        },
        timestamp: '2024-01-01T12:00:00Z'
      }
    },
    {
      type: 'performance_metric',
      name: 'LCP',
      value: 1200,
      element: 'IMG',
      size: 15000,
      url: 'https://example.com/image.jpg',
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid',
      colorIdentifier: '#FF5733-#33FF57',
      browserInfo: { /* ... */ }
    }
  ],
  sessionId: 'uuid',
  colorIdentifier: '#FF5733-#33FF57',
  browserInfo: { /* ... */ }
}
```

### Data Sending

The collector uses two methods for sending data:

1. **Regular Operation**: Uses the Fetch API to send batched events
2. **Page Unload**: Uses the sendBeacon API to ensure reliable sending during page unload

This ensures that no data is lost, even when the user navigates away from the page. 