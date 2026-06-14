"""
exec_tool.py — Controlled shell execution tool for the file manager agent.

Covers operations NOT available in the LangChain file toolkit:
  move, copy, rename, create directory, change permissions, etc.

The agent's system prompt strictly forbids using exec for read/write/delete —
those must always go through their dedicated toolkit tools.
"""

import subprocess
import shlex
from pathlib import Path
from langchain_core.tools import tool


# Allowlist: only safe file-management verbs that have no dedicated tool
ALLOWED_PREFIXES = (
    "mv ",     "move ",
    "cp ",     "copy ",
    "mkdir ",
    "rmdir ",   # empty dir removal
    "rename ",
    "chmod ",
    "touch ",   # create empty file / update timestamp
    "ln ",      # symlinks
    "find ",    # advanced find queries (not read, just locate)
    "du ",      # disk usage
    "df ",      # disk free
    "stat ",    # detailed file stat
    "file ",    # file type identification
    "md5sum ",  "sha256sum ",  # checksums
    "zip ",     "unzip ",
    "tar ",
    "gzip ",    "gunzip ",
    "rsync ",
    "wc ",      # word/line count
    "sort ",    "head ", "tail ",  # safe read-adjacent (no cat/less/more)
    "diff ",    "cmp ",           # file comparison
    "tree ",                       # directory tree
)

# Hard block list — these must go through dedicated tools
BLOCKED_VERBS = {
    "rm", "del", "rmdir",  # delete → use delete_file tool
    "cat", "less", "more", "nano", "vi", "vim", "emacs",  # read → use read_file
    "echo", "printf", "tee", "sed", "awk",  # write → use write_file
    "python", "python3", "node", "bash", "sh", "zsh",    # code exec
    "curl", "wget", "nc", "ncat", "ssh", "scp",          # network
    "sudo", "su",                                          # privilege escalation
    "kill", "killall", "pkill",                            # process control
}


def _check_command(cmd: str) -> tuple[bool, str]:
    """Return (allowed, reason). Checks both blocklist and allowlist."""
    stripped = cmd.strip()
    if not stripped:
        return False, "Empty command."

    first_word = shlex.split(stripped)[0].split("/")[-1]  # handle full paths

    if first_word in BLOCKED_VERBS:
        verb_map = {
            "rm": "delete_file tool",
            "del": "delete_file tool",
            "cat": "read_file tool",
            "less": "read_file tool",
            "more": "read_file tool",
            "echo": "write_file tool",
            "tee": "write_file tool",
        }
        suggestion = verb_map.get(first_word, "the appropriate dedicated tool")
        return False, (
            f"❌ '{first_word}' is blocked in exec_tool. "
            f"Use the {suggestion} instead."
        )

    allowed = any(stripped.startswith(p) for p in ALLOWED_PREFIXES)
    if not allowed:
        return False, (
            f"❌ Command '{first_word}' is not on the exec allowlist. "
            f"Allowed prefixes: {', '.join(p.strip() for p in ALLOWED_PREFIXES[:10])}…"
        )

    return True, ""


@tool
def exec_tool(command: str) -> str:
    """
    Execute a safe shell command for file operations that have no dedicated tool.

    ✅ ALLOWED operations (use exec_tool for these):
      - Move/rename files:     mv /path/source /path/dest
      - Copy files:            cp /path/source /path/dest
      - Create directories:    mkdir -p /path/newdir
      - Change permissions:    chmod 644 /path/file
      - Create symlinks:       ln -s /target /link
      - Archive/compress:      zip, tar, gzip, unzip
      - File checksums:        md5sum, sha256sum
      - Disk usage:            du -sh /path
      - Compare files:         diff /path/a /path/b
      - File type info:        file /path/file
      - Directory tree:        tree /path

    ❌ FORBIDDEN (use dedicated tools instead):
      - Reading file content   → use read_file tool
      - Writing/appending      → use write_file tool
      - Deleting files         → use delete_file tool
      - Listing directories    → use list_directory tool

    Args:
        command: The shell command string to execute.

    Returns:
        stdout output, or an error message if blocked/failed.
    """
    allowed, reason = _check_command(command)
    if not allowed:
        return reason

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = result.stdout.strip()
        err    = result.stderr.strip()

        if result.returncode != 0:
            return (
                f"⚠️  Command exited with code {result.returncode}.\n"
                + (f"stderr: {err}" if err else "")
                + (f"\nstdout: {output}" if output else "")
            )

        return output or "✅ Command completed successfully (no output)."

    except subprocess.TimeoutExpired:
        return "❌ Command timed out after 30 seconds."
    except Exception as e:
        return f"❌ Execution error: {e}"