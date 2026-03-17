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
- Enter to toggle editing, F2 to rename
- Ctrl+Alt+N to add new items, Ctrl+Alt+G for new sections
- Ctrl+Z / Ctrl+Shift+Z for undo/redo (session-scoped, 50 ops)

**Item Properties**
- Checkbox with strikethrough on completion
- Inline notes (expandable/collapsible per item)
- Due dates with color-coded urgency (red = overdue, yellow = due soon)
- Priority levels (High / Medium / Low) shown as colored dots

**Other**
- Google OAuth sign-in
- Dark/light theme follows OS preference
- Soft-delete with archive and restore
- Batch import API (JSON/YAML) for programmatic list creation
- Mobile-responsive design

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
| CLI | Python (Click + Rich + httpx) — *in progress* |
| Package Management | uv (Python), npm (frontend) |

## Setup

### Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) for Python dependency management
- Google OAuth credentials ([setup guide](#google-oauth-setup))

### Backend

```bash
cd backend

# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env with your Google OAuth credentials

# Run the server
uv run uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server (proxies API requests to backend on port 8001)
npm run dev -- --host
```

The app will be available at `http://localhost:5173`.

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

## CLI (Planned)

A terminal-first interface for managing checkm8 lists, designed for both human use and AI agent workflows.

```
checkm8 auth login              # OAuth browser flow
checkm8 list ls                 # List all lists
checkm8 list create "Groceries" # Create a new list
checkm8 item add LIST "Milk"    # Add an item
checkm8 item check LIST ITEM    # Check off an item
checkm8 import --file list.yaml # Batch import
checkm8 share create-link LIST  # Generate share URL
```

- **Human-readable** output by default, **`--json`** flag for structured output
- API token auth for headless/CI use
- See [SPEC.md](SPEC.md) for full CLI specification

## Architecture

```
checkm8/
├── backend/
│   ├── app/
│   │   ├── auth/       # Google OAuth, JWT, API tokens
│   │   ├── lists/      # List CRUD, search, archive
│   │   ├── nodes/      # Tree operations, import
│   │   ├── sharing/    # Share links, permissions
│   │   ├── ws/         # WebSocket manager
│   │   ├── config.py   # Settings (env-based)
│   │   ├── database.py # SQLite schema, connection
│   │   ├── schemas.py  # Pydantic models
│   │   └── main.py     # FastAPI app
│   └── tests/          # 41 tests, 82% coverage
├── frontend/
│   ├── src/
│   │   ├── api/        # REST client
│   │   ├── components/ # React UI
│   │   ├── hooks/      # Auth, WebSocket, tree state, undo
│   │   ├── lib/        # Tree utilities
│   │   └── types.ts    # Shared types
│   └── ...
├── SPEC.md             # Full project specification
└── README.md
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
