"""Item commands for checkm8 CLI."""

import click

from .client import api_delete, api_get, api_patch, api_post, resolve_list_id, resolve_node_id
from .output import console, print_json, print_node


def _resolve_list_and_nodes(list_ref: str) -> tuple[dict, list[dict]]:
    """Resolve a list and fetch its nodes."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)
    nodes = api_get(f"/lists/{lst['id']}/nodes")
    return lst, nodes


@click.group("item")
def item_cmd():
    """Manage items in a list."""


@item_cmd.command("add")
@click.argument("list_ref")
@click.argument("text")
@click.option("--parent", default=None, help="Parent node ID prefix or text")
@click.option("--after", default=None, help="Insert after this node ID prefix or text")
@click.option("--priority", type=click.Choice(["high", "medium", "low"]), default=None)
@click.option("--due", default=None, help="Due date (YYYY-MM-DD)")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def add(list_ref: str, text: str, parent: str | None, after: str | None, priority: str | None, due: str | None, as_json: bool):
    """Add a new item to a list."""
    lst, nodes = _resolve_list_and_nodes(list_ref)

    body: dict = {"type": "item", "text": text}
    if parent:
        p = resolve_node_id(nodes, parent)
        if not p:
            console.print(f"[red]Error:[/red] Parent '{parent}' not found.")
            raise SystemExit(1)
        body["parent_id"] = p["id"]
    if after:
        a = resolve_node_id(nodes, after)
        if not a:
            console.print(f"[red]Error:[/red] Node '{after}' not found.")
            raise SystemExit(1)
        body["after_id"] = a["id"]
    if priority:
        body["priority"] = priority
    if due:
        body["due_date"] = due

    node = api_post(f"/lists/{lst['id']}/nodes", body)
    if as_json:
        print_json(node)
    else:
        console.print(f"[green]✓[/green] Added [bold]{text}[/bold]  [dim]({node['id'][:8]})[/dim]")


@item_cmd.command("check")
@click.argument("list_ref")
@click.argument("item_ref")
def check(list_ref: str, item_ref: str):
    """Toggle an item's checked state."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)
    new_state = not node["checked"]
    api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", {"checked": new_state})
    icon = "✓" if new_state else "☐"
    console.print(f"[green]{icon}[/green] {node['text']}")


@item_cmd.command("update")
@click.argument("list_ref")
@click.argument("item_ref")
@click.option("--text", default=None, help="New text")
@click.option("--priority", type=click.Choice(["high", "medium", "low", "none"]), default=None)
@click.option("--due", default=None, help="Due date (YYYY-MM-DD), or 'none' to clear")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def update(list_ref: str, item_ref: str, text: str | None, priority: str | None, due: str | None, as_json: bool):
    """Update an item's properties."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)

    body: dict = {}
    if text is not None:
        body["text"] = text
    if priority is not None:
        body["priority"] = None if priority == "none" else priority
    if due is not None:
        body["due_date"] = None if due == "none" else due

    if not body:
        console.print("[yellow]Nothing to update.[/yellow]")
        return

    updated = api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", body)
    if as_json:
        print_json(updated)
    else:
        console.print(f"[green]✓[/green] Updated [bold]{updated['text']}[/bold]")


@item_cmd.command("move")
@click.argument("list_ref")
@click.argument("item_ref")
@click.option("--parent", default=None, help="New parent node (ID prefix or text), or 'root'")
@click.option("--after", default=None, help="Place after this node (ID prefix or text)")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def move(list_ref: str, item_ref: str, parent: str | None, after: str | None, as_json: bool):
    """Move an item to a new position."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)

    body: dict = {}
    if parent is not None:
        body["parent_id"] = None if parent == "root" else resolve_node_id(nodes, parent)["id"]
    if after is not None:
        a = resolve_node_id(nodes, after)
        if not a:
            console.print(f"[red]Error:[/red] Node '{after}' not found.")
            raise SystemExit(1)
        body["after_id"] = a["id"]

    updated = api_post(f"/lists/{lst['id']}/nodes/{node['id']}/move", body)
    if as_json:
        print_json(updated)
    else:
        console.print(f"[green]✓[/green] Moved [bold]{node['text']}[/bold]")


@item_cmd.command("show")
@click.argument("list_ref")
@click.argument("item_ref")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def show(list_ref: str, item_ref: str, as_json: bool):
    """Show item details."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)
    # Fetch full detail
    detail = api_get(f"/lists/{lst['id']}/nodes/{node['id']}")
    if as_json:
        print_json(detail)
    else:
        print_node(detail)


@item_cmd.command("delete")
@click.argument("list_ref")
@click.argument("item_ref")
@click.option("--yes", is_flag=True, help="Skip confirmation")
def delete(list_ref: str, item_ref: str, yes: bool):
    """Delete an item."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)

    if not yes:
        click.confirm(f"Delete '{node['text']}'?", abort=True)
    api_delete(f"/lists/{lst['id']}/nodes/{node['id']}")
    console.print(f"[green]✓[/green] Deleted [bold]{node['text']}[/bold]")
