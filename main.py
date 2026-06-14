#!/usr/bin/env python3
"""
JARVIS CLI — Rich agentic assistant with plug-and-play tool/agent registry.

Usage:
  python main.py                       # start interactive session
  /plugin <name>                       # activate a tool or agent
  /plugout <name>                      # deactivate a tool or agent
  /list                                # show registry
  /reload                              # re-discover tools and agents from disk
  /clear                               # clear conversation history
  /exit | /quit                        # exit
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Any

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent))

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, AIMessage
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt
from rich.rule import Rule
from rich.text import Text
from rich.theme import Theme
from pydantic import SecretStr
from core import Registry, build_graph
from core.state import JarvisState
from dotenv import load_dotenv

# Ensure we load the project's .env explicitly (robust when cwd differs)
project_root = Path(__file__).parent

def _new_chatgroq(*args: Any, **kwargs: Any) -> ChatGroq:
    return ChatGroq(*args, **kwargs)

# Ensure project .env values override any existing environment variables
load_dotenv(dotenv_path=project_root / ".env", override=True)

# ── Theme ─────────────────────────────────────────────────────────────────────

JARVIS_THEME = Theme({
    "jarvis.banner":   "bold bright_cyan",
    "jarvis.input":    "bold white",
    "jarvis.answer":   "bright_white",
    "jarvis.plan":     "dim italic cyan",
    "jarvis.tool":     "cyan",
    "jarvis.agent":    "magenta",
    "jarvis.system":   "dim yellow",
    "jarvis.error":    "bold red",
    "jarvis.success":  "bold green",
    "jarvis.iter":     "dim white",
    "jarvis.prompt":   "bold bright_cyan",
    "jarvis.step":     "bold yellow",
    "jarvis.node":     "bold magenta",
})

console = Console(theme=JARVIS_THEME)

BANNER = r"""
     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗
     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝
     ██║███████║██████╔╝██║   ██║██║███████╗
██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║
╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║
 ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝
"""

COMMANDS = {
    "/plugin":  "Activate a tool or agent:  /plugin <name>",
    "/plugout": "Deactivate a tool or agent: /plugout <name>",
    "/list":    "Show all tools and agents in registry",
    "/reload":  "Re-discover tools/agents from disk",
    "/clear":   "Clear conversation history",
    "/help":    "Show this help",
    "/exit":    "Exit JARVIS",
}

# ── Node display names ────────────────────────────────────────────────────────

NODE_ICONS = {
    "router":   "🧠 Router",
    "executor": "⚙  Executor",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def print_banner(registry: Registry):
    console.print(f"[jarvis.banner]{BANNER}[/jarvis.banner]")
    active_t = len(registry.active_tools())
    active_a = len(registry.active_agents())
    console.print(
        f"  [dim]Tools:[/dim] [cyan]{active_t} active[/cyan]   "
        f"[dim]Agents:[/dim] [magenta]{active_a} active[/magenta]   "
        f"[dim]Type[/dim] [bold]/help[/bold] [dim]for commands[/dim]\n"
    )


def print_help():
    console.print(Rule("[bold]JARVIS Commands[/bold]", style="cyan"))
    for cmd, desc in COMMANDS.items():
        console.print(f"  [bold cyan]{cmd:<12}[/bold cyan] {desc}")
    console.print()


def handle_command(raw: str, registry: Registry) -> bool:
    """Handle slash commands. Returns True if handled."""
    parts = raw.strip().split(maxsplit=1)
    cmd = parts[0].lower()
    arg = parts[1].strip() if len(parts) > 1 else ""

    if cmd == "/list":
        registry.print_list()
        return True

    if cmd == "/plugin":
        if not arg:
            console.print("[jarvis.error]Usage: /plugin <name>[/jarvis.error]")
        else:
            console.print(registry.plugin(arg))
        return True

    if cmd == "/plugout":
        if not arg:
            console.print("[jarvis.error]Usage: /plugout <name>[/jarvis.error]")
        else:
            console.print(registry.plugout(arg))
        return True

    if cmd == "/reload":
        registry.__init__()  # re-run discovery
        console.print("[jarvis.success]✓ Registry reloaded[/jarvis.success]")
        registry.print_list()
        return True

    if cmd == "/help":
        print_help()
        return True

    if cmd in ("/exit", "/quit"):
        console.print("\n[jarvis.system]Goodbye.[/jarvis.system]\n")
        sys.exit(0)

    return False


def _print_step_header(node_name: str, iteration: int):
    """Print a visible step separator whenever a node completes."""
    icon = NODE_ICONS.get(node_name, f"● {node_name}")
    console.print(
        f"  [jarvis.step]──── Step {iteration}: {icon} [/jarvis.step]",
    )


def _print_router_decision(update: dict):
    """Pretty-print what the router decided."""
    decision = update.get("decision", "")
    plan = update.get("plan", "")
    invocations = update.get("invocations", [])

    if decision == "answer":
        console.print("     [dim green]↳ decision:[/dim green] [green]answer[/green]")
    elif decision in ("use_tools", "use_agents"):
        console.print(f"     [dim cyan]↳ decision:[/dim cyan] [cyan]{decision}[/cyan]")
        if plan:
            console.print(f"     [dim]plan:[/dim] [jarvis.plan]{plan}[/jarvis.plan]")
        for inv in invocations:
            inv_type = inv.get("type", "?")
            inv_name = inv.get("name", "?")
            inv_input = inv.get("input", {})
            color = "cyan" if inv_type == "tool" else "magenta"
            console.print(
                f"     [dim]invoke:[/dim] [{color}]{inv_type}[/{color}] "
                f"[bold]{inv_name}[/bold]  [dim]{inv_input}[/dim]"
            )


def _print_executor_results(update: dict):
    """Print what came back from each tool/agent."""
    results = update.get("execution_results", [])
    for r in results:
        # executor.py already prints tool outputs via Rich panels.
        # Here we just show a brief summary line in the step trace.
        short = (r[:120] + "…") if len(r) > 120 else r
        console.print(f"     [dim]result:[/dim] {short}")


def render_answer(answer: str, iterations: int):
    console.print()
    console.print(Panel(
        Markdown(answer),
        title="[bold bright_cyan]JARVIS[/bold bright_cyan]",
        border_style="cyan",
        padding=(1, 2),
    ))
    if iterations > 1:
        console.print(
            f"  [jarvis.iter]({iterations} iteration{'s' if iterations != 1 else ''})[/jarvis.iter]"
        )
    console.print()


# ── Main loop ─────────────────────────────────────────────────────────────────

async def chat_loop(model: ChatGroq, registry: Registry):
    graph = build_graph(model, registry)
    history: list = []

    print_banner(registry)

    while True:
        try:
            user_input = Prompt.ask("[jarvis.prompt]You[/jarvis.prompt]")
        except (EOFError, KeyboardInterrupt):
            console.print("\n[jarvis.system]Interrupted. Type /exit to quit.[/jarvis.system]")
            continue

        if not user_input.strip():
            continue

        # Slash commands
        if user_input.startswith("/"):
            if handle_command(user_input, registry):
                graph = build_graph(model, registry)
                continue

        # Add to history
        history.append(HumanMessage(content=user_input))

        # Initial state
        state: JarvisState = {
            "messages": list(history),
            "user_input": user_input,
            "decision": "",
            "plan": "",
            "invocations": [],
            "execution_results": [],
            "final_answer": "",
            "iterations": 0,
        }

        # ── Stream with per-node step visibility ──────────────────────────────
        console.print()
        console.rule("[dim]Thinking[/dim]", style="dim")

        # Accumulate state as a plain typed dict so Pylance is happy
        final_answer: str = ""
        final_iterations: int = 0
        step_counter: int = 0
        seen_subgraph_nodes: set[str] = set()  # deduplicate subgraph debug events

        try:
            # stream_mode=["updates", "debug"] gives us:
            #   "updates" → fires once per top-level node with its state delta
            #   "debug"   → fires for every internal subgraph node too
            # Each chunk is a tuple: (stream_type, data)
            async for stream_type, data in graph.astream(
                state,
                stream_mode=["updates", "debug"],
            ):
                if stream_type == "updates":
                    # data = {node_name: state_update_dict}
                    for node_name, update in data.items():  # type: ignore[union-attr]
                        step_counter += 1
                        _print_step_header(node_name, step_counter)

                        if node_name == "router":
                            _print_router_decision(update)  # type: ignore[arg-type]
                            # Capture final answer + iterations with explicit str/int casts
                            if update.get("decision") == "answer":  # type: ignore[union-attr]
                                final_answer = str(update.get("final_answer", ""))  # type: ignore[union-attr]
                            final_iterations = int(update.get("iterations", step_counter))  # type: ignore[union-attr,arg-type]

                        elif node_name == "executor":
                            _print_executor_results(update)  # type: ignore[arg-type]

                elif stream_type == "debug":
                    # data has keys: "type", "timestamp", "step", "payload"
                    # We use it to surface subgraph node transitions
                    event_type: str = data.get("type", "")  # type: ignore[union-attr]
                    payload = data.get("payload", {})  # type: ignore[union-attr]

                    if event_type == "task":
                        # A subgraph node is about to run
                        task_name: str = str(payload.get("name", ""))
                        ns: list[str] = payload.get("triggers", [])
                        # Only print nodes that are inside a subgraph
                        # (top-level "router"/"executor" already shown via updates)
                        if task_name and task_name not in ("router", "executor", "__start__"):
                            key = f"{task_name}"
                            if key not in seen_subgraph_nodes:
                                seen_subgraph_nodes.add(key)
                            console.print(
                                f"     [dim]  ↳ subgraph node:[/dim] "
                                f"[bold yellow]{task_name}[/bold yellow]"
                                + (f"  [dim](triggers: {ns})[/dim]" if ns else "")
                            )

                    elif event_type == "task_result":
                        # A subgraph node finished — show a brief result hint
                        task_name = str(payload.get("name", ""))
                        if task_name and task_name not in ("router", "executor"):
                            result_data = payload.get("result", [])
                            if result_data:
                                # result is a list of [key, value] pairs
                                keys = [str(r[0]) for r in result_data if isinstance(r, (list, tuple))]
                                console.print(
                                    f"     [dim]  ✓ subgraph done:[/dim] "
                                    f"[bold yellow]{task_name}[/bold yellow]"
                                    + (f"  [dim]wrote: {', '.join(keys)}[/dim]" if keys else "")
                                )

        except Exception as e:
            console.print(f"\n[jarvis.error]Pipeline error: {e}[/jarvis.error]")
            continue

        console.rule("[dim]Done[/dim]", style="dim")
        console.print()

        if final_answer or final_iterations:
            render_answer(final_answer, final_iterations)
            history.append(AIMessage(content=final_answer))


def main():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        console.print("[jarvis.error]GROQ_API_KEY not set. Export it and try again.[/jarvis.error]")
        sys.exit(1)

    model = _new_chatgroq(
        model="llama-3.3-70b-versatile",
        api_key=SecretStr(api_key),
        temperature=0.2,
        max_tokens=4096,
    )

    try:
        asyncio.run(_run_async(model))
    except KeyboardInterrupt:
        console.print("\n[jarvis.system]Goodbye.[/jarvis.system]\n")


async def _run_async(model: ChatGroq):
    """Async entry point for main() — initializes registry and runs chat loop."""
    registry = Registry()
    await registry.initialize()
    await chat_loop(model, registry)


if __name__ == "__main__":
    main()