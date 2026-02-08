# GESTURE DJ — Progress Log

**Owner:** Milhud  
**Last updated:** Feb 7, 2026 11:01pm ET  
**Status:** ✅ All systems operational. Stream A (DJ Booth) integrated. 9/9 E2E tests passing.

---

## What's Built & Working

### DJ Agent (Python)
- **K2 Think via Dedalus** — reasoning loop that polls `/api/vote` and `/api/music-queue`, makes creative DJ decisions, broadcasts via WebSocket
- System prompt with full action vocabulary: energy, BPM, genre, FX, filters, visuals, camera, color palettes, animation intensity, and music generation
- Tracks decision history and feeds last 3 decisions as context for continuity
- Queues AI music generation prompts to `/api/music-queue` with detailed creative descriptions
- Posts decisions to `/api/agent` for dashboard display
- **Reuses single `aiohttp.ClientSession`** across all HTTP requests (no per-request overhead)
- Proper `close()` cleanup on shutdown
- Tested end-to-end: agent initializes, fetches APIs, calls K2 Think (~46s), executes actions, broadcasts to WS — all passing

### Vote Page (`/vote`)
- **7 vote types** in semantic layout: hero DROP button + 3 pairs (Energy: HYPE/CHILL, Tempo: FASTER/SLOWER, Style: GENRE/VISUALS)
- SVG icons (no emojis) — flame, snowflake, zap, disc, chevrons, sparkles
- Gradient section dividers with color-matched labels for each pair
- Glassmorphism cards with per-button gradient fills, border glows, active ring + glow shadow
- **Reactive backgrounds** — each vote triggers a unique full-screen animated overlay (hype burst, chill wave, drop strobe, genre rotation, speed streak, visual bloom)
- **Ambient energy response** — 3 floating orbs shift colors based on crowd energy bias + radial tint overlay
- **Session-scoped votes** — sends `sessionCode` with each POST, polls with `?session=` param
- **Haptic feedback** — `navigator.vibrate(30)` on mobile tap
- **Accessibility** — `aria-label` on all vote buttons
- Live EQ bar visualizer in header
- Shine sweep animation on hover, press scale on tap
- Vote count badges with pop-in animation
- Energy meter with dynamic gradient, shimmer effect, center marker
- Flowglad billing integration (credit purchase, usage tracking)
- 1s client-side cooldown between votes

### Dashboard (`/dashboard`)
- 3-column layout filling full viewport height: Audio State + Votes + QR | Streams + Energy + Now Playing + Queue + Timeline | Agent Brain + Feed
- **QR Code** — mini QR in sidebar "AUDIENCE JOIN" panel + full-screen modal
- **Now Playing panel** — auto-plays ready tracks from music queue with play/pause toggle, green pulse indicator, auto-advances on track end
- **Music Queue panel** — polls `/api/music-queue`, shows queued/generating/ready status dots + last 5 items
- **Session-scoped polling** — polls `/api/vote?session=CODE` for isolated vote data
- SVG icons throughout (brain, music note, camera, cube, flame, snowflake)
- Energy bar adapts gradient based on energy level
- Hype Spike badge with blur glow
- LIVE indicator with ping animation
- Vote feed with unicode symbols
- Decision timeline (horizontal scroll of recent agent decisions)
- Audio state panel (genre, BPM, energy bar, theme, complexity)
- Vote breakdown with proportional bars

### APIs
- **`GET/POST /api/vote`** — vote aggregation with 30s sliding window, energy bias, hype spike detection, rate history
  - POST now returns **full aggregation** (counts, voteRate, avgRate, energyBias, etc.)
  - POST accepts `sessionCode` in body → votes scoped per session
  - GET accepts `?session=CODE` query param → returns session-scoped aggregation
  - POST broadcasts vote to WS server via HTTP `/broadcast` endpoint
- **Server-side rate limiting** — 1 vote/sec per userId, returns 429, auto-cleans stale entries every 60s
- **`GET/POST /api/agent`** — stores + serves latest agent decision with history
- **`GET/POST/PATCH /api/music-queue`** — music generation queue (queued → generating → ready → playing)
- **`POST /api/sessions`** — create/join sessions with 6-char codes

### WebSocket Server (`ws://localhost:8080`)
- Routes messages between cv → viz + dashboard, agent → viz + cv + dashboard, votes → agent + viz + dashboard
- **HTTP `/broadcast` endpoint** — API routes POST here to broadcast messages without maintaining WS clients (reliable from Next.js API routes)
- Health check endpoint at `/health`
- Client types: `cv`, `viz`, `agent`, `dashboard`, `votes`

### DJ Booth — Stream A (`http://localhost:8000`)
- **Merged from `hud` branch** — teammate's hand-tracking DJ app, now integrated with the main system
- **FastAPI server** serves static frontend + music stems from `web/` and `music/` directories
- **MediaPipe hand landmarks** — in-browser hand tracking via `handTracker.js`
- **Gesture recognition** — finger count (stem select), open palm hold (play/pause), pinch height (volume), wave/flick (track switch), right-hand fingers (effects)
- **Tone.js audio engine** — stem-based playback with per-stem gain, master volume, looping, sync start
- **DJ Controller** — bridges gestures to audio engine actions with debouncing and Kalman filtering
- **Canvas overlay UI** — hand skeleton drawing, finger count indicator, mixer strip with knobs/meters/scope
- **WS Bridge** (`wsBridge.js`) — connects to WS server as `cv` client, sends gesture + audio state at 10 updates/sec
- **Dashboard integration** — dashboard connects as WS `dashboard` client, receives live CV data, shows track/stem/status/gesture/volume in Stream A panel
- **Launch from dashboard** — "LAUNCH DJ BOOTH" button opens `http://localhost:8000` in a new window; panel switches to live state view when connected
- **Staleness detection** — dashboard auto-detects DJ Booth disconnect after 3s of no CV data

### Vote Aggregation System
- **Session-scoped** — `getAggregator(sessionCode)` returns isolated aggregator per session via `Map`
- 30s sliding window with automatic pruning
- Hype spike detection (vote rate > 2× average)
- Energy bias calculation (-1 chill to +1 hype)
- Backwards-compatible default for no-session requests

### Auth & Sessions
- Google OAuth via Supabase
- DJ starts session → gets 6-char code → dashboard
- Audience enters code → joins → vote page
- Supabase DB: profiles, sessions, session_members + RLS policies
- Middleware auth guard on all routes

### Landing Page (`/`)
- SVG icons on navigation cards (dashboard, vote, API)
- Tech pills, gradient title, glass cards

---

## Recent Improvements (Feb 7 evening session)

| # | Improvement | Impact |
|---|-------------|--------|
| 1 | **Full aggregation in POST** — `POST /api/vote` returns complete aggregation with counts, voteRate, avgRate | Consumers don't need separate GET calls |
| 2 | **Real-time WS broadcasting** — votes broadcast via HTTP POST to WS server `/broadcast` endpoint | Dashboard/viz get instant vote updates |
| 3 | **Session-scoped votes** — votes isolated by session code across API + vote page + dashboard | Two simultaneous DJ sessions have independent vote pools |
| 4 | **Dashboard audio player** — auto-plays `ready` tracks from music queue with play/pause + auto-advance | Closes the ElevenLabs integration loop |
| 5 | **Agent HTTP session reuse** — single `aiohttp.ClientSession` across all agent requests | Eliminates per-request TCP overhead |
| 6 | **Vote page layout** — hero DROP button + 3 semantic pairs with gradient divider labels | More visually stunning and intuitive |
| 7 | **Dashboard viewport fit** — full-height layout, columns stretch, panels scroll internally | No empty space at bottom |
| 8 | **DJ Booth integration (Stream A)** — merged `hud` branch, added `wsBridge.js`, wired WS routing cv→dashboard, dashboard shows live gesture/audio state | Full hand-tracking → dashboard data flow |
| 9 | **Agent websockets fix** — fixed `ClientConnection.closed` AttributeError for newer websockets lib | Agent WS broadcast + clean shutdown work correctly |
| 10 | **Dashboard DJ Booth launcher** — "LAUNCH DJ BOOTH" button opens DJ Booth in new window, live state panel with staleness detection | One-click launch from presenter screen |

---

## E2E Test Results (Feb 7, 10:25pm ET)

**9/9 tests passing:**

| Test | Result |
|------|--------|
| POST `/api/vote` returns full aggregation with counts | ✅ |
| Session isolation: separate sessions have independent votes | ✅ |
| Rate limiting: 429 on rapid-fire same user | ✅ |
| Validation: 400 on invalid voteType | ✅ |
| Music queue lifecycle: POST → generating → ready → nextReady | ✅ |
| Agent API: POST decision → GET retrieves it | ✅ |
| WS broadcast: vote triggers real-time message to dashboard | ✅ |
| WS server health endpoint | ✅ |
| Pages respond (/, /vote, /dashboard) | ✅ |

---

## Architecture

```
Audience Phone → /vote → POST /api/vote (+ sessionCode)
                              ↓                    ↓
                    VoteAggregator          HTTP POST /broadcast
                    (session-scoped)               ↓
                              ↓              WS Server :8080
                    DJ Agent (Python)        ↓     ↓     ↓
                    K2 Think via Dedalus    viz  dashboard  agent
                    ↓                ↓
            POST /api/agent   POST /api/music-queue
                    ↓                ↓
            /dashboard polls   ElevenLabs consumer (teammate)
                    ↓                ↓
            WS broadcast      Audio player auto-plays
```

---

## What's NOT Built Yet

1. ~~**Stream A: CV + Audio Engine**~~ — **DONE.** DJ Booth integrated from `hud` branch.
2. **Stream B: 3D Visualization** — Three.js/R3F reacting to VizParams + agent actions
3. ~~**ElevenLabs consumer**~~ — **DONE.** `npm run music-consumer` polls queue → ElevenLabs sound generation → Supabase Storage upload → PATCH audioUrl. Dashboard auto-plays.
4. **Flowglad product setup** — create "DJ Vote Credits" product in Flowglad dashboard

---

## How to Run

```bash
# Terminal 1: Next.js
cd gesture-dj && npm run dev            # → http://localhost:3000

# Terminal 2: WebSocket server
cd gesture-dj && npm run ws-server      # → ws://localhost:8080

# Terminal 3: DJ Agent
cd gesture-dj && npm run agent          # → polls APIs, calls K2 Think

# Terminal 4: DJ Booth
cd web && python3 server.py             # → http://localhost:8000

# Terminal 5: ElevenLabs Music Consumer
cd gesture-dj && npm run music-consumer # → polls queue, generates music, uploads to Supabase
```

### Test the Agent
```bash
cd gesture-dj && python3 agent/test_agent.py
```

---

## Known Issues / Notes

- **In-memory state** — votes, decisions, and queue reset on server restart. Fine for hackathon demo.
- **Sessions are in Supabase** — sessions and profiles persist across restarts (unlike votes/decisions).
- **K2 Think model** — using `moonshot/kimi-k2-thinking-turbo` via Dedalus. Update `model=` in `agent/dj_agent.py` if needed.
- **Agent latency** — K2 Think can take 30-60s per decision. Timeout set to 120s.
- **Flowglad test mode** — payments work in test mode with test cards.
- **Audio autoplay** — browsers may block autoplay until user interacts with the page. The play/pause button handles this.
- **WS broadcast** — uses HTTP POST to `/broadcast` instead of maintaining a WS client from API routes (Next.js Turbopack doesn't reliably persist module-level WS connections).
- **DJ Booth requires camera** — browser will prompt for camera access on start. Works best in Chrome.
- **Start order matters** — start WS server (Terminal 2) before the agent (Terminal 3) and DJ Booth (Terminal 4) to avoid connection errors on first cycle.
