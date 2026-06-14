# 🗂 Atlas — AI File Manager Agent

A production-grade AI file manager built with **LangChain**, **LangGraph**, and **Claude**.

---

## Architecture

```
file_manager/
├── scanner.py        # Filesystem walker → SQLite index (metadata)
├── search_tool.py    # SQLite-backed search + LangChain @tool wrappers
├── exec_tool.py      # Controlled shell exec (move/copy/rename/chmod…)
├── agent.py          # LangGraph ReAct agent + system prompt + tool assembly
├── cli.py            # Interactive REPL + single-shot CLI
├── requirements.txt
└── file_index.db     # Auto-generated SQLite index
```

---

## Tools

| Tool | Source | Purpose |
|------|--------|---------|
| `read_file` | LangChain toolkit | Read file content |
| `write_file` | LangChain toolkit | Write/create/overwrite files |
| `delete_file` | LangChain toolkit | Delete a file |
| `list_directory` | LangChain toolkit | List directory contents |
| `exec_tool` | Custom | Move, copy, rename, mkdir, chmod, archive, diff… |
| `search_files_tool` | Custom (SQLite) | Search by name, ext, size, date, MIME, depth… |
| `rescan_index_tool` | Custom | Rebuild the SQLite file index |
| `index_stats_tool` | Custom | Show index statistics |

---

## Strict Tool Routing (System Prompt Rules)

The agent is instructed to **never** misroute operations:

| Operation | ✅ Correct tool | ❌ Forbidden |
|-----------|----------------|-------------|
| Read content | `read_file` | `exec_tool cat …` |
| Write content | `write_file` | `exec_tool echo …` |
| Delete file | `delete_file` | `exec_tool rm …` |
| List directory | `list_directory` | `exec_tool ls …` |
| Move/copy/rename | `exec_tool mv/cp` | any other tool |

`exec_tool` itself enforces this at the code level with an allowlist + blocklist.

---

## File Scanner

`scanner.py` walks the filesystem from a root (default: `~`) and stores:

| Metadata | Description |
|----------|-------------|
| `path`, `name` | Full path and filename |
| `extension` | File extension (`.py`, `.pdf`, …) |
| `parent_dir` | Parent directory path |
| `size_bytes/kb/mb` | File size in three units |
| `is_dir`, `is_symlink` | Type flags |
| `mime_type` | Guessed MIME type |
| `permissions` | rwxrwxrwx string |
| `owner_readable/writable/executable` | Permission flags |
| `created_at`, `modified_at`, `accessed_at` | Timestamps (ISO format) |
| `depth` | Directory depth from scan root |
| `scanned_at` | When the index entry was written |

---

## Search Filters

Pass a JSON object to `search_files_tool`:

```json
{ "name": "report", "extension": "pdf", "min_size_kb": 50 }
{ "mime_like": "image", "modified_after": "2024-01-01" }
{ "parent_dir": "Documents", "owner_writable": true, "limit": 20 }
{ "is_dir": false, "max_size_kb": 10, "depth_max": 3 }
```

---

## Setup

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
# Interactive REPL (scan first)
python cli.py --scan

# Interactive REPL (no scan)
python cli.py

# Restrict to a directory
python cli.py --root ~/Documents

# Single-shot query
python cli.py "find all Python files larger than 50KB modified this year"

# Scan only
python scanner.py ~/my_project
```

### Example queries

```
Find all PDF files in my Documents folder
Show me Python files larger than 100KB
Move ~/Downloads/report.pdf to ~/Documents/reports/
What are the 5 largest files in my home directory?
Delete all .log files in /tmp
Create a backup copy of my config.yaml in ~/backups/
Search for files modified in the last 7 days
List all image files under ~/Pictures
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Your Anthropic API key |