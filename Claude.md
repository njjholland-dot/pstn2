# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PSTN2 is a telecom industry standards project aimed at solving critical challenges in the global Public Switched Telephone Network (PSTN). The project focuses on:

- Caller ID verification and fraud prevention without requiring a centralized numbering database (CDB)
- End-to-end encryption capabilities
- Direct routing mechanisms
- Distributed messaging architecture where each Communication Provider (CP) maintains their own data

**Key terminology:**
- **CP** (Communication Provider): Telecom range holders and carriers
- **CDB** (Central Database): A proposed centralized industry numbering database - this project explicitly avoids requiring one by using distributed data stores

## Current Project Status (2025-11-30)

### ✅ Completed Deliverables

1. **✅ Educational Animations (9 complete presentations)**
   - Problem Statement (6 scenes)
   - Solution Overview (7 scenes)
   - Authentication Option 1: Direct Query (9 scenes)
   - Authentication Option 2: Token Pool (8 scenes)
   - Direct Routing (8 scenes)
   - Emergency Services (7 scenes)
   - Distributed Database (8 scenes)
   - MAP Architecture (6 scenes)
   - End-to-End Scenario (8 scenes)
   - All with UK upper-class voice synthesis
   - Deployed live at: https://pstn2.org

2. **✅ Working Code Samples (15 examples across 3 languages)**
   - TypeScript: 5 complete examples
   - Python: 5 complete examples
   - Go: 5 complete examples
   - Each language demonstrates:
     * Basic authentication (Direct Query)
     * Direct routing with media negotiation
     * Token Pool authentication
     * Emergency services location
     * Complete end-to-end call flow
   - Deployed at: https://pstn2.org/code/

3. **✅ Complete Documentation (8 major documents)**
   - SPECIFICATION.md (2,000+ lines) - Complete protocol v1.0
   - API-SPECIFICATION.yaml (1,400+ lines) - OpenAPI 3.0 REST API
   - IMPLEMENTATION-GUIDE.md (1,800+ lines) - Multi-language guide
   - TESTING-SPECIFICATION.md (1,100+ lines) - Testing & certification
   - EXAMPLES.md (3,600+ lines) - Complete example documentation
   - TypeScript README (comprehensive SDK docs)
   - Python README (410 lines with async patterns)
   - Go README (470 lines with context patterns)
   - All deployed at: https://pstn2.org/docs/

4. **✅ Production Website**
   - Professional homepage with hero section
   - Interactive animations with navigation
   - Complete code samples section
   - Full documentation library
   - Responsive design (mobile/tablet/desktop)
   - Branding: Comms Council UK
   - Live at: https://pstn2.org

### 🚧 Pending Deliverables

1. **Test Environments** - Simulating 3 CPs to prove message exchange reliability
2. **Docker Compose** setup for local development
3. **CI/CD Pipeline** for automated testing
4. **Community Contributions** - GitHub repository when ready

## Architecture Principles

**Distributed over Centralized:**
The core architectural principle is that all information traditionally stored in a centralized database already exists in each CP's own databases. The solution uses messaging to query distributed data stores rather than building a central repository.

**Edge Implementation:**
All functionality can be implemented "at the edge" and "over the top" without changes to the existing PSTN infrastructure. This allows CPs to adopt at their own pace with minimal investment.

**Short-lived Data Objects:**
Call setup data objects need only exist for ~30 seconds, enabling low-cost, high-performance memory-based solutions.

**Optional Participation:**
Unlike STIR/SHAKEN, participation in enhanced features (caller verification, encryption, direct routing) is completely optional.

## Key Technical Processes

### Fraud Control 1: Caller ID Verification
1. Caller ID owner creates a data object when placing a call
2. Recipient CP queries the distributed data store identified for that Caller ID
3. Recipient verifies call validity from the returned data
4. Optional: Data object includes caller name and call purpose for routing decisions

### Fraud Control 2: End-to-End Encryption
1. Call setup data object includes caller's public encryption key
2. Recipient CP can add their own public encryption key to the data object
3. Both CPs encrypt voice/video media with exchanged keys
4. Works over standard PSTN with IP endpoints capable of encryption/decryption

### Direct Routing
1. Caller CP requests permission from recipient to place a call
2. Recipient returns IP/port for direct SIP invite
3. Eliminates traditional PSTN routing overhead

## Development Approach

**Plan First:** The PRD explicitly requires detailed planning and storyboards before any coding or animation generation begins.

**Question Unclear Requirements:** Ask clarifying questions whenever requirements are ambiguous.

**Multi-Component Delivery:** Keep in mind that code samples, test environments, animations, and website documentation all need to work together cohesively.

## Project Structure (Current)

```
PSTN2/
├── animations/                    # Educational presentations
│   ├── index.html                # Homepage with all animations
│   ├── src/
│   │   ├── problem-statement/    # 6 scenes explaining PSTN issues
│   │   ├── solution-overview/    # 7 scenes introducing PSTN2
│   │   ├── authentication-option1/ # 9 scenes: Direct Query
│   │   ├── authentication-option2/ # 8 scenes: Token Pool
│   │   ├── direct-routing/       # 8 scenes: Peer-to-peer routing
│   │   ├── emergency-services/   # 7 scenes: Real-time 999/112
│   │   ├── distributed-database/ # 8 scenes: Directory service
│   │   ├── map-architecture/     # 6 scenes: MAP infrastructure
│   │   └── end-to-end-scenario/  # 8 scenes: Complete call flow
│   └── deploy.sh                 # FTP deployment script
│
├── code/                          # Code samples & SDKs
│   ├── typescript/
│   │   ├── examples/             # 5 TypeScript examples
│   │   ├── src/                  # SDK source code
│   │   ├── README.md             # TypeScript SDK docs
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── python/
│   │   ├── examples/             # 5 Python examples
│   │   ├── pstn2/                # SDK package
│   │   └── README.md             # Python SDK docs
│   ├── go/
│   │   ├── examples/             # 5 Go examples
│   │   ├── pkg/                  # SDK packages
│   │   └── README.md             # Go SDK docs
│   ├── EXAMPLES.md               # Comprehensive example guide
│   └── deploy.sh                 # Code deployment script
│
├── docs/                          # Specifications (root level)
│   ├── SPECIFICATION.md          # Complete protocol spec
│   ├── API-SPECIFICATION.yaml    # OpenAPI 3.0 REST API
│   ├── IMPLEMENTATION-GUIDE.md   # Multi-language guide
│   ├── TESTING-SPECIFICATION.md  # Testing & certification
│   └── EXAMPLES.md               # Linked from code/
│
├── website/                       # Website source (mirrors animations)
│   ├── index.html
│   └── content/
│
├── test-environment/             # (Planned) 3-CP simulation
├── Claude.md                     # This file - AI guidance
├── DEPLOYMENT-SUMMARY.md         # Deployment documentation
└── HOMEPAGE-UPDATE.md            # Recent homepage changes
```

## Technical Stack

### Frontend (Animations & Website)
- **HTML5/CSS3** - Responsive design with CSS Grid/Flexbox
- **D3.js v7** - SVG animations and visualizations
- **Web Speech API** - Voice synthesis (UK English)
- **Vanilla JavaScript** - No framework dependencies

### Backend (Code Samples)
- **TypeScript 5.0+** - Type-safe Node.js implementation
- **Python 3.11+** - Async/await with Pydantic models
- **Go 1.21+** - High-performance with context support

### Infrastructure
- **Hosting:** NetworkSolutions FTP (pstn2.org)
- **Deployment:** Shell scripts with curl FTP upload
- **Version Control:** Local filesystem (Git recommended for future)

### Standards & Protocols
- **OpenAPI 3.0.3** - REST API specification
- **Ed25519** - Cryptographic signatures
- **TLS 1.3** - Transport encryption
- **SRTP** - Media encryption
- **JSON** - Message format
- **E.164** - Phone number format

## File Locations on Live Site

### Main Site
- Homepage: `https://pstn2.org/index.html`
- Animations: `https://pstn2.org/src/{animation-name}/`

### Code Examples
- TypeScript: `https://pstn2.org/code/typescript/`
- Python: `https://pstn2.org/code/python/`
- Go: `https://pstn2.org/code/go/`

### Documentation
- Examples Guide: `https://pstn2.org/docs/EXAMPLES.md`
- Protocol Spec: `https://pstn2.org/docs/SPECIFICATION.md`
- API Spec: `https://pstn2.org/docs/API-SPECIFICATION.yaml`
- Implementation: `https://pstn2.org/docs/IMPLEMENTATION-GUIDE.md`
- Testing: `https://pstn2.org/docs/TESTING-SPECIFICATION.md`

## Deployment Process

Deploy the whole site with the root deploy script (lftp mirror over SFTP to
NetworkSolutions hosting). It stages the repo into the deployed-site layout,
uploads only files newer than what is on the server, and never deletes
remote files (other projects share the same host under /htdocs).

```bash
export PSTN2_FTP_PASSWORD='<SFTP password>'   # from the local credentials vault
./deploy.sh --dry-run    # preview what would be uploaded
./deploy.sh              # deploy changed files
./deploy.sh --full       # re-upload everything
```

The legacy per-directory scripts (animations/deploy.sh, code/deploy.sh,
curl over plain FTP) still exist but the root script supersedes them.
Credentials are never stored in the repo — all scripts read
PSTN2_FTP_PASSWORD from the environment.

## License & Usage

**Open Source / Public Domain**
- No commercial ownership (except Comms Council UK branding on website)
- Free to download, use, modify, and deploy
- All code samples are reference implementations
- Documentation is freely available
- Created with Claude Code AI assistance

## Working with Claude Code

When continuing work on this project with Claude Code:

1. **Check Current Status** - Review Claude.md for completed work
2. **Read Existing Code** - Always read files before editing
3. **Follow Patterns** - Maintain consistency with existing code style
4. **Test Before Deploy** - Verify locally when possible
5. **Update Documentation** - Keep Claude.md and deployment docs current
6. **Deploy Carefully** - Use provided deployment scripts
7. **Verify Live** - Check deployed files are accessible

## Key Design Patterns

### Animation Structure
Each animation follows this pattern:
- `index.html` - Container with common styles
- `animation.js` - D3.js scene rendering and transitions
- `styles.css` - Scene-specific styling
- Scenes array with text, visuals, and speech
- UK voice synthesis with auto-play option

### Code Example Structure
All examples follow identical patterns across languages:
1. Client initialization with config
2. Main operation (auth, routing, emergency, etc.)
3. Error handling with PSTN fallback
4. Proper cleanup (close clients)
5. Comprehensive logging
6. Environment variable configuration

### Documentation Structure
- README.md - Quick start, installation, API reference
- SPECIFICATION.md - Complete protocol details
- EXAMPLES.md - Detailed usage guide
- Each doc includes code snippets in all three languages

## Performance Targets

As specified in protocol:
- **Authentication:** < 100ms (95th percentile)
- **Call Setup:** < 1 second total
- **Directory Lookup:** < 50ms typical
- **Token Pool:** < 50ms for verification
- **Fallback:** Always available to traditional PSTN

## Next Development Phases

When extending this project:

1. **Test Environment**
   - 3-CP Docker Compose setup
   - Simulated call flows
   - Automated testing
   - Performance benchmarking

2. **Community Features**
   - GitHub repository
   - Issue tracking
   - Pull request workflow
   - Community contributions

3. **Enhanced Website**
   - Interactive code playground
   - Video tutorials
   - Search functionality
   - User feedback system

4. **Production Features**
   - Monitoring & metrics
   - Rate limiting
   - Load balancing
   - High availability

## Contact & Support

- **Project Lead:** Nick Holland (nick.holland@8x8.com)
- **Organization:** Comms Council UK
- **Website:** https://pstn2.org
- **Claude Code:** Generated with Claude Code AI (https://claude.com/claude-code)
