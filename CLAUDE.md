# CLAUDE.md - Cloistr Sheets

**Collaborative spreadsheet editor - Google Sheets alternative for Cloistr**

## Project Information

- **Company:** Coldforge LLC
- **Type:** Cloistr Service
- **Purpose:** Real-time collaborative spreadsheet editor using Univer.js and Yjs
- **Status:** Development - Initial scaffold created

## Technology Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| **Spreadsheet Engine** | Univer.js | Feature-rich spreadsheet library |
| **Real-time Collaboration** | Yjs | Conflict-free replicated data types |
| **Frontend** | React 18 + TypeScript + Vite | Standard Cloistr web stack |
| **Authentication** | cloistr-collab-common | Shared auth provider |
| **Deployment** | Kubernetes/Atlas | Standard Coldforge deployment |

## Architecture

### Univer.js Integration

Using the following Univer plugins:
- `@univerjs/core` - Core spreadsheet engine
- `@univerjs/sheets` - Sheet functionality
- `@univerjs/sheets-ui` - Sheet UI components
- `@univerjs/ui` - Base UI framework
- `@univerjs/design` - Design system and themes
- `@univerjs/engine-render` - Rendering engine

### Collaboration Strategy

**Custom Yjs Integration Required:**
- Univer.js does not have native Yjs support
- Need to implement adapter between Univer's internal data model and Yjs
- Will handle real-time synchronization of cell changes, formatting, etc.

### Dependencies

| Dependency | Purpose |
|------------|---------|
| `cloistr-collab-common` | Shared authentication and collaboration utilities |
| `nostr-tools` | Nostr protocol integration |
| `yjs` | Conflict-free collaborative editing |
| `react` + `react-dom` | UI framework |
| `vite` | Build tooling |

## Development Status

### ✅ Completed
- Project scaffold created
- Basic Univer.js integration
- React app structure
- TypeScript configuration
- Build system (Vite)

### 🔄 TODO - High Priority
1. **Implement Yjs-Univer Adapter** - Bridge between Univer's data model and Yjs for real-time sync
2. **Document Persistence** - Store sheets in cloistr-files or similar backend
3. **Nostr Integration** - Share sheets via Nostr events
4. **User Permissions** - Read/write access control
5. **Export/Import** - Excel, CSV, etc. compatibility

### 🔄 TODO - Future Features
- Formula calculations
- Charts and visualizations
- Comments and annotations
- Version history
- Template gallery

## File Structure

```
cloistr-sheets/
├── src/
│   ├── components/
│   │   └── Sheet.tsx          # Main Univer spreadsheet component
│   ├── App.tsx                # App with AuthProvider
│   ├── main.tsx               # React entrypoint
│   └── index.css              # Base styles
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite configuration
├── index.html                 # HTML template
└── CLAUDE.md                  # This file
```

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Integration Notes

### cloistr-collab-common
- Uses `AuthProvider` for Nostr-based authentication
- Linked via `file:../cloistr-collab-common` dependency
- Provides shared collaboration utilities

### Univer.js Notes
- Comprehensive spreadsheet engine with Excel-like features
- Actively maintained and performant
- Plugin-based architecture allows selective feature inclusion
- Good TypeScript support

### Yjs Integration Challenge
- Univer.js has its own internal data model
- Need to create bidirectional sync between Univer and Yjs
- Consider using Yjs Map/Array structures to mirror sheet data
- Handle conflicts gracefully (Yjs provides automatic CRDT resolution)

---

**Last Updated:** 2026-03-20

**Recent Changes:**
- 2026-03-20: Initial project scaffold created with Univer.js integration