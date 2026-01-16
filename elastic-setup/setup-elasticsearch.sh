#!/bin/bash

# =============================================================================
# Elasticsearch Setup Script for Search Behavior Analysis
# =============================================================================
# This script creates ILM policies and index templates for storing search
# behavior data optimized for Learn to Rank (LTR) model training.
#
# Usage:
#   ES_HOST=https://localhost:9200 ES_USER=elastic ES_PASSWORD=changeme ./setup-elasticsearch.sh
#
# Or with API key:
#   ES_HOST=https://localhost:9200 ES_API_KEY=your-api-key ./setup-elasticsearch.sh
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
ES_HOST="${ES_HOST:-http://localhost:9200}"
ES_USER="${ES_USER:-}"
ES_PASSWORD="${ES_PASSWORD:-}"
ES_API_KEY="${ES_API_KEY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Build curl authentication arguments
get_auth_args() {
    if [ -n "$ES_API_KEY" ]; then
        echo "-H \"Authorization: ApiKey $ES_API_KEY\""
    elif [ -n "$ES_USER" ] && [ -n "$ES_PASSWORD" ]; then
        echo "-u \"$ES_USER:$ES_PASSWORD\""
    else
        echo ""
    fi
}

# Execute Elasticsearch API call
es_call() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    local auth_args=$(get_auth_args)
    local url="${ES_HOST}${endpoint}"
    
    if [ -n "$data" ]; then
        eval curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            $auth_args \
            -d "'$data'"
    else
        eval curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            $auth_args
    fi
}

# Check if Elasticsearch is reachable
check_connection() {
    log_info "Checking Elasticsearch connection..."
    local response=$(es_call "GET" "/" "")
    
    if echo "$response" | grep -q "cluster_name"; then
        local cluster_name=$(echo "$response" | grep -o '"cluster_name" *: *"[^"]*"' | cut -d'"' -f4)
        local version=$(echo "$response" | grep -o '"number" *: *"[^"]*"' | head -1 | cut -d'"' -f4)
        log_success "Connected to Elasticsearch cluster: $cluster_name (version: $version)"
        return 0
    else
        log_error "Failed to connect to Elasticsearch at $ES_HOST"
        log_error "Response: $response"
        return 1
    fi
}

# -----------------------------------------------------------------------------
# ILM Policy
# -----------------------------------------------------------------------------
create_ilm_policy() {
    log_info "Creating ILM policy: search-behavior-ilm-policy"
    
    local ilm_policy='{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "20gb"
          },
          "set_priority": {
            "priority": 100
          },
          "forcemerge": {
            "max_num_segments": 1
          }
        }
      }
    }
  }
}'

    local response=$(es_call "PUT" "/_ilm/policy/search-behavior-ilm-policy" "$ilm_policy")
    
    if echo "$response" | grep -q '"acknowledged":true'; then
        log_success "ILM policy created successfully"
    else
        log_warning "ILM policy response: $response"
    fi
}

# -----------------------------------------------------------------------------
# Events Index Template
# -----------------------------------------------------------------------------
create_events_template() {
    log_info "Creating index template: search-behavior-events"
    
    local template='{
  "index_patterns": ["search-behavior-events-*"],
  "priority": 500,
  "template": {
    "settings": {
      "index": {
        "number_of_shards": 4,
        "number_of_replicas": 1,
        "lifecycle": {
          "name": "search-behavior-ilm-policy",
          "rollover_alias": "search-behavior-events"
        },
        "refresh_interval": "5s"
      }
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "timestamp": {
          "type": "date",
          "format": "strict_date_optional_time||epoch_millis"
        },
        "sessionId": {
          "type": "keyword"
        },
        "colorIdentifier": {
          "type": "keyword"
        },
        "events": {
          "type": "nested",
          "properties": {
            "type": {
              "type": "keyword"
            },
            "name": {
              "type": "keyword"
            },
            "itemId": {
              "type": "keyword"
            },
            "position": {
              "type": "integer"
            },
            "searchRequestId": {
              "type": "keyword"
            },
            "timestamp": {
              "type": "date",
              "format": "strict_date_optional_time||epoch_millis"
            },
            "sessionId": {
              "type": "keyword"
            },
            "data": {
              "type": "object",
              "enabled": true,
              "dynamic": true
            }
          }
        },
        "browserInfo": {
          "type": "object",
          "properties": {
            "userAgent": {
              "type": "keyword",
              "ignore_above": 512
            },
            "language": {
              "type": "keyword"
            },
            "platform": {
              "type": "keyword"
            },
            "screenWidth": {
              "type": "integer"
            },
            "screenHeight": {
              "type": "integer"
            },
            "viewportWidth": {
              "type": "integer"
            },
            "viewportHeight": {
              "type": "integer"
            },
            "devicePixelRatio": {
              "type": "float"
            },
            "timezone": {
              "type": "keyword"
            },
            "timestamp": {
              "type": "date",
              "format": "strict_date_optional_time||epoch_millis"
            },
            "domain": {
              "type": "keyword"
            },
            "path": {
              "type": "keyword"
            },
            "browser": {
              "type": "keyword"
            },
            "connection": {
              "type": "object",
              "properties": {
                "effectiveType": {
                  "type": "keyword"
                },
                "downlink": {
                  "type": "float"
                },
                "rtt": {
                  "type": "integer"
                },
                "saveData": {
                  "type": "boolean"
                }
              }
            },
            "memory": {
              "type": "object",
              "properties": {
                "deviceMemory": {
                  "type": "float"
                },
                "hardwareConcurrency": {
                  "type": "integer"
                }
              }
            }
          }
        },
        "utmParams": {
          "type": "object",
          "properties": {
            "utm_source": {
              "type": "keyword"
            },
            "utm_medium": {
              "type": "keyword"
            },
            "utm_campaign": {
              "type": "keyword"
            },
            "utm_term": {
              "type": "keyword"
            },
            "utm_content": {
              "type": "keyword"
            }
          }
        }
      }
    }
  }
}'

    local response=$(es_call "PUT" "/_index_template/search-behavior-events" "$template")
    
    if echo "$response" | grep -q '"acknowledged":true'; then
        log_success "Events index template created successfully"
    else
        log_warning "Events template response: $response"
    fi
}

# -----------------------------------------------------------------------------
# Performance Metrics Index Template
# -----------------------------------------------------------------------------
create_metrics_template() {
    log_info "Creating index template: search-behavior-metrics"
    
    local template='{
  "index_patterns": ["search-behavior-metrics-*"],
  "priority": 500,
  "template": {
    "settings": {
      "index": {
        "number_of_shards": 4,
        "number_of_replicas": 1,
        "lifecycle": {
          "name": "search-behavior-ilm-policy",
          "rollover_alias": "search-behavior-metrics"
        },
        "refresh_interval": "5s"
      }
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "timestamp": {
          "type": "date",
          "format": "strict_date_optional_time||epoch_millis"
        },
        "sessionId": {
          "type": "keyword"
        },
        "colorIdentifier": {
          "type": "keyword"
        },
        "performanceMetrics": {
          "type": "nested",
          "properties": {
            "type": {
              "type": "keyword"
            },
            "value": {
              "type": "float"
            },
            "element": {
              "type": "keyword"
            },
            "size": {
              "type": "long"
            },
            "url": {
              "type": "keyword",
              "ignore_above": 2048
            },
            "name": {
              "type": "keyword",
              "ignore_above": 2048
            },
            "duration": {
              "type": "float"
            },
            "initiatorType": {
              "type": "keyword"
            },
            "ttfb": {
              "type": "float"
            },
            "domContentLoaded": {
              "type": "float"
            },
            "load": {
              "type": "float"
            },
            "dns": {
              "type": "float"
            },
            "tcp": {
              "type": "float"
            },
            "request": {
              "type": "float"
            },
            "timestamp": {
              "type": "date",
              "format": "strict_date_optional_time||epoch_millis"
            },
            "sessionId": {
              "type": "keyword"
            }
          }
        },
        "browserInfo": {
          "type": "object",
          "properties": {
            "userAgent": {
              "type": "keyword",
              "ignore_above": 512
            },
            "language": {
              "type": "keyword"
            },
            "platform": {
              "type": "keyword"
            },
            "screenWidth": {
              "type": "integer"
            },
            "screenHeight": {
              "type": "integer"
            },
            "viewportWidth": {
              "type": "integer"
            },
            "viewportHeight": {
              "type": "integer"
            },
            "devicePixelRatio": {
              "type": "float"
            },
            "timezone": {
              "type": "keyword"
            },
            "timestamp": {
              "type": "date",
              "format": "strict_date_optional_time||epoch_millis"
            },
            "domain": {
              "type": "keyword"
            },
            "path": {
              "type": "keyword"
            },
            "browser": {
              "type": "keyword"
            },
            "connection": {
              "type": "object",
              "properties": {
                "effectiveType": {
                  "type": "keyword"
                },
                "downlink": {
                  "type": "float"
                },
                "rtt": {
                  "type": "integer"
                },
                "saveData": {
                  "type": "boolean"
                }
              }
            },
            "memory": {
              "type": "object",
              "properties": {
                "deviceMemory": {
                  "type": "float"
                },
                "hardwareConcurrency": {
                  "type": "integer"
                }
              }
            }
          }
        }
      }
    }
  }
}'

    local response=$(es_call "PUT" "/_index_template/search-behavior-metrics" "$template")
    
    if echo "$response" | grep -q '"acknowledged":true'; then
        log_success "Metrics index template created successfully"
    else
        log_warning "Metrics template response: $response"
    fi
}

# -----------------------------------------------------------------------------
# Create Initial Indices with Write Aliases
# -----------------------------------------------------------------------------
create_initial_indices() {
    log_info "Creating initial indices with write aliases..."
    
    # Create initial events index
    local events_index='{
  "aliases": {
    "search-behavior-events": {
      "is_write_index": true
    }
  }
}'
    
    local response=$(es_call "PUT" "/search-behavior-events-000001" "$events_index")
    
    if echo "$response" | grep -q '"acknowledged":true'; then
        log_success "Initial events index created: search-behavior-events-000001"
    elif echo "$response" | grep -q "resource_already_exists_exception"; then
        log_warning "Events index already exists, skipping..."
    else
        log_warning "Events index response: $response"
    fi
    
    # Create initial metrics index
    local metrics_index='{
  "aliases": {
    "search-behavior-metrics": {
      "is_write_index": true
    }
  }
}'
    
    response=$(es_call "PUT" "/search-behavior-metrics-000001" "$metrics_index")
    
    if echo "$response" | grep -q '"acknowledged":true'; then
        log_success "Initial metrics index created: search-behavior-metrics-000001"
    elif echo "$response" | grep -q "resource_already_exists_exception"; then
        log_warning "Metrics index already exists, skipping..."
    else
        log_warning "Metrics index response: $response"
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    echo ""
    echo "=============================================="
    echo "  Elasticsearch Search Behavior Setup"
    echo "  Optimized for Learn to Rank (LTR)"
    echo "=============================================="
    echo ""
    
    log_info "Elasticsearch Host: $ES_HOST"
    
    if [ -n "$ES_API_KEY" ]; then
        log_info "Authentication: API Key"
    elif [ -n "$ES_USER" ]; then
        log_info "Authentication: Basic Auth (user: $ES_USER)"
    else
        log_warning "No authentication configured"
    fi
    
    echo ""
    
    # Check connection
    if ! check_connection; then
        exit 1
    fi
    
    echo ""
    
    # Create ILM policy
    create_ilm_policy
    
    # Create index templates
    create_events_template
    create_metrics_template
    
    # Create initial indices
    create_initial_indices
    
    echo ""
    echo "=============================================="
    log_success "Setup completed successfully!"
    echo "=============================================="
    echo ""
    echo "Next steps:"
    echo "  1. Configure your backend to send events to the 'search-behavior-events' alias"
    echo "  2. Configure your backend to send metrics to the 'search-behavior-metrics' alias"
    echo "  3. For LTR training, query using nested queries on the events field"
    echo ""
    echo "Example document structure for events:"
    echo '  POST /search-behavior-events/_doc'
    echo '  {'
    echo '    "timestamp": "2024-01-01T12:00:00Z",'
    echo '    "sessionId": "uuid",'
    echo '    "colorIdentifier": "#FF5733-#33FF57",'
    echo '    "events": [{ "type": "click", "itemId": "123", "position": 3, "searchRequestId": "search-456" }],'
    echo '    "browserInfo": { ... },'
    echo '    "utmParams": { ... }'
    echo '  }'
    echo ""
}

main "$@"
