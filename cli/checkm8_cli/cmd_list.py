"""List commands for checkm8 CLI."""

import click

from .client import api_delete, api_get, api_patch, api_post, resolve_list_id
from .output import console, print_json, print_list_detail, print_lists, print_nodes_tree, render_markdown


@click.group("list")
def list_cmd():
    """Manage todo lists."""


@list_cmd.command("ls")
@click.option("--archived", is_flag=True, help="Include archived lists")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def ls(archived: bool, as_json: bool):
    """List all accessible lists."""
    params = {}
    if archived:
        params["include_archived"] = "true"
    lists = api_get("/lists", params=params)
    if as_json:
        print_json(lists)
    else:
        print_lists(lists)


@list_cmd.command("create")
@click.argument("title")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def create(title: str, as_json: bool):
    """Create a new list."""
    lst = api_post("/lists", {"title": title})
    if as_json:
        print_json(lst)
    else:
        console.print(f"[green]✓[/green] Created list [bold]{title}[/bold]  [dim]({lst['id'][:8]})[/dim]")


@list_cmd.command("show")
@click.argument("list_ref")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
@click.option("--format", "fmt", type=click.Choice(["tree", "md"]), default="tree", help="Output format (tree or md)")
def show(list_ref: str, as_json: bool, fmt: str):
    """Show a list and its items. LIST_REF is a title or ID prefix."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)

    nodes = api_get(f"/lists/{lst['id']}/nodes")
    if as_json:
        print_json({"list": lst, "nodes": nodes})
    elif fmt == "md":
        click.echo(render_markdown(lst["title"], nodes))
    else:
        print_list_detail(lst)
        console.print()
        print_nodes_tree(nodes)


@list_cmd.command("rename")
@click.argument("list_ref")
@click.argument("new_title")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def rename(list_ref: str, new_title: str, as_json: bool):
    """Rename a list."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)

    updated = api_patch(f"/lists/{lst['id']}", {"title": new_title})
    if as_json:
        print_json(updated)
    else:
        console.print(f"[green]✓[/green] Renamed to [bold]{new_title}[/bold]")


@list_cmd.command("archive")
@click.argument("list_ref")
def archive(list_ref: str):
    """Archive a list."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)
    api_post(f"/lists/{lst['id']}/archive")
    console.print(f"[green]✓[/green] Archived [bold]{lst['title']}[/bold]")


@list_cmd.command("restore")
@click.argument("list_ref")
def restore(list_ref: str):
    """Restore an archived list."""
    lists = api_get("/lists", params={"include_archived": "true"})
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)
    api_post(f"/lists/{lst['id']}/restore")
    console.print(f"[green]✓[/green] Restored [bold]{lst['title']}[/bold]")


@list_cmd.command("delete")
@click.argument("list_ref")
@click.option("--yes", is_flag=True, help="Skip confirmation")
def delete(list_ref: str, yes: bool):
    """Delete a list permanently."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)

    if not yes:
        click.confirm(f"Delete '{lst['title']}' permanently?", abort=True)
    api_delete(f"/lists/{lst['id']}")
    console.print(f"[green]✓[/green] Deleted [bold]{lst['title']}[/bold]")


@list_cmd.command("search")
@click.argument("query")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def search(query: str, as_json: bool):
    """Search lists and items."""
    results = api_get("/lists", params={"q": query})
    if as_json:
        print_json(results)
    else:
        if not results:
            console.print("[dim]No results[/dim]")
            return
        for lst in results:
            console.print(f"[bold]{lst['title']}[/bold]  [dim]({lst['id'][:8]})[/dim]")
            for node in lst.get("matching_nodes", []):
                prefix = "§" if node["type"] == "section" else "•"
                console.print(f"  {prefix} {node['text']}")
