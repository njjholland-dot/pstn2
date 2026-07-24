# PSTN2 Test Harness

Complete test environment for the PSTN2 protocol with working implementation.

## What's Included

- **Backend**: Full PSTN2 protocol implementation (3 CPs + Simulator)
- **Frontend**: Interactive web UI for call simulation
- **Database**: MySQL schema and seed data (500+ phone numbers)
- **Tests**: 42 unit tests + 17 integration tests (100% pass rate)
- **Documentation**: Complete setup and deployment guides

## Quick Start

See `test-environment/README.md` for detailed instructions.

### Prerequisites
- Node.js 18+
- MySQL 8.0
- npm or yarn

### Setup

1. **Database**:
   ```bash
   cd test-environment/backend/database
   # Run migrations and seeds (see DEPLOYMENT-NOTES.md)
   ```

2. **Backend**:
   ```bash
   cd test-environment/backend
   npm install
   npm run dev
   ```

3. **Frontend**:
   ```bash
   cd test-environment/frontend
   npm install
   npm run dev
   ```

4. **Run Tests**:
   ```bash
   cd test-environment/backend
   npm test
   ```

## Documentation

- `test-environment/README.md` - Main documentation
- `test-environment/DEPLOYMENT-NOTES.md` - Setup and deployment guide
- `test-environment/GIT-WORKFLOW.md` - Git usage guide
- `test-environment/IMPLEMENTATION-PLAN.md` - Detailed implementation plan

## Support

Visit https://pstn2.org for complete specifications and API documentation.

## License

MIT License - See LICENSE file
