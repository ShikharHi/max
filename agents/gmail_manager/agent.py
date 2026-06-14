"""
agent.py — Gmail AI Agent
Custom LangGraph StateGraph (no prebuilt create_react_agent) + Groq LLM.
MCP tools loaded from ArtyMcLabin/Gmail-MCP-Server via langchain-mcp-adapters.

Graph topology:
    START → llm_call ─┬─(tool calls?)─→ tool_node → llm_call
                      └─(no tool calls)─→ END
"""

import asyncio
import concurrent.futures
import json
import operator
import os
import sys
from pathlib import Path
from textwrap import dedent
from typing import Annotated, Any

from dotenv import load_dotenv
from langchain_core.messages import AnyMessage, SystemMessage, ToolMessage, HumanMessage
from langchain_groq import ChatGroq
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import StateGraph, START, END
from pydantic import SecretStr
from typing_extensions import TypedDict

# Load .env from project root
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path, override=True)

api = os.getenv("GROQ_API_KEY") or ""

_TOOL_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=2)

def _run_coroutine_in_thread(coro):
    return _TOOL_EXECUTOR.submit(asyncio.run, coro).result()


def _new_chatgroq(*args: Any, **kwargs: Any) -> ChatGroq:
    return ChatGroq(*args, **kwargs)
MCP_SERVER_PATH = os.getenv("MCP_SERVER_PATH") or str(
    Path(__file__).resolve().parents[2]
    / "mcp"
    / "Gmail-MCP-Server-main"
    / "dist"
    / "index.js"
)
DEFAULT_MODEL = "llama-3.3-70b-versatile"


# ─────────────────────────────────────────────────────────────
# System Prompt
# ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = dedent("""
You are Aria, an expert AI Gmail Agent. You help users read, search, compose,
send, reply, label, archive, and manage their Gmail inbox efficiently.

═══════════════════════════════════════════════════════════════
  STRICT TOOL ROUTING — NEVER VIOLATE THESE RULES
═══════════════════════════════════════════════════════════════

1. SEARCH / FIND EMAILS
   ▸ Always use: gmail_search_emails
   ▸ Use Gmail search syntax: is:unread, from:name@domain.com,
     subject:keyword, newer_than:7d, older_than:30d, has:attachment,
     label:work, in:inbox, in:sent, etc.

2. READ A SPECIFIC EMAIL
   ▸ Always use: gmail_get_email with the message_id.

3. READ A FULL THREAD / CONVERSATION
   ▸ Always use: gmail_get_thread with the thread_id.

4. LIST ALL LABELS
   ▸ Always use: gmail_list_labels

5. COMPOSE AND SEND A NEW EMAIL
   ▸ Always use: gmail_send_email
   ▸ CONFIRM with the user before sending — show to, subject, and a
     preview of the body. Only send after explicit approval.

6. REPLY TO AN EMAIL
   ▸ Always use: gmail_reply_to_email (preserves In-Reply-To headers).
   ▸ CONFIRM with the user before sending.

7. CREATE A DRAFT (don't send yet)
   ▸ Always use: gmail_create_draft

8. ARCHIVE AN EMAIL
   ▸ Always use: gmail_archive_email
   ▸ CONFIRM before archiving unless the user said "go ahead".

9. MOVE TO TRASH
   ▸ Always use: gmail_move_to_trash
   ▸ CONFIRM before trashing.

10. APPLY A LABEL
    ▸ Always use: gmail_apply_label

═══════════════════════════════════════════════════════════════
  BEHAVIOURAL GUIDELINES
═══════════════════════════════════════════════════════════════

• ALWAYS confirm before any write operation (send, reply, trash, archive,
  label) unless the user has explicitly said "go ahead" or "don't ask".

• When showing email results, display: sender, subject, date, snippet.
  Never dump raw JSON at the user.

• For bulk operations (e.g. "archive all newsletters"), describe exactly
  what you will do and how many emails are affected, then wait for
  confirmation before proceeding.

• If a search returns no results, say so clearly and suggest refining
  the query.

• When replying, use gmail_reply_to_email — never gmail_send_email —
  so threading is preserved correctly.

• Be concise and factual. Use bullet points for multi-email results.

• Never expose email content the user did not ask to see.
""").strip()


# ─────────────────────────────────────────────────────────────
# Graph State
# ─────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int


# ─────────────────────────────────────────────────────────────
# Load MCP tools
# ─────────────────────────────────────────────────────────────

def _mcp_config() -> dict:
    if not Path(MCP_SERVER_PATH).exists():
        raise RuntimeError(
            "MCP_SERVER_PATH not set in .env\n"
            f"Point it to: {Path(__file__).resolve().parents[2] / 'mcp' / 'Gmail-MCP-Server-main' / 'dist' / 'index.js'}"
        )
    return {
        "gmail": {
            "command": "node",
            "args": [MCP_SERVER_PATH],
            "transport": "stdio",
        }
    }


async def load_tools() -> tuple[list, dict]:
    """
    Load Gmail tools from the running MCP server.
    Uses stateless MultiServerMCPClient (no async context manager needed).
    parallel_tool_calls is NOT set here — it's set on the LLM binding below.

    Returns:
        (tools_list, tools_by_name_dict)
    """
    client = MultiServerMCPClient(_mcp_config())
    tools = await client.get_tools()
    tools_by_name = {t.name: t for t in tools}
    return tools, tools_by_name


def _is_inbox_summary_request(query: str) -> bool:
    lowered = query.lower()
    return "inbox" in lowered and any(word in lowered for word in ("summar", "summary", "summarise", "summarize"))


async def _summarize_inbox(query: str) -> str:
    tools, tools_by_name = await load_tools()
    search_tool = tools_by_name.get("search_emails")
    if search_tool is None:
        return "Gmail search tool is unavailable."

    search_result = await search_tool.ainvoke({"query": "in:inbox", "maxResults": 10})
    payload = json.dumps(search_result, ensure_ascii=False, default=str, indent=2)

    llm = _new_chatgroq(
        model=DEFAULT_MODEL,
        temperature=0.2,
        api_key=SecretStr(api),
    )

    response = await llm.ainvoke([
        SystemMessage(content=(
            "You summarize Gmail search results for the user. "
            "Do not call tools. Be concise, mention counts and a few notable senders/subjects."
        )),
        HumanMessage(content=(
            f"User request: {query}\n\n"
            f"Inbox search results JSON:\n{payload}\n\n"
            "Write a short inbox summary."
        )),
    ])
    return str(response.content)


# ─────────────────────────────────────────────────────────────
# Graph nodes
# ─────────────────────────────────────────────────────────────

def make_llm_call_node(model_with_tools):
    """Returns the llm_call node closed over the bound model."""

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
    """Returns the tool_node closed over the tools registry."""

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
                    # MCP tools are async — run them in a separate loop when the current loop is already running.
                    try:
                        asyncio.get_running_loop()
                    except RuntimeError:
                        observation = asyncio.get_event_loop().run_until_complete(
                            tool.ainvoke(tool_call["args"])
                        )
                    else:
                        observation = _run_coroutine_in_thread(tool.ainvoke(tool_call["args"]))
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
    tools: list,
    tools_by_name: dict,
    model: str = "llama-3.3-70b-versatile",
    temperature: float = 0.0,
):
    """
    Build and compile the Gmail agent graph.

    Args:
        tools         : List of MCP tool objects (from load_tools()).
        tools_by_name : Dict of {name: tool} for the tool_node.
        model         : Groq model string.
        temperature   : LLM temperature.

    Returns:
        Compiled LangGraph graph.
    """
    # parallel_tool_calls=False is MANDATORY for Groq — it rejects parallel calls.
    llm = _new_chatgroq(
        model=model,
        temperature=temperature,
        api_key=SecretStr(api),
        model_kwargs={"parallel_tool_calls": False},
    )

    model_with_tools = llm.bind_tools(tools)

    llm_call  = make_llm_call_node(model_with_tools)
    tool_node = make_tool_node(tools_by_name)

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
# Convenience async runner
# ─────────────────────────────────────────────────────────────

async def run(input_data, model=None, config=None, agent=None) -> str:
    """Run a single query and return the final text response."""
    if isinstance(input_data, dict):
        query = input_data.get("text", "")
    else:
        query = str(input_data)

    if not query or not query.strip():
        return "No Gmail query provided."

    if _is_inbox_summary_request(query):
        return await _summarize_inbox(query)

    if agent is None:
        tools, tools_by_name = await load_tools()
        agent = build_agent(tools, tools_by_name)

    state = agent.invoke({"messages": [HumanMessage(content=query)], "llm_calls": 0})
    return state["messages"][-1].content


# ─────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) or "Summarize my last 5 unread emails."
    print("\nAria Gmail Agent\n" + "─" * 40)
    print(asyncio.run(run(query)))
