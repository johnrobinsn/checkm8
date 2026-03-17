# checkm8 — Shared To-Do List App

## Overview
A real-time collaborative to-do list app with hierarchical task organization, sharing, and keyboard-first navigation.

## Platform
- Web app, mobile-first responsive design, also works on desktop
- Keyboard-first navigation with touch and mouse support
- Dark/light theme follows OS system preference automatically
- Target scale: personal/family use (<50 users)

## Tech Stack
- **Backend:** Python with FastAPI (async, WebSocket support)
- **Frontend:** React with Tailwind CSS
- **CLI:** Python CLI (`checkm8`) for managing lists from the terminal
- **Database:** SQLite (file-based, real DB in tests)
- **Real-time:** WebSockets for live sync
- **Auth:** Google OAuth (web), OAuth browser flow + API tokens (CLI)
- **Deployment:** Single VPS, online only (no offline support)

## Authentication
- Google OAuth sign-in
- Any Google account holder can be a collaborator

## Multiple Lists
- Create, browse, and search to-do lists
- Search within list contents
- Each list is individually bookmarkable via URL

## Hierarchical Structure
- Two node types: **group/section** (no checkbox, organizational) and **item** (with checkbox)
- Nesting capped at **5 levels** deep
- **Drag-and-drop** reordering across nesting levels (within the 5-level cap)
- Quick item creation relative to current selection
- Check/uncheck items — checked items **strike through in place** (no reordering)
- Sections are **collapsible/expandable**

## Item Properties
- **Text** — the item description
- **Checkbox** — done/not done (items only, not sections)
- **Inline notes** — expandable/collapsible free-form text per item, indented to item's level
- **Due date** (optional) — color-coded urgency:
  - Red: overdue
  - Yellow: due today or tomorrow
  - Normal: all other dates
- **Priority** (optional) — High / Medium / Low, displayed as a colored dot/badge next to the item

## Sharing & Permissions
- Owner can share lists with other Google account holders
- **MVP sharing flow:** Owner generates a shareable URL (copy link), sends it manually (no app-sent emails for MVP)
- Permission levels: read-only or read-write
- Owner can revoke sharing
- Bookmarkable URLs for the app and individual lists

## Real-Time Collaboration
- **Live sync** via WebSockets — changes from other users appear instantly
- **Presence indicators:** small avatars of active users shown at the top of the list
- **Conflict resolution:** field-level merge (text, checked state, notes, due date, priority tracked independently). Last write wins per field — no full-item overwrites.

## Undo / Redo
- Session-scoped undo/redo (resets when tab is closed)
- ~50 operation history depth
- Covers: create, delete, move, check/uncheck, edit text, edit notes

## Notifications
- **In-app ephemeral toasts** only — brief popup when shared list items change, auto-dismisses
- No notification history/center
- No email notifications for MVP

## List Deletion
- **Soft delete with archive** — deleted lists move to an archive
- Owner can restore archived lists
- Shared users lose access until restored

## Keyboard Navigation
- **Arrow keys** for tree navigation (up/down to move between items, left/right to collapse/expand or move between levels)
- **Tab / Shift+Tab** to indent/outdent items
- **Enter** to create a new item
- Standard shortcuts for undo (Ctrl+Z), redo (Ctrl+Shift+Z)

## CLI (`checkm8`)

The CLI is a first-class interface to checkm8, designed for both human scripting and AI agent workflows.

### Architecture
- **API client** — CLI calls the FastAPI REST API (same as the web app). All operations go through the API, ensuring real-time sync triggers and permission enforcement.

### Authentication
- **OAuth browser flow** for interactive use — opens browser for Google login, stores refresh token in `~/.checkm8/config`
- **API tokens** for headless/AI agent use — generate long-lived tokens from the web UI, store in `~/.checkm8/config`

### Output Modes
- **Human-readable** (default) — pretty-printed, colored text output
- **JSON** (`--json` flag) — structured JSON output for scripting and AI agents

### Commands
Full coverage of all app operations:

- **List management:** `checkm8 list create|ls|search|archive|restore|delete`
- **Item CRUD:** `checkm8 item add|edit|rm|show` with `--parent`, `--after`, `--priority`, `--due` flags
- **Tree operations:** `checkm8 item move|indent|outdent|check|uncheck`
- **Notes:** `checkm8 note set|show|clear`
- **Sections:** `checkm8 section add|rm|rename`
- **Sharing:** `checkm8 share create-link|revoke|ls` (list collaborators)
- **Admin:** `checkm8 admin users|sessions`
- **Auth:** `checkm8 auth login|token|logout`

### Batch Operations
- Accept structured **JSON or YAML input** via `checkm8 import` to create an entire list with hierarchy in one shot
- Example: `checkm8 import --file grocery-list.yaml`
- Useful for AI agents that generate a full list structure and apply it atomically

### AI Agent Usage
- AI agents interact by shelling out to the `checkm8` CLI
- `--json` flag ensures parseable output for all commands
- Batch import enables creating complex list structures in a single call
- Example workflow: agent generates YAML, pipes to `checkm8 import --json --stdin`

## Testing Strategy

### Frontend Tests
- **React Testing Library** for component-level tests
- Test tree operations (create, delete, move, indent/outdent, check/uncheck)
- Test keyboard navigation flows
- Test drag-and-drop behavior
- Test real-time update rendering

### Backend Tests
- **pytest** with async support for FastAPI
- Tests hit a **real SQLite file** (cleaned between runs) — no mocks for the database
- Test API endpoints, WebSocket message handling, auth flows
- Test conflict resolution logic
- Test sharing/permissions enforcement

### Coverage
- **80% minimum coverage enforced** — CI fails if coverage drops below threshold
- Coverage tracked for both frontend (Istanbul/c8) and backend (coverage.py)
- Coverage reports mapped against features to identify gaps

### CLI Tests
- **pytest** tests for the CLI using subprocess calls to `checkm8`
- Test all command groups against a running test server
- Verify JSON output mode parses correctly
- Test batch import with sample YAML/JSON fixtures
- Test auth token flow

### CLI Testability
- Backend API is fully testable via `curl` / `httpie` or the `checkm8` CLI itself
- WebSocket endpoints testable via `websocat` or similar CLI tools
- Database state inspectable via `sqlite3` CLI for debugging
- The CLI's `--json` output mode makes it easy to assert on state in automated tests
