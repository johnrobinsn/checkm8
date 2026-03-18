"""Auth commands for checkm8 CLI."""

import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import click
import httpx
from rich.console import Console

from .config import get_api_token, get_api_url, get_config, save_config

console = Console()


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _OAuthCallbackHandler(BaseHTTPRequestHandler):
    """Handles the OAuth redirect from the backend."""

    token: str | None = None
    user_name: str | None = None
    user_email: str | None = None

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        cls = type(self)
        cls.token = params.get("token", [None])[0]
        cls.user_name = params.get("user", [None])[0]
        cls.user_email = params.get("email", [None])[0]

        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        if cls.token:
            self.wfile.write(b"""<html><body style="font-family:system-ui;text-align:center;padding:60px">
                <h2 style="color:#22c55e">&#10003; Authenticated!</h2>
                <p>You can close this tab and return to the terminal.</p>
                </body></html>""")
        else:
            self.wfile.write(b"""<html><body style="font-family:system-ui;text-align:center;padding:60px">
                <h2 style="color:#ef4444">&#10007; Authentication failed</h2>
                <p>No token received. Please try again.</p>
                </body></html>""")

    def log_message(self, format, *args):
        pass  # suppress HTTP logs


@click.group("auth")
def auth():
    """Manage authentication."""


@auth.command("login")
@click.option("--token", default=None, help="API token (skip browser flow)")
@click.option("--url", default=None, help="API base URL (default: http://localhost:8001)")
def login(token: str | None, url: str | None):
    """Authenticate via Google OAuth. Opens browser if available, falls back to device code flow."""
    config = get_config()
    if url:
        config["api_url"] = url
        save_config(config)

    api_url = url or get_api_url()

    if token:
        config["api_token"] = token
        save_config(config)
        console.print("[green]✓[/green] Authenticated with API token.")
        console.print(f"  Token: {token[:8]}...")
        return

    # Try browser flow first
    console.print("Opening browser for Google sign-in...")
    try:
        opened = webbrowser.open("about:blank")  # test if browser works
    except Exception:
        opened = False

    if opened:
        success = _browser_flow(api_url)
        if success:
            return

    # Fallback to device code flow
    console.print("[yellow]No browser available.[/yellow] Using device code flow.\n")
    _device_code_flow(api_url)


def _browser_flow(api_url: str) -> bool:
    """OAuth flow with local HTTP callback server. Returns True on success."""
    port = _find_free_port()
    callback_url = f"http://localhost:{port}/callback"

    try:
        r = httpx.get(f"{api_url}/auth/google/login", params={"cli_callback": callback_url}, timeout=5)
        r.raise_for_status()
        login_url = r.json()["url"]
    except httpx.ConnectError:
        console.print(f"[red]✗[/red] Cannot reach API server at {api_url}")
        console.print("  Make sure the checkm8 backend is running.")
        raise SystemExit(1)

    handler = _OAuthCallbackHandler
    handler.token = None
    server = HTTPServer(("127.0.0.1", port), handler)

    try:
        webbrowser.open(login_url)
    except Exception:
        server.server_close()
        return False

    console.print("  [dim]Waiting for authentication...[/dim]")

    server.timeout = 120
    server_thread = threading.Thread(target=server.handle_request)
    server_thread.start()
    server_thread.join(timeout=120)
    server.server_close()

    if handler.token:
        config = get_config()
        config["api_token"] = handler.token
        save_config(config)
        name = handler.user_name or "Unknown"
        email = handler.user_email or ""
        console.print(f"[green]✓[/green] Authenticated as {name} ({email})")
        console.print(f"  Token: {handler.token[:8]}...")
        return True

    console.print("[red]✗[/red] Authentication timed out or failed.")
    raise SystemExit(1)


def _device_code_flow(api_url: str):
    """Device code flow for headless/SSH environments."""
    device_url = f"{api_url}/auth/device"

    console.print("  [bold]Device code authentication[/bold]")
    console.print()
    console.print("  1. Open this URL on any device with a browser:")
    console.print(f"     [blue]{device_url}[/blue]")
    console.print("  2. Sign in with your Google account")
    console.print("  3. A code will be displayed in the browser")
    console.print("  4. Enter that code below")
    console.print()

    code = click.prompt("  Enter code").strip().upper()

    try:
        r = httpx.post(f"{api_url}/auth/device/exchange", json={"code": code}, timeout=10)
    except httpx.ConnectError:
        console.print(f"[red]✗[/red] Cannot reach API server at {api_url}")
        raise SystemExit(1)

    if r.status_code == 404:
        console.print("[red]✗[/red] Invalid code. Please try again.")
        raise SystemExit(1)
    elif r.status_code == 410:
        console.print("[red]✗[/red] Code expired. Please start over.")
        raise SystemExit(1)
    elif r.status_code != 200:
        console.print(f"[red]✗[/red] Error: {r.text}")
        raise SystemExit(1)

    data = r.json()
    config = get_config()
    config["api_token"] = data["token"]
    save_config(config)
    name = data.get("user", "Unknown")
    email = data.get("email", "")
    console.print(f"[green]✓[/green] Authenticated as {name} ({email})")
    console.print(f"  Token: {data['token'][:8]}...")


@auth.command("status")
def status():
    """Show current auth status."""
    token = get_api_token()
    if token:
        console.print(f"[green]✓[/green] Authenticated  Token: {token[:8]}...")
        console.print(f"  API URL: {get_api_url()}")

        try:
            r = httpx.get(f"{get_api_url()}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=5)
            if r.status_code == 200:
                user = r.json()
                console.print(f"  User: {user['name']} ({user['email']})")
            else:
                console.print("[yellow]  Warning: Token may be invalid[/yellow]")
        except httpx.ConnectError:
            console.print("[yellow]  Warning: Cannot reach API server[/yellow]")
    else:
        console.print("[red]✗[/red] Not authenticated. Run 'checkm8 auth login'")


@auth.command("logout")
def logout():
    """Remove stored credentials."""
    config = get_config()
    config.pop("api_token", None)
    save_config(config)
    console.print("[green]✓[/green] Logged out.")
