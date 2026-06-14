"""State definitions for the JARVIS LangGraph pipeline."""
from __future__ import annotations

from typing import Annotated, Any
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class JarvisState(TypedDict, total=False):
    # Full conversation / working messages
    messages: Annotated[list[BaseMessage], add_messages]
    # The user's original request (never mutated) — optional, defaults to ""
    user_input: str
    # Router decision: "answer" | "use_tools" | "use_agents"
    decision: str
    # Plan produced by router when it wants to delegate
    plan: str
    # Which tools/agents to invoke and with what args
    # List of {"type": "tool"|"agent", "name": str, "input": dict}
    invocations: list[dict[str, Any]]
    # Accumulated execution results
    execution_results: list[str]
    # Final answer when router decides to respond directly
    final_answer: str
    # Iteration count (guard against infinite loops)
    iterations: int