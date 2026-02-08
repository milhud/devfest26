# GESTURE DJ — Teammate Handoff

**Last updated:** Feb 7, 2026 11:01pm ET

## How to Run Everything

You need **4 terminals** running simultaneously:

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

# Terminal 4: DJ Booth (hand-tracking + stem audio)
cd web
python3 server.py
# → http://localhost:8000
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
|--------|----------|
| `cv` | viz, dashboard |
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
- From `cv`: `{ source: "cv", type: "gesture_update", data: { gesture, audio } }` — live hand-tracking + stem audio state

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

1. ~~**Stream A: CV + Audio Engine**~~ — **DONE.** See DJ Booth section below.
2. **Stream B: 3D Visualization** — Three.js/R3F scene reacting to VizParams
3. **ElevenLabs consumer** — poll `/api/music-queue?status=queued`, generate audio, PATCH back
4. **Flowglad product** — create "DJ Vote Credits" product in Flowglad dashboard with slug `dj-vote-credits`

---

## DJ Booth (Stream A) — Integrated

The hand-tracking DJ booth runs as a **separate app** at `http://localhost:8000` (served by FastAPI from `web/`). It connects to the WS server as a `cv` client and streams gesture + audio state to the dashboard in real-time.

### How it works

1. **Dashboard** → click **LAUNCH DJ BOOTH** button (opens `http://localhost:8000` in a new window)
2. **DJ Booth** → click **START DJ BOOTH** → allows camera → MediaPipe hand tracking begins
3. **Gestures control audio** — stem selection (finger count), play/pause (open palm hold), volume (pinch height), track switch (wave), effects (right hand fingers)
4. **State streams to dashboard** — gesture + audio state sent to WS server at 10 updates/sec → routed to dashboard
5. **Dashboard shows live state** — Stream A panel shows track, stem, status, gesture type, and per-stem volume bars

### Gesture controls

| Gesture | Hand | Action |
|---------|------|--------|
| Hold 1-3 fingers | Left | Select stem 1-3 |
| Open palm hold (650ms) | Left | Play/pause toggle |
| Pinch + raise/lower | Left | Stem volume (height = volume) |
| Wave / flick | Left | Next track |
| Hold 1-3 fingers | Right | Trigger effect 1-3 |

### CV → Dashboard WS message shape

```json
{
  "source": "cv",
  "type": "gesture_update",
  "data": {
    "gesture": {
      "fingerCount": 2,
      "handDetected": true,
      "isPinching": false,
      "volume": 0.65,
      "stemSelect": 1,
      "playPause": false,
      "trackSwitch": false,
      "isFist": false,
      "isOpen": false,
      "effectTrigger": 0
    },
    "audio": {
      "trackFolder": "track1",
      "trackIndex": 0,
      "selectedStem": 1,
      "stemVolumes": [0.35, 0.65, 0],
      "isPlaying": true,
      "isTrackLoading": false,
      "volume": 0.65,
      "stemCount": 3
    }
  },
  "timestamp": 1770522840716
}
```

### Key files

```
web/
├── server.py                          # FastAPI server (port 8000)
├── static/
│   ├── index.html                     # DJ Booth UI
│   ├── css/styles.css                 # Styling
│   └── js/
│       ├── main.js                    # App entry — init, render loop
│       ├── handTracker.js             # MediaPipe hand landmark detection
│       ├── gestureDetector.js         # Gesture recognition (pinch, wave, fingers)
│       ├── audioEngine.js             # Tone.js stem-based playback
│       ├── djController.js            # Bridges gestures → audio engine
│       ├── uiRenderer.js              # Canvas overlay + HUD updates
│       ├── kalmanFilter.js            # Smoothing for volume control
│       ├── wsBridge.js                # WebSocket bridge to WS server (cv client)
│       └── config.js                  # Thresholds, model path, landmarks
music/
├── track1/stem1-3.wav                 # Audio stems for track 1
├── track2/stem1-3.wav                 # Audio stems for track 2
└── effects/effect1-3.mp3              # One-shot sound effects
```

---

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  /vote page  │───▶│  /api/vote   │◀───│  /dashboard  │
│  (audience)  │    │  (aggregation)│    │  (presenter) │
│  +sessionCode│    │  +session    │    │  +audio player│
└──────────────┘    └──────┬───────┘    └──────┬───────┘
                           │                    │
                    HTTP POST /broadcast        │ WS (dashboard client)
                           ↓                    │
                    ┌──────────────┐    ┌───────▼──────┐
                    │  WS Server   │    │  /api/agent  │
                    │  :8080       │    │  (decisions)  │
                    └──┬───┬───┬──┘    └──────▲───────┘
                       │   │   │              │
                      viz  cv  dashboard      │
                            ↑                 │
                    ┌───────┴──────┐   ┌──────┴───────┐
                    │  DJ Booth   │   │  DJ Agent    │
                    │  :8000      │   │  (Python)    │
                    │  MediaPipe  │   │  K2 Think    │
                    │  + Tone.js  │   └──────┬───────┘
                    └─────────────┘          │
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
│   ├── dashboard/page.tsx               # Dashboard + audio player + DJ Booth launcher
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
├── server/ws-server.ts                  # WebSocket bridge + HTTP /broadcast (cv→viz+dashboard)
├── agent/
│   ├── dj_agent.py                      # K2 Think reasoning loop
│   ├── test_agent.py                    # Agent test script
│   └── requirements.txt                 # Python deps
├── supabase-schema.sql                  # DB tables + RLS policies
├── .env.example                         # Env var template
├── HANDOFF.md                           # This file
└── PROGRESS.md                          # Build progress log

web/                                     # DJ Booth (Stream A) — separate app
├── server.py                            # FastAPI server (port 8000)
├── requirements.txt                     # Python deps (fastapi, uvicorn)
└── static/
    ├── index.html                       # DJ Booth UI
    ├── css/styles.css                   # Full-screen camera + HUD styling
    └── js/
        ├── main.js                      # App entry, render loop
        ├── handTracker.js               # MediaPipe hand landmarks
        ├── gestureDetector.js           # Gesture recognition
        ├── audioEngine.js               # Tone.js stem playback
        ├── djController.js              # Gesture → audio bridge
        ├── uiRenderer.js                # Canvas overlay + mixer HUD
        ├── kalmanFilter.js              # Smooth volume tracking
        ├── wsBridge.js                  # WS bridge (cv client → :8080)
        └── config.js                    # Thresholds + constants

music/                                   # Shared audio assets
├── track1/stem1-3.wav
├── track2/stem1-3.wav
└── effects/effect1-3.mp3
```
