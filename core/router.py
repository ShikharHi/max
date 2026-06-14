"""Router node — the brain of JARVIS.

Receives the current state, decides:
  - "answer"     → respond directly
  - "use_tools"  → delegate to tools
  - "use_agents" → delegate to agents

When delegating it also emits a structured plan as JSON.
"""
from __future__ import annotations

import json
import re
from typing import Any

from langchain_groq import ChatGroq
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from .registry import Registry
from .state import JarvisState

MAX_ITERATIONS = 8


def _extract_first_json_block(text: str) -> str | None:
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    for index, char in enumerate(text[start:], start=start):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return None


def _strip_router_output(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```json\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"```$", "", raw).strip()
    return raw


def _parse_router_output(raw: str) -> dict[str, Any]:
    raw = _strip_router_output(raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        json_block = _extract_first_json_block(raw)
        if json_block:
            try:
                return json.loads(json_block)
            except json.JSONDecodeError:
                pass

    return {"decision": "answer", "answer": raw}

ROUTER_SYSTEM_TEMPLATE = """You are JARVIS, a highly capable AI assistant with access to tools and specialist agents.

{registry_context}

---

Your job is to decide the best next action given the conversation so far.

## Decision Rules
- If you can answer confidently and completely from your own knowledge, output decision: "answer".
- If the task requires real-time data, computation, file access, or other external operations, output decision: "use_tools".
- If the task requires deep analysis, summarization, or research better handled by a specialist agent, output decision: "use_agents".
- You can combine tools AND agents in one plan by using decision: "use_tools" (tools are processed first) or "use_agents". You may sequence multiple calls.

## Output Format (ALWAYS valid JSON, no markdown fences)
If decision is "answer":
{{
  "decision": "answer",
  "answer": "<your full response here>"
}}

If decision is "use_tools" or "use_agents":
{{
  "decision": "use_tools" | "use_agents",
  "plan": "<brief description of what you're about to do>",
  "invocations": [
    {{"type": "tool", "name": "<tool_name>", "input": {{"<param>": "<value>"}}}},
    {{"type": "agent", "name": "<agent_name>", "input": {{"<param>": "<value>"}}}}
  ]
}}

## Important
- Only use tools/agents listed above. Never invent names.
- After receiving execution results you will be called again to decide if more work is needed or if you can now answer.
- If iteration count is high, prefer answering with what you have.
"""


async def router_node(
    state: JarvisState,
    config: RunnableConfig,
    model: ChatGroq,
    registry: Registry,
) -> dict[str, Any]:
    iterations = state.get("iterations", 0)

    # Build system prompt with live registry context
    system_prompt = ROUTER_SYSTEM_TEMPLATE.format(
        registry_context=registry.router_context()
    )

    # Build messages for the LLM
    messages: list[BaseMessage] = [SystemMessage(content=system_prompt)]

    # Add conversation history
    for msg in state.get("messages", []):
        messages.append(msg)

    # If we have execution results, add them as context
    results = state.get("execution_results", [])
    if results:
        result_block = "\n\n---\n**Execution Results:**\n" + "\n\n".join(
            f"[{i+1}] {r}" for i, r in enumerate(results)
        )
        messages.append(
            HumanMessage(
                content=result_block
                + "\n\nNow decide: can you answer, or do you need more tool/agent calls?"
            )
        )
    elif not any(isinstance(m, HumanMessage) for m in messages):
        # Fallback: use user_input if available, otherwise extract from last HumanMessage in state
        fallback = state.get("user_input") or ""
        if not fallback:
            # Pull from last human message in state
            for m in reversed(state.get("messages", [])):
                if isinstance(m, HumanMessage):
                    fallback = m.content
                    break
        if fallback:
            messages.append(HumanMessage(content=fallback))

    # Force answer if max iterations reached
    if iterations >= MAX_ITERATIONS:
        messages.append(
            HumanMessage(
                content="MAX ITERATIONS REACHED. You must output decision: 'answer' now using everything gathered so far."
            )
        )

    # Pass config so astream_events can propagate through the LLM call
    response = await model.ainvoke(messages, config)
    raw_content = response.content
    if isinstance(raw_content, str):
        raw = raw_content.strip()
    else:
        raw = json.dumps(raw_content, ensure_ascii=False).strip()

    # Strip markdown fences if present
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"```$", "", raw).strip()

    parsed = _parse_router_output(raw)
    decision = parsed.get("decision", "answer")

    answer_text = parsed.get("answer") if decision == "answer" else parsed.get("plan")
    message_content = str(answer_text) if answer_text is not None else raw

    update: dict[str, Any] = {
        "decision": decision,
        "iterations": iterations + 1,
        "messages": [AIMessage(content=message_content)],
    }

    if decision == "answer":
        update["final_answer"] = parsed.get("answer", raw)
        update["invocations"] = []
    else:
        update["plan"] = parsed.get("plan", "")
        update["invocations"] = parsed.get("invocations", [])
        # Clear previous results for next round
        update["execution_results"] = []

    return update