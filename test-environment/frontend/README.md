# PSTN2 Test Harness - Frontend

React-based web portal for simulating and visualizing PSTN2 protocol message exchanges.

## Features

- **CP Switcher**: Switch between CP1, CP2, and CP3 perspectives
- **Call Simulator**: Initiate test calls with customizable parameters
- **Message Flow Visualization**: Real-time timeline of protocol messages
- **CP Dashboard**: Statistics and number inventory for each CP
- **Responsive Design**: Built with TailwindCSS for modern UI

## Tech Stack

- **React 18** - UI framework
- **TypeScript 5** - Type safety
- **Vite** - Fast build tool
- **TailwindCSS** - Utility-first CSS
- **Axios** - HTTP client
- **Lucide React** - Icon library
- **date-fns** - Date formatting

## Prerequisites

- Node.js 18+
- npm or yarn
- Backend server running on localhost:3000

## Installation

```bash
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

The application will be available at http://localhost:5173

## Building for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── CPSwitcher.tsx   # CP selection component
│   │   ├── CallSimulator.tsx # Call initiation form
│   │   ├── MessageFlow.tsx  # Message timeline
│   │   └── CPDashboard.tsx  # Statistics dashboard
│   ├── services/            # API services
│   │   └── api.ts           # Backend API client
│   ├── types/               # TypeScript types
│   │   └── index.ts         # Shared type definitions
│   ├── constants/           # Configuration
│   │   └── cps.ts           # CP configurations
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # App entry point
│   └── index.css            # Global styles
├── index.html               # HTML template
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite config
└── tailwind.config.js       # TailwindCSS config
```

## Usage

### Simulating a Call

1. Select the originating CP using the CP Switcher
2. Enter caller number (from selected CP's ranges)
3. Enter called number (from any CP)
4. Optionally add company name for branding
5. Toggle "Test Direct Routing" to include routing negotiation
6. Click "Initiate Call"
7. View the message flow in real-time

### Viewing Statistics

1. Click "CP Dashboard" tab
2. View number counts, call statistics, and porting info
3. Browse allocated numbers and ranges
4. Refresh data as needed

### Quick Test Scenarios

Use the quick test buttons to automatically populate the form with pre-configured scenarios for testing calls between different CPs.

## API Configuration

The frontend proxies API requests through Vite's dev server. Configuration in `vite.config.ts`:

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

## Environment Variables

No environment variables required for local development. API endpoints are configured in `src/constants/cps.ts`.

## Color Scheme

Each CP has a distinct color for visual identification:
- **CP1 (TelcoOne)**: Blue (#3b82f6)
- **CP2 (ConnectCom)**: Green (#10b981)
- **CP3 (NetLink)**: Amber (#f59e0b)

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

## Troubleshooting

**API Connection Issues**
- Ensure backend is running on localhost:3000
- Check CORS configuration
- Verify CP APIs are running on ports 3001, 3002, 3003

**Build Errors**
- Clear node_modules and reinstall
- Check Node.js version (18+ required)
- Verify TypeScript configuration

## License

Part of the PSTN2 Test Harness project.
