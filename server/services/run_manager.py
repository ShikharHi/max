"""
RunManager — the heart of the server.

Responsibilities:
  - Accept run requests, queue them per-thread (FIFO)
  - Execute graph.astream() in a background asyncio task
  - Broadcast SSE events to all subscribers of a run
  - Support multitask strategies: enqueue, reject, interrupt
  - Track active runs and allow cancellation
  - Write final state snapshot back to the DB thread record
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections import defaultdict
from typing import Any, AsyncIterator, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from db.database import Database


class RunManager:
    """Coordinates background graph execution and SSE fan-out."""

    def __init__(self, graph, db: Database):
        self.graph = graph
        self.db = db

        # run_id → asyncio.Queue of SSE event dicts (None = stream closed)
        self._streams: dict[str, asyncio.Queue] = {}

        # run_id → asyncio.Task
        self._tasks: dict[str, asyncio.Task] = {}

        # thread_id → deque of queued run_ids (for enqueue strategy)
        self._thread_queues: dict[str, asyncio.Queue] = defaultdict(asyncio.Queue)

        # thread_id → asyncio.Task running the queue consumer
        self._thread_workers: dict[str, asyncio.Task] = {}

    # ── Public API ────────────────────────────────────────────────────────────

    async def submit(
        self,
        run_id: str,
        thread_id: Optional[str],
        input_data: dict[str, Any],
        stream_modes: list[str],
        multitask: str = "enqueue",
    ) -> None:
        """Queue a run for execution."""
        if thread_id:
            active = await self.db.get_active_run_for_thread(thread_id)
            if active and active["run_id"] != run_id:
                if multitask == "reject":
                    raise ValueError(f"Thread {thread_id} already has an active run. Strategy=reject.")
                elif multitask == "interrupt":
                    await self.cancel(active["run_id"])

        # Initialise a broadcast queue for this run
        self._streams[run_id] = asyncio.Queue()

        payload = {
            "run_id": run_id,
            "thread_id": thread_id,
            "input_data": input_data,
            "stream_modes": stream_modes,
        }

        if thread_id:
            # Per-thread serial queue ensures ordered execution
            await self._thread_queues[thread_id].put(payload)
            if thread_id not in self._thread_workers or self._thread_workers[thread_id].done():
                worker = asyncio.create_task(self._thread_worker(thread_id))
                self._thread_workers[thread_id] = worker
        else:
            # Stateless run — execute immediately in its own task
            task = asyncio.create_task(self._execute(payload))
            self._tasks[run_id] = task

    async def cancel(self, run_id: str) -> bool:
        """Cancel a pending or running run."""
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()
        await self.db.cancel_run(run_id)
        # Push a terminal event so any listening SSE clients disconnect
        await self._push(run_id, {"event": "error", "data": {"error": "Run was cancelled."}})
        await self._close(run_id)
        return True

    async def stream(self, run_id: str) -> AsyncIterator[str]:
        """
        Async generator that yields raw SSE text lines for a run.
        Blocks until the run's queue is drained (None sentinel received).
        """
        q = self._streams.get(run_id)
        if q is None:
            # Run not found or already done — emit error and close
            yield _sse("error", {"error": "run_not_found", "run_id": run_id})
            return

        while True:
            event = await q.get()
            if event is None:
                # Stream finished
                yield _sse("end", {})
                break
            yield _sse(event["event"], event["data"])

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _thread_worker(self, thread_id: str) -> None:
        """Drain the per-thread queue serially."""
        q = self._thread_queues[thread_id]
        while not q.empty():
            payload = await q.get()
            task = asyncio.create_task(self._execute(payload))
            self._tasks[payload["run_id"]] = task
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def _execute(self, payload: dict) -> None:
        run_id: str = payload["run_id"]
        thread_id: Optional[str] = payload["thread_id"]
        input_data: dict = payload["input_data"]
        stream_modes: list[str] = payload["stream_modes"]

        await self.db.update_run_status(run_id, "running")
        if thread_id:
            await self.db.update_thread_status(thread_id, "busy")

        # Emit metadata event (mirrors LangGraph server)
        await self._push(run_id, {
            "event": "metadata",
            "data": {"run_id": run_id, "thread_id": thread_id},
        })

        # Build LangGraph config
        config: dict[str, Any] = {}
        if thread_id:
            config["configurable"] = {"thread_id": thread_id}

        # Normalise stream modes for LangGraph
        lg_modes: list[str] = []
        for m in stream_modes:
            if m in ("values", "updates", "debug", "messages"):
                lg_modes.append(m)
            elif m == "messages-tuple":
                lg_modes.append("messages")

        if not lg_modes:
            lg_modes = ["updates"]

        final_values: dict = {}

        try:
            async for stream_type, data in self.graph.astream(
                input_data,
                config=config,
                stream_mode=lg_modes,
            ):
                if stream_type == "values":
                    final_values = data
                    await self._push(run_id, {
                        "event": "values",
                        "data": _serialise(data),
                    })

                elif stream_type == "updates":
                    await self._push(run_id, {
                        "event": "updates",
                        "data": _serialise(data),
                    })
                    # Track latest values from updates
                    for node_update in data.values():
                        if isinstance(node_update, dict):
                            final_values.update(node_update)

                elif stream_type == "messages":
                    # messages is a tuple: (message_chunk, metadata)
                    if isinstance(data, (list, tuple)) and len(data) == 2:
                        msg, meta = data
                        await self._push(run_id, {
                            "event": "messages/partial",
                            "data": {
                                "content": getattr(msg, "content", str(msg)),
                                "type": type(msg).__name__,
                                "metadata": _serialise(meta) if isinstance(meta, dict) else {},
                            },
                        })
                    else:
                        await self._push(run_id, {
                            "event": "messages/partial",
                            "data": _serialise(data),
                        })

                elif stream_type == "debug":
                    await self._push(run_id, {
                        "event": "debug",
                        "data": _serialise(data),
                    })

        except asyncio.CancelledError:
            await self.db.update_run_status(run_id, "interrupted")
            if thread_id:
                await self.db.update_thread_status(thread_id, "interrupted")
            await self._close(run_id)
            return

        except Exception as exc:
            await self._push(run_id, {
                "event": "error",
                "data": {"error": str(exc), "run_id": run_id},
            })
            await self.db.update_run_status(run_id, "error")
            if thread_id:
                await self.db.update_thread_status(thread_id, "error")
            await self._close(run_id)
            return

        # Success
        await self.db.update_run_status(run_id, "success")
        if thread_id and final_values:
            await self.db.update_thread_status(thread_id, "idle", values=_serialise(final_values))
        elif thread_id:
            await self.db.update_thread_status(thread_id, "idle")

        # Emit final values snapshot
        if final_values:
            await self._push(run_id, {
                "event": "values",
                "data": _serialise(final_values),
            })

        await self._close(run_id)

    async def _push(self, run_id: str, event: dict) -> None:
        q = self._streams.get(run_id)
        if q is not None:
            await q.put(event)

    async def _close(self, run_id: str) -> None:
        """Send sentinel to signal stream end, then cleanup."""
        q = self._streams.get(run_id)
        if q is not None:
            await q.put(None)
        # Keep stream dict alive briefly so late subscribers can get the None
        await asyncio.sleep(0.1)
        self._streams.pop(run_id, None)
        self._tasks.pop(run_id, None)


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _sse(event: str, data: Any) -> str:
    """Format a single SSE event as text."""
    payload = json.dumps(data, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


def _serialise(obj: Any) -> Any:
    """Recursively make an object JSON-safe."""
    if isinstance(obj, BaseMessage):
        return {
            "type": obj.__class__.__name__,
            "content": obj.content,
            "id": getattr(obj, "id", None),
            "additional_kwargs": getattr(obj, "additional_kwargs", {}),
        }
    if isinstance(obj, dict):
        return {k: _serialise(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_serialise(i) for i in obj]
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)
