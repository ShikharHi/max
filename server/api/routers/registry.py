"""Registry management — /registry"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from dependencies import get_registry
from models.schemas import PluginAction

router = APIRouter(prefix="/registry", tags=["Registry"])


@router.get("")
async def list_registry(registry=Depends(get_registry)):
    tools = [
        {
            "kind": "tool",
            "name": t.name,
            "display_name": t.display_name,
            "description": t.description,
            "active": t.active,
            "version": t.version,
            "tags": t.tags,
        }
        for t in registry.all_tools()
    ]
    agents = [
        {
            "kind": "agent",
            "name": a.name,
            "display_name": a.display_name,
            "description": a.description,
            "active": a.active,
            "version": a.version,
            "tags": a.tags,
            "input_schema": a.input_schema,
        }
        for a in registry.all_agents()
    ]
    return {"tools": tools, "agents": agents}


@router.get("/active")
async def list_active(registry=Depends(get_registry)):
    return {
        "tools": [t.name for t in registry.active_tools()],
        "agents": [a.name for a in registry.active_agents()],
    }


@router.post("/plugin")
async def plugin(body: PluginAction, registry=Depends(get_registry)):
    result = registry.plugin(body.name)
    if "Not found" in result:
        raise HTTPException(404, f"'{body.name}' not found in registry")
    return {"status": "ok", "message": result, "name": body.name}


@router.post("/plugout")
async def plugout(body: PluginAction, registry=Depends(get_registry)):
    result = registry.plugout(body.name)
    if "Not found" in result:
        raise HTTPException(404, f"'{body.name}' not found in registry")
    return {"status": "ok", "message": result, "name": body.name}


@router.post("/reload")
async def reload_registry(registry=Depends(get_registry)):
    await registry.initialize()
    return {
        "status": "reloaded",
        "tools": len(registry.all_tools()),
        "agents": len(registry.all_agents()),
    }
