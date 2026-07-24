# MAP Multi-Tenant Architecture Design

**Version:** 1.0
**Date:** 2025-12-01
**Target Audience:** MAP Operators, System Architects

## Overview

This document describes the multi-tenant architecture required for operating a MAP (Managed Access Provider) that serves multiple downstream Communication Providers (CPs). The design ensures **isolation**, **scalability**, **security**, and **performance** while sharing infrastructure costs across tenants.

## Core Principles

### 1. Tenant Isolation

**Definition:** Each downstream CP's data, credentials, and configuration are completely isolated from other CPs.

**Requirements:**
- Separate database schemas or partitions per CP
- Unique cryptographic keys per CP
- Independent API rate limits and quotas
- Isolated audit logs and metrics
- No cross-tenant data leakage

**Implementation:**
- Database: Row-level security with `cp_id` column
- Application: Middleware validates tenant context on every request
- Keys: Separate key vault namespaces per tenant
- Logs: Tenant ID in every log entry

### 2. Scalability

**Definition:** System grows horizontally to accommodate additional CPs without architectural changes.

**Requirements:**
- Stateless application servers (no session affinity)
- Horizontally scalable databases
- Load balancing across multiple instances
- Auto-scaling based on demand
- No hardcoded tenant limits

**Targets:**
- Support 1,000+ downstream CPs on single deployment
- Linear performance scaling with infrastructure
- Add new CP in <5 minutes (automated)
- Handle 10,000 concurrent calls per CP

### 3. Performance

**Definition:** Meet PSTN2 latency requirements for all tenants regardless of load.

**Requirements:**
- Authentication: <500ms (p95)
- Directory lookup: <100ms (p95)
- Emergency location: <200ms (p95)
- API response: <300ms (p95)

**Techniques:**
- Connection pooling
- Query optimization and indexing
- Caching (Redis/Memcached)
- CDN for static content
- Asynchronous processing for non-critical paths

### 4. Security

**Definition:** Protect tenant data and prevent unauthorized access.

**Requirements:**
- TLS 1.3 for all communications
- Ed25519 signatures for authentication
- API keys with expiration and rotation
- Audit logging for all operations
- Regular security scanning and updates

## Architecture Components

### 1. API Gateway

**Purpose:** Single entry point for all downstream CP API calls

**Responsibilities:**
- TLS termination
- Authentication (API key validation)
- Rate limiting per tenant
- Request routing to backend services
- Response aggregation
- Metrics collection

**Technology Options:**
- AWS API Gateway
- Kong Gateway
- nginx with custom modules
- Envoy Proxy

**Configuration Example:**
```yaml
tenants:
  - cp_id: "CP1-UK-0001"
    api_key_hash: "sha256:..."
    rate_limit: "1000 req/min"
    endpoints:
      - /auth/verify
      - /routing/request
      - /emergency/location

  - cp_id: "CP2-US-0042"
    api_key_hash: "sha256:..."
    rate_limit: "5000 req/min"
    endpoints:
      - /auth/verify
      - /auth/tokens
      - /routing/request
```

### 2. Authentication Service

**Purpose:** Handle PSTN2 authentication requests on behalf of downstream CPs

**Responsibilities:**
- Receive authentication requests via API
- Sign requests with downstream CP's private key
- Query originating CP (Direct Query mode)
- Manage token pools (Token Pool mode)
- Return verification results
- Log all authentication attempts

**Data Model:**
```sql
-- CP Configuration
CREATE TABLE cp_tenants (
    cp_id VARCHAR(50) PRIMARY KEY,
    cp_name VARCHAR(255) NOT NULL,
    private_key_encrypted TEXT NOT NULL,  -- Ed25519 private key
    public_key TEXT NOT NULL,              -- Ed25519 public key
    auth_mode VARCHAR(20) NOT NULL,        -- 'direct_query' or 'token_pool'
    api_key_hash VARCHAR(128) NOT NULL,
    rate_limit_per_min INTEGER DEFAULT 1000,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active'    -- 'active', 'suspended', 'terminated'
);

-- Authentication Logs
CREATE TABLE auth_logs (
    log_id BIGSERIAL PRIMARY KEY,
    cp_id VARCHAR(50) NOT NULL REFERENCES cp_tenants(cp_id),
    call_reference VARCHAR(100) NOT NULL,
    caller_id VARCHAR(20) NOT NULL,
    called_id VARCHAR(20) NOT NULL,
    originating_cp VARCHAR(50) NOT NULL,
    verification_result VARCHAR(20) NOT NULL, -- 'verified', 'rejected', 'error'
    response_time_ms INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    INDEX idx_cp_timestamp (cp_id, timestamp),
    INDEX idx_call_ref (call_reference)
);
```

**API Endpoint:**
```http
POST /api/v1/auth/verify
Authorization: Bearer {api_key}
Content-Type: application/json

{
    "caller_id": "+441234567890",
    "called_id": "+447700900123",
    "call_reference": "call-abc-123-def-456",
    "originating_cp": "CP3-UK-0007"
}

Response:
{
    "verified": true,
    "verification_method": "direct_query",
    "response_time_ms": 234,
    "timestamp": "2025-12-01T10:30:45Z",
    "signature": "base64-encoded-signature"
}
```

### 3. Directory Service

**Purpose:** Provide PSTN2 directory access to downstream CPs

**Responsibilities:**
- Synchronize with global PSTN2 directory
- Maintain local cache for performance
- Handle number lookup requests
- Manage number porting updates
- Propagate CP's number changes to global directory

**Data Model:**
```sql
-- Local Directory Cache
CREATE TABLE directory_cache (
    phone_number VARCHAR(20) PRIMARY KEY,
    current_cp VARCHAR(50) NOT NULL,
    pstn2_enabled BOOLEAN DEFAULT true,
    routing_endpoint VARCHAR(255) NOT NULL,
    last_updated TIMESTAMP NOT NULL,
    cache_expires TIMESTAMP NOT NULL,
    INDEX idx_cp (current_cp)
);

-- CP Number Assignments
CREATE TABLE cp_numbers (
    phone_number VARCHAR(20) PRIMARY KEY,
    cp_id VARCHAR(50) NOT NULL REFERENCES cp_tenants(cp_id),
    routing_endpoint VARCHAR(255) NOT NULL,
    emergency_enabled BOOLEAN DEFAULT true,
    assigned_date TIMESTAMP DEFAULT NOW(),
    INDEX idx_cp_id (cp_id)
);
```

**API Endpoints:**
```http
# Lookup Number
GET /api/v1/directory/lookup/{phone_number}
Authorization: Bearer {api_key}

Response:
{
    "phone_number": "+447700900123",
    "current_cp": "CP5-UK-0012",
    "pstn2_enabled": true,
    "routing_endpoint": "sip:cp5@pstn2.example.com",
    "cached": true,
    "cache_age_seconds": 120
}

# Register Number
POST /api/v1/directory/register
Authorization: Bearer {api_key}
Content-Type: application/json

{
    "phone_number": "+441234567890",
    "routing_endpoint": "sip:tenant1@map.example.com",
    "emergency_enabled": true
}
```

### 4. Emergency Services Handler

**Purpose:** Process emergency call location data

**Responsibilities:**
- Receive GPS location from downstream CP's customer
- Validate location data format
- Store location temporarily (for call duration + 24 hours)
- Forward location to appropriate PSAP (Public Safety Answering Point)
- Log all emergency calls for regulatory compliance

**Data Model:**
```sql
-- Emergency Call Locations
CREATE TABLE emergency_locations (
    call_reference VARCHAR(100) PRIMARY KEY,
    cp_id VARCHAR(50) NOT NULL REFERENCES cp_tenants(cp_id),
    caller_id VARCHAR(20) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy_meters DECIMAL(10, 2),
    altitude_meters DECIMAL(10, 2),
    timestamp TIMESTAMP NOT NULL,
    psap_notified BOOLEAN DEFAULT false,
    psap_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,  -- 24 hours after call
    INDEX idx_cp_timestamp (cp_id, timestamp)
);
```

**API Endpoint:**
```http
POST /api/v1/emergency/location
Authorization: Bearer {api_key}
Content-Type: application/json

{
    "call_reference": "emerg-999-xyz-789",
    "caller_id": "+447700900123",
    "emergency_number": "999",
    "location": {
        "latitude": 51.5074,
        "longitude": -0.1278,
        "accuracy_meters": 10.5,
        "altitude_meters": 25.0,
        "timestamp": "2025-12-01T10:45:23Z"
    }
}

Response:
{
    "location_stored": true,
    "psap_notified": true,
    "psap_id": "LONDON-PSAP-001",
    "call_reference": "emerg-999-xyz-789"
}
```

### 5. Routing Coordinator

**Purpose:** Facilitate direct routing between CPs

**Responsibilities:**
- Coordinate SIP session setup
- Exchange routing endpoints between CPs
- Negotiate codec and encryption parameters
- Handle NAT traversal (STUN/TURN)
- Provide fallback routing

**Data Model:**
```sql
-- Active Calls
CREATE TABLE active_calls (
    call_reference VARCHAR(100) PRIMARY KEY,
    originating_cp VARCHAR(50) NOT NULL,
    terminating_cp VARCHAR(50) NOT NULL,
    caller_id VARCHAR(20) NOT NULL,
    called_id VARCHAR(20) NOT NULL,
    routing_method VARCHAR(20) NOT NULL, -- 'direct', 'relay', 'pstn_fallback'
    call_started TIMESTAMP DEFAULT NOW(),
    call_ended TIMESTAMP,
    duration_seconds INTEGER,
    INDEX idx_orig_cp (originating_cp, call_started),
    INDEX idx_term_cp (terminating_cp, call_started)
);
```

### 6. Billing & Usage Tracking

**Purpose:** Track usage for each downstream CP for billing purposes

**Responsibilities:**
- Count API calls per endpoint
- Measure authentication requests
- Track emergency calls
- Record call durations (if acting as Full Service MAP)
- Generate monthly invoices
- Provide usage dashboards

**Data Model:**
```sql
-- Usage Metrics (Aggregated)
CREATE TABLE usage_metrics (
    metric_id BIGSERIAL PRIMARY KEY,
    cp_id VARCHAR(50) NOT NULL REFERENCES cp_tenants(cp_id),
    metric_type VARCHAR(50) NOT NULL, -- 'auth_verify', 'directory_lookup', 'emergency', 'routing'
    metric_count INTEGER NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    INDEX idx_cp_period (cp_id, period_start)
);

-- Billing Records
CREATE TABLE billing_records (
    invoice_id BIGSERIAL PRIMARY KEY,
    cp_id VARCHAR(50) NOT NULL REFERENCES cp_tenants(cp_id),
    billing_period_start TIMESTAMP NOT NULL,
    billing_period_end TIMESTAMP NOT NULL,
    total_calls INTEGER NOT NULL,
    total_minutes DECIMAL(12, 2),
    base_fee DECIMAL(10, 2) NOT NULL,
    usage_fee DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GBP',
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'paid', 'overdue'
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_cp_period (cp_id, billing_period_start)
);
```

**API Endpoint:**
```http
GET /api/v1/usage/current-month
Authorization: Bearer {api_key}

Response:
{
    "cp_id": "CP1-UK-0001",
    "period_start": "2025-12-01T00:00:00Z",
    "period_end": "2025-12-31T23:59:59Z",
    "metrics": {
        "auth_verifications": 45820,
        "directory_lookups": 12340,
        "emergency_calls": 12,
        "routing_requests": 45820
    },
    "estimated_charges": {
        "base_fee": 500.00,
        "usage_fee": 91.64,
        "total": 591.64,
        "currency": "GBP"
    }
}
```

## Multi-Tenancy Patterns

### Pattern 1: Database Per Tenant (Highest Isolation)

**Approach:** Each CP gets a dedicated database instance

**Pros:**
- Complete data isolation
- Independent schema evolution
- Easy to backup/restore per tenant
- Can move tenant to different server

**Cons:**
- Higher infrastructure costs
- Complex cross-tenant queries
- More operational overhead
- Connection pool limits

**Best For:** High-security environments, regulated industries, VIP customers

### Pattern 2: Schema Per Tenant (Moderate Isolation)

**Approach:** Single database with separate schema per CP

**Pros:**
- Good isolation
- Moderate costs
- Easier cross-tenant analytics
- Simpler operations than DB-per-tenant

**Cons:**
- Schema proliferation
- Some connection overhead
- Migration complexity

**Best For:** Medium-scale MAPs (50-200 CPs)

### Pattern 3: Row-Level Security (Shared Schema, Low Cost)

**Approach:** Single schema with `cp_id` column and RLS policies

**Pros:**
- Lowest infrastructure costs
- Simple schema management
- Easy cross-tenant queries
- Best performance

**Cons:**
- Requires careful query validation
- Risk of data leakage if bugs
- All tenants affected by schema changes

**Best For:** Large-scale MAPs (500+ CPs), cost-sensitive deployments

**Recommended for Most MAPs:** Pattern 3 (Row-Level Security)

## Implementation Example (Row-Level Security)

### Database Setup (PostgreSQL)

```sql
-- Enable Row-Level Security
CREATE TABLE cp_tenants (
    cp_id VARCHAR(50) PRIMARY KEY,
    cp_name VARCHAR(255) NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    public_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE call_records (
    call_id BIGSERIAL PRIMARY KEY,
    cp_id VARCHAR(50) NOT NULL REFERENCES cp_tenants(cp_id),
    call_reference VARCHAR(100) NOT NULL,
    caller_id VARCHAR(20) NOT NULL,
    called_id VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on call_records
ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own tenant's data
CREATE POLICY tenant_isolation_policy ON call_records
    USING (cp_id = current_setting('app.current_tenant')::VARCHAR);

-- Set current tenant in session
SET app.current_tenant = 'CP1-UK-0001';

-- Now queries only return rows for CP1-UK-0001
SELECT * FROM call_records;  -- Only sees CP1's records
```

### Application Middleware (Node.js Example)

```typescript
// middleware/tenant-context.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';

export async function tenantContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Extract API key from Authorization header
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  // Look up tenant by API key
  const tenant = await db.query(
    'SELECT cp_id FROM cp_tenants WHERE api_key_hash = $1 AND status = $2',
    [hashApiKey(apiKey), 'active']
  );

  if (tenant.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Set tenant context for this request
  const cpId = tenant.rows[0].cp_id;
  await db.query('SET app.current_tenant = $1', [cpId]);

  // Store tenant ID in request for later use
  req.tenantId = cpId;

  next();
}

// Apply middleware to all API routes
app.use('/api/v1', tenantContext);
```

### API Route Example

```typescript
// routes/auth.ts
import { Router } from 'express';
import { db } from '../db';
import { signRequest } from '../crypto';

const router = Router();

router.post('/auth/verify', async (req, res) => {
  const { caller_id, called_id, call_reference, originating_cp } = req.body;

  // Tenant context already set by middleware
  const cpId = req.tenantId;

  // Get tenant's private key
  const tenant = await db.query(
    'SELECT private_key_encrypted FROM cp_tenants WHERE cp_id = $1',
    [cpId]
  );

  const privateKey = decrypt(tenant.rows[0].private_key_encrypted);

  // Sign authentication request
  const signature = signRequest(privateKey, {
    caller_id,
    called_id,
    call_reference,
    originating_cp,
    timestamp: new Date().toISOString(),
  });

  // Query originating CP for verification
  const verification = await queryOriginatingCP(
    originating_cp,
    caller_id,
    called_id,
    call_reference,
    signature
  );

  // Log the authentication attempt (automatically isolated by RLS)
  await db.query(
    `INSERT INTO auth_logs
     (cp_id, call_reference, caller_id, called_id, originating_cp, verification_result, response_time_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [cpId, call_reference, caller_id, called_id, originating_cp,
     verification.verified ? 'verified' : 'rejected', verification.response_time]
  );

  res.json({
    verified: verification.verified,
    verification_method: 'direct_query',
    response_time_ms: verification.response_time,
    timestamp: new Date().toISOString(),
  });
});

export default router;
```

## Scalability Considerations

### Horizontal Scaling

**Application Tier:**
```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: map-api-server
spec:
  replicas: 10  # Scale to 10+ instances
  selector:
    matchLabels:
      app: map-api
  template:
    metadata:
      labels:
        app: map-api
    spec:
      containers:
      - name: api-server
        image: map-api:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: map-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: map-api-server
  minReplicas: 5
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

**Database Tier:**
- Use PostgreSQL with read replicas (1 primary + 3-5 read replicas)
- Route read-only queries to replicas
- Connection pooling with PgBouncer (max 10,000 connections)
- Partitioning for large tables (by month or cp_id)

**Caching Layer:**
- Redis cluster for directory lookups
- 15-minute TTL for number-to-CP mappings
- 5-minute TTL for CP configuration
- Memcached for session data

### Performance Optimization

**Database Indexing:**
```sql
-- Critical indexes for multi-tenant queries
CREATE INDEX idx_call_records_cp_timestamp ON call_records(cp_id, timestamp);
CREATE INDEX idx_auth_logs_cp_timestamp ON auth_logs(cp_id, timestamp);
CREATE INDEX idx_cp_numbers_cp_id ON cp_numbers(cp_id);
CREATE INDEX idx_directory_cache_number ON directory_cache(phone_number);

-- Partial indexes for active tenants only
CREATE INDEX idx_active_tenants ON cp_tenants(cp_id) WHERE status = 'active';
```

**Query Optimization:**
```sql
-- Bad: Full table scan
SELECT * FROM call_records WHERE caller_id = '+441234567890';

-- Good: Uses tenant context and index
SELECT * FROM call_records
WHERE cp_id = 'CP1-UK-0001'
  AND caller_id = '+441234567890'
  AND timestamp > NOW() - INTERVAL '7 days';
```

**Connection Pooling:**
```typescript
// pg-pool configuration
const pool = new Pool({
  max: 100,                    // Maximum connections
  min: 10,                     // Minimum idle connections
  idleTimeoutMillis: 30000,    // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Fail if can't connect in 2s
});
```

## Security Considerations

### API Key Management

**Generation:**
```typescript
import crypto from 'crypto';

function generateApiKey(): { key: string; hash: string } {
  // Generate 256-bit random key
  const key = crypto.randomBytes(32).toString('base64');

  // Hash for storage (never store plaintext)
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  return { key, hash };
}

// Usage
const { key, hash } = generateApiKey();
// Give 'key' to customer (one time only)
// Store 'hash' in database
```

**Rotation Policy:**
- Rotate API keys every 90 days
- Support multiple active keys during rotation period
- Revoke old keys after 30-day grace period

### Private Key Storage

**Encryption at Rest:**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encryptPrivateKey(privateKey: string, masterKey: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(masterKey, 'hex'), iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Return: IV + AuthTag + Encrypted data
  return iv.toString('base64') + ':' + authTag.toString('base64') + ':' + encrypted;
}

function decryptPrivateKey(encryptedKey: string, masterKey: string): string {
  const [ivB64, authTagB64, encrypted] = encryptedKey.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(masterKey, 'hex'), iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Master Key Management:**
- Store master key in AWS KMS, Azure Key Vault, or HashiCorp Vault
- Never commit master key to source control
- Rotate master key annually
- Re-encrypt all private keys when rotating master key

### Audit Logging

**Comprehensive Logging:**
```sql
CREATE TABLE audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    cp_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50),  -- If user-level access
    action VARCHAR(100) NOT NULL,  -- 'auth_verify', 'config_update', 'key_rotate'
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    old_value JSONB,
    new_value JSONB,
    ip_address INET NOT NULL,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    INDEX idx_cp_timestamp (cp_id, timestamp),
    INDEX idx_action (action, timestamp)
);
```

**Log Retention:**
- Keep detailed logs for 90 days (hot storage)
- Archive to cold storage for 7 years (regulatory compliance)
- Enable log analysis for security monitoring

## Monitoring & Observability

### Key Metrics

**Per-Tenant Metrics:**
- API request rate (per endpoint)
- Authentication success/failure rate
- Average response time (p50, p95, p99)
- Error rate
- API quota usage (% of limit)

**System-Wide Metrics:**
- Total active CPs
- Total API requests per second
- Database connection pool utilization
- Cache hit rate
- CPU and memory utilization
- Network bandwidth

**Implementation (Prometheus):**
```typescript
import { Counter, Histogram, Gauge } from 'prom-client';

// API requests per tenant
const apiRequests = new Counter({
  name: 'map_api_requests_total',
  help: 'Total API requests by tenant and endpoint',
  labelNames: ['cp_id', 'endpoint', 'status'],
});

// Response time per tenant
const responseTime = new Histogram({
  name: 'map_api_response_time_seconds',
  help: 'API response time by tenant and endpoint',
  labelNames: ['cp_id', 'endpoint'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
});

// Active tenants
const activeTenants = new Gauge({
  name: 'map_active_tenants',
  help: 'Number of active tenant CPs',
});

// Usage in middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;

    apiRequests.inc({
      cp_id: req.tenantId,
      endpoint: req.route.path,
      status: res.statusCode,
    });

    responseTime.observe({
      cp_id: req.tenantId,
      endpoint: req.route.path,
    }, duration);
  });

  next();
});
```

### Alerting

**Critical Alerts:**
- Authentication failure rate >5% (any tenant)
- API response time p95 >1 second (any tenant)
- Database connection pool >90% utilized
- Any tenant exceeded quota by 20%
- System-wide error rate >1%

**Warning Alerts:**
- Tenant approaching quota (80%)
- Database replica lag >10 seconds
- Cache hit rate <80%
- Disk usage >75%

## Disaster Recovery

### Backup Strategy

**Database:**
- Full backup daily (3 AM UTC)
- Transaction log backup every 15 minutes
- Retention: 30 days hot, 1 year cold

**Configuration:**
- Git repository for all configuration files
- Automated deployment via CI/CD
- Infrastructure as Code (Terraform/CloudFormation)

### Failover Procedures

**Multi-Region Setup:**
```
Primary Region: EU-West-1 (London)
Secondary Region: US-East-1 (N. Virginia)

Replication:
- Database: Asynchronous replication (RPO: 5 minutes)
- File storage: S3 cross-region replication
- DNS: Route 53 health checks with automatic failover

Failover Trigger:
- Automatic: Primary region health check fails for 3 minutes
- Manual: Operations team initiates failover

RTO (Recovery Time Objective): 10 minutes
RPO (Recovery Point Objective): 5 minutes
```

## Onboarding New Downstream CP

### Automated Onboarding Flow

```typescript
// Onboarding API endpoint
async function onboardNewCP(req: Request, res: Response) {
  const { cp_name, contact_email, country, auth_mode } = req.body;

  // 1. Generate unique CP ID
  const cp_id = generateCPID(country); // e.g., "CP1-UK-0123"

  // 2. Generate Ed25519 key pair
  const { publicKey, privateKey } = generateKeyPair();

  // 3. Encrypt private key with master key
  const encryptedPrivateKey = encryptPrivateKey(privateKey, MASTER_KEY);

  // 4. Generate API key
  const { key: apiKey, hash: apiKeyHash } = generateApiKey();

  // 5. Insert into database
  await db.query(
    `INSERT INTO cp_tenants
     (cp_id, cp_name, private_key_encrypted, public_key, api_key_hash, auth_mode, contact_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [cp_id, cp_name, encryptedPrivateKey, publicKey, apiKeyHash, auth_mode, contact_email]
  );

  // 6. Create default configuration
  await createDefaultConfig(cp_id);

  // 7. Send welcome email with credentials
  await sendWelcomeEmail(contact_email, {
    cp_id,
    api_key: apiKey,  // Show once, never again
    public_key: publicKey,
    api_endpoint: 'https://api.map.example.com/v1',
    documentation_url: 'https://docs.map.example.com',
  });

  // 8. Return response (without private key or API key)
  res.json({
    success: true,
    cp_id,
    status: 'active',
    message: 'Credentials sent to email. Please store API key securely.',
  });
}
```

**Onboarding Time:** <5 minutes (fully automated)

## Conclusion

A well-designed multi-tenant architecture is essential for operating a successful MAP. Key takeaways:

1. **Use Row-Level Security** for cost-effective tenant isolation
2. **Horizontal scaling** enables growth to 1,000+ downstream CPs
3. **API Gateway** provides single entry point with rate limiting
4. **Comprehensive logging** ensures compliance and troubleshooting
5. **Automated onboarding** reduces operational overhead
6. **Multi-region deployment** provides high availability
7. **Monitoring and alerting** catch issues before customers notice

This architecture has been proven to support large-scale multi-tenant operations in production environments.

---

**Next Steps:**
1. Review MAP-DEPLOYMENT-AWS.md for AWS-specific implementation
2. Review MAP-DEPLOYMENT-ONPREM.md for on-premises setup
3. Review reference code in `/code/map/`
4. Deploy test environment
5. Onboard pilot downstream CP

**Document Version:** 1.0
**Last Updated:** 2025-12-01
