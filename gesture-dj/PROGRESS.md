# GESTURE DJ — Progress Log

## Stream C: Voting System, Agent, Dashboard & UI (Milhud)

### What's Built & Working

#### DJ Agent (Python)
- **K2 Think via Dedalus** — reasoning loop that polls `/api/vote` and `/api/music-queue`, makes creative DJ decisions, broadcasts via WebSocket
- System prompt with full action vocabulary: energy, BPM, genre, FX, filters, visuals, camera, color palettes, animation intensity, and music generation
- Tracks decision history and feeds last 3 decisions as context for continuity
- Queues AI music generation prompts to `/api/music-queue` with detailed creative descriptions
- Posts decisions to `/api/agent` for dashboard display
- Tested end-to-end: agent initializes, fetches APIs, calls K2 Think (~46s), executes actions, broadcasts to WS — all passing

#### Vote Page (`/vote`)
- **7 vote types**: Hype, Chill, Drop, Genre, Faster, Visuals, Slower
- SVG icons (no emojis) — flame, snowflake, zap, disc, chevrons, sparkles
- Glassmorphism cards with per-button gradient fills, border glows, active ring + glow shadow
- **Reactive backgrounds** — each vote triggers a unique full-screen animated overlay:
  - Hype → warm orange/red radial burst
  - Chill → cool cyan/blue wave
  - Drop → rapid yellow/white strobe flash
  - Genre → purple/pink conic gradient rotation
  - Faster → green streak shooting upward
  - Visuals → pink/magenta bloom with hue-rotation
- **Ambient energy response** — 3 floating orbs with `blur(80px)` shift colors based on crowd energy bias (warm when hype, cool when chill), plus a radial tint overlay
- **Haptic feedback** — `navigator.vibrate(30)` on mobile tap
- **Accessibility** — `aria-label` on all vote buttons
- Live EQ bar visualizer in header
- Shine sweep animation on hover, press scale on tap
- Vote count badges with pop-in animation
- Energy meter with dynamic gradient, shimmer effect, center marker
- Flowglad billing integration (credit purchase, usage tracking)
- 1s client-side cooldown between votes

#### Dashboard (`/dashboard`)
- 3-column layout: Audio State + Votes + QR | Streams + Energy + Queue + Timeline | Agent Brain + Feed
- **QR Code** — mini QR in sidebar "AUDIENCE JOIN" panel + full-screen modal (click session code or "Show QR"). Uses `qrcode.react`. Shows session code, URL, scannable QR
- **Music Queue panel** — polls `/api/music-queue`, shows queued/generating/ready status dots + last 5 items with genre, BPM, prompt preview, color-coded status badges
- **SVG icons throughout** — brain, music note, camera, cube, flame, snowflake (no emojis)
- Energy bar adapts gradient based on energy level
- Hype Spike badge with blur glow
- LIVE indicator with ping animation
- Vote feed with unicode symbols
- Decision timeline (horizontal scroll of recent agent decisions)
- Audio state panel (genre, BPM, energy bar, theme, complexity)
- Vote breakdown with proportional bars

#### APIs
- **`GET/POST /api/vote`** — vote aggregation with 30s sliding window, energy bias, hype spike detection, rate history
- **Server-side rate limiting** — 1 vote/sec per userId, returns 429, auto-cleans stale entries every 60s
- **`GET/POST /api/agent`** — stores + serves latest agent decision with history
- **`GET/POST/PATCH /api/music-queue`** — music generation queue (queued → generating → ready → playing)
- **`POST /api/sessions`** — create/join sessions with 6-char codes

#### WebSocket Server (`ws://localhost:8080`)
- Routes messages between cv → viz, agent → viz + cv, votes → agent
- Health check endpoint at `/health`
- Client type tracking

#### Landing Page (`/`)
- SVG icons on navigation cards (dashboard, vote, API)
- Tech pills, gradient title, glass cards

#### Login & Role Select
- Google OAuth via Supabase
- DJ starts session → gets code → dashboard
- Audience enters code → joins → vote page

---

### Architecture

```
Audience Phone → /vote → POST /api/vote → VoteAggregator (30s window)
                                              ↓
                                    DJ Agent (Python, K2 Think)
                                    ↓                    ↓
                            POST /api/agent     POST /api/music-queue
                                    ↓                    ↓
                            /dashboard polls     ElevenLabs consumer (TBD)
                                    ↓
                            WS Server :8080 → viz/cv/audio clients
```

---

### What's NOT Built Yet (teammate parts)

1. **Stream A: CV + Audio Engine** — MediaPipe hands → gesture params → Tone.js
2. **Stream B: 3D Visualization** — Three.js/R3F reacting to VizParams + agent actions
3. **ElevenLabs consumer** — poll `/api/music-queue?status=queued`, generate audio, PATCH back with `audioUrl`
4. **Flowglad product setup** — create "DJ Vote Credits" product in Flowglad dashboard

---

### How to Run

```bash
# Terminal 1: Next.js
cd gesture-dj && npm run dev        # → http://localhost:3000

# Terminal 2: WebSocket server
cd gesture-dj && npm run ws-server  # → ws://localhost:8080

# Terminal 3: DJ Agent
cd gesture-dj && npm run agent      # → polls APIs, calls K2 Think
```

### Test the Agent
```bash
cd gesture-dj && python3 agent/test_agent.py
```
