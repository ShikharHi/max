"""Threads CRUD + state — /threads"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from db.database import Database
from dependencies import get_db
from models.schemas import ThreadCreate, ThreadStateUpdate
from pydantic import BaseModel, Field


class ThreadUpdate(BaseModel):
    metadata: dict[str, object] = Field(default_factory=dict)

router = APIRouter(prefix="/threads", tags=["Threads"])


@router.post("", status_code=201)
async def create_thread(body: ThreadCreate, db: Database = Depends(get_db)):
    thread_id = str(uuid.uuid4())
    return await db.create_thread(thread_id, body.metadata)


@router.get("")
async def list_threads(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    db: Database = Depends(get_db),
):
    return await db.list_threads(limit=limit, offset=offset, status=status)


@router.post("/search")
async def search_threads(
    body: dict,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Database = Depends(get_db),
):
    """Filter threads by metadata or status (mirrors LangGraph Cloud search)."""
    status = body.get("status")
    return await db.list_threads(limit=limit, offset=offset, status=status)


@router.get("/{thread_id}")
async def get_thread(thread_id: str, db: Database = Depends(get_db)):
    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(404, f"Thread '{thread_id}' not found")
    return row


@router.delete("/{thread_id}", status_code=204)
async def delete_thread(thread_id: str, db: Database = Depends(get_db)):
    ok = await db.delete_thread(thread_id)
    if not ok:
        raise HTTPException(404, f"Thread '{thread_id}' not found")


@router.patch("/{thread_id}")
async def update_thread(thread_id: str, body: ThreadUpdate, db: Database = Depends(get_db)):
    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(404, f"Thread '{thread_id}' not found")
    return await db.update_thread_metadata(thread_id, body.metadata)


# ── Thread state (LangGraph checkpointer-backed) ──────────────────────────────

@router.get("/{thread_id}/state")
async def get_thread_state(thread_id: str, db: Database = Depends(get_db)):
    """
    Return the latest checkpointed state for this thread.
    We delegate to the LangGraph graph's checkpointer.
    """
    from dependencies import get_graph
    graph = get_graph()

    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(404, f"Thread '{thread_id}' not found")

    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = await graph.aget_state(config)
        if state is None:
            return {"values": {}, "next": [], "metadata": {}, "checkpoint_id": None}
        return {
            "values": state.values,
            "next": list(state.next or []),
            "metadata": state.metadata or {},
            "checkpoint_id": state.config.get("configurable", {}).get("checkpoint_id"),
        }
    except Exception as exc:
        raise HTTPException(500, f"Failed to fetch state: {exc}")


@router.post("/{thread_id}/state")
async def update_thread_state(thread_id: str, body: ThreadStateUpdate, db: Database = Depends(get_db)):
    """Patch the thread state (useful for HITL resume)."""
    from dependencies import get_graph
    graph = get_graph()

    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(404, f"Thread '{thread_id}' not found")

    config: dict = {"configurable": {"thread_id": thread_id}}
    if body.checkpoint_id:
        config["configurable"]["checkpoint_id"] = body.checkpoint_id

    try:
        await graph.aupdate_state(config, body.values)
    except Exception as exc:
        raise HTTPException(500, f"State update failed: {exc}")

    return await get_thread_state(thread_id, db)


@router.get("/{thread_id}/history")
async def get_thread_history(
    thread_id: str,
    limit: int = Query(10, ge=1, le=100),
    db: Database = Depends(get_db),
):
    """Return checkpoint history for a thread."""
    from dependencies import get_graph
    graph = get_graph()

    row = await db.get_thread(thread_id)
    if not row:
        raise HTTPException(404, f"Thread '{thread_id}' not found")

    config = {"configurable": {"thread_id": thread_id}}
    history = []
    try:
        async for snap in graph.aget_state_history(config, limit=limit):
            history.append({
                "values": snap.values,
                "next": list(snap.next or []),
                "metadata": snap.metadata or {},
                "checkpoint_id": snap.config.get("configurable", {}).get("checkpoint_id"),
                "parent_checkpoint_id": snap.parent_config.get("configurable", {}).get("checkpoint_id") if snap.parent_config else None,
            })
    except Exception as exc:
        raise HTTPException(500, f"History fetch failed: {exc}")

    return history
