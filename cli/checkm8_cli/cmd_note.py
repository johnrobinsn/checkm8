"""Note commands for checkm8 CLI."""

import click

from .client import api_get, api_patch, resolve_list_id, resolve_node_id
from .output import console, print_json


def _resolve_list_and_nodes(list_ref: str) -> tuple[dict, list[dict]]:
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)
    nodes = api_get(f"/lists/{lst['id']}/nodes")
    return lst, nodes


@click.group("note")
def note_cmd():
    """Manage notes on items."""


@note_cmd.command("set")
@click.argument("list_ref")
@click.argument("item_ref")
@click.argument("text")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def set_note(list_ref: str, item_ref: str, text: str, as_json: bool):
    """Set a note on an item."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)

    updated = api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", {"notes": text})
    if as_json:
        print_json(updated)
    else:
        console.print(f"[green]✓[/green] Note set on [bold]{node['text']}[/bold]")


@note_cmd.command("show")
@click.argument("list_ref")
@click.argument("item_ref")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def show(list_ref: str, item_ref: str, as_json: bool):
    """Show the note on an item."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)

    detail = api_get(f"/lists/{lst['id']}/nodes/{node['id']}")
    if as_json:
        print_json({"notes": detail.get("notes")})
    else:
        notes = detail.get("notes")
        if notes:
            console.print(f"[bold]{node['text']}[/bold]")
            console.print(notes)
        else:
            console.print(f"[dim]No notes on '{node['text']}'[/dim]")


@note_cmd.command("clear")
@click.argument("list_ref")
@click.argument("item_ref")
def clear(list_ref: str, item_ref: str):
    """Clear the note from an item."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)

    api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", {"notes": None})
    console.print(f"[green]✓[/green] Note cleared from [bold]{node['text']}[/bold]")
