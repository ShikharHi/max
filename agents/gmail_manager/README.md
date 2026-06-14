# Aria — Gmail Agent

Simple LangGraph ReAct agent for Gmail. Same architecture as AtlasFS.
No supervisor. No synthesizer. Just the loop.

```
START → llm_call ─┬─(tool calls?)─→ tool_node → llm_call
                  └─(no tool calls)─→ END
```

## Stack
- LangGraph (Python) — custom StateGraph, no prebuilt agents
- Groq: llama-3.3-70b-versatile
- MCP: https://github.com/ArtyMcLabin/Gmail-MCP-Server (stdio, runs locally)
- langchain-mcp-adapters: MultiServerMCPClient (stateless)

## Files

```
gmail_agent/
├── agent.py          # Graph definition — mirrors Atlas agent.py exactly
├── main.py           # REPL entry point
├── requirements.txt
├── .env.example
└── README.md
```

## Setup

### 1. Clone and build the Gmail MCP server
```bash
git clone https://github.com/ArtyMcLabin/Gmail-MCP-Server
cd Gmail-MCP-Server
npm install
npm run build
```
Follow the auth steps in that repo to connect your Gmail account (OAuth2).

### 2. Install Python deps
```bash
pip install -r requirements.txt
```

### 3. Configure
```bash
cp .env.example .env
# Set GROQ_API_KEY and MCP_SERVER_PATH in .env
```

### 4. Run
```bash
python main.py
```

## Usage examples

```
You: Summarize my last 10 unread emails
You: Search for emails from anu@example.com this week
You: Reply to the latest email from Anu — tell her I'll be there at 7pm
You: Archive all emails from newsletter@medium.com
You: Show me the full thread for that Medium email
You: Create a draft to boss@work.com — subject: Leave request
```

## Key notes

- `parallel_tool_calls=False` on the Groq LLM — mandatory, Groq rejects parallel calls
- MCP tools load once at startup via `load_tools()`, then stay bound for the session
- The agent always confirms before write ops (send, reply, trash, archive) — enforced in the system prompt
- Conversation history accumulates across turns in the REPL (`/clear` to reset)
- `/tools` lists every MCP tool loaded from the server at startup
