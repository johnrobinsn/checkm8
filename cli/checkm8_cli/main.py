"""checkm8 CLI - command-line interface for checkm8 collaborative todo lists."""

import click

from .cmd_auth import auth
from .cmd_import import import_cmd
from .cmd_item import item_cmd
from .cmd_list import list_cmd
from .cmd_note import note_cmd
from .cmd_section import section_cmd
from .cmd_share import share_cmd


@click.group()
@click.version_option(version="0.1.0", prog_name="checkm8")
def cli():
    """checkm8 - collaborative todo list CLI.

    Manage your todo lists, items, sections, and shares from the command line.
    Use 'checkm8 auth login' to get started.
    """


cli.add_command(auth)
cli.add_command(list_cmd, "list")
cli.add_command(item_cmd, "item")
cli.add_command(section_cmd, "section")
cli.add_command(note_cmd, "note")
cli.add_command(share_cmd, "share")
cli.add_command(import_cmd, "import")


if __name__ == "__main__":
    cli()
