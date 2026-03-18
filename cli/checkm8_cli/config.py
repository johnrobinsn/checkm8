"""Configuration management for checkm8 CLI."""

import json
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".checkm8"
CONFIG_FILE = CONFIG_DIR / "config.json"


def get_config() -> dict:
    """Load config from ~/.checkm8/config.json."""
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    return {}


def save_config(config: dict) -> None:
    """Save config to ~/.checkm8/config.json."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2) + "\n")


def get_api_url() -> str:
    """Get the API base URL."""
    return os.environ.get(
        "CHECKM8_API_URL",
        get_config().get("api_url", "http://localhost:8001"),
    )


def get_api_token() -> str | None:
    """Get API token from env var or config file."""
    token = os.environ.get("CHECKM8_API_TOKEN")
    if token:
        return token
    return get_config().get("api_token")
