# PSTN2 Complete Project Download

**Version:** 1.0
**Date:** 2025-11-30
**Created with:** Claude Code AI

## What's Included

This archive contains the complete PSTN2 project including:

- ✅ All 9 educational animations with voiceover
- ✅ Code samples in TypeScript, Python, and Go (15 examples total)
- ✅ Complete protocol and API specifications
- ✅ Implementation guides for all three languages
- ✅ Testing and certification documentation
- ✅ Deployment scripts for FTP upload
- ✅ Claude Code AI support files (Claude.md)
- ✅ Website source code and styling

## Quick Start

### 1. Extract the Archive

```bash
unzip pstn2-complete.zip
cd pstn2-complete
```

### 2. Browse Locally

Open `animations/index.html` in your web browser to view the complete website offline.

### 3. Run Code Examples

#### TypeScript
```bash
cd code/typescript/examples
npm install
export PSTN2_PRIVATE_KEY="your-key-here"
npx tsx 01-basic-authentication.ts
```

#### Python
```bash
cd code/python/examples
pip install pstn2
export PSTN2_PRIVATE_KEY="your-key-here"
python 01_basic_authentication.py
```

#### Go
```bash
cd code/go/examples
go mod init my-pstn2-test
go get github.com/pstn2/pstn2-go
export PSTN2_PRIVATE_KEY="your-key-here"
go run 01-basic-authentication.go
```

### 4. Deploy Your Own Instance

The project includes deployment scripts:

```bash
cd animations
# Edit deploy.sh with your FTP credentials
./deploy.sh

cd ../code
# Edit deploy.sh with your FTP credentials
./deploy.sh
```

## Directory Structure

```
pstn2-complete/
├── animations/               # Educational animations & website
│   ├── index.html           # Main homepage
│   ├── src/                 # 9 animation presentations
│   └── deploy.sh            # Deployment script
│
├── code/                    # Code samples & SDKs
│   ├── typescript/          # 5 TypeScript examples
│   ├── python/              # 5 Python examples
│   ├── go/                  # 5 Go examples
│   ├── EXAMPLES.md          # Complete examples guide
│   └── deploy.sh            # Deployment script
│
├── SPECIFICATION.md         # Protocol specification v1.0
├── API-SPECIFICATION.yaml   # OpenAPI 3.0 REST API
├── IMPLEMENTATION-GUIDE.md  # Multi-language implementation guide
├── TESTING-SPECIFICATION.md # Testing & certification
├── Claude.md                # Claude Code AI guidance
├── DEPLOYMENT-SUMMARY.md    # Deployment documentation
├── HOMEPAGE-UPDATE.md       # Recent changes log
└── DOWNLOAD-README.md       # This file
```

## Using with Claude Code

This project was created with Claude Code AI. To continue development:

1. **Install Claude Code:**
   - Visit: https://claude.com/claude-code
   - Download and install for your platform

2. **Open the Project:**
   ```bash
   cd pstn2-complete
   claude-code .
   ```

3. **Read Claude.md:**
   The `Claude.md` file contains complete guidance for the AI including:
   - Project overview and architecture
   - Current status of all deliverables
   - Technical stack and patterns
   - Deployment procedures
   - Key design patterns
   - Performance targets

4. **Ask Claude to Continue:**
   - "Implement the test environment with 3 CPs"
   - "Add a new animation explaining..."
   - "Create additional code examples for..."
   - "Update the documentation to include..."

## License & Usage

**Open Source / Public Domain**

✅ **Free to Use:** No commercial ownership (except Comms Council UK logo)
✅ **Modify:** Change anything to fit your needs
✅ **Deploy:** Run on your own infrastructure
✅ **Distribute:** Share with others
✅ **Learn:** Educational reference implementation

**Attribution:**
- Created with Claude Code AI (https://claude.com/claude-code)
- Sponsored by Comms Council UK
- Project Lead: Nick Holland (nick.holland@8x8.com)

## Documentation

### Protocol Specifications
- **SPECIFICATION.md** - Complete PSTN2 protocol v1.0 (2,000+ lines)
- **API-SPECIFICATION.yaml** - OpenAPI 3.0 REST API spec (1,400+ lines)
- **IMPLEMENTATION-GUIDE.md** - Multi-language guide (1,800+ lines)
- **TESTING-SPECIFICATION.md** - Testing & certification (1,100+ lines)

### Code Examples
- **EXAMPLES.md** - Comprehensive guide to all 15 examples (3,600+ lines)
- **TypeScript README** - TypeScript SDK documentation
- **Python README** - Python SDK documentation (410 lines)
- **Go README** - Go SDK documentation (470 lines)

### Each Language Has 5 Examples:
1. **Basic Authentication** - Verify inbound calls with Direct Query
2. **Direct Routing** - Request peer-to-peer routing
3. **Token Pool** - Alternative authentication mechanism
4. **Emergency Services** - Real-time location for 999/112/911
5. **Complete Call Flow** - End-to-end Alice→Bob scenario

## Animations

All 9 presentations include:
- Interactive D3.js visualizations
- UK English voice synthesis
- Navigation controls
- Scene-by-scene explanations
- Auto-play option

### Available Presentations:
1. **Problem Statement** (6 scenes) - Current PSTN issues
2. **Solution Overview** (7 scenes) - PSTN2 introduction
3. **Authentication Option 1** (9 scenes) - Direct Query
4. **Authentication Option 2** (8 scenes) - Token Pool
5. **Direct Routing** (8 scenes) - Peer-to-peer connections
6. **Emergency Services** (7 scenes) - Real-time 999 location
7. **Distributed Database** (8 scenes) - Directory service
8. **MAP Architecture** (6 scenes) - Messaging infrastructure
9. **End-to-End Scenario** (8 scenes) - Complete call example

## Technical Requirements

### To View Locally
- Modern web browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- No server required for animations

### To Run Code Examples

**TypeScript:**
- Node.js 18+
- npm or yarn
- TypeScript 5.0+

**Python:**
- Python 3.11+
- pip, poetry, or uv
- Optional: virtualenv

**Go:**
- Go 1.21+
- Go modules enabled

### To Deploy
- FTP access to web server
- curl command-line tool
- Bash shell (or adapt scripts for Windows)

## Deployment

The project includes two deployment scripts:

### Deploy Animations & Website
```bash
cd animations
# Edit deploy.sh - update FTP credentials
./deploy.sh
```

### Deploy Code Samples
```bash
cd code
# Edit deploy.sh - update FTP credentials
./deploy.sh
```

Both scripts use curl with FTP to upload files to your web server.

## Performance

Expected performance per protocol specification:
- **Authentication:** < 100ms (95th percentile)
- **Call Setup:** < 1 second total
- **Directory Lookup:** < 50ms typical
- **Token Pool:** < 50ms for verification

## Security

All implementations include:
- Ed25519 cryptographic signatures
- TLS 1.3 for transport
- SRTP for media encryption
- Environment variables for secrets
- No hardcoded credentials

## Architecture Principles

**Distributed Over Centralized:**
No central database required. All data exists in distributed CP databases.

**Edge Implementation:**
Can be deployed "over the top" without PSTN infrastructure changes.

**Optional Participation:**
CPs can adopt at their own pace. Backward compatible with traditional PSTN.

**Short-lived Objects:**
Call data objects exist for ~30 seconds, enabling memory-based implementations.

## Support & Community

- **Website:** https://pstn2.org
- **Email:** nick.holland@8x8.com
- **Organization:** Comms Council UK
- **Claude Code:** https://claude.com/claude-code

## Contributing

This is an open educational project. Contributions welcome:

1. **Code Improvements** - Optimize existing examples
2. **New Examples** - Add use cases
3. **Documentation** - Clarify or expand docs
4. **Translations** - Support more languages
5. **Testing** - Add test coverage
6. **Animations** - Create new explanatory content

## Changelog

### Version 1.0 (2025-11-30)
- ✅ 9 complete educational animations
- ✅ 15 code examples (TypeScript, Python, Go)
- ✅ Complete protocol specification
- ✅ OpenAPI 3.0 REST API spec
- ✅ Implementation guides for 3 languages
- ✅ Testing & certification documentation
- ✅ Production website at pstn2.org
- ✅ All deployed and verified

## Future Development

Potential next phases:
1. **Test Environment** - 3-CP Docker Compose simulation
2. **CI/CD Pipeline** - Automated testing
3. **GitHub Repository** - Public source control
4. **Community Contributions** - Open collaboration
5. **Enhanced Website** - Interactive playground
6. **Video Tutorials** - Walkthrough examples

## Getting Help

### Read the Documentation
Start with `Claude.md` for project overview, then:
- `SPECIFICATION.md` for protocol details
- `EXAMPLES.md` for code usage
- Language-specific READMEs for SDK docs

### Ask Claude Code
If you have Claude Code installed:
1. Open the project directory
2. Ask questions about the code
3. Request new features or examples
4. Get help debugging issues

### Contact the Team
- Email: nick.holland@8x8.com
- Website: https://pstn2.org

---

**Thank you for using PSTN2!**

This project demonstrates how modern AI tools like Claude Code can accelerate the creation of complex technical documentation, working code samples, and educational content.

Feel free to use, modify, and share this work. Together we can improve telecommunications for everyone.
