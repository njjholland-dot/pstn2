# PSTN2 Implementation Guide

**Version:** 1.0
**Last Updated:** 2025-11-30
**Target Audience:** Software engineers implementing PSTN2 clients/servers

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture Patterns](#architecture-patterns)
3. [TypeScript Implementation](#typescript-implementation)
4. [Python Implementation](#python-implementation)
5. [Go Implementation](#go-implementation)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Guide](#deployment-guide)
8. [Performance Optimization](#performance-optimization)
9. [Security Checklist](#security-checklist)
10. [Common Pitfalls](#common-pitfalls)

---

## 1. Getting Started

### 1.1 Prerequisites

**Knowledge Required:**
- RESTful API design
- Cryptographic signatures (Ed25519)
- TLS/HTTPS
- Async/await patterns
- Error handling strategies

**Infrastructure:**
- TLS certificate (Let's Encrypt recommended)
- Public IP address with DNS
- Key management system (AWS KMS, HashiCorp Vault, etc.)
- Logging infrastructure (ELK, Datadog, etc.)

### 1.2 Quick Start Checklist

- [ ] Generate Ed25519 key pair
- [ ] Register RCPID with regulator
- [ ] Set up TLS endpoints
- [ ] Implement authentication API
- [ ] Implement routing API
- [ ] Cache directory locally
- [ ] Set up monitoring/alerting
- [ ] Test with other CPs
- [ ] Deploy with fallback to traditional PSTN

### 1.3 Development Environment

```bash
# Clone reference implementations (open source, public domain)
git clone https://github.com/njjholland-dot/pstn2.git
cd pstn2/code

# TypeScript
cd typescript
npm install
npm run build
npm test

# Python
cd python
pip install -r requirements.txt
pytest

# Go
cd go
go mod download
go test ./...
```

---

## 2. Architecture Patterns

### 2.1 Client Library Structure

**Recommended Module Structure:**
```
pstn2-client/
├── src/
│   ├── client.{ts,py,go}          # Main client class
│   ├── types.{ts,py,go}           # Type definitions
│   ├── errors.{ts,py,go}          # Error classes
│   ├── auth/                      # Authentication module
│   │   ├── direct-query.{...}
│   │   └── token-pool.{...}
│   ├── routing/                   # Routing module
│   ├── encryption/                # Encryption utilities
│   ├── emergency/                 # Emergency services
│   ├── directory/                 # Directory cache
│   ├── messaging/                 # HTTP client with retry
│   └── utils/
│       ├── crypto.{...}           # Cryptographic functions
│       └── logger.{...}           # Logging utilities
├── examples/                      # Usage examples
├── tests/                         # Test suite
└── docs/                          # API documentation
```

### 2.2 Server Implementation Structure

**Recommended Server Structure:**
```
pstn2-server/
├── src/
│   ├── server.{ts,py,go}          # HTTP server setup
│   ├── routes/                    # API route handlers
│   │   ├── auth.{...}
│   │   ├── routing.{...}
│   │   ├── emergency.{...}
│   │   └── directory.{...}
│   ├── middleware/                # Authentication, rate limiting
│   ├── models/                    # Data models
│   ├── services/                  # Business logic
│   │   ├── call-records.{...}    # Track active calls
│   │   ├── directory-sync.{...}  # Sync with other CPs
│   │   └── location.{...}        # Location services
│   └── utils/
│       ├── validation.{...}       # Request validation
│       └── signing.{...}          # Signature verification
├── config/                        # Configuration files
├── migrations/                    # Database migrations
└── tests/                         # Integration tests
```

### 2.3 Design Patterns

#### 2.3.1 Retry with Exponential Backoff

```typescript
// TypeScript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      if (!isRetryable(error)) throw error;

      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }
  throw new Error('Max retries exceeded');
}
```

```python
# Python
import asyncio
from typing import TypeVar, Callable

T = TypeVar('T')

async def retry_with_backoff(
    fn: Callable[[], T],
    max_retries: int = 3,
    base_delay: float = 0.1
) -> T:
    for i in range(max_retries):
        try:
            return await fn()
        except Exception as e:
            if i == max_retries - 1:
                raise
            if not is_retryable(e):
                raise

            delay = base_delay * (2 ** i)
            await asyncio.sleep(delay)
```

```go
// Go
func retryWithBackoff(
    fn func() error,
    maxRetries int,
    baseDelay time.Duration,
) error {
    for i := 0; i < maxRetries; i++ {
        err := fn()
        if err == nil {
            return nil
        }

        if i == maxRetries-1 {
            return err
        }
        if !isRetryable(err) {
            return err
        }

        delay := baseDelay * time.Duration(1<<uint(i))
        time.Sleep(delay)
    }
    return errors.New("max retries exceeded")
}
```

#### 2.3.2 Porting Chain Resolution

```typescript
// TypeScript
async function resolvePortingChain(
  phoneNumber: string,
  maxHops: number = 5
): Promise<{ cpId: string; endpoint: string; chain: string[] }> {
  const chain: string[] = [];
  let currentCP = await directory.lookup(phoneNumber);

  while (chain.length < maxHops) {
    chain.push(currentCP.cpId);

    const portingInfo = await checkPorting(currentCP, phoneNumber);
    if (!portingInfo.ported) {
      return { cpId: currentCP.cpId, endpoint: currentCP.endpoint, chain };
    }

    currentCP = await directory.lookup(phoneNumber, portingInfo.newRcpid);
  }

  throw new Error('Porting chain too long (possible loop)');
}
```

#### 2.3.3 Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

---

## 3. TypeScript Implementation

### 3.1 Project Setup

```bash
# Initialize project
mkdir pstn2-typescript && cd pstn2-typescript
npm init -y

# Install dependencies
npm install --save \
  axios axios-retry \
  joi \
  redis \
  uuid \
  winston

npm install --save-dev \
  @types/node \
  @types/jest \
  @types/uuid \
  typescript \
  ts-jest \
  jest \
  eslint \
  prettier
```

### 3.2 TypeScript Configuration

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "types": ["node", "jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 3.3 Core Client Implementation

```typescript
// src/client.ts
import { AuthenticationModule } from './auth';
import { RoutingModule } from './routing';
import { DirectoryModule } from './directory';
import { PSTN2Config } from './types';

export class PSTN2Client {
  public readonly auth: AuthenticationModule;
  public readonly routing: RoutingModule;
  public readonly directory: DirectoryModule;

  constructor(private config: PSTN2Config) {
    // Validate configuration
    this.validateConfig();

    // Initialize modules
    this.directory = new DirectoryModule(config);
    this.auth = new AuthenticationModule(config, this.directory);
    this.routing = new RoutingModule(config, this.directory);

    // Start background tasks
    this.startDirectorySync();
  }

  private validateConfig(): void {
    if (!this.config.cpId) {
      throw new Error('cpId is required');
    }
    if (!/^CP[12]-[A-Z]{2}-\d{4}$/.test(this.config.cpId)) {
      throw new Error('Invalid cpId format');
    }
    // ... more validation
  }

  private startDirectorySync(): void {
    // Sync directory every hour
    setInterval(() => {
      this.directory.sync().catch(console.error);
    }, 3600000);
  }

  async close(): Promise<void> {
    // Cleanup resources
    await this.directory.close();
  }
}
```

### 3.4 TypeScript Testing Strategy

```typescript
// src/client.test.ts
import { PSTN2Client } from './client';
import { AuthenticationMode } from './types';

describe('PSTN2Client', () => {
  let client: PSTN2Client;

  beforeEach(() => {
    client = new PSTN2Client({
      cpId: 'CP1-UK-0001',
      apiEndpoint: 'https://api.test.example.com',
      privateKey: 'test-private-key',
      authMode: AuthenticationMode.DirectQuery,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('verifyCall', () => {
    it('should verify legitimate call', async () => {
      const result = await client.auth.verifyCall({
        callerID: '+441234567890',
        calledID: '+447700900123',
        callReference: 'test-123',
      });

      expect(result.verified).toBe(true);
    });

    it('should reject fraudulent call', async () => {
      const result = await client.auth.verifyCall({
        callerID: '+441234567890',
        calledID: '+447700900123',
        callReference: 'fraud-456',
      });

      expect(result.verified).toBe(false);
    });
  });
});
```

---

## 4. Python Implementation

### 4.1 Project Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install \
  httpx \
  pydantic \
  cryptography \
  redis \
  structlog \
  pytest \
  pytest-asyncio
```

### 4.2 Project Structure

```python
# pstn2/__init__.py
from .client import PSTN2Client
from .types import AuthenticationMode, PhoneNumber, RCPID
from .errors import PSTN2Error, CallNotFoundError

__all__ = [
    'PSTN2Client',
    'AuthenticationMode',
    'PhoneNumber',
    'RCPID',
    'PSTN2Error',
    'CallNotFoundError',
]

__version__ = '1.0.0'
```

### 4.3 Core Client Implementation

```python
# pstn2/client.py
from typing import Optional
import httpx
from .auth import AuthenticationModule
from .routing import RoutingModule
from .directory import DirectoryModule
from .types import PSTN2Config, PhoneNumber

class PSTN2Client:
    """PSTN2 client for distributed telecommunications."""

    def __init__(self, config: PSTN2Config):
        self.config = config
        self._validate_config()

        # Initialize HTTP client
        self._http_client = httpx.AsyncClient(
            timeout=config.timeout or 2.0,
            verify=True,  # Always verify TLS
        )

        # Initialize modules
        self.directory = DirectoryModule(config, self._http_client)
        self.auth = AuthenticationModule(config, self._http_client, self.directory)
        self.routing = RoutingModule(config, self._http_client, self.directory)

    def _validate_config(self) -> None:
        """Validate configuration."""
        if not self.config.cp_id:
            raise ValueError('cp_id is required')
        # ... more validation

    async def verify_call(
        self,
        caller_id: PhoneNumber,
        called_id: PhoneNumber,
        call_reference: str,
    ) -> dict:
        """Verify an inbound call."""
        return await self.auth.verify_call(
            caller_id=caller_id,
            called_id=called_id,
            call_reference=call_reference,
        )

    async def close(self) -> None:
        """Close HTTP client and cleanup resources."""
        await self._http_client.aclose()
```

### 4.4 Type Definitions with Pydantic

```python
# pstn2/types.py
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from enum import Enum

class PhoneNumber(str):
    """E.164 formatted phone number."""

    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not isinstance(v, str):
            raise TypeError('string required')
        if not v.startswith('+'):
            raise ValueError('must start with +')
        if not v[1:].isdigit():
            raise ValueError('must contain only digits after +')
        if len(v) < 3 or len(v) > 16:
            raise ValueError('invalid length')
        return cls(v)

class AuthenticationMode(str, Enum):
    DIRECT_QUERY = 'direct_query'
    TOKEN_POOL = 'token_pool'

class PSTN2Config(BaseModel):
    cp_id: str = Field(..., pattern=r'^CP[12]-[A-Z]{2}-\d{4}$')
    api_endpoint: str = Field(..., pattern=r'^https://')
    private_key: str
    auth_mode: AuthenticationMode
    timeout: Optional[float] = 2.0
    retries: Optional[int] = 3

    class Config:
        use_enum_values = True
```

---

## 5. Go Implementation

### 5.1 Project Setup

```bash
# Initialize Go module
mkdir pstn2-go && cd pstn2-go
go mod init github.com/yourorg/pstn2

# Install dependencies
go get github.com/go-chi/chi/v5
go get github.com/go-redis/redis/v9
go get github.com/stretchr/testify
```

### 5.2 Project Structure

```
pstn2/
├── go.mod
├── go.sum
├── cmd/
│   └── pstn2-server/
│       └── main.go
├── pkg/
│   └── pstn2/
│       ├── client.go
│       ├── types.go
│       ├── errors.go
│       ├── auth/
│       ├── routing/
│       └── directory/
├── internal/
│   └── server/
│       ├── handlers.go
│       └── middleware.go
└── examples/
```

### 5.3 Core Client Implementation

```go
// pkg/pstn2/client.go
package pstn2

import (
	"context"
	"crypto/ed25519"
	"net/http"
	"time"
)

type Config struct {
	CPID          string
	APIEndpoint   string
	PrivateKey    ed25519.PrivateKey
	AuthMode      AuthenticationMode
	Timeout       time.Duration
	Retries       int
	LogLevel      string
}

type Client struct {
	config      Config
	httpClient  *http.Client
	auth        *AuthModule
	routing     *RoutingModule
	directory   *DirectoryModule
}

func NewClient(config Config) (*Client, error) {
	// Validate configuration
	if err := validateConfig(config); err != nil {
		return nil, err
	}

	// Create HTTP client
	httpClient := &http.Client{
		Timeout: config.Timeout,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	// Initialize modules
	directory := NewDirectoryModule(config, httpClient)
	auth := NewAuthModule(config, httpClient, directory)
	routing := NewRoutingModule(config, httpClient, directory)

	return &Client{
		config:     config,
		httpClient: httpClient,
		auth:       auth,
		routing:    routing,
		directory:  directory,
	}, nil
}

func (c *Client) VerifyCall(ctx context.Context, req CallVerificationRequest) (*CallVerificationResponse, error) {
	return c.auth.VerifyCall(ctx, req)
}

func (c *Client) Close() error {
	c.httpClient.CloseIdleConnections()
	return nil
}
```

### 5.4 Type Definitions

```go
// pkg/pstn2/types.go
package pstn2

import (
	"errors"
	"regexp"
	"time"
)

type PhoneNumber string

var phoneNumberRegex = regexp.MustCompile(`^\+[1-9]\d{1,14}$`)

func (p PhoneNumber) Validate() error {
	if !phoneNumberRegex.MatchString(string(p)) {
		return errors.New("invalid phone number format")
	}
	return nil
}

type RCPID string

var rcpidRegex = regexp.MustCompile(`^CP[12]-[A-Z]{2}-\d{4}$`)

func (r RCPID) Validate() error {
	if !rcpidRegex.MatchString(string(r)) {
		return errors.New("invalid RCPID format")
	}
	return nil
}

type CallVerificationRequest struct {
	MessageID     string      `json:"messageId"`
	Timestamp     time.Time   `json:"timestamp"`
	Version       string      `json:"version"`
	RequestingCP  RCPID       `json:"requestingCP"`
	CallerID      PhoneNumber `json:"callerID"`
	CalledID      PhoneNumber `json:"calledID"`
	CallReference string      `json:"callReference"`
	Signature     []byte      `json:"signature"`
}

type CallVerificationResponse struct {
	Verified      bool        `json:"verified"`
	CallReference string      `json:"callReference"`
	CallerName    string      `json:"callerName,omitempty"`
	CallerOrg     string      `json:"callerOrg,omitempty"`
	CallPurpose   string      `json:"callPurpose,omitempty"`
	TrustLevel    string      `json:"trustLevel,omitempty"`
	Timestamp     time.Time   `json:"timestamp"`
	Signature     []byte      `json:"signature"`
}
```

---

## 6. Testing Strategy

### 6.1 Unit Testing

Test individual modules in isolation with mocked dependencies.

**Example (TypeScript/Jest):**
```typescript
describe('AuthenticationModule', () => {
  let auth: AuthenticationModule;
  let mockHttp: jest.Mocked<HttpClient>;
  let mockDirectory: jest.Mocked<DirectoryModule>;

  beforeEach(() => {
    mockHttp = createMockHttpClient();
    mockDirectory = createMockDirectory();
    auth = new AuthenticationModule(config, mockHttp, mockDirectory);
  });

  it('should verify call successfully', async () => {
    mockHttp.post.mockResolvedValue({
      verified: true,
      callReference: 'test-123',
    });

    const result = await auth.verifyCall({
      callerID: '+441234567890',
      calledID: '+447700900123',
      callReference: 'test-123',
    });

    expect(result.verified).toBe(true);
    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/verify'),
      expect.any(Object)
    );
  });
});
```

### 6.2 Integration Testing

Test interactions between real CPs.

**Test Environment Setup:**
```
Docker Compose with 3 mock CPs:
  CP1 (Port 8001)
  CP2 (Port 8002)
  CP3 (Port 8003)

Test scenarios:
  1. CP1 → CP2 authentication
  2. Porting chain: CP1 → CP2 → CP3
  3. Emergency location query
  4. Directory synchronization
```

### 6.3 Load Testing

Use tools like k6, Artillery, or Locust.

**Example k6 script:**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp to 100 RPS
    { duration: '5m', target: 100 },  // Sustain 100 RPS
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'],  // 95% under 100ms
  },
};

export default function() {
  const payload = JSON.stringify({
    messageId: '123',
    timestamp: new Date().toISOString(),
    requestingCP: 'CP1-UK-0001',
    callerID: '+441234567890',
    calledID: '+447700900123',
    callReference: `test-${__VU}-${__ITER}`,
  });

  const response = http.post(
    'https://api.cp2.example.com/pstn2/v1/auth/verify',
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 100,
  });
}
```

---

## 7. Deployment Guide

### 7.1 Production Checklist

- [ ] TLS certificate installed and valid
- [ ] DNS records configured (A/AAAA)
- [ ] Firewall rules allow inbound 443
- [ ] Keys stored in secure key management system
- [ ] Monitoring/alerting configured
- [ ] Log aggregation set up
- [ ] Rate limiting configured
- [ ] DDoS protection active
- [ ] Backup/disaster recovery plan
- [ ] Tested failover to traditional PSTN

### 7.2 Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production
EXPOSE 443

CMD ["node", "dist/server.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  pstn2-server:
    build: .
    ports:
      - "443:443"
    environment:
      - CP_ID=${CP_ID}
      - PRIVATE_KEY_PATH=/run/secrets/private_key
      - REDIS_URL=redis://redis:6379
    secrets:
      - private_key
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: unless-stopped

secrets:
  private_key:
    file: ./secrets/private_key.pem

volumes:
  redis-data:
```

### 7.3 Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pstn2-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pstn2-server
  template:
    metadata:
      labels:
        app: pstn2-server
    spec:
      containers:
      - name: pstn2-server
        image: yourorg/pstn2-server:1.0.0
        ports:
        - containerPort: 443
        env:
        - name: CP_ID
          valueFrom:
            configMapKeyRef:
              name: pstn2-config
              key: cp-id
        - name: PRIVATE_KEY
          valueFrom:
            secretKeyRef:
              name: pstn2-secrets
              key: private-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "500m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 443
            scheme: HTTPS
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 443
            scheme: HTTPS
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: pstn2-server
spec:
  type: LoadBalancer
  selector:
    app: pstn2-server
  ports:
  - protocol: TCP
    port: 443
    targetPort: 443
```

---

## 8. Performance Optimization

### 8.1 Caching Strategy

**Directory Cache:**
- Cache TTL: 1 hour
- Invalidate on version change
- Pre-warm cache on startup

**Authentication Results:**
- Cache negative results: 5 minutes
- Cache positive results: 1 minute
- Use Redis or in-memory cache

### 8.2 Connection Pooling

```typescript
// HTTP connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
  keepAliveMsecs: 30000,
});

const httpClient = axios.create({
  httpAgent,
  httpsAgent: new https.Agent({ /* same config */ }),
});
```

### 8.3 Database Optimization

**Call Records Table (PostgreSQL):**
```sql
CREATE TABLE call_records (
  call_reference UUID PRIMARY KEY,
  caller_id VARCHAR(20) NOT NULL,
  called_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Index for fast lookups
CREATE INDEX idx_call_records_expires
  ON call_records (expires_at);

-- Auto-delete expired records
CREATE FUNCTION delete_expired_calls() RETURNS VOID AS $$
  DELETE FROM call_records WHERE expires_at < NOW();
$$ LANGUAGE SQL;

-- Run cleanup every minute
SELECT cron.schedule('cleanup-calls', '* * * * *', 'SELECT delete_expired_calls()');
```

---

## 9. Security Checklist

### 9.1 Cryptography

- [ ] Ed25519 keys properly generated (256-bit entropy)
- [ ] Private keys stored in hardware security module (HSM) or key vault
- [ ] Key rotation policy: 90 days
- [ ] Signature verification on all incoming requests
- [ ] TLS 1.3 enforced (no TLS 1.2 or lower)
- [ ] Certificate pinning implemented (optional but recommended)

### 9.2 Network Security

- [ ] HTTPS only (no HTTP)
- [ ] HSTS headers set (`Strict-Transport-Security`)
- [ ] Rate limiting per IP/CP
- [ ] DDoS protection (Cloudflare, AWS Shield, etc.)
- [ ] Firewall rules: only 443 inbound
- [ ] No sensitive data in logs

### 9.3 Application Security

- [ ] Input validation on all fields
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] CSRF tokens (for admin interfaces)
- [ ] Dependency security scanning (Snyk, Dependabot)
- [ ] Regular security audits

---

## 10. Common Pitfalls

### 10.1 Clock Skew

**Problem:** Timestamp validation fails due to clock drift.

**Solution:**
- Use NTP to sync clocks
- Accept timestamps ±30 seconds
- Log clock skew warnings

### 10.2 Porting Loop Detection

**Problem:** Infinite loop following porting chain.

**Solution:**
- Limit to 5 hops maximum
- Track visited CPs
- Timeout after 2 seconds total

### 10.3 Memory Leaks

**Problem:** Directory cache grows unbounded.

**Solution:**
- Set TTL on all cache entries
- Use LRU eviction policy
- Monitor memory usage

### 10.4 Signature Verification

**Problem:** Signature verification fails silently.

**Solution:**
- Log all verification failures
- Alert on high failure rate
- Provide clear error messages

### 10.5 Fallback Not Tested

**Problem:** Traditional PSTN fallback broken in production.

**Solution:**
- Test fallback regularly
- Monitor fallback rate
- Have runbook for manual fallback

---

## Appendix: Configuration Examples

### TypeScript

```typescript
const config: PSTN2Config = {
  cpId: 'CP1-UK-0001',
  apiEndpoint: 'https://api.yourcp.com/pstn2/v1',
  privateKey: process.env.PSTN2_PRIVATE_KEY!,
  publicKey: process.env.PSTN2_PUBLIC_KEY,
  authMode: AuthenticationMode.DirectQuery,
  timeout: 2000,
  retries: 3,
  cacheDirectory: true,
  cacheTTL: 3600,
  fallbackToTraditional: true,
  logLevel: 'info',
};
```

### Python

```python
config = PSTN2Config(
    cp_id='CP1-UK-0001',
    api_endpoint='https://api.yourcp.com/pstn2/v1',
    private_key=os.environ['PSTN2_PRIVATE_KEY'],
    auth_mode=AuthenticationMode.DIRECT_QUERY,
    timeout=2.0,
    retries=3,
    cache_directory=True,
    cache_ttl=3600,
    fallback_to_traditional=True,
    log_level='INFO',
)
```

### Go

```go
config := pstn2.Config{
    CPID:        "CP1-UK-0001",
    APIEndpoint: "https://api.yourcp.com/pstn2/v1",
    PrivateKey:  privateKey,
    AuthMode:    pstn2.DirectQuery,
    Timeout:     2 * time.Second,
    Retries:     3,
    CacheDir:    true,
    CacheTTL:    1 * time.Hour,
    Fallback:    true,
    LogLevel:    "info",
}
```

---

**Document Status:** Living Guide
**Contributions:** https://github.com/njjholland-dot/pstn2/pulls
**Questions:** https://github.com/njjholland-dot/pstn2/discussions

(Repository access is currently limited while the project incubates; contact nick.holland@8x8.com)
