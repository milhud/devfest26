# GESTURE DJ — Teammate Handoff

**Last updated:** Feb 7, 2026 10:28pm ET

## How to Run Everything

You need **3 terminals** running simultaneously:

```bash
# Terminal 1: Next.js app (frontend + APIs)
cd gesture-dj
npm run dev
# → http://localhost:3000

# Terminal 2: WebSocket server (real-time bridge)
cd gesture-dj
npm run ws-server
# → ws://localhost:8080

# Terminal 3: DJ Agent (K2 Think reasoning loop)
cd gesture-dj
npm run agent
# → polls /api/vote and /api/music-queue, posts decisions to /api/agent
```

---

## Pages

| URL | Purpose |
|-----|---------|
| `/` | Landing page with navigation |
| `/vote?session=CODE` | Audience mobile voting UI (share via QR code) |
| `/dashboard?session=CODE` | Main presentation screen — vote feed, agent log, audio player |

---

## APIs You'll Need

### Vote System

- **`GET /api/vote`** — current vote aggregation + recent votes
  - Optional query param: `?session=CODE` for session-scoped results
- **`POST /api/vote`** — cast a vote (returns **full aggregation** including counts, voteRate, avgRate):
  ```json
  { "userId": "...", "voteType": "energy_up", "sessionCode": "ABC123" }
  ```
  - `sessionCode` is optional but recommended — isolates votes per DJ session
  - Votes are also **broadcast in real-time** to the WS server automatically

Vote types: `energy_up`, `energy_down`, `drop_request`, `genre_switch`, `viz_style`, `speed_up`, `speed_down`

### Agent Decisions

- **`GET /api/agent`** — latest agent decision (reasoning, actions, audioState)

The agent posts here automatically. Poll this to get the latest reasoning and actions for your viz/audio systems.

### Music Generation Queue (for ElevenLabs integration)

This is the key integration point for the ElevenLabs team.

**Flow: Agent → Queue → Your Code → ElevenLabs → Queue → Dashboard Audio Player**

1. **Agent queues a prompt**: it POSTs to `/api/music-queue` with a detailed prompt
2. **Your code polls for queued items**: `GET /api/music-queue?status=queued`
3. **You pick up a queued item**, mark it generating: `PATCH /api/music-queue` with `{ "id": "mq-xxx", "status": "generating" }`
4. **Send the `prompt` field to ElevenLabs** for music generation
5. **When audio is ready**, update: `PATCH /api/music-queue` with `{ "id": "mq-xxx", "status": "ready", "audioUrl": "https://..." }`
6. **Dashboard auto-plays** the track — it polls for `nextReady` and has a built-in audio player with play/pause

#### Example: Consuming the Music Queue

```javascript
// Poll for queued items
const res = await fetch('/api/music-queue?status=queued');
const { queue } = await res.json();

if (queue.length > 0) {
  const item = queue[0];
  
  // Mark as generating
  await fetch('/api/music-queue', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: item.id, status: 'generating' }),
  });

  // Send to ElevenLabs
  const audioUrl = await generateWithElevenLabs(item.prompt, {
    genre: item.genre,
    bpm: item.bpm,
    energy: item.energy,
    mood: item.mood,
    duration_seconds: item.duration_seconds,
  });

  // Mark as ready (dashboard will auto-play this)
  await fetch('/api/music-queue', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: item.id, status: 'ready', audioUrl }),
  });
}
```

#### Music Queue Item Shape

```typescript
{
  id: string;
  prompt: string;           // Detailed text prompt for ElevenLabs
  genre: string;            // house, dnb, techno, lofi, ambient, trance, dubstep
  bpm: number;              // 80-180
  energy: number;           // 0.0-1.0
  mood: string;             // euphoric, dark, chill, aggressive, dreamy, hypnotic
  duration_seconds: number; // 15-60
  status: 'queued' | 'generating' | 'ready' | 'playing' | 'failed';
  audioUrl?: string;        // Set when status = 'ready'
  agentReasoning?: string;  // Why the agent chose this track
}
```

---

## WebSocket Server

The WS server at `ws://localhost:8080` routes messages between systems.

### Connecting as a client

```javascript
const ws = new WebSocket('ws://localhost:8080?type=viz');
// Valid types: 'cv', 'viz', 'agent', 'dashboard', 'votes'
```

### Message routing

| Source | Routed to |
|--------|-----------|
| `cv` | viz |
| `agent` | viz, cv, dashboard |
| `votes` | agent, viz, dashboard |

### HTTP broadcast endpoint (for API routes)

Instead of maintaining WS clients, API routes can POST to `http://localhost:8080/broadcast`:

```javascript
await fetch('http://localhost:8080/broadcast', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: 'votes',   // determines routing (see table above)
    type: 'vote_cast',
    data: { vote, aggregation },
    timestamp: Date.now(),
  }),
});
```

The vote API uses this automatically — every vote is broadcast in real-time.

### Messages the viz client will receive

- From `agent`: `{ source: "agent", type: "agent_decision", data: { actions, audioState } }`
- From `votes`: `{ source: "votes", type: "vote_cast", data: { vote, aggregation } }`
- From `cv`: gesture parameter updates

### Agent actions your viz should react to

- `change_viz_theme` → swap visual theme ("cyber", "organic", "minimal", "chaos")
- `set_camera_mode` → change camera ("orbit", "fly", "static", "shake")
- `set_color_palette` → lerp to new colors (array of 3 hex strings)
- `set_animation_intensity` → 0.0-1.0 (particle speed, bloom, mesh distortion)
- `trigger_drop` → start buildup animation (`{ buildup_bars: 4|8|16 }`)

---

## Shared Types

All TypeScript types are in `src/lib/types.ts`. Key interfaces:

- `VizParams` — what the 3D viz consumes (fftBands, audienceEnergy, visualTheme, etc.)
- `VoteType` / `Vote` / `VoteAggregation` — voting system types
- `AgentAction` / `AgentDecision` — agent output types
- `WSMessage` — WebSocket message envelope

---

## Env Variables

In `gesture-dj/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...     # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...# Supabase anon key
DEDALUS_API_KEY="..."            # Dedalus SDK — agent uses this
K2THINK_API_KEY="..."            # IFM K2 Think
FLOWGLAD_SECRET_KEY="..."        # Flowglad billing (server)
NEXT_PUBLIC_FLOWGLAD_KEY="..."   # Flowglad billing (client)
```

Agent env is in `gesture-dj/agent/.env` (same DEDALUS_API_KEY).

---

## What's NOT Built Yet (your part)

1. **Stream A: CV + Audio Engine** — MediaPipe hands → gesture params → Tone.js audio
2. **Stream B: 3D Visualization** — Three.js/R3F scene reacting to VizParams
3. **ElevenLabs consumer** — poll `/api/music-queue?status=queued`, generate audio, PATCH back
4. **Flowglad product** — create "DJ Vote Credits" product in Flowglad dashboard with slug `dj-vote-credits`

---

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  /vote page  │───▶│  /api/vote   │◀───│  /dashboard  │
│  (audience)  │    │  (aggregation)│    │  (presenter) │
│  +sessionCode│    │  +session    │    │  +audio player│
└──────────────┘    └──────┬───────┘    └──────┬───────┘
                           │                    │
                    HTTP POST /broadcast        │
                           ↓                    │
                    ┌──────────────┐    ┌───────▼──────┐
                    │  WS Server   │    │  /api/agent  │
                    │  :8080       │    │  (decisions)  │
                    └──┬───┬───┬──┘    └──────▲───────┘
                       │   │   │              │
                      viz  cv  dashboard      │
                                       ┌──────┴───────┐
                                       │  DJ Agent    │
                                       │  (Python)    │
                                       │  K2 Think    │
                                       └──────┬───────┘
                                              │
                                       ┌──────▼───────────┐
                                       │ /api/music-queue │
                                       │ (prompt queue)   │
                                       └──────┬───────────┘
                                              │
                                       ┌──────▼──────────┐
                                       │  ElevenLabs    │
                                       │  (your code)   │
                                       └────────────────┘
```

---

## File Map

```
gesture-dj/
├── src/app/
│   ├── page.tsx                         # Landing page
│   ├── layout.tsx                       # Root layout + providers
│   ├── globals.css                      # Neon club theme CSS
│   ├── login/page.tsx                   # Google OAuth login
│   ├── role-select/page.tsx             # DJ vs Audience role picker
│   ├── vote/page.tsx                    # Voting UI (session-scoped)
│   ├── dashboard/page.tsx               # Dashboard + audio player
│   ├── auth/callback/route.ts           # OAuth redirect handler
│   └── api/
│       ├── vote/route.ts                # Vote POST/GET (session-scoped, WS broadcast)
│       ├── agent/route.ts               # Agent decision POST/GET
│       ├── music-queue/route.ts         # Music queue POST/GET/PATCH
│       ├── sessions/route.ts            # Session create/join
│       └── flowglad/[...path]/route.ts  # Flowglad SDK handler
├── src/lib/
│   ├── types.ts                         # Shared TypeScript types
│   ├── vote-aggregator.ts               # Session-scoped 30s window aggregation
│   ├── flowglad.ts                      # FlowgladServer factory
│   └── supabase/                        # Supabase client/server/middleware
├── src/middleware.ts                     # Auth guard
├── server/ws-server.ts                  # WebSocket bridge + HTTP /broadcast
├── agent/
│   ├── dj_agent.py                      # K2 Think reasoning loop
│   ├── test_agent.py                    # Agent test script
│   └── requirements.txt                 # Python deps
├── supabase-schema.sql                  # DB tables + RLS policies
├── .env.example                         # Env var template
├── HANDOFF.md                           # This file
└── PROGRESS.md                          # Build progress log
```
