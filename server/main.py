"""
JARVIS FastAPI Server
=====================
Production-grade server that mirrors the LangGraph Platform API contract.

Endpoints:
  GET  /                                   health check
  GET  /info                               server info + graph metadata
  GET  /docs                               Swagger UI

  -- Assistants --
  POST   /assistants                       create assistant
  GET    /assistants                       list assistants
  GET    /assistants/{id}                  get assistant
  DELETE /assistants/{id}                  delete assistant

  -- Threads --
  POST   /threads                          create thread
  GET    /threads                          list threads
  POST   /threads/search                   search/filter threads
  GET    /threads/{id}                     get thread (includes latest values)
  DELETE /threads/{id}                     delete thread
  GET    /threads/{id}/state               get latest LangGraph checkpoint state
  POST   /threads/{id}/state               patch state (for HITL resume)
  GET    /threads/{id}/history             checkpoint history

  -- Runs (threaded) --
  POST   /threads/{id}/runs                create background run
  GET    /threads/{id}/runs                list runs
  POST   /threads/{id}/runs/stream         create + stream run (SSE)
  POST   /threads/{id}/runs/wait           create + wait for completion
  GET    /threads/{id}/runs/{rid}          get run
  GET    /threads/{id}/runs/{rid}/stream   re-attach to run stream
  POST   /threads/{id}/runs/{rid}/cancel   cancel run

  -- Runs (stateless) --
  POST   /runs/stream                      stateless SSE stream
  POST   /runs/wait                        stateless wait

  -- Registry --
  GET    /registry                         list all tools/agents
  GET    /registry/active                  list active names
  POST   /registry/plugin                  activate tool/agent
  POST   /registry/plugout                 deactivate tool/agent
  POST   /registry/reload                  re-discover from disk
"""
from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

import uvicorn
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import SecretStr

# ── Path setup ────────────────────────────────────────────────────────────────
# Allow running from the server/ subdirectory or from the project root.
HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(HERE))

load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)

# ── App ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    from langchain_groq import ChatGroq
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    # Resolve the JARVIS core package
    core_path = PROJECT_ROOT / "core"
    if not core_path.exists():
        raise RuntimeError(f"JARVIS core package not found at {core_path}")

    from core import Registry
    from db.database import Database
    from services.run_manager import RunManager
    import dependencies as deps

    # ── LLM ──────────────────────────────────────────────────────────────────
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set")

    model = ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=SecretStr(api_key),
        temperature=0.2,
        max_tokens=4096,
    )

    # ── Registry ──────────────────────────────────────────────────────────────
    registry = Registry()
    await registry.initialize()

    logger.info(
        "Registry ready — %d tools, %d agents",
        len(registry.active_tools()),
        len(registry.active_agents()),
    )

    # ── Graph (SqliteSaver for persistence) ───────────────────────────────────
    checkpointer_path = str(HERE / "jarvis_checkpoints.db")
    async with AsyncSqliteSaver.from_conn_string(checkpointer_path) as checkpointer:
        from functools import partial
        from core.router import router_node
        from core.executor import executor_node
        from core.state import JarvisState
        from langgraph.graph import END, StateGraph

        def _route(state):
            return "end" if state.get("decision", "answer") == "answer" else "execute"

        sg = StateGraph(JarvisState)
        sg.add_node("router", partial(router_node, model=model, registry=registry))
        sg.add_node("executor", partial(executor_node, model=model, registry=registry))
        sg.set_entry_point("router")
        sg.add_conditional_edges("router", _route, {"end": END, "execute": "executor"})
        sg.add_edge("executor", "router")
        graph = sg.compile(checkpointer=checkpointer)

        # ── DB (metadata layer) ───────────────────────────────────────────────────
        db = Database()
        await db.connect()

        # ── RunManager ────────────────────────────────────────────────────────────
        run_manager = RunManager(graph=graph, db=db)

        # ── Register singletons ───────────────────────────────────────────────────
        deps.set_db(db)
        deps.set_run_manager(run_manager)
        deps.set_registry(registry)
        deps.set_graph(graph)

        logger.info("JARVIS server ready  ✓")

        yield

        if db:
            await db.close()


app = FastAPI(
    title="JARVIS API",
    description="Production LangGraph agent server for JARVIS.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_start_time = time.time()
logger = logging.getLogger("jarvis.server")

# ── Routers ───────────────────────────────────────────────────────────────────

from api.routers import assistants, threads, runs, registry as reg_router

app.include_router(assistants.router)
app.include_router(threads.router)
app.include_router(runs.router)
app.include_router(reg_router.router)


# ── Health / Info ─────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "graph_id": "jarvis",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - _start_time, 2),
    }


@app.get("/info", tags=["Health"])
async def info():
    import dependencies as deps
    registry = deps._registry
    tools = [t.name for t in registry.active_tools()] if registry else []
    agents = [a.name for a in registry.active_agents()] if registry else []
    return {
        "graph_id": "jarvis",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - _start_time, 2),
        "active_tools": tools,
        "active_agents": agents,
        "endpoints": {
            "assistants": "/assistants",
            "threads": "/threads",
            "runs_stream": "/threads/{thread_id}/runs/stream",
            "runs_wait": "/threads/{thread_id}/runs/wait",
            "stateless_stream": "/runs/stream",
            "registry": "/registry",
            "docs": "/docs",
        },
    }


# ── __init__ files ────────────────────────────────────────────────────────────

_inits = [
    HERE / "__init__.py",
    HERE / "api" / "__init__.py",
    HERE / "api" / "routers" / "__init__.py",
    HERE / "db" / "__init__.py",
    HERE / "models" / "__init__.py",
    HERE / "services" / "__init__.py",
]
for p in _inits:
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.touch()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    )
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[str(HERE), str(PROJECT_ROOT / "core")],
        log_level="info",
    )
