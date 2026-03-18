"""Import commands for checkm8 CLI."""

import json
import sys

import click
import yaml

from .client import api_get, api_post, resolve_list_id
from .output import console, print_json, print_nodes_tree


@click.command("import")
@click.argument("list_ref")
@click.argument("file", type=click.Path(exists=True))
@click.option("--format", "fmt", type=click.Choice(["json", "yaml", "auto"]), default="auto", help="Input format")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def import_cmd(list_ref: str, file: str, fmt: str, as_json: bool):
    """Batch import items from a JSON or YAML file.

    The file should contain a list of nodes with this structure:

    \b
    - text: "Section name"
      type: section
      children:
        - text: "Item 1"
        - text: "Item 2"
          priority: high
          due_date: "2025-01-15"
          notes: "Some notes"
    """
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)

    # Read and parse file
    with open(file) as f:
        content = f.read()

    if fmt == "auto":
        if file.endswith((".yml", ".yaml")):
            fmt = "yaml"
        else:
            fmt = "json"

    try:
        if fmt == "yaml":
            data = yaml.safe_load(content)
        else:
            data = json.loads(content)
    except Exception as e:
        console.print(f"[red]Error parsing file:[/red] {e}")
        raise SystemExit(1)

    # Normalize: accept either a list or {"nodes": [...]}
    if isinstance(data, dict):
        data = data.get("nodes", data.get("items", []))
    if not isinstance(data, list):
        console.print("[red]Error:[/red] Expected a list of nodes.")
        raise SystemExit(1)

    result = api_post(f"/lists/{lst['id']}/nodes/import", {"nodes": data})
    if as_json:
        print_json(result)
    else:
        count = len(result) if isinstance(result, list) else 0
        console.print(f"[green]✓[/green] Imported {count} nodes into [bold]{lst['title']}[/bold]")
        # Show the updated tree
        nodes = api_get(f"/lists/{lst['id']}/nodes")
        print_nodes_tree(nodes)
