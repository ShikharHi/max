# JARVIS Frontend

Production-grade frontend for JARVIS, built as a dark command-center interface for chat, tool execution traces, marketplace discovery, and stack management.

## Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Framer Motion
- Zustand
- react-markdown, remark-gfm, rehype-highlight
- lucide-react

## Getting Started

Install dependencies:

```bash
npm install
```

Create an environment file:

```bash
cp .env.example .env.local
```

Set the backend URL if needed:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Run the development server:

```bash
npm run dev
```

Open the printed localhost URL in your browser.

## Scripts

```bash
npm run dev        # Start local development server
npm run build      # Create production build
npm run start      # Run production server after build
npm run lint       # Run Next.js lint checks
npm run typecheck  # Run TypeScript without emitting files
```

## API Contract

The frontend expects the JARVIS backend at `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:8000`.

Core endpoints used:

- `GET /threads`
- `POST /threads`
- `GET /threads/{thread_id}/state`
- `POST /threads/{thread_id}/runs/stream`
- `POST /threads/{thread_id}/runs/{run_id}/cancel`
- `GET /registry`
- `GET /registry/active`
- `POST /registry/plugin`
- `POST /registry/plugout`
- `POST /registry/reload`

Streaming runs are parsed as SSE events:

- `metadata`
- `updates`
- `values`
- `messages/partial`
- `error`
- `end`

## Project Layout

```text
src/
  app/                 App Router pages
  components/          Sidebar, chat, trace, marketplace, and stack UI
  hooks/               Threads, registry, run, and SSE hooks
  lib/                 API client and utility helpers
  store/               Zustand application store
  types/               Shared TypeScript types
```

## Notes

If the backend is offline, the UI shows a connection banner and keeps the shell usable. Messages are appended optimistically before a streamed run starts.
