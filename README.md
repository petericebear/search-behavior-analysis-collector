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
- Comprehensive performance metrics tracking per page path
- Anonymous user tracking with color codes
- Page visibility and unload tracking
- Search request ID tracking for correlating clicks with search requests
- Path-based metrics collection for single-page applications

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
  metricsEndpoint: 'https://your-api-endpoint.com/metrics', // Optional: separate endpoint for metrics
  selector: '.your-item-class', // CSS selector for trackable items
  dataAttribute: 'data-item-id', // Attribute containing the item ID
  searchRequestIdAttribute: 'data-search-request-id', // Attribute containing the search request ID
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  batchSize: 10, // Number of events to batch before sending
  sendInterval: 10000, // Send interval in milliseconds (10 seconds)
  sessionId: 'backend-generated-session-id', // Optional: Inject session ID from backend
  searchRequestId: 'current-search-request-id', // Optional: Inject search request ID from backend
  performanceMetricsEnabled: true // Optional: Enable/disable performance metrics collection
});
```

### Path-Based Metrics Collection

The collector automatically tracks performance metrics for each unique path in your application:

- Initial page load
- Client-side navigation (pushState/replaceState)
- Browser back/forward navigation
- Direct URL changes

Metrics are collected and sent separately for each path, allowing you to analyze performance across different pages of your application. The collector handles:

- Automatic observer cleanup and reset on path changes
- Path-specific performance metrics
- Proper cleanup of resources when destroyed

### Session Management

The collector supports two session management modes:

1. **Automatic Session Generation** (default):
   - Generates a new UUID for each session
   - Stores session ID in localStorage for persistence across browser sessions
   - Includes session timestamp for expiration tracking
   - Automatically expires sessions after the configured timeout period
   - Resets on conversion or timeout
   - Checks session expiration every minute

2. **Backend Session Injection**:
   - Accepts session ID from backend through config
   - Useful for maintaining session consistency across page loads
   - Example:
   ```javascript
   // Server-side rendered session ID
   const sessionId = document.querySelector('meta[name="session-id"]').content;
   
   const collector = new SearchBehaviorAnalysisCollector({
     sessionId: sessionId,
     sessionTimeout: 30 * 60 * 1000, // 30 minutes
     // ... other config options
   });
   ```

### Session Expiration

Sessions are managed with the following rules:
- Sessions persist across browser restarts using localStorage
- Each session has a timestamp that's checked for expiration
- Sessions automatically expire after the configured timeout period
- Expired sessions are automatically reset with a new session ID
- Session expiration is checked every minute
- Sessions can be manually reset using `resetSession()`

### Tracking Clicks

Add the specified class and data attributes to your trackable elements:

```html
<div class="your-item-class" data-item-id="123" data-search-request-id="search-456">
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

### React Integration

When using with React, you can update the search request ID programmatically:

```javascript
// In your React component
useEffect(() => {
  // Update search request ID when search results change
  collector.updateSearchRequestId(newSearchRequestId);
}, [newSearchRequestId]);
```

### Cleanup

When you need to remove the collector (e.g., when unmounting a component), call the `destroy()` method:

```javascript
// Clean up event listeners, intervals, and performance observers
collector.destroy();
```

This will:
- Clear all intervals (session check, batch sending)
- Disconnect performance observers
- Remove event listeners (click, visibility, popstate, beforeunload)
- Restore original history methods (pushState, replaceState)

## Configuration Options

- `endpoint`: API endpoint for sending tracking data (defaults to '/api/track')
- `metricsEndpoint`: API endpoint for sending performance metrics (defaults to '/api/metrics')
- `selector`: CSS selector for trackable items (defaults to '.trackable-item')
- `dataAttribute`: Attribute name containing the item ID (defaults to 'data-item-id')
- `searchRequestIdAttribute`: Attribute name containing the search request ID (defaults to 'data-search-request-id')
- `sessionTimeout`: Session timeout in milliseconds (defaults to 30 minutes)
- `batchSize`: Number of events to batch before sending (defaults to 10)
- `sendInterval`: Interval for sending batched events in milliseconds (defaults to 10 seconds)
- `sessionId`: Optional session ID to inject from backend
- `searchRequestId`: Optional search request ID to inject from backend
- `performanceMetricsEnabled`: Enable/disable performance metrics collection (defaults to true)

## Performance Metrics

The collector automatically collects the following performance metrics for each page path:

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
- Current domain and path
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

## Data Structure

The collector sends data in two different formats depending on the type of data being sent:

### Event Payload
```javascript
{
  events: [
    {
      type: 'click',
      itemId: '123',
      position: 3, // Position of the clicked element (1-based index)
      searchRequestId: 'search-456', // ID of the search request that generated these results
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid'
    },
    {
      type: 'custom_event',
      name: 'view_item',
      data: {
        itemId: '123',
        category: 'electronics',
        price: 99.99
      },
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid'
    }
  ],
  sessionId: 'uuid',
  colorIdentifier: '#FF5733-#33FF57', // Session-level anonymous identifier
  timestamp: '2024-01-01T12:00:00Z',
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
    domain: 'example.com',
    path: '/products/shoes',
    connection: {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false
    },
    memory: {
      deviceMemory: 8,
      hardwareConcurrency: 4
    }
  },
  utmParams: {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'summer_sale'
  }
}
```

### Performance Metrics Payload
```javascript
{
  performanceMetrics: [
    {
      type: 'LCP',
      value: 1200,
      element: 'IMG',
      size: 15000,
      url: 'https://example.com/image.jpg',
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid'
    },
    {
      type: 'FCP',
      value: 800,
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid'
    },
    {
      type: 'FID',
      value: 50,
      name: 'click',
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid'
    },
    {
      type: 'CLS',
      value: 0.1,
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid'
    },
    {
      type: 'RESOURCE',
      name: 'https://example.com/script.js',
      duration: 150,
      size: 25000,
      initiatorType: 'script',
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid'
    },
    {
      type: 'NAVIGATION',
      ttfb: 200,
      domContentLoaded: 800,
      load: 1200,
      dns: 50,
      tcp: 100,
      request: 300,
      timestamp: '2024-01-01T12:00:00Z',
      sessionId: 'uuid'
    }
  ],
  sessionId: 'uuid',
  colorIdentifier: '#FF5733-#33FF57',
  browserInfo: {
    // Same browser info structure as event payload
  },
  timestamp: '2024-01-01T12:00:00Z'
}
```

Performance metrics are sent to a separate endpoint (`metricsEndpoint`) and are sent immediately when collected to ensure timely data. Regular events are batched and sent according to the configured batch size and interval.

### Data Sending

The collector uses two methods for sending data:

1. **Regular Operation**: Uses the Fetch API to send batched events
2. **Page Unload**: Uses the sendBeacon API to ensure reliable sending during page unload

This ensures that no data is lost, even when the user navigates away from the page.

## Elasticsearch Setup

The project includes an Elasticsearch setup script optimized for storing search behavior data for Learn to Rank (LTR) model training.

### Prerequisites

- Elasticsearch 8.x running and accessible
- `curl` installed on your system

### Running the Setup Script

Navigate to the `elastic-setup` directory and run the setup script:

```bash
# With basic authentication
ES_HOST=https://localhost:9200 ES_USER=elastic ES_PASSWORD=changeme ./elastic-setup/setup-elasticsearch.sh

# With API key authentication
ES_HOST=https://localhost:9200 ES_API_KEY=your-api-key ./elastic-setup/setup-elasticsearch.sh

# Local development (no auth)
ES_HOST=http://localhost:9200 ./elastic-setup/setup-elasticsearch.sh
```

### What the Script Creates

#### 1. ILM Policy (`search-behavior-ilm-policy`)

An Index Lifecycle Management policy optimized for LTR workloads:

- **Hot Phase**: Active indexing with 4 primary shards
- **Rollover**: Triggers at 20GB max primary shard size
- **Force Merge**: Reduces to 1 segment after rollover (optimizes read performance for ML training)

#### 2. Events Index Template (`search-behavior-events`)

Stores click events, custom events, and conversions with the following field types:

| Field | Type | Purpose |
|-------|------|---------|
| `sessionId` | keyword | User session identification |
| `colorIdentifier` | keyword | Anonymous user tracking |
| `events.type` | keyword | Event type (click, custom_event, conversion) |
| `events.itemId` | keyword | Clicked/viewed item ID |
| `events.position` | integer | Position in search results (1-based) |
| `events.searchRequestId` | keyword | Links clicks to search queries |
| `browserInfo.*` | keyword/integer | Browser and device context |
| `utmParams.*` | keyword | Marketing attribution |
| `timestamp` | date | Event timestamp |

#### 3. Metrics Index Template (`search-behavior-metrics`)

Stores performance metrics (Core Web Vitals, Navigation Timing, Resource Timing):

| Field | Type | Purpose |
|-------|------|---------|
| `performanceMetrics.type` | keyword | Metric type (LCP, FCP, FID, CLS, etc.) |
| `performanceMetrics.value` | float | Metric value |
| `performanceMetrics.element` | keyword | DOM element (for LCP) |
| `performanceMetrics.duration` | float | Resource load duration |
| `performanceMetrics.ttfb` | float | Time to First Byte |
| `timestamp` | date | Metric timestamp |

### Indexing Data

After running the setup script, send data to the write aliases:

```bash
# Index an event document
curl -X POST "localhost:9200/search-behavior-events/_doc" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2024-01-01T12:00:00Z",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "colorIdentifier": "#FF5733-#33FF57",
    "events": [{
      "type": "click",
      "itemId": "product-123",
      "position": 3,
      "searchRequestId": "search-456",
      "timestamp": "2024-01-01T12:00:00Z",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000"
    }],
    "browserInfo": {
      "browser": "Chrome",
      "platform": "MacIntel",
      "language": "en-US"
    },
    "utmParams": {
      "utm_source": "google",
      "utm_medium": "cpc"
    }
  }'

# Index a metrics document
curl -X POST "localhost:9200/search-behavior-metrics/_doc" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2024-01-01T12:00:00Z",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "colorIdentifier": "#FF5733-#33FF57",
    "performanceMetrics": [{
      "type": "LCP",
      "value": 1200,
      "element": "IMG",
      "timestamp": "2024-01-01T12:00:00Z",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000"
    }]
  }'
```

### Querying for LTR Training Data

Extract click-through data for training Learn to Rank models:

```bash
# Get all clicks with position data for a specific search request
curl -X GET "localhost:9200/search-behavior-events/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "nested": {
        "path": "events",
        "query": {
          "bool": {
            "must": [
              { "term": { "events.type": "click" } },
              { "term": { "events.searchRequestId": "search-456" } }
            ]
          }
        },
        "inner_hits": {}
      }
    }
  }'

# Aggregate clicks by position for click model training
curl -X GET "localhost:9200/search-behavior-events/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "size": 0,
    "aggs": {
      "clicks": {
        "nested": { "path": "events" },
        "aggs": {
          "by_position": {
            "terms": { "field": "events.position" },
            "aggs": {
              "by_item": {
                "terms": { "field": "events.itemId" }
              }
            }
          }
        }
      }
    }
  }'
```

### LTR Data Model

The schema is designed for Learn to Rank with:

- **Click-through signals**: `itemId`, `position`, `searchRequestId` to build click models
- **Session context**: `sessionId`, `colorIdentifier` for user-level features
- **Query-document pairs**: Link via `searchRequestId` to your search query logs
- **Behavioral features**: Event types, timestamps for engagement scoring