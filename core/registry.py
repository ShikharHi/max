"""
Registry — discovers tools and agents from filesystem.
Structure expected:
  tools/<name>/tool.json   +  tool.py
  agents/<name>/agent.json +  agent.py
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table

console = Console()

BASE = Path(__file__).parent.parent


class ToolEntry:
    def __init__(self, meta: dict, callable_fn: Any, folder: Path):
        self.name: str = meta["name"]
        self.display_name: str = meta.get("display_name", meta["name"])
        self.description: str = meta.get("description", "")
        self.version: str = meta.get("version", "1.0.0")
        self.active: bool = meta.get("active", True)
        self.tags: list[str] = meta.get("tags", [])
        self.callable_fn = callable_fn
        self.folder = folder
        self.meta = meta


class AgentEntry:
    def __init__(self, meta: dict, run_fn: Any, folder: Path):
        self.name: str = meta["name"]
        self.display_name: str = meta.get("display_name", meta["name"])
        self.description: str = meta.get("description", "")
        self.version: str = meta.get("version", "1.0.0")
        self.active: bool = meta.get("active", True)
        self.tags: list[str] = meta.get("tags", [])
        self.input_schema: dict = meta.get("input_schema", {})
        self.run_fn = run_fn
        self.folder = folder
        self.meta = meta


class Registry:
    def __init__(self):
        self._tools: dict[str, ToolEntry] = {}
        self._agents: dict[str, AgentEntry] = {}
        # Discovery is deferred to initialize() to avoid blocking the event loop

    # ── Discovery ────────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Async initialization: discovers tools and agents using threads.
        
        Uses asyncio.to_thread() to run blocking file I/O without freezing the event loop.
        """
        await self._discover()

    async def _discover(self) -> None:
        """Asynchronously discover tools and agents from filesystem."""
        await self._discover_tools()
        await self._discover_agents()

    async def _discover_tools(self) -> None:
        """Asynchronously discover tools using thread pool for file I/O."""
        tools_dir = BASE / "tools"
        if not tools_dir.exists():
            return

        # Use to_thread to avoid blocking event loop on directory scan
        folders = await asyncio.to_thread(self._list_folders, tools_dir)

        for folder in folders:
            json_path = folder / "tool.json"
            py_path = folder / "tool.py"
            if not json_path.exists() or not py_path.exists():
                continue
            try:
                # File I/O in thread
                meta = await asyncio.to_thread(lambda p: json.loads(p.read_text()), json_path)
                mod = await asyncio.to_thread(self._load_module, py_path, f"jarvis_tool_{folder.name}")
                # Find the first LangChain BaseTool instance (decorated with @tool)
                from langchain_core.tools import BaseTool
                fn = None
                for attr in vars(mod).values():
                    if isinstance(attr, BaseTool):
                        fn = attr
                        break
                if fn is None:
                    console.print(f"[yellow]⚠ No @tool found in {py_path}[/yellow]")
                    continue
                entry = ToolEntry(meta, fn, folder)
                self._tools[entry.name] = entry
            except Exception as e:
                console.print(f"[red]✗ Failed to load tool {folder.name}: {e}[/red]")

    async def _discover_agents(self) -> None:
        """Asynchronously discover agents using thread pool for file I/O."""
        agents_dir = BASE / "agents"
        if not agents_dir.exists():
            return

        # Use to_thread to avoid blocking event loop on directory scan
        folders = await asyncio.to_thread(self._list_folders, agents_dir)

        for folder in folders:
            json_path = folder / "agent.json"
            py_path = folder / "agent.py"
            if not json_path.exists() or not py_path.exists():
                continue
            try:
                # File I/O in thread
                meta = await asyncio.to_thread(lambda p: json.loads(p.read_text()), json_path)
                mod = await asyncio.to_thread(self._load_module, py_path, f"jarvis_agent_{folder.name}")
                run_fn = getattr(mod, "run", None)
                if run_fn is None:
                    console.print(f"[yellow]⚠ No run() found in {py_path}[/yellow]")
                    continue
                entry = AgentEntry(meta, run_fn, folder)
                self._agents[entry.name] = entry
            except Exception as e:
                console.print(f"[red]✗ Failed to load agent {folder.name}: {e}[/red]")

    @staticmethod
    def _list_folders(directory: Path) -> list[Path]:
        """Helper to list directories (for use in to_thread)."""
        return sorted([f for f in directory.iterdir() if f.is_dir()])

    @staticmethod
    def _load_module(path: Path, module_name: str):
        spec = importlib.util.spec_from_file_location(module_name, path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load module {module_name} from {path}")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = mod
        spec.loader.exec_module(mod)
        return mod

    # ── Active accessors ─────────────────────────────────────────────────────

    def active_tools(self) -> list[ToolEntry]:
        return [t for t in self._tools.values() if t.active]

    def active_agents(self) -> list[AgentEntry]:
        return [a for a in self._agents.values() if a.active]

    def all_tools(self) -> list[ToolEntry]:
        return list(self._tools.values())

    def all_agents(self) -> list[AgentEntry]:
        return list(self._agents.values())

    def get_tool(self, name: str) -> ToolEntry | None:
        return self._tools.get(name)

    def get_agent(self, name: str) -> AgentEntry | None:
        return self._agents.get(name)

    # ── Plugin / plugout ─────────────────────────────────────────────────────

    def plugin(self, name: str) -> str:
        """Activate a tool or agent by name."""
        entry = self._tools.get(name) or self._agents.get(name)
        if entry is None:
            return f"[red]Not found:[/red] '{name}'"
        if entry.active:
            return f"[yellow]Already active:[/yellow] {entry.display_name}"
        entry.active = True
        self._save_meta(entry)
        return f"[green]✓ Plugged in:[/green] {entry.display_name}"

    def plugout(self, name: str) -> str:
        """Deactivate a tool or agent by name."""
        entry = self._tools.get(name) or self._agents.get(name)
        if entry is None:
            return f"[red]Not found:[/red] '{name}'"
        if not entry.active:
            return f"[yellow]Already inactive:[/yellow] {entry.display_name}"
        entry.active = False
        self._save_meta(entry)
        return f"[yellow]✓ Plugged out:[/yellow] {entry.display_name}"

    def _save_meta(self, entry: ToolEntry | AgentEntry):
        """Persist the active state back to the JSON file."""
        is_tool = isinstance(entry, ToolEntry)
        json_path = entry.folder / ("tool.json" if is_tool else "agent.json")
        data = json.loads(json_path.read_text())
        data["active"] = entry.active
        json_path.write_text(json.dumps(data, indent=2))

    # ── Router prompt snippet ─────────────────────────────────────────────────

    def router_context(self) -> str:
        """Build the dynamic tools/agents section injected into router system prompt."""
        lines = []

        tools = self.active_tools()
        if tools:
            lines.append("## Available Tools")
            for t in tools:
                lines.append(f"- **{t.name}**: {t.description}")
        else:
            lines.append("## Available Tools\n(none active)")

        lines.append("")

        agents = self.active_agents()
        if agents:
            lines.append("## Available Agents")
            for a in agents:
                schema_str = ", ".join(f"{k}: {v}" for k, v in a.input_schema.items())
                lines.append(f"- **{a.name}**: {a.description}  |  inputs: {schema_str}")
        else:
            lines.append("## Available Agents\n(none active)")

        return "\n".join(lines)

    # ── List display ─────────────────────────────────────────────────────────

    def print_list(self):
        table = Table(title="JARVIS Registry", show_header=True, header_style="bold cyan")
        table.add_column("Type", style="dim", width=8)
        table.add_column("Name", style="bold")
        table.add_column("Status", width=10)
        table.add_column("Description")

        for t in self.all_tools():
            status = "[green]active[/green]" if t.active else "[red]inactive[/red]"
            table.add_row("tool", t.display_name, status, t.description[:70])

        for a in self.all_agents():
            status = "[green]active[/green]" if a.active else "[red]inactive[/red]"
            table.add_row("agent", a.display_name, status, a.description[:70])

        console.print(table)