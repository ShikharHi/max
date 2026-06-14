"""Assistants CRUD — /assistants"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from db.database import Database
from dependencies import get_db
from models.schemas import AssistantCreate

router = APIRouter(prefix="/assistants", tags=["Assistants"])


@router.post("", status_code=201)
async def create_assistant(body: AssistantCreate, db: Database = Depends(get_db)):
    data = body.model_dump()
    data["assistant_id"] = str(uuid.uuid4())
    data["config"] = body.config
    data["metadata"] = body.metadata
    data["version"] = 1
    return await db.create_assistant(data)


@router.get("")
async def list_assistants(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Database = Depends(get_db),
):
    return await db.list_assistants(limit=limit, offset=offset)


@router.get("/{assistant_id}")
async def get_assistant(assistant_id: str, db: Database = Depends(get_db)):
    row = await db.get_assistant(assistant_id)
    if not row:
        raise HTTPException(404, f"Assistant '{assistant_id}' not found")
    return row


@router.delete("/{assistant_id}", status_code=204)
async def delete_assistant(assistant_id: str, db: Database = Depends(get_db)):
    if assistant_id == "jarvis":
        raise HTTPException(403, "Cannot delete the default JARVIS assistant")
    ok = await db.delete_assistant(assistant_id)
    if not ok:
        raise HTTPException(404, f"Assistant '{assistant_id}' not found")
