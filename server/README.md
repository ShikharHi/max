# JARVIS FastAPI Server

Production-grade HTTP server for JARVIS. Mirrors the **LangGraph Platform API contract** so your existing frontend (or the LangGraph SDK) can talk to it without changes.

---

## Directory layout

```
your-project/
├── core/                    ← your existing JARVIS core (unchanged)
│   ├── __init__.py
│   ├── executor.py
│   ├── graph.py
│   ├── registry.py
│   ├── router.py
│   └── state.py
├── tools/                   ← tool plugins (unchanged)
├── agents/                  ← agent plugins (unchanged)
├── main.py                  ← your existing CLI (unchanged)
│
└── server/                  ← ← ← DROP THIS FOLDER HERE
    ├── main.py              server entry point
    ├── dependencies.py      DI singletons
    ├── requirements.txt
    ├── api/routers/
    │   ├── assistants.py
    │   ├── threads.py
    │   ├── runs.py
    │   └── registry.py
    ├── db/
    │   └── database.py      SQLite metadata (threads/runs/assistants)
    ├── models/
    │   └── schemas.py       Pydantic request/response models
    └── services/
        └── run_manager.py   async execution + SSE fan-out
```

> **Important:** The `server/` folder sits alongside `core/`, not inside it.
> `server/main.py` adds `../` (project root) to `sys.path` automatically, so
> `from core import ...` just works.

---

## Installation

```bash
cd server/
pip install -r requirements.txt
```

Your project's `.env` (in the project root) is loaded automatically.  
Required variable:

```
GROQ_API_KEY=gsk_...
```

---

## Running

```bash
# From inside server/
python main.py

# Or with uvicorn directly (hot-reload on core/ changes too)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload \
  --reload-dir . --reload-dir ../core
```

The server starts at **http://localhost:8000**  
Swagger UI at **http://localhost:8000/docs**

---

## API Reference

### Health

| Method | Path    | Description                          |
|--------|---------|--------------------------------------|
| GET    | `/`     | Health check + uptime                |
| GET    | `/info` | Server info, active tools/agents     |

---

### Assistants

| Method | Path                    | Description           |
|--------|-------------------------|-----------------------|
| POST   | `/assistants`           | Create assistant      |
| GET    | `/assistants`           | List assistants       |
| GET    | `/assistants/{id}`      | Get assistant         |
| DELETE | `/assistants/{id}`      | Delete assistant      |

The **default `jarvis` assistant** is seeded automatically and cannot be deleted.

---

### Threads

Threads are persistent conversation contexts backed by the LangGraph `AsyncSqliteSaver` checkpointer.

| Method | Path                          | Description                          |
|--------|-------------------------------|--------------------------------------|
| POST   | `/threads`                    | Create thread                        |
| GET    | `/threads`                    | List threads (`?status=idle/busy`)   |
| POST   | `/threads/search`             | Filter threads by status/metadata    |
| GET    | `/threads/{id}`               | Get thread (includes latest values)  |
| DELETE | `/threads/{id}`               | Delete thread                        |
| GET    | `/threads/{id}/state`         | Latest LangGraph checkpoint state    |
| POST   | `/threads/{id}/state`         | Patch state (HITL resume)            |
| GET    | `/threads/{id}/history`       | Full checkpoint history              |

---

### Runs

#### Threaded (stateful, uses LangGraph checkpointer)

| Method | Path                                      | Description                       |
|--------|-------------------------------------------|-----------------------------------|
| POST   | `/threads/{id}/runs`                      | Create background run             |
| GET    | `/threads/{id}/runs`                      | List runs for thread              |
| POST   | `/threads/{id}/runs/stream`               | **Create + stream (SSE)** ← main  |
| POST   | `/threads/{id}/runs/wait`                 | Create + block until done         |
| GET    | `/threads/{id}/runs/{rid}`                | Get run status                    |
| GET    | `/threads/{id}/runs/{rid}/stream`         | Re-attach to running stream       |
| POST   | `/threads/{id}/runs/{rid}/cancel`         | Cancel run                        |

#### Stateless (no thread, no persistence)

| Method | Path           | Description         |
|--------|----------------|---------------------|
| POST   | `/runs/stream` | Stateless SSE run   |
| POST   | `/runs/wait`   | Stateless wait run  |

---

### Registry

| Method | Path                | Description                       |
|--------|---------------------|-----------------------------------|
| GET    | `/registry`         | All tools + agents with metadata  |
| GET    | `/registry/active`  | Active names only                 |
| POST   | `/registry/plugin`  | Activate `{"name": "tool_name"}`  |
| POST   | `/registry/plugout` | Deactivate `{"name": "tool_name"}`|
| POST   | `/registry/reload`  | Re-scan disk for new plugins      |

---

## SSE Event Format

All streaming endpoints emit **Server-Sent Events**:

```
event: metadata
data: {"run_id": "...", "thread_id": "..."}

event: updates
data: {"router": {"decision": "use_tools", "plan": "..."}}

event: updates
data: {"executor": {"execution_results": ["[tool:web_search] ..."]}}

event: values
data: {"messages": [...], "final_answer": "...", "iterations": 2}

event: end
data: {}
```

| Event             | When                                          |
|-------------------|-----------------------------------------------|
| `metadata`        | Run starts (always first)                     |
| `updates`         | After each node completes (router, executor)  |
| `values`          | Full state snapshot (on request or at end)    |
| `messages/partial`| Token-by-token if `stream_mode=["messages"]`  |
| `debug`           | Internal LangGraph debug events               |
| `error`           | On graph exception or cancellation            |
| `end`             | Stream closed (always last)                   |

---

## Request Body — `/runs/stream`

```json
{
  "assistant_id": "jarvis",
  "input": {
    "messages": [{"role": "user", "content": "What's the weather in Vadodara?"}]
  },
  "stream_mode": ["updates", "values"],
  "multitask_strategy": "enqueue"
}
```

**Shorthand input formats accepted:**

```json
{ "user_input": "What time is it?" }
```

```json
{ "messages": [{"role": "user", "content": "Hello"}] }
```

---

## Multitask Strategies

When a thread already has a running job and a new run arrives:

| Strategy    | Behaviour                                           |
|-------------|-----------------------------------------------------|
| `enqueue`   | Queue the new run, execute after current finishes   |
| `reject`    | Return HTTP 409 immediately                         |
| `interrupt` | Cancel the current run, start the new one           |

---

## Connecting your Next.js frontend

Replace your old custom fetch with the standard pattern:

```typescript
// Create a thread once per conversation
const thread = await fetch('/threads', { method: 'POST', body: '{}' })
const { thread_id } = await thread.json()

// Stream a run
const res = await fetch(`/threads/${thread_id}/runs/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    assistant_id: 'jarvis',
    input: { user_input: userMessage },
    stream_mode: ['updates', 'values'],
  }),
})

const reader = res.body!.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const text = decoder.decode(value)
  // Parse SSE lines
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6))
      // handle data.final_answer, data.decision, etc.
    }
  }
}
```

---

## Using the LangGraph SDK (optional)

Since the server mirrors the LangGraph Platform contract, the official SDK works:

```python
from langgraph_sdk import get_client

client = get_client(url="http://localhost:8000")

thread = await client.threads.create()

async for chunk in client.runs.stream(
    thread["thread_id"],
    "jarvis",
    input={"user_input": "Hello JARVIS"},
    stream_mode="updates",
):
    print(chunk.event, chunk.data)
```

---

## Architecture notes

- **`Database` (SQLite/aiosqlite)** — stores thread metadata, run status, assistant records. Separate from LangGraph's own checkpoint tables.
- **`AsyncSqliteSaver`** — LangGraph's checkpointer. Stores full state snapshots per node per thread. Lives in `server/jarvis_checkpoints.db`.
- **`RunManager`** — owns a per-thread FIFO `asyncio.Queue` so concurrent requests are serialised safely. Each run gets its own `asyncio.Queue` for SSE fan-out; multiple clients can subscribe to the same run's stream.
- The graph is compiled **once at startup** and reused across all requests (thread-safe because LangGraph uses `thread_id` in config for isolation).
