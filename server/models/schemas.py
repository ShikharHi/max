"""Pydantic schemas matching the LangGraph Platform API contract."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.utcnow()


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Assistants ────────────────────────────────────────────────────────────────

class AssistantCreate(BaseModel):
    graph_id: str = "jarvis"
    name: str = "JARVIS"
    config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Assistant(BaseModel):
    assistant_id: str = Field(default_factory=_uuid)
    graph_id: str
    name: str
    config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    version: int = 1


# ── Threads ───────────────────────────────────────────────────────────────────

class ThreadCreate(BaseModel):
    metadata: dict[str, Any] = Field(default_factory=dict)


class Thread(BaseModel):
    thread_id: str = Field(default_factory=_uuid)
    metadata: dict[str, Any] = Field(default_factory=dict)
    status: Literal["idle", "busy", "interrupted", "error"] = "idle"
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    values: Optional[dict[str, Any]] = None  # latest state snapshot


class ThreadState(BaseModel):
    values: dict[str, Any]
    next: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_now)
    checkpoint_id: Optional[str] = None
    parent_checkpoint_id: Optional[str] = None


class ThreadStateUpdate(BaseModel):
    values: dict[str, Any]
    checkpoint_id: Optional[str] = None


# ── Runs ──────────────────────────────────────────────────────────────────────

MultitaskStrategy = Literal["reject", "enqueue", "interrupt", "rollback"]
StreamMode = Literal["values", "messages", "updates", "debug", "messages-tuple"]


class RunCreate(BaseModel):
    assistant_id: str = "jarvis"
    input: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    stream_mode: list[StreamMode] = Field(default_factory=lambda: ["values"])
    multitask_strategy: MultitaskStrategy = "enqueue"
    webhook: Optional[str] = None


class Run(BaseModel):
    run_id: str = Field(default_factory=_uuid)
    thread_id: Optional[str] = None
    assistant_id: str
    status: Literal["pending", "running", "success", "error", "timeout", "interrupted"] = "pending"
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    kwargs: dict[str, Any] = Field(default_factory=dict)


# ── Registry ──────────────────────────────────────────────────────────────────

class PluginAction(BaseModel):
    name: str


class RegistryEntry(BaseModel):
    name: str
    display_name: str
    description: str
    active: bool
    version: str
    tags: list[str]
    kind: Literal["tool", "agent"]


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    graph_id: str = "jarvis"
    uptime_seconds: float = 0.0
