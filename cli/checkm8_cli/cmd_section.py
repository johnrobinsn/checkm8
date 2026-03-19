"""Section commands for checkm8 CLI."""

import click

from .client import api_delete, api_get, api_patch, api_post, resolve_list_id, resolve_node_id
from .output import console, print_json


def _resolve_list_and_nodes(list_ref: str) -> tuple[dict, list[dict]]:
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)
    nodes = api_get(f"/lists/{lst['id']}/nodes")
    return lst, nodes


@click.group("section")
def section_cmd():
    """Manage sections in a list."""


@section_cmd.command("add")
@click.argument("list_ref")
@click.argument("text")
@click.option("--parent", default=None, help="Parent node ID prefix or text")
@click.option("--after", default=None, help="Insert after this node")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def add(list_ref: str, text: str, parent: str | None, after: str | None, as_json: bool):
    """Add a new section to a list."""
    lst, nodes = _resolve_list_and_nodes(list_ref)

    body: dict = {"type": "section", "text": text}
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

    node = api_post(f"/lists/{lst['id']}/nodes", body)
    if as_json:
        print_json(node)
    else:
        console.print(f"[green]✓[/green] Added section [bold]{text}[/bold]  [dim]({node['id'][:8]})[/dim]")


@section_cmd.command("rename")
@click.argument("list_ref")
@click.argument("section_ref")
@click.argument("new_text")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def rename(list_ref: str, section_ref: str, new_text: str, as_json: bool):
    """Rename a section."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, section_ref)
    if not node:
        console.print(f"[red]Error:[/red] Section '{section_ref}' not found.")
        raise SystemExit(1)

    updated = api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", {"text": new_text})
    if as_json:
        print_json(updated)
    else:
        console.print(f"[green]✓[/green] Renamed to [bold]{new_text}[/bold]")


@section_cmd.command("move")
@click.argument("list_ref")
@click.argument("section_ref")
@click.option("--up", is_flag=True, help="Move one position up")
@click.option("--down", is_flag=True, help="Move one position down")
@click.option("--top", is_flag=True, help="Move to first position")
@click.option("--after", default=None, help="Place after this section")
@click.option("--to", "to_parent", default=None, help="Move into this parent section, or 'root'")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def move(list_ref: str, section_ref: str, up: bool, down: bool, top: bool, after: str | None, to_parent: str | None, as_json: bool):
    """Move a section up/down or to a specific position."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, section_ref)
    if not node:
        console.print(f"[red]Error:[/red] Section '{section_ref}' not found.")
        raise SystemExit(1)

    # Get siblings at the same level
    siblings = [n for n in nodes if n["parent_id"] == node["parent_id"]]
    siblings.sort(key=lambda n: n["position"])

    body: dict = {}

    if top:
        # Move to first position among siblings
        body["parent_id"] = node["parent_id"]
        # No after_id = insert at beginning
    elif up or down:
        idx = next((i for i, s in enumerate(siblings) if s["id"] == node["id"]), -1)
        if idx < 0:
            console.print("[red]Error:[/red] Could not find section position.")
            raise SystemExit(1)
        if up:
            if idx == 0:
                console.print("[dim]Already at the top.[/dim]")
                return
            # Place before the previous sibling by finding the one before that
            if idx >= 2:
                body["after_id"] = siblings[idx - 2]["id"]
            # else: moving to first position, no after_id needed
            body["parent_id"] = node["parent_id"]
        else:  # down
            if idx >= len(siblings) - 1:
                console.print("[dim]Already at the bottom.[/dim]")
                return
            body["after_id"] = siblings[idx + 1]["id"]
            body["parent_id"] = node["parent_id"]
    elif after:
        a = resolve_node_id(nodes, after)
        if not a:
            console.print(f"[red]Error:[/red] Node '{after}' not found.")
            raise SystemExit(1)
        body["after_id"] = a["id"]
        body["parent_id"] = a["parent_id"]
    elif to_parent is not None:
        if to_parent == "root":
            body["parent_id"] = None
        else:
            p = resolve_node_id(nodes, to_parent)
            if not p:
                console.print(f"[red]Error:[/red] Section '{to_parent}' not found.")
                raise SystemExit(1)
            body["parent_id"] = p["id"]
    else:
        console.print("[yellow]Specify --up, --down, --top, --after, or --to.[/yellow]")
        return

    updated = api_post(f"/lists/{lst['id']}/nodes/{node['id']}/move", body)
    if as_json:
        print_json(updated)
    else:
        direction = "to top" if top else "up" if up else "down" if down else ""
        console.print(f"[green]✓[/green] Moved section [bold]{node['text'] or node['id'][:8]}[/bold]" + (f" {direction}" if direction else ""))


@section_cmd.command("pin")
@click.argument("list_ref")
@click.argument("section_ref")
def pin(list_ref: str, section_ref: str):
    """Pin a section to the top of its level."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, section_ref)
    if not node:
        console.print(f"[red]Error:[/red] Section '{section_ref}' not found.")
        raise SystemExit(1)
    if node.get("pinned"):
        console.print(f"[dim]Already pinned:[/dim] {node['text']}")
        return
    api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", {"pinned": True})
    console.print(f"[green]📌[/green] Pinned [bold]{node['text']}[/bold]")


@section_cmd.command("unpin")
@click.argument("list_ref")
@click.argument("section_ref")
def unpin(list_ref: str, section_ref: str):
    """Unpin a section."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, section_ref)
    if not node:
        console.print(f"[red]Error:[/red] Section '{section_ref}' not found.")
        raise SystemExit(1)
    if not node.get("pinned"):
        console.print(f"[dim]Not pinned:[/dim] {node['text']}")
        return
    api_patch(f"/lists/{lst['id']}/nodes/{node['id']}", {"pinned": False})
    console.print(f"[green]✓[/green] Unpinned [bold]{node['text']}[/bold]")


@section_cmd.command("delete")
@click.argument("list_ref")
@click.argument("section_ref")
@click.option("--yes", is_flag=True, help="Skip confirmation")
def delete(list_ref: str, section_ref: str, yes: bool):
    """Delete a section and all its children."""
    lst, nodes = _resolve_list_and_nodes(list_ref)
    node = resolve_node_id(nodes, section_ref)
    if not node:
        console.print(f"[red]Error:[/red] Section '{section_ref}' not found.")
        raise SystemExit(1)

    children = [n for n in nodes if n["parent_id"] == node["id"]]
    if children and not yes:
        click.confirm(f"Delete section '{node['text']}' and its {len(children)} children?", abort=True)
    elif not yes:
        click.confirm(f"Delete section '{node['text']}'?", abort=True)

    api_delete(f"/lists/{lst['id']}/nodes/{node['id']}")
    console.print(f"[green]✓[/green] Deleted section [bold]{node['text']}[/bold]")
