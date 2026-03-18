# checkm8 CLI Skill

Use the `checkm8` CLI to manage collaborative todo lists. The CLI lives at `/mntc/code/checkm8/cli/` and is run via `uv run checkm8` from that directory.

## Authentication

Set the `CHECKM8_API_TOKEN` environment variable with a valid JWT or API token. The backend must be running on `http://localhost:8001` (or set `CHECKM8_API_URL`).

```bash
export CHECKM8_API_TOKEN="your-token-here"
```

Or configure persistently:
```bash
uv run checkm8 auth login --token "your-token"
uv run checkm8 auth status
```

## Commands Reference

All commands accept `--json` for machine-readable JSON output.

### Lists

```bash
# List all lists
uv run checkm8 list ls
uv run checkm8 list ls --json

# Show a list with its full item tree
uv run checkm8 list show "My List"
uv run checkm8 list show fe47f0   # ID prefix works too

# Create, rename, archive, restore, delete
uv run checkm8 list create "New List"
uv run checkm8 list rename "Old Name" "New Name"
uv run checkm8 list archive "My List"
uv run checkm8 list restore "My List"
uv run checkm8 list delete "My List" --yes

# Search lists and items
uv run checkm8 list search "keyword"
```

### Items

```bash
# Add an item (LIST_REF is a title or ID prefix)
uv run checkm8 item add "My List" "Buy milk"
uv run checkm8 item add "My List" "Organic" --parent "Groceries" --priority high --due 2025-03-20

# Toggle checked
uv run checkm8 item check "My List" "Buy milk"

# Update properties
uv run checkm8 item update "My List" "Buy milk" --text "Buy oat milk" --priority medium
uv run checkm8 item update "My List" "Buy milk" --due none  # clear due date

# Move an item
uv run checkm8 item move "My List" "Buy milk" --parent "Groceries"
uv run checkm8 item move "My List" "Buy milk" --parent root --after "Some item"

# Show details
uv run checkm8 item show "My List" "Buy milk"
uv run checkm8 item show "My List" "Buy milk" --json

# Delete
uv run checkm8 item delete "My List" "Buy milk" --yes
```

### Sections

```bash
# Add a section
uv run checkm8 section add "My List" "Groceries"
uv run checkm8 section add "My List" "Produce" --parent "Groceries"

# Rename
uv run checkm8 section rename "My List" "Groceries" "Food & Groceries"

# Delete (cascades to children)
uv run checkm8 section delete "My List" "Groceries" --yes
```

### Notes

```bash
# Set a note on an item
uv run checkm8 note set "My List" "Buy milk" "Get the 2% kind"

# Show note
uv run checkm8 note show "My List" "Buy milk"

# Clear note
uv run checkm8 note clear "My List" "Buy milk"
```

### Sharing

```bash
# Create share link
uv run checkm8 share create "My List" --permission write

# List shares
uv run checkm8 share ls "My List"

# Revoke
uv run checkm8 share revoke "My List" f7533450
```

### Import

Import items from a YAML or JSON file:

```bash
uv run checkm8 import "My List" items.yaml
uv run checkm8 import "My List" items.json --format json
```

YAML format:
```yaml
- text: "Section Name"
  type: section
  children:
    - text: "Item 1"
      priority: high
      due_date: "2025-03-20"
      notes: "Some notes"
    - text: "Item 2"
```

JSON format:
```json
[
  {
    "text": "Section Name",
    "type": "section",
    "children": [
      {"text": "Item 1", "priority": "high"},
      {"text": "Item 2"}
    ]
  }
]
```

## Tips for AI Agents

- Always use `--json` for parsing output programmatically
- Items and sections can be referenced by **name** or **ID prefix** (first 6-8 chars)
- The `list show` command with `--json` returns the full tree — useful for reading current state
- `list search` searches both list titles and item text/notes
- Import is the fastest way to bulk-create structured content
- All commands require `CHECKM8_API_TOKEN` to be set
- Run from `/mntc/code/checkm8/cli/` directory: `cd /mntc/code/checkm8/cli && uv run checkm8 ...`
