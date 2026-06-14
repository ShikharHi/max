"""Runs — /threads/{thread_id}/runs  and  /runs (stateless)"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from db.database import Database
from dependencies import get_db, get_run_manager
from models.schemas import RunCreate
from services.run_manager import RunManager

router = APIRouter(tags=["Runs"])

# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_jarvis_input(input_data: dict) -> dict:
    """
    Translate the generic run input into the JarvisState shape.
    Clients can send either:
      {"messages": [...], "user_input": "..."}   (preferred)
      {"input": "some string"}                   (shorthand)
    """
    from langchain_core.messages import HumanMessage

    if "messages" in input_data:
        raw_msgs = input_data["messages"]
        msgs = []
        for m in raw_msgs:
            if isinstance(m, dict):
                role = m.get("role", "user")
                content = m.get("content", "")
                if role == "human" or role == "user":
                    msgs.append(HumanMessage(content=content))
                # assistant msgs are already in state history via checkpointer
            else:
                msgs.append(m)
        user_input = input_data.get("user_input", "") or (msgs[-1].content if msgs else "")
        return {
            "messages": msgs,
            "user_input": user_input,
            "decision": "",
            "plan": "",
            "invocations": [],
            "execution_results": [],
            "final_answer": "",
            "iterations": 0,
        }

    if "user_input" in input_data:
        ui = input_data["user_input"]
        return {
            "messages": [HumanMessage(content=ui)],
            "user_input": ui,
            "decision": "",
            "plan": "",
            "invocations": [],
            "execution_results": [],
            "final_answer": "",
            "iterations": 0,
        }

    # Passthrough — caller provided full JarvisState dict
    return input_data


def _normalize_stream_modes(stream_modes) -> list[str]:
    if stream_modes is None:
        return []

    normalized: list[str] = []
    for mode in stream_modes:
        if hasattr(mode, "value"):
            normalized.append(mode.value)
        else:
            normalized.append(str(mode))
    return normalized


# ── Threaded runs ─────────────────────────────────────────────────────────────

@router.post("/threads/{thread_id}/runs", status_code=201)
async def create_run(
    thread_id: str,
    body: RunCreate,
    db: Database = Depends(get_db),
    rm: RunManager = Depends(get_run_manager),
):
    thread = await db.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, f"Thread '{thread_id}' not found")

    run_id = str(uuid.uuid4())
    run = await db.create_run(
        run_id=run_id,
        thread_id=thread_id,
        assistant_id=body.assistant_id,
        metadata=body.metadata,
        kwargs={"input": body.input, "config": body.config},
    )

    jarvis_input = _build_jarvis_input(body.input)

    try:
        await rm.submit(
            run_id=run_id,
            thread_id=thread_id,
            input_data=jarvis_input,
            stream_modes=_normalize_stream_modes(body.stream_mode),
            multitask=body.multitask_strategy,
        )
    except ValueError as exc:
        await db.update_run_status(run_id, "error")
        raise HTTPException(409, str(exc))

    return run


@router.post("/threads/{thread_id}/runs/stream")
async def stream_run(
    thread_id: str,
    body: RunCreate,
    db: Database = Depends(get_db),
    rm: RunManager = Depends(get_run_manager),
):
    """Create a run AND stream its output in one request (most common client pattern)."""
    thread = await db.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, f"Thread '{thread_id}' not found")

    run_id = str(uuid.uuid4())
    await db.create_run(
        run_id=run_id,
        thread_id=thread_id,
        assistant_id=body.assistant_id,
        metadata=body.metadata,
        kwargs={"input": body.input, "config": body.config},
    )

    jarvis_input = _build_jarvis_input(body.input)

    try:
        await rm.submit(
            run_id=run_id,
            thread_id=thread_id,
            input_data=jarvis_input,
            stream_modes=_normalize_stream_modes(body.stream_mode),
            multitask=body.multitask_strategy,
        )
    except ValueError as exc:
        await db.update_run_status(run_id, "error")
        raise HTTPException(409, str(exc))

    return StreamingResponse(
        rm.stream(run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Run-ID": run_id,
        },
    )


@router.post("/threads/{thread_id}/runs/wait")
async def wait_run(
    thread_id: str,
    body: RunCreate,
    db: Database = Depends(get_db),
    rm: RunManager = Depends(get_run_manager),
):
    """Create a run and wait (block) until it completes, then return final state."""
    thread = await db.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, f"Thread '{thread_id}' not found")

    run_id = str(uuid.uuid4())
    await db.create_run(
        run_id=run_id,
        thread_id=thread_id,
        assistant_id=body.assistant_id,
        metadata=body.metadata,
        kwargs={"input": body.input, "config": body.config},
    )

    jarvis_input = _build_jarvis_input(body.input)
    await rm.submit(
        run_id=run_id,
        thread_id=thread_id,
        input_data=jarvis_input,
        stream_modes=["values"],
        multitask=body.multitask_strategy,
    )

    # Drain the stream, capturing the last values event
    final_values = None
    async for raw_sse in rm.stream(run_id):
        if '"event": "values"' in raw_sse or "event: values" in raw_sse:
            import json, re
            m = re.search(r"data: (.+)", raw_sse)
            if m:
                try:
                    final_values = json.loads(m.group(1))
                except Exception:
                    pass

    run = await db.get_run(run_id)
    return {"run": run, "values": final_values}


@router.get("/threads/{thread_id}/runs")
async def list_runs(
    thread_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Database = Depends(get_db),
):
    thread = await db.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, f"Thread '{thread_id}' not found")
    return await db.list_runs(thread_id, limit=limit, offset=offset)


@router.get("/threads/{thread_id}/runs/{run_id}")
async def get_run(thread_id: str, run_id: str, db: Database = Depends(get_db)):
    run = await db.get_run(run_id)
    if not run or run["thread_id"] != thread_id:
        raise HTTPException(404, f"Run '{run_id}' not found on thread '{thread_id}'")
    return run


@router.get("/threads/{thread_id}/runs/{run_id}/stream")
async def join_stream(
    thread_id: str,
    run_id: str,
    db: Database = Depends(get_db),
    rm: RunManager = Depends(get_run_manager),
):
    """Join an already-created run's stream (re-attach pattern)."""
    run = await db.get_run(run_id)
    if not run or run["thread_id"] != thread_id:
        raise HTTPException(404, f"Run '{run_id}' not found on thread '{thread_id}'")
    return StreamingResponse(
        rm.stream(run_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/threads/{thread_id}/runs/{run_id}/cancel", status_code=202)
async def cancel_run(
    thread_id: str,
    run_id: str,
    db: Database = Depends(get_db),
    rm: RunManager = Depends(get_run_manager),
):
    run = await db.get_run(run_id)
    if not run or run["thread_id"] != thread_id:
        raise HTTPException(404, f"Run '{run_id}' not found")
    await rm.cancel(run_id)
    return {"status": "cancellation_requested", "run_id": run_id}


# ── Stateless runs ────────────────────────────────────────────────────────────

@router.post("/runs/stream")
async def stateless_stream(
    body: RunCreate,
    db: Database = Depends(get_db),
    rm: RunManager = Depends(get_run_manager),
):
    """Stateless streaming run — no thread, no persistence."""
    run_id = str(uuid.uuid4())
    await db.create_run(
        run_id=run_id,
        thread_id=None,
        assistant_id=body.assistant_id,
        metadata=body.metadata,
        kwargs={"input": body.input},
    )

    jarvis_input = _build_jarvis_input(body.input)
    await rm.submit(
        run_id=run_id,
        thread_id=None,
        input_data=jarvis_input,
        stream_modes=_normalize_stream_modes(body.stream_mode),
    )

    return StreamingResponse(
        rm.stream(run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Run-ID": run_id,
        },
    )


@router.post("/runs/wait")
async def stateless_wait(
    body: RunCreate,
    db: Database = Depends(get_db),
    rm: RunManager = Depends(get_run_manager),
):
    run_id = str(uuid.uuid4())
    await db.create_run(
        run_id=run_id,
        thread_id=None,
        assistant_id=body.assistant_id,
        metadata=body.metadata,
        kwargs={"input": body.input},
    )

    jarvis_input = _build_jarvis_input(body.input)
    await rm.submit(run_id=run_id, thread_id=None, input_data=jarvis_input, stream_modes=["values"])

    final_values = None
    async for raw_sse in rm.stream(run_id):
        import json, re
        m = re.search(r"data: (.+)", raw_sse)
        if m and "values" in raw_sse:
            try:
                final_values = json.loads(m.group(1))
            except Exception:
                pass

    run = await db.get_run(run_id)
    return {"run": run, "values": final_values}
