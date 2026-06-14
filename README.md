# JARVIS CLI — Plug-and-Play Agentic Assistant

A LangGraph-based agentic CLI assistant with a dynamic tool/agent registry, Rich UI, and a router→executor loop.

---

## Architecture

```
User Input
    │
    ▼
┌─────────┐   decision: "answer"     ──► Final Answer
│  Router │
│  (LLM)  │   decision: "use_tools"  ──►┐
└─────────┘   decision: "use_agents" ──►┤
    ▲                                    │
    │            ┌───────────┐           │
    └────────────│ Executor  │◄──────────┘
    (results)    └───────────┘
```

The **Router** is the only decision-maker. It sees:
- The full conversation history
- All active tools and agents (dynamically injected into system prompt)
- Any results from previous execution rounds

It outputs structured JSON specifying whether to answer directly or delegate, and if delegating, exactly which tools/agents to call and with what inputs.

The **Executor** runs those calls (tools synchronously, agents via `async run()`) and returns results back to the Router for the next decision.

This loop continues until the Router decides to answer, or MAX_ITERATIONS (8) is hit.

---

## File Structure

```
jarvis/
├── jarvis.py               # Entry point — Rich CLI
├── requirements.txt
├── core/
│   ├── registry.py         # Auto-discovery, plugin/plugout, router context
│   ├── router.py           # Router LLM node
│   ├── executor.py         # Executor node
│   ├── graph.py            # LangGraph pipeline
│   └── state.py            # JarvisState TypedDict
├── tools/
│   └── <tool_name>/
│       ├── tool.json       # Metadata (name, description, active, tags, ...)
│       └── tool.py         # @tool decorated function
└── agents/
    └── <agent_name>/
        ├── agent.json      # Metadata (name, description, active, input_schema, ...)
        └── agent.py        # async run(input_data: dict, model: ChatAnthropic) -> str
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `/plugin <name>` | Activate a tool or agent |
| `/plugout <name>` | Deactivate a tool or agent |
| `/list` | Show full registry with active/inactive status |
| `/reload` | Re-scan disk for new tools/agents |
| `/clear` | Clear conversation history |
| `/help` | Show help |
| `/exit` | Quit |

---

## Adding a Tool

1. Create `tools/<your_tool>/tool.json`:
```json
{
  "name": "your_tool",
  "display_name": "Your Tool",
  "description": "What it does — be specific, the router reads this.",
  "version": "1.0.0",
  "active": true,
  "input_schema": {"param1": "string"},
  "tags": ["tag1"]
}
```

2. Create `tools/<your_tool>/tool.py`:
```python
from langchain_core.tools import tool

@tool
def your_tool(param1: str) -> str:
    """Brief docstring."""
    return "result"
```

3. Run `/reload` in JARVIS or restart.

---

## Adding an Agent

1. Create `agents/<your_agent>/agent.json` with same fields + `input_schema`.

2. Create `agents/<your_agent>/agent.py`:
```python
from langchain_anthropic import ChatAnthropic

async def run(input_data: dict, model: ChatAnthropic) -> str:
    # Use the shared model or spin up your own LangGraph subgraph
    ...
    return "result string"
```

3. Run `/reload` in JARVIS.

---

## Setup

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python jarvis.py
```
# max
# max
