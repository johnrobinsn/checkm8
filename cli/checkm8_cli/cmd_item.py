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
    """Check (mark done) an item."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)
    if node["checked"]:
        console.print(f"[dim]Already checked:[/dim] {node['text'] or node['id'][:8]}")
        return
    api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", {"checked": True})
    console.print(f"[green]✓[/green] {node['text'] or node['id'][:8]} → [green]checked[/green]")


@item_cmd.command("uncheck")
@click.argument("list_ref")
@click.argument("item_ref")
def uncheck(list_ref: str, item_ref: str):
    """Uncheck (mark not done) an item."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)
    if not node["checked"]:
        console.print(f"[dim]Already unchecked:[/dim] {node['text'] or node['id'][:8]}")
        return
    api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", {"checked": False})
    console.print(f"[green]☐[/green] {node['text'] or node['id'][:8]} → [yellow]unchecked[/yellow]")


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
@click.option("--to", "to_section", default=None, help="Move into this section (name, ID prefix, or #index)")
@click.option("--parent", default=None, help="New parent node (ID prefix or text), or 'root'")
@click.option("--after", default=None, help="Place after this node (ID prefix or text)")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def move(list_ref: str, item_ref: str, to_section: str | None, parent: str | None, after: str | None, as_json: bool):
    """Move an item to a new position. All metadata (notes, priority, etc.) is preserved."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, item_ref)
    if not node:
        console.print(f"[red]Error:[/red] Item '{item_ref}' not found.")
        raise SystemExit(1)

    body: dict = {}
    # --to is a friendlier alias for --parent (resolves sections by name)
    target = to_section or parent
    if target is not None:
        if target == "root":
            body["parent_id"] = None
        else:
            p = resolve_node_id(nodes, target)
            if not p:
                console.print(f"[red]Error:[/red] Section '{target}' not found.")
                raise SystemExit(1)
            body["parent_id"] = p["id"]
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
        dest = "root" if body.get("parent_id") is None and target == "root" else (target or "")
        console.print(f"[green]✓[/green] Moved [bold]{node['text'] or node['id'][:8]}[/bold]" + (f" → {dest}" if dest else ""))


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


@item_cmd.command("prune")
@click.argument("list_ref")
@click.option("--section", default=None, help="Only prune within this section")
@click.option("--yes", is_flag=True, help="Skip confirmation")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def prune(list_ref: str, section: str | None, yes: bool, as_json: bool):
    """Delete all checked items at once."""
    lst, nodes = _resolve_list_and_nodes(list_ref)

    # Filter to checked items
    checked = [n for n in nodes if n["type"] == "item" and n["checked"]]

    # Optionally scope to a section
    if section:
        sec = resolve_node_id(nodes, section)
        if not sec:
            console.print(f"[red]Error:[/red] Section '{section}' not found.")
            raise SystemExit(1)
        # Get all descendant IDs of the section
        def _descendants(parent_id: str) -> set[str]:
            ids = {parent_id}
            for n in nodes:
                if n["parent_id"] == parent_id:
                    ids |= _descendants(n["id"])
            return ids
        scope = _descendants(sec["id"])
        checked = [n for n in checked if n["parent_id"] in scope or n["id"] in scope]

    if not checked:
        console.print("[dim]No checked items to prune.[/dim]")
        return

    if not yes:
        names = ", ".join(n["text"] or n["id"][:8] for n in checked[:5])
        if len(checked) > 5:
            names += f", ... (+{len(checked) - 5} more)"
        click.confirm(f"Delete {len(checked)} checked items: {names}?", abort=True)

    deleted = []
    for n in checked:
        api_delete(f"/lists/{lst['id']}/nodes/{n['id']}")
        deleted.append(n)

    if as_json:
        print_json([{"id": n["id"], "text": n["text"]} for n in deleted])
    else:
        console.print(f"[green]✓[/green] Pruned {len(deleted)} checked item{'s' if len(deleted) != 1 else ''}")


@item_cmd.command("archived")
@click.argument("list_ref")
@click.option("--offset", default=0, type=int, help="Start offset (default 0)")
@click.option("--limit", default=20, type=int, help="Max items to return (default 20)")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def archived(list_ref: str, offset: int, limit: int, as_json: bool):
    """List archived items, most recently completed first."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)

    data = api_get(f"/lists/{lst['id']}/nodes/archived", params={"offset": offset, "limit": limit})
    items = data["items"]
    total = data["total"]

    if as_json:
        print_json(data)
        return

    if not items:
        console.print("[dim]No archived items.[/dim]")
        return

    from rich.table import Table
    table = Table(show_header=True, title=f"Archived items ({offset + 1}–{offset + len(items)} of {total})")
    table.add_column("#", style="dim", justify="right", width=4)
    table.add_column("Text", style="bold")
    table.add_column("Completed", style="dim")
    table.add_column("ID", style="dim", max_width=8)

    for i, item in enumerate(items, start=offset + 1):
        completed = item.get("checked_at") or item.get("updated_at") or ""
        if completed:
            completed = completed[:16].replace("T", " ")
        table.add_row(str(i), item["text"] or "[italic]untitled[/italic]", completed, item["id"][:8])

    console.print(table)
    if offset + len(items) < total:
        console.print(f"[dim]Use --offset {offset + len(items)} to see more[/dim]")


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
