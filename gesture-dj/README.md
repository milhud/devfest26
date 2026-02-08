# Gesture DJ

An interactive AI-powered DJ booth for DevFest 2026. The audience votes on their phones to shape the music, visuals, and energy of a live set — powered by K2 Think reasoning, ElevenLabs music generation, and real-time 3D visuals.

## Quick Start

```bash
npm install

# Terminal 1: Next.js app
npm run dev              # → http://localhost:3000

# Terminal 2: WebSocket server
npm run ws-server        # → ws://localhost:8080

# Terminal 3: DJ Agent
npm run agent            # → K2 Think reasoning loop
```

## Tech Stack

- **Frontend** — Next.js 16, React 19, Tailwind CSS v4, TypeScript
- **Auth** — Supabase (Google OAuth)
- **AI Agent** — K2 Think via Dedalus SDK (Python)
- **Billing** — Flowglad (vote credits)
- **Real-time** — WebSocket server + HTTP broadcast
- **Music Gen** — ElevenLabs (via music queue API)

## Project Structure

| Path | Purpose |
|------|---------|
| `/vote` | Audience voting UI (mobile-first) |
| `/dashboard` | DJ presentation screen (projector) |
| `/api/vote` | Vote aggregation (session-scoped) |
| `/api/agent` | Agent decision store |
| `/api/music-queue` | Music generation queue |
| `server/ws-server.ts` | Real-time message routing |
| `agent/dj_agent.py` | K2 Think reasoning loop |

## Env Setup

Copy `.env.example` to `.env.local` and fill in the values. See `.env.example` for details.

## Docs

- **[HANDOFF.md](./HANDOFF.md)** — Teammate integration guide (APIs, WS, types)
- **[PROGRESS.md](./PROGRESS.md)** — Build progress log + E2E test results
