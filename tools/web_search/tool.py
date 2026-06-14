from typing import List
from pydantic import BaseModel, Field
from langchain_core.tools import tool
from tavily import TavilyClient
import os
from dotenv import load_dotenv

load_dotenv()

client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))


class SearchResult(BaseModel):
    title: str
    url: str
    content: str


class TavilyResponse(BaseModel):
    query: str
    answer: str
    sources: List[SearchResult]


@tool
def tavily_search(query: str) -> TavilyResponse:
    """Search the web and return structured results."""
    result = client.search(
        query=query,
        max_results=5,
        search_depth="advanced",
    )

    # Coerce None answers to empty string and handle missing fields safely
    answer = str(result.get("answer") or "")

    raw_results = result.get("results") or []
    sources = []
    for r in raw_results:
        if not isinstance(r, dict):
            continue
        sources.append(
            SearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                content=r.get("content", ""),
            )
        )

    # Try to extract a current temperature from the source snippets
    import re

    temp_value = None
    temp_unit = None
    for s in sources:
        if not s.content:
            continue
        # Look for patterns like '95°', '95°C', '95 °F', '95°F'
        m = re.search(r"(\d{1,3}(?:\.\d)?)\s?°\s?([CF])", s.content, flags=re.IGNORECASE)
        if not m:
            m = re.search(r"(\d{1,3}(?:\.\d)?)\s?°", s.content)
        if m:
            temp_value = m.group(1)
            # If second group exists, use it; else leave None
            try:
                temp_unit = m.group(2).upper() if m.group(2) else None
            except Exception:
                temp_unit = None
            break

    if temp_value:
        unit_display = temp_unit or ""
        answer = f"Approximately {temp_value}°{unit_display} (extracted from sources)"

    return TavilyResponse(
        query=query,
        answer=answer,
        sources=sources,
    )