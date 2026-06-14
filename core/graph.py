"""
Graph builder — assembles the JARVIS LangGraph pipeline.

Flow:
  router ──► (decision)
               ├─ "answer"                  ──► END
               ├─ "use_tools" / "use_agents" ──► executor ──► router (loop)
"""
from __future__ import annotations

from functools import partial

from langchain_groq import ChatGroq
from langgraph.graph import END, StateGraph

from .executor import executor_node
from .registry import Registry
from .router import router_node
from .state import JarvisState


def _route(state: JarvisState) -> str:
    decision = state.get("decision", "answer")
    if decision == "answer":
        return "end"
    return "execute"


def build_graph(model: ChatGroq, registry: Registry):
    """Build and compile the JARVIS StateGraph."""
    graph = StateGraph(JarvisState)

    # Bind model + registry into nodes via partial.
    # RunnableConfig is injected automatically by LangGraph as a second
    # positional arg when the node signature includes it — partial leaves
    # that slot open.
    router = partial(router_node, model=model, registry=registry)
    executor = partial(executor_node, model=model, registry=registry)

    graph.add_node("router", router)
    graph.add_node("executor", executor)

    graph.set_entry_point("router")

    graph.add_conditional_edges(
        "router",
        _route,
        {"end": END, "execute": "executor"},
    )
    graph.add_edge("executor", "router")

    return graph.compile()

def build_graph_for_server():
    """Zero-arg factory for langgraph-cli server.
    
    Initializes Registry discovery in a separate thread to avoid blocking the event loop.
    """
    import os
    from pydantic import SecretStr
    import concurrent.futures
    import asyncio

    api_key = os.getenv("GROQ_API_KEY")
    if api_key is None:
        raise RuntimeError("GROQ_API_KEY environment variable is required")
    model = ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=SecretStr(api_key),
        temperature=0.2,
        max_tokens=4096,
    )
    registry = Registry()
    
    # Run async initialization in a background thread with its own event loop
    def init_registry():
        asyncio.run(registry.initialize())
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(init_registry).result()
    
    return build_graph(model, registry)