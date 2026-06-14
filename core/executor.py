"""Executor node — runs tools and agents specified in the router's plan."""
from __future__ import annotations

import json
from typing import Any

from langchain_groq import ChatGroq
from langchain_core.runnables import RunnableConfig
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

from .registry import Registry
from .state import JarvisState

console = Console()


def _format_tool_output(result: Any) -> Text:
    """Render tool output in a readable, wrapped form for the terminal."""
    if isinstance(result, str):
        content = result
    else:
        try:
            content = json.dumps(result, indent=2, ensure_ascii=False, default=str)
        except TypeError:
            content = str(result)
    return Text(content, overflow="fold")


def _print_tool_output(name: str, result: Any, is_error: bool = False) -> None:
    title_style = "bold red" if is_error else "bold green"
    border_style = "red" if is_error else "green"
    console.print(
        Panel(
            _format_tool_output(result),
            title=f"[{title_style}] {name} output [/{title_style}]",
            border_style=border_style,
            expand=False,
            padding=(1, 2),
        )
    )


async def executor_node(
    state: JarvisState,
    config: RunnableConfig,
    model: ChatGroq,
    registry: Registry,
) -> dict[str, Any]:
    invocations = state.get("invocations", [])
    results: list[str] = list(state.get("execution_results", []))

    for inv in invocations:
        inv_type = inv.get("type", "tool")
        name = inv.get("name", "")
        input_data = inv.get("input", {})

        if inv_type == "tool":
            tool_entry = registry.get_tool(name)
            if tool_entry is None or not tool_entry.active:
                results.append(f"[tool:{name}] ERROR: tool not found or inactive.")
                continue
            try:
                console.print(
                    f"  [dim cyan]⚙ Running tool:[/dim cyan] [bold]{name}[/bold]  args={input_data}"
                )
                # LangChain @tool functions accept kwargs
                result = tool_entry.callable_fn.invoke(input_data)
                _print_tool_output(name, result)
                results.append(f"[tool:{name}] {result}")
            except Exception as e:
                _print_tool_output(name, e, is_error=True)
                results.append(f"[tool:{name}] ERROR: {e}")

        elif inv_type == "agent":
            agent_entry = registry.get_agent(name)
            if agent_entry is None or not agent_entry.active:
                results.append(f"[agent:{name}] ERROR: agent not found or inactive.")
                continue
            try:
                console.print(
                    f"  [dim magenta]🤖 Running agent:[/dim magenta] [bold]{name}[/bold]  input={input_data}"
                )
                # Pass config down so subagents can propagate streaming context
                result = await agent_entry.run_fn(input_data, model, config)
                results.append(f"[agent:{name}] {result}")
            except Exception as e:
                results.append(f"[agent:{name}] ERROR: {e}")
        else:
            results.append(
                f"[unknown:{name}] ERROR: unknown invocation type '{inv_type}'"
            )

    return {"execution_results": results}