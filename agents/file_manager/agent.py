"""
agent.py — File Manager AI Agent
Custom LangGraph StateGraph (no prebuilt create_react_agent) + Groq LLM.

Graph topology:
    START → llm_call ─┬─(tool calls?)─→ tool_node → llm_call
                      └─(no tool calls)─→ END
"""

import operator
import sys
from pathlib import Path
from textwrap import dedent
from typing import Annotated, Any, Literal

from langchain.messages import AnyMessage, SystemMessage, ToolMessage
from langchain_groq import ChatGroq
from langchain_community.agent_toolkits import FileManagementToolkit
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict

# Allow this module to import its sibling helper modules when loaded by path.
sys.path.insert(0, str(Path(__file__).parent))

from exec_tool import exec_tool
from search_tool import search_files_tool, rescan_index_tool, index_stats_tool
from pydantic import SecretStr
import os
from dotenv import load_dotenv

# Load project .env explicitly (agent runs from nested package dir)
env_path = Path(__file__).resolve().parents[2] / ".env"
# Load and override environment variables from project .env to ensure the
# project-specific GROQ_API_KEY is used instead of any system-level key.
load_dotenv(dotenv_path=env_path, override=True)

def _new_chatgroq(*args: Any, **kwargs: Any) -> ChatGroq:
    return ChatGroq(*args, **kwargs)

api = os.getenv("GROQ_API_KEY") or ""
# ─────────────────────────────────────────────────────────────
# System Prompt
# ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = dedent("""
You are Atlas, an expert AI File Manager Agent. You help users organise,
navigate, search, read, write, and manage their files efficiently.

═══════════════════════════════════════════════════════════════
  STRICT TOOL ROUTING — NEVER VIOLATE THESE RULES
═══════════════════════════════════════════════════════════════

1. READ FILE CONTENT
   ▸ Always use: read_file
   ✗ Never use exec_tool with cat, less, more, head, tail, or any
     command that reads and returns file content.

2. WRITE / CREATE / APPEND FILE CONTENT
   ▸ Always use: write_file
   ✗ Never use exec_tool with echo, printf, tee, sed, awk, or any
     command that writes data into a file.

3. DELETE FILES
   ▸ Always use: file_delete
   ✗ Never use exec_tool with rm, del, or rmdir to remove files.

4. LIST DIRECTORY CONTENTS
   ▸ Always use: list_directory
   ✗ Never use exec_tool with ls, dir, or find to list files.

5. MOVE, COPY, RENAME, COMPRESS, CHMOD, MKDIR (no dedicated tool)
   ▸ Use: exec_tool
   These operations have no dedicated tool; exec_tool is the right choice.

6. SEARCH / FIND FILES BY METADATA
   ▸ Use: search_files_tool with a JSON filter object.
   ▸ Available filters: name, extension, parent_dir, is_dir,
     min_size_kb, max_size_kb, modified_after, modified_before,
     mime_type, mime_like, owner_writable, depth_max, limit.
   ▸ If the index seems stale, call rescan_index_tool first.

7. INDEX MANAGEMENT
   ▸ rescan_index_tool — rebuild the file index (after bulk changes)
   ▸ index_stats_tool  — show index stats (total files, extensions, etc.)

═══════════════════════════════════════════════════════════════
  BEHAVIOURAL GUIDELINES
═══════════════════════════════════════════════════════════════

• Before any destructive operation (delete, overwrite, move to a different
  location) CONFIRM with the user unless they have explicitly said "go ahead"
  or "don't ask".

• When searching, prefer search_files_tool with relevant filters over
  brute-force directory listing.

• After move/copy/delete/rename operations, suggest calling rescan_index_tool
  so the index stays accurate.

• Always show full paths in your responses so the user knows exactly what
  was affected.

• If you are unsure which directory to operate in, ask the user to clarify
  rather than guessing.

• Be concise and factual. Use bullet points for multi-file results.

• Never expose or log file content that the user did not ask to see.
""").strip()


# ─────────────────────────────────────────────────────────────
# Graph State
# ─────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int


# ─────────────────────────────────────────────────────────────
# Build tools
# ─────────────────────────────────────────────────────────────

def build_tools(root_dir: str | None = None) -> tuple[list, dict]:
    """
    Returns (tools_list, tools_by_name_dict).
    root_dir: restricts LC file toolkit to this directory.
    """
    work_dir = root_dir or str(Path.home())

    toolkit = FileManagementToolkit(
        root_dir=work_dir,
        selected_tools=["read_file", "write_file", "file_delete", "list_directory"],
    )
    lc_tools = toolkit.get_tools()

    custom_tools = [exec_tool, search_files_tool, rescan_index_tool, index_stats_tool]
    all_tools = lc_tools + custom_tools
    tools_by_name = {t.name: t for t in all_tools}
    return all_tools, tools_by_name


# ─────────────────────────────────────────────────────────────
# Graph nodes
# ─────────────────────────────────────────────────────────────

def make_llm_call_node(model_with_tools):
    """Returns the llm_call node function closed over the bound model."""

    def llm_call(state: AgentState) -> dict:
        """Call the LLM; it decides whether to invoke a tool or respond."""
        response = model_with_tools.invoke(
            [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
        )
        return {
            "messages": [response],
            "llm_calls": state.get("llm_calls", 0) + 1,
        }

    return llm_call


def make_tool_node(tools_by_name: dict):
    """Returns the tool_node function closed over the tools registry."""

    def tool_node(state: AgentState) -> dict:
        """Execute every tool call in the last AI message."""
        results: list[ToolMessage] = []
        last_msg = state["messages"][-1]

        for tool_call in getattr(last_msg, "tool_calls", []):
            tool = tools_by_name.get(tool_call["name"])
            if tool is None:
                observation = f"Error: unknown tool '{tool_call['name']}'"
            else:
                try:
                    observation = tool.invoke(tool_call["args"])
                except Exception as e:
                    observation = f"Tool error: {e}"

            results.append(
                ToolMessage(
                    content=str(observation),
                    tool_call_id=tool_call["id"],
                )
            )

        return {"messages": results}

    return tool_node


def should_continue(state: AgentState) -> str:
    """Route: tool_node if the LLM made tool calls, else END."""
    last_msg = state["messages"][-1]
    if getattr(last_msg, "tool_calls", None):
        return "tool_node"
    return END


# ─────────────────────────────────────────────────────────────
# Build agent graph
# ─────────────────────────────────────────────────────────────

def build_agent(
    model: str = "llama-3.3-70b-versatile",
    root_dir: str | None = None,
    temperature: float = 0.0,
):
    """
    Build and compile the custom LangGraph StateGraph agent.

    Args:
        model    : Groq model string (default llama-3.3-70b-versatile).
        root_dir : Root directory for file operations (default: home dir).
        temperature: LLM temperature.

    Returns:
        Compiled LangGraph graph.
    """
    # ── LLM ──────────────────────────────────────────────────
    llm = _new_chatgroq(model=model, temperature=temperature, api_key=SecretStr(api))

    # ── Tools ────────────────────────────────────────────────
    tools, tools_by_name = build_tools(root_dir)
    model_with_tools = llm.bind_tools(tools)

    # ── Node functions ───────────────────────────────────────
    llm_call  = make_llm_call_node(model_with_tools)
    tool_node = make_tool_node(tools_by_name)

    # ── Graph ────────────────────────────────────────────────
    builder = StateGraph(AgentState)

    builder.add_node("llm_call",  llm_call)
    builder.add_node("tool_node", tool_node)

    builder.add_edge(START, "llm_call")
    builder.add_conditional_edges(
        "llm_call",
        should_continue,
        ["tool_node", END],
    )
    builder.add_edge("tool_node", "llm_call")

    return builder.compile()


# ─────────────────────────────────────────────────────────────
# Convenience runner
# ─────────────────────────────────────────────────────────────

def _normalize_query(input_data) -> str:
    """Convert structured agent input into a plain query string."""
    if isinstance(input_data, str):
        return input_data

    if isinstance(input_data, dict):
        style = str(input_data.get("style", "")).strip().lower().replace(" ", "_").replace("-", "_")
        text = str(input_data.get("text") or input_data.get("path") or input_data.get("query") or "").strip()

        if style == "dir_list":
            target = text or "."
            return f"List the files and directories in {target}."

        if style == "file_list":
            target = text or "."
            return f"List the files in {target}."

        if text:
            return text

    return str(input_data)


def _resolve_directory_target(input_data) -> Path:
    """Resolve a directory request to an actual filesystem path."""
    cwd = Path.cwd()

    if isinstance(input_data, dict):
        raw_target = str(input_data.get("path") or input_data.get("text") or input_data.get("query") or "").strip()
    else:
        raw_target = str(input_data).strip()

    if not raw_target:
        return cwd

    candidate = Path(raw_target).expanduser()
    if candidate.exists() and candidate.is_dir():
        return candidate.resolve()

    search_roots = [cwd, cwd.parent, cwd.parent.parent, Path.home()]
    lowered = raw_target.lower()

    for root in search_roots:
        if not root.exists():
            continue
        if root.name.lower() == lowered and root.is_dir():
            return root.resolve()
        direct = root / raw_target
        if direct.exists() and direct.is_dir():
            return direct.resolve()
        for child in root.iterdir():
            if child.is_dir() and child.name.lower() == lowered:
                return child.resolve()

    return candidate.resolve()


def _format_directory_listing(target: Path) -> str:
    """Return a concise directory listing for the requested path."""
    if not target.exists():
        return f"Directory not found: {target}"
    if not target.is_dir():
        return f"Not a directory: {target}"

    entries = []
    try:
        for child in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            suffix = "/" if child.is_dir() else ""
            entries.append(f"{child.name}{suffix}")
    except PermissionError:
        return f"Permission denied: {target}"

    if not entries:
        return f"{target} is empty."

    return f"{target}\n" + "\n".join(entries)


async def run(input_data, model=None, config=None, agent=None, root_dir: str | None = None) -> str:
    """Run a single query or structured request and return the final text response."""
    from langchain.messages import HumanMessage

    if isinstance(input_data, dict):
        style = str(input_data.get("style", "")).strip().lower().replace(" ", "_").replace("-", "_")
        if style == "dir_list":
            return _format_directory_listing(_resolve_directory_target(input_data))

    if agent is None:
        agent = build_agent(root_dir=root_dir)

    query = _normalize_query(input_data)
    state = agent.invoke({"messages": [HumanMessage(content=query)]})  # type: ignore
    return state["messages"][-1].content


if __name__ == "__main__":
    import asyncio
    import sys
    query = " ".join(sys.argv[1:]) or "List the files in my home directory."
    print("\n🤖 Atlas File Manager\n" + "─" * 40)
    print(asyncio.run(run(query)))