# checkm8 CLI — Agent Reference

checkm8 is a collaborative todo list CLI. Run commands with `uv run checkm8` from the `cli/` directory, or install globally with `uv tool install -e /mntc/code/checkm8/cli`.

## Authentication

```bash
# Browser OAuth (interactive)
uv run checkm8 auth login --url http://localhost:8001

# Direct token (headless/agent use)
uv run checkm8 auth login --token <API_TOKEN> --url http://localhost:8001

# Or use environment variables (no login needed)
export CHECKM8_API_URL=http://localhost:8001
export CHECKM8_API_TOKEN=<API_TOKEN>

# Check auth status
uv run checkm8 auth status
```

## Lists

```bash
# List all lists
uv run checkm8 list ls
uv run checkm8 list ls --json

# Create a list
uv run checkm8 list create "My List"
uv run checkm8 list create "My List" --json   # returns {id, title, ...}

# Show a list (by title or ID prefix)
uv run checkm8 list show "My List"
uv run checkm8 list show "My List" --format md    # markdown output
uv run checkm8 list show "My List" --json          # JSON output

# Rename / archive / restore / delete
uv run checkm8 list rename "My List" "New Name"
uv run checkm8 list archive "My List"
uv run checkm8 list restore "My List"
uv run checkm8 list delete "My List" --yes

# Search lists and items
uv run checkm8 list search "query"
```

## Items

```bash
# Add an item (to root or under a parent section/item)
uv run checkm8 item add <LIST_REF> "Buy milk"
uv run checkm8 item add <LIST_REF> "Sub-task" --parent <SECTION_OR_ITEM_REF>
uv run checkm8 item add <LIST_REF> "Urgent" --priority high --due 2026-03-20

# Check/uncheck
uv run checkm8 item check <LIST_REF> <ITEM_REF>
uv run checkm8 item uncheck <LIST_REF> <ITEM_REF>

# Edit text
uv run checkm8 item edit <LIST_REF> <ITEM_REF> "New text"

# Delete
uv run checkm8 item delete <LIST_REF> <ITEM_REF> --yes

# List archived items (most recently completed first)
uv run checkm8 item archived <LIST_REF>
uv run checkm8 item archived <LIST_REF> --limit 10 --offset 20
uv run checkm8 item archived <LIST_REF> --json

# All item commands accept --json flag
```

## Sections (groups/headings)

```bash
# Add a section
uv run checkm8 section add <LIST_REF> "Section Name"
uv run checkm8 section add <LIST_REF> "Sub-section" --parent <PARENT_SECTION_REF>

# Rename / delete
uv run checkm8 section rename <LIST_REF> <SECTION_REF> "New Name"
uv run checkm8 section delete <LIST_REF> <SECTION_REF> --yes
```

## Notes

```bash
# Set a note on an item
uv run checkm8 note set <LIST_REF> <ITEM_REF> "Note text here"

# View a note
uv run checkm8 note show <LIST_REF> <ITEM_REF>

# Clear a note
uv run checkm8 note clear <LIST_REF> <ITEM_REF>
```

## Sharing

```bash
# Create a share link (returns a URL)
uv run checkm8 share create <LIST_REF>
uv run checkm8 share create <LIST_REF> --permission write

# List shares
uv run checkm8 share ls <LIST_REF>

# Revoke a share
uv run checkm8 share revoke <LIST_REF> <SHARE_REF>
```

## Batch Import

```bash
# Import from JSON or YAML file
uv run checkm8 import <LIST_REF> items.json
uv run checkm8 import <LIST_REF> items.yaml
```

Import format (JSON):
```json
{
  "nodes": [
    {
      "type": "section",
      "text": "Shopping",
      "children": [
        {"text": "Milk", "priority": "high"},
        {"text": "Eggs", "checked": true}
      ]
    },
    {"text": "Call dentist", "due_date": "2026-03-20", "notes": "Ask about cleaning"}
  ]
}
```

## Reference Conventions

- `<LIST_REF>` — list title (exact match) or ID prefix (e.g. `d26926f5` or even `d269`)
- `<ITEM_REF>` / `<SECTION_REF>` — item text (exact match) or ID prefix
- All commands support `--json` for machine-readable output
- Priority values: `high`, `medium`, `low`
- Due dates: `YYYY-MM-DD` format
- Max nesting depth: 5 levels
