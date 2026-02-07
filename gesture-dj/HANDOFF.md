# GESTURE DJ — Teammate Handoff

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
| `/vote` | Audience mobile voting UI (share via QR code) |
| `/dashboard` | Main presentation screen — vote feed, agent log, current params |

---

## APIs You'll Need

### Vote System

- **`GET /api/vote`** — current vote aggregation + recent votes
- **`POST /api/vote`** — cast a vote: `{ "userId": "...", "voteType": "energy_up" }`

Vote types: `energy_up`, `energy_down`, `drop_request`, `genre_switch`, `viz_style`, `speed_up`, `speed_down`

### Agent Decisions

- **`GET /api/agent`** — latest agent decision (reasoning, actions, audioState)

The agent posts here automatically. Poll this to get the latest reasoning and actions for your viz/audio systems.

### Music Generation Queue (for ElevenLabs integration)

This is the key integration point for the ElevenLabs team.

**Flow: Agent → Queue → Your Code → ElevenLabs → Queue → Audio Player**

1. **Agent queues a prompt**: it POSTs to `/api/music-queue` with a detailed prompt
2. **Your code polls for queued items**: `GET /api/music-queue?status=queued`
3. **You pick up a queued item**, mark it generating: `PATCH /api/music-queue` with `{ "id": "mq-xxx", "status": "generating" }`
4. **Send the `prompt` field to ElevenLabs** for music generation
5. **When audio is ready**, update: `PATCH /api/music-queue` with `{ "id": "mq-xxx", "status": "ready", "audioUrl": "https://..." }`
6. **Audio player picks up ready tracks** from `GET /api/music-queue` → `nextReady` field

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

  // Mark as ready
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

**Connect with a type parameter:**
```javascript
const ws = new WebSocket('ws://localhost:8080?type=viz');  // or 'cv', 'agent', 'vote'
```

**Messages the viz client will receive:**
- From `agent`: `{ source: "agent", type: "agent_decision", data: { actions, audioState } }`
- From `cv`: gesture parameter updates

**Agent actions your viz should react to:**
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
K2THINK_API_KEY="..."       # IFM K2 Think (not currently used directly)
DEDALUS_API_KEY="..."       # Dedalus SDK — agent uses this
FLOWGLAD_SECRET_KEY="..."   # Flowglad billing
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
└──────────────┘    └──────┬───────┘    └──────┬───────┘
                           │                    │
                    ┌──────▼───────┐    ┌───────▼──────┐
                    │  DJ Agent    │───▶│  /api/agent  │
                    │  (Python)    │    │  (decisions)  │
                    │  K2 Think    │    └──────────────┘
                    └──────┬───────┘
                           │
                    ┌──────▼───────────┐    ┌──────────────┐
                    │ /api/music-queue │───▶│  ElevenLabs  │
                    │ (prompt queue)   │◀───│  (your code) │
                    └──────────────────┘    └──────────────┘
                           │
                    ┌──────▼───────┐
                    │  WS Server   │
                    │  :8080       │
                    └──┬───┬───┬──┘
                       │   │   │
                      viz  cv  audio
```
