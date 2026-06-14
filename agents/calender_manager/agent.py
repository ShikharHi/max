"""
agent.py — Google Calendar AI Agent
Custom LangGraph StateGraph (no prebuilt create_react_agent) + Groq LLM.
MCP tools loaded from nspady/google-calendar-mcp via langchain-mcp-adapters.

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
from datetime import datetime, time, timedelta
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
GOOGLE_OAUTH_CREDENTIALS = os.getenv("GOOGLE_OAUTH_CREDENTIALS") or str(
    Path.home() / ".gmail-mcp" / "gcp-oauth.keys.json"
)
CALENDAR_MCP_SERVER = Path(__file__).resolve().parents[2] / "mcp" / "google-calendar-mcp-main" / "build" / "index.js"
DEFAULT_CALENDAR_ACCOUNT = os.getenv("GOOGLE_CALENDAR_ACCOUNT", "").strip() or None


# ─────────────────────────────────────────────────────────────
# System Prompt
# ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = dedent("""
You are Cleo, an expert AI Google Calendar Agent. You help users view, create,
update, delete, and manage their calendar events efficiently across multiple
accounts and calendars.

═══════════════════════════════════════════════════════════════
  STRICT TOOL ROUTING — NEVER VIOLATE THESE RULES
═══════════════════════════════════════════════════════════════

1. LIST ALL CALENDARS
   ▸ Always use: list-calendars

2. LIST EVENTS (by date range)
   ▸ Always use: list-events
   ▸ Always include timeMin and timeMax in ISO 8601 format.
   ▸ Use get-current-time first if you do not know the current date/time.

3. SEARCH EVENTS (by keyword / title)
   ▸ Always use: search-events

4. GET A SPECIFIC EVENT
   ▸ Always use: get-event with the eventId.

5. CREATE A NEW EVENT
   ▸ Always use: create-event
   ▸ CONFIRM with the user before creating — show title, date/time,
     duration, attendees, and calendar. Only create after approval.

6. UPDATE AN EXISTING EVENT
   ▸ Always use: update-event
   ▸ CONFIRM before updating — show what is changing.

7. DELETE AN EVENT
   ▸ Always use: delete-event
   ▸ CONFIRM before deleting — show event title and date.

8. RESPOND TO AN INVITATION (accept / decline / maybe)
   ▸ Always use: respond-to-event
   ▸ CONFIRM the response before sending.

9. CHECK AVAILABILITY / FREE-BUSY
   ▸ Always use: get-freebusy

10. GET CURRENT DATE AND TIME
    ▸ Always use: get-current-time
    ▸ Call this first whenever the user uses relative dates like
      "today", "tomorrow", "this week", "next Monday", etc.

11. LIST AVAILABLE EVENT COLORS
    ▸ Always use: list-colors

12. MANAGE GOOGLE ACCOUNTS
    ▸ Always use: manage-accounts (add / list / remove accounts)

═══════════════════════════════════════════════════════════════
  BEHAVIOURAL GUIDELINES
═══════════════════════════════════════════════════════════════

• ALWAYS call get-current-time before any date calculation. Never
  assume what today's date is.

• ALWAYS confirm before any write operation (create, update, delete,
  respond) unless the user has explicitly said "go ahead" or "don't ask".

• When showing events, display: title, date, time, duration, location
  (if any), attendees (if any). Never dump raw JSON at the user.

• For availability checks, summarise free windows clearly:
  "You are free Monday 10am–12pm and Tuesday 2pm–4pm."

• When the user gives a relative date ("next Friday"), resolve it
  using get-current-time, then confirm the resolved date before
  proceeding.

• For recurring event modifications, clarify scope:
  "Just this occurrence, this and future, or all occurrences?"

• Be concise and factual. Use bullet points for event lists.

• If a calendar name is ambiguous, call list-calendars and ask
  the user to confirm which one they mean.
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
    credentials_path = Path(GOOGLE_OAUTH_CREDENTIALS).expanduser()
    if not credentials_path.exists():
        raise RuntimeError(
            "GOOGLE_OAUTH_CREDENTIALS not set in .env\n"
            f"Point it to your gcp-oauth.keys.json file: {credentials_path}\n"
            "See: https://github.com/nspady/google-calendar-mcp"
        )
    return {
        "google-calendar": {
            "command": "node",
            "args": [str(CALENDAR_MCP_SERVER)],
            "transport": "stdio",
            "env": {
                "GOOGLE_OAUTH_CREDENTIALS": str(credentials_path),
            },
        }
    }


async def load_tools() -> tuple[list, dict]:
    """
    Load Calendar tools from the MCP server via npx.
    Uses stateless MultiServerMCPClient (no async context manager needed).
    parallel_tool_calls is NOT set here — set on the LLM binding below.

    Returns:
        (tools_list, tools_by_name_dict)
    """
    client = MultiServerMCPClient(_mcp_config())
    tools = await client.get_tools()
    tools_by_name = {t.name: t for t in tools}
    return tools, tools_by_name


def _is_today_meeting_query(query: str) -> bool:
    lowered = query.lower()
    return "today" in lowered and any(word in lowered for word in ("meeting", "meetings", "event", "events"))


def _today_bounds() -> tuple[str, str]:
    now = datetime.now().astimezone()
    start = datetime.combine(now.date(), time.min, tzinfo=now.tzinfo)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


async def _summarize_today_meetings(query: str) -> str:
    tools, tools_by_name = await load_tools()
    list_events = tools_by_name.get("list-events")
    if list_events is None:
        return "Calendar list-events tool is unavailable."

    time_min, time_max = _today_bounds()
    try:
        event_args = {
            "timeMin": time_min,
            "timeMax": time_max,
        }
        if DEFAULT_CALENDAR_ACCOUNT:
            event_args["account"] = DEFAULT_CALENDAR_ACCOUNT
        else:
            event_args["calendarId"] = "primary"

        result = await list_events.ainvoke({
            **event_args,
        })
    except Exception as e:
        message = str(e)
        if "authentication token is invalid or expired" in message.lower():
            return (
                "Google Calendar authentication has expired. Re-run the MCP auth step: "
                "`npm run auth` in `mcp/google-calendar-mcp-main` (or the equivalent auth command for your setup), "
                "then try again."
            )
        return f"Calendar query failed: {message}"

    if isinstance(result, str):
        raw_text = result
    else:
        raw_text = json.dumps(result, ensure_ascii=False, default=str, indent=2)

    llm = _new_chatgroq(
        model="llama-3.3-70b-versatile",
        temperature=0.2,
        api_key=SecretStr(api),
        model_kwargs={"parallel_tool_calls": False},
    )

    response = await llm.ainvoke([
        SystemMessage(content=(
            "You summarize Google Calendar query results for the user. "
            "Do not call tools. Be concise and answer whether there are meetings today, "
            "then list titles and times if present."
        )),
        HumanMessage(content=(
            f"User request: {query}\n\n"
            f"Calendar results for today (JSON or text):\n{raw_text}\n\n"
            "Write a short answer about whether there are meetings today."
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

    def _inject_default_account(tool, args: dict) -> dict:
        if not DEFAULT_CALENDAR_ACCOUNT or "account" in args:
            return args

        args_schema = getattr(tool, "args_schema", None)
        schema_fields = getattr(args_schema, "model_fields", None) or getattr(args_schema, "__fields__", None)
        if schema_fields and "account" in schema_fields:
            return {**args, "account": DEFAULT_CALENDAR_ACCOUNT}

        return args

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
                    tool_args = _inject_default_account(tool, dict(tool_call["args"]))
                    # MCP tools are async — run them in a separate loop when the current loop is already running.
                    try:
                        asyncio.get_running_loop()
                    except RuntimeError:
                        observation = asyncio.get_event_loop().run_until_complete(
                            tool.ainvoke(tool_args)
                        )
                    else:
                        observation = _run_coroutine_in_thread(tool.ainvoke(tool_args))
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
    Build and compile the Calendar agent graph.

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
        date = input_data.get("date")
        action = input_data.get("action")
    else:
        query = str(input_data)
        date = None
        action = None

    if not query or not query.strip():
        return "No calendar query provided."

    if _is_today_meeting_query(query) or (
        isinstance(date, str) and date.lower() == "today" and action == "list"
    ):
        return await _summarize_today_meetings(query)

    if agent is None:
        tools, tools_by_name = await load_tools()
        agent = build_agent(tools, tools_by_name)

    state = agent.invoke(AgentState(messages=[HumanMessage(content=query)], llm_calls=0))
    return state["messages"][-1].content


# ─────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) or "What events do I have this week?"
    print("\nCleo Calendar Agent\n" + "─" * 40)
    print(asyncio.run(run(query)))