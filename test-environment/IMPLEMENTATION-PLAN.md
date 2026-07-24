# PSTN2 Test Harness - Implementation Plan

## Overview

A comprehensive test harness for simulating PSTN2 message exchanges between multiple Communication Providers (CPs) without actual call placement. The system includes:

- **3 Simulated CPs**: CP1, CP2, CP3 (each with separate MySQL database)
- **Web Portal**: Switch between CP perspectives with real-time message simulation
- **Message Exchange**: Simulate all PSTN2 protocol messages
- **Visual Interface**: See message flows, authentication, routing, and porting scenarios

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Web Portal (React)                       │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │   CP1 View   │   CP2 View   │   CP3 View   │             │
│  └──────────────┴──────────────┴──────────────┘             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Node.js/Express API Server                      │
│  ┌─────────────────────────────────────────────────┐        │
│  │      PSTN2 Core Library (TypeScript)            │        │
│  │  • Authentication (Direct Query & Token Pool)   │        │
│  │  • Directory Service                            │        │
│  │  • Direct Routing                               │        │
│  │  • Message Queue/Logger                         │        │
│  │  • Porting Chain Resolution                     │        │
│  └─────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  MySQL DB    │    │  MySQL DB    │    │  MySQL DB    │
│     CP1      │    │     CP2      │    │     CP3      │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## Stage 1: Foundation & Database Setup

### 1.1 Project Structure
```
test-environment/
├── backend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── core/
│   │   │   │   ├── authentication.ts
│   │   │   │   ├── directory.ts
│   │   │   │   ├── routing.ts
│   │   │   │   ├── messaging.ts
│   │   │   │   └── types.ts
│   │   │   └── database/
│   │   │       ├── connection.ts
│   │   │       ├── models.ts
│   │   │       └── migrations/
│   │   ├── api/
│   │   │   ├── cp1-routes.ts
│   │   │   ├── cp2-routes.ts
│   │   │   ├── cp3-routes.ts
│   │   │   └── simulator-routes.ts
│   │   ├── services/
│   │   │   ├── cp-service.ts
│   │   │   └── message-logger.ts
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CPSwitcher.tsx
│   │   │   ├── MessageSimulator.tsx
│   │   │   ├── MessageFlow.tsx
│   │   │   └── CPDashboard.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   └── App.tsx
│   └── package.json
├── docker/
│   └── docker-compose.yml
└── docs/
    ├── IMPLEMENTATION-PLAN.md
    ├── API-GUIDE.md
    └── USER-GUIDE.md
```

### 1.2 Database Schema (Each CP Database)

#### Tables:

**`numbers`** - Number ranges owned by this CP
```sql
CREATE TABLE numbers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    number VARCHAR(20) UNIQUE NOT NULL,
    number_range VARCHAR(50),
    status ENUM('active', 'ported_out', 'ported_in', 'reserved') DEFAULT 'active',
    ported_to_cp VARCHAR(50) NULL,
    ported_from_cp VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_number (number),
    INDEX idx_status (status)
);
```

**`directory_cache`** - Cached directory info from other CPs
```sql
CREATE TABLE directory_cache (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cp_id VARCHAR(50) NOT NULL,
    number_range VARCHAR(50) NOT NULL,
    api_endpoint VARCHAR(255) NOT NULL,
    public_key TEXT,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    INDEX idx_cp_id (cp_id),
    INDEX idx_expires (expires_at)
);
```

**`auth_tokens`** - Token pool storage
```sql
CREATE TABLE auth_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    token_id VARCHAR(64) UNIQUE NOT NULL,
    caller_id VARCHAR(20) NOT NULL,
    called_id VARCHAR(20) NOT NULL,
    call_reference VARCHAR(64) NOT NULL,
    originating_cp VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP NULL,
    INDEX idx_token_id (token_id),
    INDEX idx_expires (expires_at),
    INDEX idx_caller (caller_id)
);
```

**`call_records`** - Call simulation records
```sql
CREATE TABLE call_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    call_reference VARCHAR(64) UNIQUE NOT NULL,
    caller_id VARCHAR(20) NOT NULL,
    called_id VARCHAR(20) NOT NULL,
    direction ENUM('inbound', 'outbound') NOT NULL,
    auth_method ENUM('direct_query', 'token_pool') NULL,
    auth_result ENUM('verified', 'failed', 'timeout') NULL,
    routing_accepted BOOLEAN DEFAULT FALSE,
    direct_routing_fqdn VARCHAR(255) NULL,
    direct_routing_port INT NULL,
    porting_chain JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_call_ref (call_reference),
    INDEX idx_caller (caller_id),
    INDEX idx_called (called_id)
);
```

**`message_log`** - All PSTN2 messages exchanged
```sql
CREATE TABLE message_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(64) UNIQUE NOT NULL,
    call_reference VARCHAR(64) NULL,
    message_type ENUM('auth_request', 'auth_response', 'routing_request', 'routing_response',
                      'token_create', 'token_verify', 'directory_query', 'porting_query') NOT NULL,
    direction ENUM('sent', 'received') NOT NULL,
    from_cp VARCHAR(50) NOT NULL,
    to_cp VARCHAR(50) NOT NULL,
    payload JSON NOT NULL,
    response JSON NULL,
    status_code INT NULL,
    timestamp TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_call_ref (call_reference),
    INDEX idx_type (message_type),
    INDEX idx_timestamp (timestamp)
);
```

**`cp_config`** - CP configuration
```sql
CREATE TABLE cp_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cp_id VARCHAR(50) UNIQUE NOT NULL,
    api_endpoint VARCHAR(255) NOT NULL,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    auth_mode ENUM('direct_query', 'token_pool') DEFAULT 'direct_query',
    token_pool_endpoint VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Stage 2: Core Library Development

### 2.1 Type Definitions (`lib/core/types.ts`)

```typescript
// Core PSTN2 Types
export interface PSTN2Config {
  cpId: string;
  apiEndpoint: string;
  publicKey: string;
  privateKey: string;
  authMode: 'direct_query' | 'token_pool';
  tokenPoolEndpoint?: string;
  dbConnection: DatabaseConnection;
}

export interface AuthenticationRequest {
  callerID: string;
  calledID: string;
  callReference: string;
  timestamp: string;
  signature: string;
}

export interface AuthenticationResponse {
  verified: boolean;
  callerName?: string;
  callPurpose?: string;
  portingChain?: string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface RoutingRequest {
  destinationNumber: string;
  callerID: string;
  callReference: string;
  mediaCapabilities: MediaCapabilities;
  publicKey: string;
  branding?: CallBranding;
}

export interface RoutingResponse {
  accepted: boolean;
  connectionDetails?: {
    fqdn: string;
    port: number;
    publicKey: string;
  };
  rejectionReason?: string;
}

export interface DirectoryEntry {
  cpId: string;
  numberRange: string;
  apiEndpoint: string;
  publicKey: string;
}

export interface MessageLogEntry {
  messageId: string;
  callReference?: string;
  messageType: string;
  direction: 'sent' | 'received';
  fromCP: string;
  toCP: string;
  payload: any;
  response?: any;
  statusCode?: number;
  timestamp: Date;
}
```

### 2.2 Authentication Module (`lib/core/authentication.ts`)

**Responsibilities:**
- Direct Query authentication
- Token Pool creation/verification
- Signature generation/validation
- Porting chain resolution

**Key Functions:**
```typescript
class AuthenticationService {
  async verifyCall(request: AuthenticationRequest): Promise<AuthenticationResponse>
  async createToken(request: TokenCreateRequest): Promise<TokenCreateResponse>
  async verifyToken(tokenId: string): Promise<TokenVerifyResponse>
  async resolvePortingChain(number: string): Promise<string[]>
  private async queryOriginatingCP(cpEndpoint: string, request: any): Promise<any>
}
```

### 2.3 Directory Service (`lib/core/directory.ts`)

**Responsibilities:**
- Number range lookup
- Directory caching
- CP discovery
- Cache invalidation

**Key Functions:**
```typescript
class DirectoryService {
  async lookupNumber(number: string): Promise<DirectoryEntry>
  async publishDirectory(): Promise<void>
  async refreshCache(): Promise<void>
  async getAllCPs(): Promise<DirectoryEntry[]>
}
```

### 2.4 Routing Module (`lib/core/routing.ts`)

**Responsibilities:**
- Direct routing negotiation
- Media capability matching
- Connection details exchange
- Call branding

**Key Functions:**
```typescript
class RoutingService {
  async requestRouting(request: RoutingRequest): Promise<RoutingResponse>
  async acceptRouting(request: RoutingRequest): Promise<RoutingResponse>
  private async negotiateMediaCapabilities(caps: MediaCapabilities): Promise<boolean>
}
```

### 2.5 Message Logger (`lib/core/messaging.ts`)

**Responsibilities:**
- Log all messages
- HTTP client with retry
- Message signing
- Response validation

**Key Functions:**
```typescript
class MessagingService {
  async sendMessage(toCP: string, type: string, payload: any): Promise<any>
  async logMessage(entry: MessageLogEntry): Promise<void>
  async getMessageHistory(callReference: string): Promise<MessageLogEntry[]>
  private async signPayload(payload: any): Promise<string>
  private async verifySignature(payload: any, signature: string): Promise<boolean>
}
```

---

## Stage 3: API Server Development

### 3.1 CP API Endpoints

Each CP (CP1, CP2, CP3) exposes these endpoints:

```
POST /pstn2/v1/auth/verify       - Verify inbound call
POST /pstn2/v1/auth/token/create - Create token (if using token pool)
POST /pstn2/v1/auth/token/verify - Verify token
POST /pstn2/v1/routing/request   - Request direct routing
POST /pstn2/v1/directory/query   - Query directory
GET  /pstn2/v1/directory/all     - Get full directory
POST /pstn2/v1/porting/query     - Query porting status
```

### 3.2 Simulator API Endpoints

```
POST /api/simulator/call/initiate        - Initiate simulated call
GET  /api/simulator/call/:ref/messages   - Get message history for call
GET  /api/simulator/cp/:cpId/calls       - Get all calls for CP
POST /api/simulator/cp/:cpId/port-number - Simulate number porting
GET  /api/simulator/cp/:cpId/directory   - Get CP's directory
POST /api/simulator/cp/:cpId/config      - Update CP configuration
GET  /api/simulator/stats                - Get overall statistics
```

### 3.3 Example Implementation (cp1-routes.ts)

```typescript
import express from 'express';
import { AuthenticationService } from '../lib/core/authentication';
import { RoutingService } from '../lib/core/routing';
import { DirectoryService } from '../lib/core/directory';

const router = express.Router();
const cpId = 'CP1-UK-0001';

// Authentication endpoint
router.post('/pstn2/v1/auth/verify', async (req, res) => {
  try {
    const authService = new AuthenticationService(cpId);
    const result = await authService.verifyCall(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routing endpoint
router.post('/pstn2/v1/routing/request', async (req, res) => {
  try {
    const routingService = new RoutingService(cpId);
    const result = await routingService.acceptRouting(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

---

## Stage 4: Web Portal Frontend

### 4.1 Main Components

**CPSwitcher Component**
- Dropdown to switch between CP1, CP2, CP3
- Shows active CP's details (ID, endpoint, number ranges)
- Visual indicator of current perspective

**MessageSimulator Component**
- Form to initiate calls
  - From Number (dropdown from current CP's numbers)
  - To Number (any valid number)
  - Authentication Mode (Direct Query / Token Pool)
  - Call Purpose / Branding (optional)
- "Initiate Call" button
- Real-time status display

**MessageFlow Component**
- Timeline/sequence diagram showing message exchanges
- Each message box shows:
  - Timestamp
  - Message type
  - From → To
  - Payload (expandable JSON)
  - Response (expandable JSON)
  - Status (success/failure)
- Color coding:
  - Green: Successful
  - Red: Failed
  - Yellow: In progress
  - Blue: Info messages

**CPDashboard Component**
- Statistics for current CP:
  - Total calls today
  - Successful authentications
  - Direct routing success rate
  - Numbers owned
  - Ported numbers
- Recent calls table
- Number management panel

### 4.2 Page Layout

```
┌────────────────────────────────────────────────────────────┐
│  PSTN2 Test Harness          [CP: CP1 ▼]    [Stats] [Docs] │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │  Call Simulator      │  │  Current CP Details      │   │
│  │                      │  │                          │   │
│  │  From: +4471234567   │  │  CP ID: CP1-UK-0001     │   │
│  │  To:   +4477009001   │  │  Endpoint: :3001        │   │
│  │  Auth: Direct Query  │  │  Numbers: 100 active     │   │
│  │  [Initiate Call]     │  │  Auth: Direct Query      │   │
│  └──────────────────────┘  └──────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Message Flow                                         │ │
│  │                                                        │ │
│  │  10:23:45.123  AUTH_REQUEST    CP1 → CP2             │ │
│  │  ┌────────────────────────────────────────────────┐  │ │
│  │  │ { callerID: "+4471234567", ... }               │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  │  10:23:45.234  AUTH_RESPONSE   CP2 → CP1             │ │
│  │  ┌────────────────────────────────────────────────┐  │ │
│  │  │ { verified: true, ... }                        │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  │  10:23:45.345  ROUTING_REQUEST CP1 → CP2             │ │
│  │  ...                                                  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

---

## Stage 5: Test Scenarios

### 5.1 Basic Scenarios

**Scenario 1: Simple Direct Query Authentication**
- CP1 calls CP2's number
- CP2 queries CP1 for verification
- Call authenticated successfully

**Scenario 2: Token Pool Authentication**
- CP1 creates token before calling CP2
- CP2 verifies token from pool
- Call authenticated successfully

**Scenario 3: Direct Routing**
- CP1 requests routing to CP2
- CP2 accepts and provides connection details
- Keys exchanged for encryption

**Scenario 4: Number Porting (Simple)**
- Number originally in CP1
- Ported to CP2
- CP3 calls the number
- CP3 queries CP1 → CP1 returns ported_to: CP2
- CP3 queries CP2 → CP2 authenticates

**Scenario 5: Porting Chain (Complex)**
- Number ported from CP1 → CP2 → CP3
- CP1 calls the number
- System follows chain: CP1 → CP2 → CP3
- CP3 authenticates the call

**Scenario 6: Failed Authentication**
- CP1 calls CP2 with spoofed number
- CP2 queries CP3 (actual owner)
- CP3 denies ownership
- Call marked as fraud

**Scenario 7: Call with Branding**
- CP1 calls CP2 with branding info
- Branding includes logo, purpose, display name
- CP2 receives and displays branding

---

## Stage 6: Development Phases & Timeline

### Phase 1: Foundation (Week 1)
- ✓ Set up project structure
- ✓ Create MySQL databases (CP1, CP2, CP3)
- ✓ Run database migrations
- ✓ Set up TypeScript build system
- ✓ Create core type definitions

### Phase 2: Core Library (Week 2)
- ✓ Implement authentication module
- ✓ Implement directory service
- ✓ Implement routing module
- ✓ Implement message logging
- ✓ Unit tests for each module

### Phase 3: API Server (Week 3)
- ✓ Create Express server
- ✓ Implement CP1 endpoints
- ✓ Implement CP2 endpoints
- ✓ Implement CP3 endpoints
- ✓ Implement simulator endpoints
- ✓ API integration tests

### Phase 4: Frontend (Week 4)
- ✓ Set up React project
- ✓ Create CP switcher component
- ✓ Create message simulator
- ✓ Create message flow display
- ✓ Create dashboard components

### Phase 5: Integration & Testing (Week 5)
- ✓ End-to-end testing
- ✓ Test all scenarios
- ✓ Performance testing
- ✓ Bug fixes
- ✓ Documentation

### Phase 6: Polish & Deployment (Week 6)
- ✓ UI/UX improvements
- ✓ Add animations/visualizations
- ✓ Docker containerization
- ✓ Deployment documentation
- ✓ User guide

---

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.0+
- **Framework**: Express.js
- **Database**: MySQL 8.0
- **ORM**: TypeORM or Sequelize
- **Crypto**: Node crypto module for signatures
- **Testing**: Jest, Supertest

### Frontend
- **Framework**: React 18 + TypeScript
- **Styling**: TailwindCSS
- **State Management**: React Context + Hooks
- **HTTP Client**: Axios
- **UI Components**: Headless UI
- **Visualization**: D3.js for message flow diagrams
- **Testing**: React Testing Library, Jest

### DevOps
- **Containerization**: Docker + Docker Compose
- **Database Migrations**: Flyway or TypeORM migrations
- **Build Tool**: Vite (frontend), tsc (backend)
- **Linting**: ESLint + Prettier

---

## Initial Data Setup

### CP1 Configuration
```json
{
  "cpId": "CP1-UK-0001",
  "apiEndpoint": "http://localhost:3001",
  "numberRanges": ["+44712345XX", "+44712346XX"],
  "authMode": "direct_query"
}
```

### CP2 Configuration
```json
{
  "cpId": "CP2-UK-0002",
  "apiEndpoint": "http://localhost:3002",
  "numberRanges": ["+44770090XX", "+44770091XX"],
  "authMode": "direct_query"
}
```

### CP3 Configuration
```json
{
  "cpId": "CP3-UK-0003",
  "apiEndpoint": "http://localhost:3003",
  "numberRanges": ["+44777700XX", "+44777701XX"],
  "authMode": "token_pool",
  "tokenPoolEndpoint": "http://localhost:3000/token-pool"
}
```

---

## Deliverables

1. **Source Code** - Complete TypeScript backend + React frontend
2. **Docker Compose** - One-command setup (3 MySQL DBs + backend + frontend)
3. **API Documentation** - OpenAPI/Swagger spec for all endpoints
4. **User Guide** - How to use the test harness
5. **Test Scenarios** - Step-by-step guide for each scenario
6. **Database Schema** - SQL scripts and ER diagram
7. **Architecture Diagram** - Visual system overview

---

## Success Criteria

- ✓ Can simulate calls between any CP combination
- ✓ All PSTN2 message types are exchanged and logged
- ✓ Porting chains resolve correctly (up to 3 hops)
- ✓ Both Direct Query and Token Pool auth work
- ✓ Web interface is intuitive and real-time
- ✓ Message flow is clearly visualized
- ✓ Can switch CP perspective instantly
- ✓ All database operations are fast (<100ms)
- ✓ System can handle 100+ simulated calls without degradation

---

## Next Steps

1. Review and approve this plan
2. Begin Phase 1 (Foundation) implementation
3. Set up development environment
4. Create GitHub repository
5. Initialize databases and run migrations
6. Start coding core library modules

---

**End of Implementation Plan**
