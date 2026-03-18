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
