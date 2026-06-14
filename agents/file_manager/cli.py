#!/usr/bin/env python3
"""
cli.py — Interactive CLI for the Atlas File Manager Agent.

Usage:
    python cli.py                          # interactive REPL (home dir)
    python cli.py --root /some/dir         # restrict to a specific dir
    python cli.py --scan                   # scan first, then start REPL
    python cli.py "list my python files"  # single shot query
"""

import argparse
import asyncio
import sys
import os
from pathlib import Path

# ── make sure we can import our modules ──────────────────────
sys.path.insert(0, str(Path(__file__).parent))

from scanner import scan_user_folder
from agent import build_agent, run

BANNER = """
╔══════════════════════════════════════════════════════════╗
║  🗂  ATLAS  —  AI File Manager Agent                     ║
║  Powered by LangChain + LangGraph + Claude               ║
╠══════════════════════════════════════════════════════════╣
║  Commands:  !scan   rebuild file index                   ║
║             !stats  show index statistics                 ║
║             !root   show working root directory           ║
║             !clear  clear screen                          ║
║             !quit   exit                                  ║
╚══════════════════════════════════════════════════════════╝
"""


def repl(agent, root_dir: str):
    print(BANNER)
    print(f"  Root: {root_dir}\n")

    from search_tool import index_stats_tool, rescan_index_tool

    while True:
        try:
            user_input = input("You › ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n👋  Bye!")
            break

        if not user_input:
            continue

        # Meta commands
        if user_input.lower() in ("!quit", "!exit", "quit", "exit"):
            print("👋  Bye!")
            break

        if user_input.lower() == "!clear":
            os.system("clear" if os.name == "posix" else "cls")
            continue

        if user_input.lower() == "!root":
            print(f"  Root: {root_dir}\n")
            continue

        if user_input.lower() == "!scan":
            print("🔍 Scanning…")
            scan_user_folder(root=root_dir)
            continue

        if user_input.lower() == "!stats":
            print(index_stats_tool.invoke(""))
            print()
            continue

        # Agent query
        print("\nAtlas › ", end="", flush=True)
        try:
            response = asyncio.run(run(user_input, agent=agent))
            print(response)
        except Exception as e:
            print(f"[error] {e}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description="Atlas AI File Manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("query", nargs="?", help="Single shot query (optional)")
    parser.add_argument("--root", "-r", default=None, help="Root directory for file ops")
    parser.add_argument("--scan", "-s", action="store_true", help="Run scanner before starting")
    parser.add_argument("--model", "-m", default="llama-3.3-70b-versatile", help="Groq model")
    args = parser.parse_args()

    root_dir = args.root or str(Path.home())

    if args.scan:
        print("🔍 Initial scan…")
        scan_user_folder(root=root_dir)

    agent = build_agent(model=args.model, root_dir=root_dir)

    if args.query:
        # Single-shot mode
        response = asyncio.run(run(args.query, agent=agent))
        print(response)
    else:
        # Interactive REPL
        repl(agent, root_dir)


if __name__ == "__main__":
    main()