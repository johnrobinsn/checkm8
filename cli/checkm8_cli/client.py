"""HTTP client for the checkm8 API."""

import sys

import httpx

from .config import get_api_token, get_api_url


def _get_client() -> httpx.Client:
    token = get_api_token()
    if not token:
        print("Error: Not authenticated. Run 'checkm8 auth login' first.", file=sys.stderr)
        sys.exit(1)
    return httpx.Client(
        base_url=get_api_url(),
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )


def api_get(path: str, params: dict | None = None) -> dict | list:
    with _get_client() as c:
        r = c.get(path, params=params)
        r.raise_for_status()
        return r.json()


def api_post(path: str, json_data: dict | None = None, expected_status: int = 200) -> dict | list | None:
    with _get_client() as c:
        r = c.post(path, json=json_data)
        if r.status_code == 204:
            return None
        r.raise_for_status()
        return r.json()


def api_patch(path: str, json_data: dict) -> dict:
    with _get_client() as c:
        r = c.patch(path, json=json_data)
        r.raise_for_status()
        return r.json()


def api_delete(path: str) -> None:
    with _get_client() as c:
        r = c.delete(path)
        r.raise_for_status()


def resolve_list_id(lists: list[dict], prefix: str) -> dict | None:
    """Resolve a list by ID prefix or exact title match."""
    # Exact title match first
    for lst in lists:
        if lst["title"].lower() == prefix.lower():
            return lst
    # ID prefix match
    matches = [lst for lst in lists if lst["id"].startswith(prefix)]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        print(f"Error: Ambiguous ID prefix '{prefix}' matches {len(matches)} lists.", file=sys.stderr)
        sys.exit(1)
    return None


def resolve_node_id(nodes: list[dict], prefix: str) -> dict | None:
    """Resolve a node by ID prefix or exact text match."""
    # Exact text match first
    for node in nodes:
        if node["text"].lower() == prefix.lower():
            return node
    # ID prefix match
    matches = [n for n in nodes if n["id"].startswith(prefix)]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        print(f"Error: Ambiguous ID prefix '{prefix}' matches {len(matches)} nodes.", file=sys.stderr)
        sys.exit(1)
    return None
