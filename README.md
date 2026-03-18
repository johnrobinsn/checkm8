# checkm8

A real-time collaborative to-do list app with hierarchical task organization, sharing, and keyboard-first navigation.

Built for personal and family use — share lists with anyone who has a Google account.

## Features

**Hierarchical Tasks**
- Two node types: **sections** (headings/groups) and **items** (with checkboxes)
- Nest up to 5 levels deep
- Drag-and-drop reordering across nesting levels
- Collapsible/expandable sections

**Real-Time Collaboration**
- Live sync via WebSockets — changes appear instantly
- Presence indicators show who's viewing each list
- Field-level conflict resolution (last write wins per field, not per item)

**Sharing**
- Generate shareable links with read-only or read-write permissions
- Any Google account holder can be a collaborator
- Owner can revoke access at any time

**Keyboard Navigation**
- Arrow keys for tree navigation
- Tab / Shift+Tab to indent/outdent
- Enter to toggle editing, Escape to cancel
- Space to toggle section collapse/expand
- Ctrl+Alt+N to create a new list
- Ctrl+Alt+G for new sections
- Ctrl+Alt+L or `/` to focus search
- Ctrl+Z / Ctrl+Shift+Z for undo/redo (session-scoped, 50 ops)

**Item Properties**
- Checkbox with strikethrough on completion
- Inline notes (expandable/collapsible per item)
- Due dates with color-coded urgency (red = overdue, yellow = due soon)
- Priority levels (High / Medium / Low) shown as colored dots

**CLI Tool**
- Full-featured terminal interface for humans and AI agents
- All commands: `auth`, `list`, `item`, `section`, `note`, `share`, `import`
- `--json` flag for machine-readable output
- Markdown export: `checkm8 list show "My List" --format md`
- Browser OAuth + device code flow for headless environments

**Other**
- Google OAuth sign-in
- Installable as a PWA (standalone, no URL bar)
- Dark/light theme follows OS preference
- API token management UI for CLI/agent access
- Soft-delete with archive and restore
- Batch import API (JSON/YAML) for programmatic list creation
- Mobile-responsive design with touch-friendly controls
- Real-time sidebar updates when lists are created/deleted/renamed
- Full-text search across list contents (items, sections, notes)

## Screenshots

> *Coming soon*

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, async SQLite (aiosqlite) |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Auth | Google OAuth 2.0, JWT tokens |
| Real-time | WebSockets |
| Drag & Drop | @dnd-kit |
| CLI | Python (Click + Rich + httpx) |
| Package Management | uv (Python), npm (frontend) |

## Setup

### Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) for Python dependency management
- Google OAuth credentials ([setup guide](#google-oauth-setup))

### Quick Start (both servers)

```bash
npm install          # Install concurrently
cd frontend && npm install && cd ..
cd backend && uv sync && cd ..

# Configure Google OAuth (see below)
cp backend/.env.example backend/.env

# Start both backend and frontend
npm run dev
```

The app will be available at `http://localhost:5173`.

### Individual Servers

```bash
# Backend only
cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Frontend only
cd frontend && npm run dev -- --host
```

### CLI

```bash
cd cli && uv sync

# Authenticate (opens browser)
uv run checkm8 auth login --url http://localhost:8001

# Or install globally
uv tool install -e /path/to/checkm8/cli
checkm8 auth login
```

### Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URI: `http://localhost:8001/auth/google/callback`
7. Copy the Client ID and Client Secret into your `backend/.env`:

```env
CHECKM8_GOOGLE_CLIENT_ID=your-client-id
CHECKM8_GOOGLE_CLIENT_SECRET=your-client-secret
CHECKM8_GOOGLE_REDIRECT_URI=http://localhost:8001/auth/google/callback
```

### Running Tests

```bash
cd backend
uv run pytest -v              # Run all tests
uv run pytest --cov=app       # With coverage report
```

41 tests, 82% coverage.

## API Overview

All endpoints are prefixed and accessible at `http://localhost:8001`.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google/login` | Get Google OAuth redirect URL |
| GET | `/auth/google/callback` | OAuth callback (redirects to frontend) |
| GET | `/auth/me` | Get current user |
| POST | `/auth/tokens` | Create API token |
| GET | `/auth/tokens` | List API tokens |
| DELETE | `/auth/tokens/{token_id}` | Delete API token |
| POST | `/auth/logout` | Logout |

### Lists

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/lists` | Create a list |
| GET | `/lists` | Get all accessible lists |
| GET | `/lists/{id}` | Get a single list |
| PUT | `/lists/{id}` | Update list name |
| POST | `/lists/{id}/archive` | Archive a list |
| POST | `/lists/{id}/restore` | Restore from archive |
| DELETE | `/lists/{id}` | Permanently delete |

### Nodes (Items & Sections)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/lists/{id}/nodes` | Get all nodes in a list |
| POST | `/lists/{id}/nodes` | Create a node |
| POST | `/lists/{id}/nodes/import` | Batch import nodes (JSON) |
| GET | `/lists/{id}/nodes/{node_id}` | Get a single node |
| PUT | `/lists/{id}/nodes/{node_id}` | Update a node |
| POST | `/lists/{id}/nodes/{node_id}/move` | Move/reorder a node |
| DELETE | `/lists/{id}/nodes/{node_id}` | Delete node (cascades to children) |

### Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/lists/{id}/shares` | Create share link |
| GET | `/lists/{id}/shares` | List shares |
| DELETE | `/lists/{id}/shares/{share_id}` | Revoke share |
| POST | `/shares/{token}/claim` | Claim a share link |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:8001/ws/{list_id}?token={jwt}` | Real-time sync for a list |
| `ws://localhost:8001/ws/global?token={jwt}` | List-level change notifications |

### Batch Import Format

```json
POST /lists/{id}/nodes/import

{
  "nodes": [
    {
      "text": "Groceries",
      "node_type": "section",
      "children": [
        { "text": "Milk", "node_type": "item" },
        { "text": "Eggs", "node_type": "item", "priority": "high" },
        {
          "text": "Produce",
          "node_type": "section",
          "children": [
            { "text": "Bananas", "node_type": "item" },
            { "text": "Spinach", "node_type": "item", "due_date": "2026-03-20" }
          ]
        }
      ]
    }
  ]
}
```

## CLI

A terminal-first interface for managing checkm8 lists, designed for both human use and AI agent workflows.

```bash
checkm8 auth login                          # OAuth browser flow
checkm8 auth login --token TOKEN            # Direct token auth
checkm8 list ls                             # List all lists
checkm8 list create "Groceries"             # Create a new list
checkm8 list show "Groceries" --format md   # Export as markdown
checkm8 item add LIST "Milk" --priority high
checkm8 item check LIST "Milk"
checkm8 section add LIST "Produce"
checkm8 note set LIST ITEM "Remember organic"
checkm8 share create LIST --permission write
checkm8 import LIST items.yaml              # Batch import
```

- **Human-readable** output by default, **`--json`** flag for structured output
- API token auth for headless/CI use (`CHECKM8_API_TOKEN` env var)
- Browser OAuth + device code flow for headless environments
- ID prefix matching (no need for full UUIDs)
- See [cli/CLAUDE.md](cli/CLAUDE.md) for full command reference

## Architecture

```
checkm8/
├── backend/
│   ├── app/
│   │   ├── auth/       # Google OAuth, JWT, API tokens, device code flow
│   │   ├── lists/      # List CRUD, search, archive
│   │   ├── nodes/      # Tree operations, batch import
│   │   ├── sharing/    # Share links, permissions
│   │   ├── ws/         # WebSocket manager (per-list + global)
│   │   ├── config.py   # Settings (env-based)
│   │   ├── database.py # SQLite schema, connection
│   │   ├── schemas.py  # Pydantic models
│   │   └── main.py     # FastAPI app
│   └── tests/          # 41 tests, 82% coverage
├── frontend/
│   ├── public/         # PWA manifest, service worker, icons
│   ├── src/
│   │   ├── api/        # REST client
│   │   ├── components/ # React UI (mobile-responsive)
│   │   ├── hooks/      # Auth, WebSocket, tree state, undo
│   │   ├── lib/        # Tree utilities
│   │   └── types.ts    # Shared types
│   └── ...
├── cli/                # CLI tool (Click + Rich + httpx)
│   ├── checkm8_cli/    # Command modules
│   ├── CLAUDE.md       # Agent command reference
│   └── pyproject.toml
├── SPEC.md             # Full project specification
├── package.json        # Root: npm run dev starts both servers
└── README.md
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
