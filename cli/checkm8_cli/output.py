"""Output formatting for checkm8 CLI."""

import json as json_mod

import click
from rich.console import Console
from rich.table import Table
from rich.tree import Tree

console = Console()


def print_json(data):
    """Print data as JSON."""
    click.echo(json_mod.dumps(data, indent=2))


def print_lists(lists: list[dict]):
    """Print lists as a rich table."""
    table = Table(show_header=True)
    table.add_column("ID", style="dim", max_width=8)
    table.add_column("Title", style="bold")
    table.add_column("Updated", style="dim")
    for lst in lists:
        table.add_row(lst["id"][:8], lst["title"], lst["updated_at"][:10])
    console.print(table)


def print_list_detail(lst: dict):
    """Print a single list."""
    console.print(f"[bold]{lst['title']}[/bold]  [dim]({lst['id'][:8]})[/dim]")
    console.print(f"  Owner: {lst['owner_id'][:8]}  Updated: {lst['updated_at'][:10]}")


def print_nodes_tree(nodes: list[dict]):
    """Print nodes as a rich tree."""
    if not nodes:
        console.print("[dim]No items[/dim]")
        return

    # Build parent->children map
    children: dict[str | None, list[dict]] = {}
    for n in nodes:
        children.setdefault(n["parent_id"], []).append(n)

    # Sort by position
    for key in children:
        children[key].sort(key=lambda x: x["position"])

    def _format_node(node: dict) -> str:
        prefix = ""
        if node["type"] == "section":
            prefix = "[bold cyan]§[/bold cyan] "
        elif node["checked"]:
            prefix = "[green]✓[/green] "
        else:
            prefix = "☐ "

        text = node["text"] or "[dim italic]untitled[/dim italic]"
        if node["type"] == "section":
            text = f"[bold]{text}[/bold]"
        elif node["checked"]:
            text = f"[strikethrough]{text}[/strikethrough]"

        extras = []
        if node.get("priority"):
            colors = {"high": "red", "medium": "yellow", "low": "green"}
            c = colors.get(node["priority"], "white")
            extras.append(f"[{c}]!{node['priority']}[/{c}]")
        if node.get("due_date"):
            extras.append(f"[dim]due:{node['due_date']}[/dim]")
        if node.get("notes"):
            extras.append("[dim]📝[/dim]")

        suffix = f"  {'  '.join(extras)}" if extras else ""
        return f"{prefix}{text}{suffix}  [dim]({node['id'][:8]})[/dim]"

    def _add_children(tree_node, parent_id: str | None):
        for child in children.get(parent_id, []):
            branch = tree_node.add(_format_node(child))
            _add_children(branch, child["id"])

    tree = Tree("[bold]Items[/bold]")
    _add_children(tree, None)
    console.print(tree)


def print_node(node: dict):
    """Print a single node detail."""
    type_label = "Section" if node["type"] == "section" else "Item"
    console.print(f"[bold]{type_label}:[/bold] {node['text'] or '[dim]untitled[/dim]'}  [dim]({node['id'][:8]})[/dim]")
    if node["type"] == "item":
        console.print(f"  Checked: {'✓' if node['checked'] else '☐'}")
    if node.get("priority"):
        console.print(f"  Priority: {node['priority']}")
    if node.get("due_date"):
        console.print(f"  Due: {node['due_date']}")
    if node.get("notes"):
        console.print(f"  Notes: {node['notes']}")
    if node.get("parent_id"):
        console.print(f"  Parent: [dim]{node['parent_id'][:8]}[/dim]")


def render_markdown(title: str, nodes: list[dict]) -> str:
    """Render a list and its nodes as markdown."""
    children: dict[str | None, list[dict]] = {}
    for n in nodes:
        children.setdefault(n["parent_id"], []).append(n)
    for key in children:
        children[key].sort(key=lambda x: x["position"])

    lines = [f"# {title}", ""]

    def _render(parent_id: str | None, depth: int):
        for node in children.get(parent_id, []):
            indent = "  " * depth
            if node["type"] == "section":
                # Sections as markdown headings (## for top-level, ### for nested, etc.)
                level = min(depth + 2, 6)
                lines.append(f"{'#' * level} {node['text'] or 'Untitled'}")
                if node.get("notes"):
                    lines.append("")
                    lines.append(f"{node['notes']}")
                lines.append("")
                _render(node["id"], depth + 1)
            else:
                check = "x" if node["checked"] else " "
                text = node["text"] or "Untitled"
                extras = []
                if node.get("priority"):
                    extras.append(f"!{node['priority']}")
                if node.get("due_date"):
                    extras.append(f"due: {node['due_date']}")
                suffix = f" ({', '.join(extras)})" if extras else ""
                lines.append(f"{indent}- [{check}] {text}{suffix}")
                if node.get("notes"):
                    for note_line in node["notes"].splitlines():
                        lines.append(f"{indent}  > {note_line}")
                _render(node["id"], depth + 1)

    _render(None, 0)
    return "\n".join(lines) + "\n"


def print_shares(shares: list[dict]):
    """Print shares as a table."""
    table = Table(show_header=True)
    table.add_column("ID", style="dim", max_width=8)
    table.add_column("Permission")
    table.add_column("Claimed by", style="dim")
    table.add_column("Token", style="dim", max_width=12)
    for s in shares:
        claimed = s.get("user_id", "")
        if claimed:
            claimed = claimed[:8]
        else:
            claimed = "unclaimed"
        table.add_row(s["id"][:8], s["permission"], claimed, s["share_token"][:12])
    console.print(table)
