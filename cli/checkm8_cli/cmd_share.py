"""Share commands for checkm8 CLI."""

import click

from .client import api_delete, api_get, api_post, resolve_list_id
from .config import get_api_url
from .output import console, print_json, print_shares


@click.group("share")
def share_cmd():
    """Manage list sharing."""


@share_cmd.command("create")
@click.argument("list_ref")
@click.option("--permission", type=click.Choice(["read", "write"]), default="read", help="Permission level")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def create(list_ref: str, permission: str, as_json: bool):
    """Create a share link for a list."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)

    share = api_post(f"/lists/{lst['id']}/shares", {"permission": permission})
    if as_json:
        print_json(share)
    else:
        base = get_api_url().replace(":8001", ":5173")  # frontend URL
        console.print(f"[green]✓[/green] Share link created ({permission}):")
        console.print(f"  {base}/claim/{share['share_token']}")
        console.print(f"  Token: [dim]{share['share_token']}[/dim]")


@share_cmd.command("ls")
@click.argument("list_ref")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def ls(list_ref: str, as_json: bool):
    """List all shares for a list."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)

    shares = api_get(f"/lists/{lst['id']}/shares")
    if as_json:
        print_json(shares)
    else:
        if not shares:
            console.print("[dim]No shares[/dim]")
        else:
            print_shares(shares)


@share_cmd.command("revoke")
@click.argument("list_ref")
@click.argument("share_id")
@click.option("--yes", is_flag=True, help="Skip confirmation")
def revoke(list_ref: str, share_id: str, yes: bool):
    """Revoke a share."""
    lists = api_get("/lists")
    lst = resolve_list_id(lists, list_ref)
    if not lst:
        console.print(f"[red]Error:[/red] List '{list_ref}' not found.")
        raise SystemExit(1)

    shares = api_get(f"/lists/{lst['id']}/shares")
    match = [s for s in shares if s["id"].startswith(share_id)]
    if not match:
        console.print(f"[red]Error:[/red] Share '{share_id}' not found.")
        raise SystemExit(1)
    if len(match) > 1:
        console.print(f"[red]Error:[/red] Ambiguous share ID prefix.")
        raise SystemExit(1)

    if not yes:
        click.confirm(f"Revoke share {match[0]['id'][:8]}?", abort=True)

    api_delete(f"/lists/{lst['id']}/shares/{match[0]['id']}")
    console.print(f"[green]✓[/green] Share revoked.")
