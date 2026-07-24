# PSTN2 Test Harness

A comprehensive test environment for the PSTN2 protocol, simulating multiple Communication Providers (CPs) with full authentication, routing, and directory services.

## 🎯 Overview

This test harness provides a complete, working implementation of the PSTN2 protocol with:

- **3 Simulated CPs**: CP1 (Direct Query), CP2 (Direct Query), CP3 (Token Pool)
- **Real MySQL Database**: 500+ phone numbers across CPs
- **Full Protocol Implementation**: Authentication, Directory, Routing, Porting
- **Web UI**: Interactive call simulator with CP switching
- **Complete Test Suite**: 17 integration tests + 42 unit tests with 100% pass rate

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0
- npm or yarn

### 1. Start Backend

```bash
cd backend
npm install
npm run dev
```

The backend will start 4 services:
- CP1 API: http://localhost:3001
- CP2 API: http://localhost:3002
- CP3 API: http://localhost:3003
- Simulator: http://localhost:3000

### 2. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at: http://localhost:5173

### 3. Run Tests

```bash
cd backend

# Run all tests (unit + integration)
npm test

# Run only unit tests
npm test -- src/__tests__/

# Run only integration tests
npx ts-node tests/integration.test.ts
```

## 📊 Test Results

```
✅ Unit Tests: 42/42 passing (100%)
✅ Integration Tests: 17/17 passing (100%)
⏱️  Total execution time: ~1 second
📊 Test coverage: All PSTN2 use cases + utility functions
```

## 🏗️ Architecture

### Backend Structure

```
backend/
├── src/
│   ├── api/                    # API route handlers
│   │   ├── cp-routes.ts        # PSTN2 protocol endpoints
│   │   └── simulator-routes.ts # Test control API
│   ├── lib/
│   │   ├── core/              # Core PSTN2 services
│   │   │   ├── authentication.ts  # Direct Query & Token Pool
│   │   │   ├── directory.ts       # Number lookup & caching
│   │   │   ├── routing.ts         # Direct routing negotiation
│   │   │   ├── messaging.ts       # HTTP client with retry
│   │   │   ├── types.ts           # TypeScript interfaces
│   │   │   └── utils.ts           # Helpers & validation
│   │   └── database/
│   │       └── connection.ts   # MySQL connection pooling
│   ├── __tests__/             # Unit tests
│   │   ├── setup.ts           # Jest test setup
│   │   └── utils.test.ts      # Utils unit tests (42 tests)
│   └── server.ts              # Main entry point
├── tests/
│   └── integration.test.ts    # Integration test suite (17 tests)
├── jest.config.js             # Jest configuration
└── database/
    ├── migrations/            # SQL schema
    └── seeds/                 # Test data
```

### Database Schema

8 tables supporting complete PSTN2 functionality:

- **cp_config** - CP configurations
- **numbers** - Phone number inventory
- **directory_cache** - Cached directory entries
- **auth_tokens** - Token pool for authentication
- **call_records** - Call history
- **message_log** - Protocol message audit trail
- **porting_history** - Number porting records
- **statistics** - System metrics

## 🧪 Testing

### Unit Tests (42 tests)

Comprehensive tests for utility functions:

- **Phone Number Utilities** (17 tests): normalizePhoneNumber, isValidPhoneNumber, numberMatchesRange, extractRange
- **ID Generation** (9 tests): generateCallReference, generateMessageId, generateTokenId
- **Timestamp Utilities** (9 tests): getCurrentTimestamp, addSeconds, isExpired
- **Validation** (7 tests): isValidCPId, isValidUrl, isValidUUID

### Integration Tests (17 tests)

End-to-end tests covering:

1. Health checks (all services)
2. CP info endpoints
3. Directory queries (found/not found)
4. Directory publishing
5. Direct Query authentication
6. Token Pool authentication (create & verify)
7. Direct routing requests
8. Porting queries
9. Database access
10. End-to-end call simulation
11. CORS handling
12. Error handling
13. Media capability negotiation

### Test Data

- **CP1-UK-0001 (TelcoOne)**: 200 numbers, Direct Query auth
- **CP2-UK-0002 (ConnectCom)**: 200 numbers, Direct Query auth
- **CP3-UK-0003 (NetLink)**: 100 numbers, Token Pool auth

## 🔧 Configuration

### Database (backend/.env)

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=PSTN2_User
DB_PASSWORD=PSTN2_Pass_2024!
DB_NAME=PSTN2
```

## 📖 API Endpoints

### PSTN2 Protocol (each CP)

```
GET  /pstn2/v1/info                      - CP information
GET  /pstn2/v1/health                    - Health check
POST /pstn2/v1/directory/query           - Look up number
GET  /pstn2/v1/directory/all             - Get all ranges
POST /pstn2/v1/auth/verify               - Direct Query auth
POST /pstn2/v1/auth/token/create         - Create token (CP3)
POST /pstn2/v1/auth/token/verify         - Verify token (CP3)
POST /pstn2/v1/routing/request           - Direct routing request
POST /pstn2/v1/porting/query             - Porting status
```

### Simulator API

```
GET  /health                             - Simulator health
POST /api/call/initiate                  - Simulate call
GET  /api/call/:ref/messages             - Get call messages
GET  /api/cp/:id/numbers                 - Get CP numbers
GET  /api/cp/:id/stats                   - Get CP statistics
```

## 📝 Usage Examples

### Test Call Between CPs

```bash
# Directory lookup
curl -X POST http://localhost:3001/pstn2/v1/directory/query \
  -H "Content-Type: application/json" \
  -d '{"number": "+441712345000"}'

# Initiate call simulation
curl -X POST http://localhost:3000/api/call/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "fromCP": "CP1-UK-0001",
    "fromNumber": "+441712345000",
    "toNumber": "+441770090000"
  }'
```

## 📚 Documentation

- **DEPLOYMENT-NOTES.md** - Setup and deployment guide
- **GIT-WORKFLOW.md** - Git usage and workflow  
- **IMPLEMENTATION-PLAN.md** - Detailed implementation plan (50+ pages)
- **BUILD-STATUS.md** - Progress tracking

## 🎯 Success Metrics

- ✅ Backend: 100% complete (2500+ lines)
- ✅ Frontend: 100% complete (1500+ lines)
- ✅ Database: Fully configured and seeded
- ✅ Unit Tests: 42/42 passing (100%)
- ✅ Integration Tests: 17/17 passing (100%)
- ✅ Git: 5 commits with full history
- ✅ Documentation: Comprehensive guides

**Status**: Production Ready - All Tests Passing ✅

---

**Version**: 1.0.0
**Updated**: 2025-12-03
**Total Lines of Code**: 4800+
