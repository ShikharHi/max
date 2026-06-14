"""
main.py — Interactive REPL for the Aria Gmail Agent.

Usage:
    python main.py

Controls:
    /exit or /quit   — exit
    /tools           — list loaded MCP tools
    /clear           — clear conversation history (keeps same agent)
    /help            — show available commands
"""

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage

env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path, override=True)

from agent import load_tools, build_agent

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
if not GROQ_API_KEY:
    print("ERROR: GROQ_API_KEY not set. Copy .env.example → .env and fill it in.")
    sys.exit(1)


COMMANDS = {
    "/exit":  "Exit the agent",
    "/quit":  "Exit the agent",
    "/tools": "List loaded MCP tools",
    "/clear": "Clear conversation history",
    "/help":  "Show this help",
}


async def main():
    print("=" * 50)
    print("  Aria — Gmail Agent")
    print("  MCP: ArtyMcLabin/Gmail-MCP-Server")
    print("=" * 50)

    print("\nLoading Gmail MCP tools...", end="", flush=True)
    try:
        tools, tools_by_name = await load_tools()
        tool_names = list(tools_by_name.keys())
        print(f" {len(tools)} tools loaded.\n")
    except RuntimeError as e:
        print(f"\nERROR: {e}")
        sys.exit(1)

    agent = build_agent(tools, tools_by_name)
    history = []

    while True:
        try:
            user_input = input("You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nGoodbye.")
            break

        if not user_input:
            continue

        cmd = user_input.lower()

        if cmd in ("/exit", "/quit"):
            print("Goodbye.")
            break

        if cmd == "/tools":
            print("Loaded tools:")
            for name in tool_names:
                print(f"  - {name}")
            continue

        if cmd == "/clear":
            history = []
            print("History cleared.")
            continue

        if cmd == "/help":
            for c, desc in COMMANDS.items():
                print(f"  {c:<10} {desc}")
            continue

        # ── Run one turn ──────────────────────────────────────────────────
        history.append(HumanMessage(content=user_input))

        try:
            state = agent.invoke({"messages": history, "llm_calls": 0})
        except Exception as e:
            print(f"Agent error: {e}")
            continue

        # Update history with all new messages from this turn
        history = state["messages"]

        # Print final AI response
        last = state["messages"][-1]
        print(f"\nAria: {last.content}\n")


if __name__ == "__main__":
    asyncio.run(main())
